/**
 * Editing Mechanics Engine (EME) - Conversational Revision & Session State Machine (PF-09)
 *
 * Implements:
 * - Versioned session lifecycle state machine:
 *     initialized -> candidate_selection_required -> ready <-> revision_pending
 *     -> verifying -> (revision_verified -> ready) | (revision_failed -> ready)
 *     -> recovery_required
 * - Unbreakable Invariant: Never replace or deactivate the last verified delivery
 *   until its successor has passed every verification gate and been safely committed.
 * - Idempotent, crash-safe transaction logging and recovery.
 * - Multi-revision undo / redo history DAG.
 * - Full integration with RevisionOrchestrator, CandidateOrchestrator, and RenderOrchestrator.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { BriefValidator } = require('./brief-validator.js');
const { CandidateOrchestrator } = require('./candidate-orchestrator.js');
const { RevisionOrchestrator } = require('./revision-orchestrator.js');
const { PreferenceExtractor } = require('./preference-model.js');
const { PreferenceFeedbackRecorder } = require('./preference-feedback-recorder.js');

class RevisionSessionManager {
  static get SCHEMA_VERSION() {
    return '1.0.0';
  }

  /**
   * Initializes a new revision session document.
   *
   * @param {object} params
   * @param {string} params.prompt Initial user prompt
   * @param {object} [params.brief] Pre-compiled EditBrief
   * @param {object} [params.project] Initial baseline EME project
   * @param {object} [params.preferenceProfile] Initial preference profile
   * @param {object} [params.candidateSetDoc] Optional pre-generated CandidateSet
   * @param {string} [params.outputDir='artifacts/deliverables']
   * @returns {object} Conforming eme-revision-session.v1 document
   */
  static createSession({
    prompt,
    brief,
    project,
    preferenceProfile,
    candidateSetDoc,
    outputDir = 'artifacts/deliverables'
  }) {
    fs.mkdirSync(outputDir, { recursive: true });
    const sessionId = `ses-${crypto.randomBytes(6).toString('hex')}`;
    const timestamp = new Date().toISOString();

    const hardConstraints = (brief?.constraints || []).map((c, i) => ({
      constraint_id: c.constraint_id || `C-HARD-${i + 1}`,
      type: c.type || 'preserve_property',
      description: c.description || 'Mandatory constraint',
      strength: c.strength || 'hard',
      provenance: 'brief_invariant'
    }));

    let initialState = 'initialized';
    if (candidateSetDoc) {
      if (candidateSetDoc.selection?.selected_candidate_id) {
        initialState = 'ready';
      } else {
        initialState = 'candidate_selection_required';
      }
    }

    const sessionDoc = {
      schema_version: this.SCHEMA_VERSION,
      session_id: sessionId,
      created_at: timestamp,
      updated_at: timestamp,
      state: initialState,
      request: {
        original_prompt: prompt || 'Create and revise video project',
        brief_id: brief?.brief_id || 'brief-ses',
        latest_revision_prompt: null
      },
      hard_constraints: hardConstraints,
      preference_profile: preferenceProfile || null,
      candidate_set_id: candidateSetDoc?.candidate_set_id || null,
      selected_candidate_id: candidateSetDoc?.selection?.selected_candidate_id || null,
      active_delivery: null,
      history: [],
      undo_redo: {
        current_revision_id: null,
        undo_stack: [],
        redo_stack: []
      },
      concurrency: {
        version: 0,
        last_modified_at: timestamp
      },
      recovery: {
        status: 'clean',
        pending_transaction_id: null,
        last_attempted_revision_id: null,
        checkpoint_path: null
      },
      diagnostics: []
    };

    // If candidate set has an active selection, bind it immediately
    if (candidateSetDoc?.selection?.selected_candidate_id) {
      this._bindCandidateDeliveryToSession(sessionDoc, candidateSetDoc, candidateSetDoc.selection.selected_candidate_id);
    }

    this._saveSession(sessionDoc, outputDir);
    return sessionDoc;
  }

  /**
   * Binds an approved candidate selection to initialize the active verified delivery.
   *
   * @param {object} params
   * @param {object} params.session Live session document
   * @param {object} params.candidateSetDoc CandidateSet document
   * @param {string} params.candidateId Candidate identifier
   * @param {string} [params.outputDir='artifacts/deliverables']
   * @param {Array<string>} [params.explicitlyRejectedCandidateIds=[]]
   * @returns {{ success: boolean, session: object, deliveryRun?: object, error?: string }}
   */
  static bindSelectedCandidate({
    session,
    candidateSetDoc,
    candidateId,
    outputDir = 'artifacts/deliverables',
    explicitlyRejectedCandidateIds = []
  }) {
    if (!session) return { success: false, error: 'Session document is required' };
    if (session.state !== 'initialized' && session.state !== 'candidate_selection_required' && session.state !== 'ready') {
      return { success: false, error: `Cannot bind candidate from state "${session.state}"` };
    }

    const selectRes = CandidateOrchestrator.selectCandidate({
      candidateSetDoc,
      candidateId,
      outputDir,
      preferenceProfile: session.preference_profile,
      explicitlyRejectedCandidateIds
    });

    if (!selectRes.success) {
      return { success: false, error: selectRes.error || 'Failed to select candidate' };
    }

    const selectedCand = selectRes.candidateSetDoc.candidates.find(c => c.candidate_id === candidateId);
    const fullCand = candidateSetDoc._fullCandidates?.find(c => c.candidate_id === candidateId) ||
                     selectRes.candidateSetDoc?._fullCandidates?.find(c => c.candidate_id === candidateId);
    const executedProject = fullCand?._executedProject || selectedCand?._executedProject;

    session.candidate_set_id = selectRes.candidateSetDoc.candidate_set_id;
    session.selected_candidate_id = candidateId;

    const isInitial = !Array.isArray(session.history) || session.history.length === 0;
    const revId = isInitial ? 'rev-0' : `rev-${session.history.length}`;
    const predecessorId = isInitial ? null : (session.active_delivery?.revision_id || session.history[session.history.length - 1]?.revision_id || null);
    const timestamp = new Date().toISOString();

    session.active_delivery = {
      delivery_run_id: selectRes.deliveryRun?.run_id || `run-${candidateId}`,
      manifest_id: selectedCand.deliverable.manifest_id,
      media_path: selectedCand.deliverable.media_path,
      sha256: selectedCand.deliverable.sha256,
      revision_id: revId,
      activated_at: timestamp
    };

    let projectPath = null;
    if (executedProject) {
      projectPath = path.join(outputDir, `${session.session_id}-${revId}-project.json`);
      fs.writeFileSync(projectPath, JSON.stringify(executedProject, null, 2), 'utf8');
    }

    if (!Array.isArray(session.history)) {
      session.history = [];
    }

    session.history.push({
      revision_id: revId,
      predecessor_id: predecessorId,
      prompt: isInitial ? `Initial Candidate Selection: ${selectedCand.variation_profile?.name || candidateId}` : `Selected Candidate: ${selectedCand.variation_profile?.name || candidateId}`,
      status: 'committed',
      plan_hash: selectedCand.canonical_plan_hash,
      manifest_id: selectedCand.deliverable.manifest_id,
      delivery_run_id: selectRes.deliveryRun?.run_id || `run-${candidateId}`,
      media_sha256: selectedCand.deliverable.sha256,
      media_path: selectedCand.deliverable.media_path,
      project_path: projectPath,
      operations_count: selectedCand.plan_summary?.operations_count || 0,
      qa_score: selectedCand.qa_summary?.score ?? 100,
      timestamp,
      error: null,
      _deliveryRun: selectRes.deliveryRun,
      _project: executedProject
    });

    if (!session.undo_redo) {
      session.undo_redo = { current_revision_id: revId, undo_stack: [], redo_stack: [] };
    } else {
      if (session.undo_redo.current_revision_id) {
        session.undo_redo.undo_stack.push(session.undo_redo.current_revision_id);
      }
      session.undo_redo.current_revision_id = revId;
      session.undo_redo.redo_stack = [];
    }

    session.state = 'ready';
    session.updated_at = timestamp;
    session.concurrency.version++;
    session.concurrency.last_modified_at = timestamp;

    this._saveSession(session, outputDir);

    return {
      success: true,
      session,
      deliveryRun: selectRes.deliveryRun
    };
  }

  /**
   * Applies a natural-language conversational revision to the active delivery.
   * Guarantees that the prior active delivery remains active until the new revision
   * has successfully passed execution, rendering, physical media QA, and semantic verification.
   *
   * @param {object} params
   * @param {object} params.session Live session document
   * @param {string} params.revisionPrompt Natural language revision instruction
   * @param {object} params.project Project baseline matching active delivery
   * @param {string} [params.outputDir='artifacts/deliverables']
   * @param {object} [params.options]
   * @returns {{ success: boolean, session: object, revisionRun?: object, error?: string }}
   */
  static applyRevision({
    session,
    revisionPrompt,
    project,
    outputDir = 'artifacts/deliverables',
    options = {}
  }) {
    fs.mkdirSync(outputDir, { recursive: true });

    // 1. Invariant & Concurrency Check
    if (!session || !session.active_delivery) {
      return { success: false, error: 'Session has no active verified delivery' };
    }

    if (session.state !== 'ready') {
      return {
        success: false,
        error: `Invalid transition: session is in state "${session.state}", must be "ready" to revise`
      };
    }

    // Verify expected concurrency version if provided
    if (options.expectedVersion !== undefined && options.expectedVersion !== session.concurrency.version) {
      return {
        success: false,
        error: `Stale session version: expected ${options.expectedVersion}, current ${session.concurrency.version}`
      };
    }

    const currentRevId = session.active_delivery.revision_id;
    const nextRevIndex = session.history.length;
    const nextRevId = `rev-${nextRevIndex}`;
    const txId = `tx-${crypto.randomBytes(6).toString('hex')}`;
    const timestamp = new Date().toISOString();

    // 2. Transition to revision_pending & record transaction checkpoint
    session.state = 'revision_pending';
    if (!session.request) session.request = {};
    session.request.latest_revision_prompt = revisionPrompt;
    session.recovery.status = 'in_flight';
    session.recovery.pending_transaction_id = txId;
    session.recovery.last_attempted_revision_id = nextRevId;

    const checkpointPath = path.join(outputDir, `${session.session_id}-${txId}-checkpoint.json`);
    fs.writeFileSync(checkpointPath, JSON.stringify({
      session_id: session.session_id,
      transaction_id: txId,
      predecessor_revision_id: currentRevId,
      active_delivery: session.active_delivery,
      timestamp
    }, null, 2), 'utf8');
    session.recovery.checkpoint_path = checkpointPath;

    // 3. Transition to verifying & execute through RevisionOrchestrator
    session.state = 'verifying';

    const activeHistory = session.history.find(h => h.revision_id === session.active_delivery.revision_id);
    const effectiveProject = activeHistory?._project || activeHistory?._executedProject || project;

    // Build synthetic or actual priorRunDoc from active delivery
    const priorRunDoc = {
      run_id: session.active_delivery.delivery_run_id,
      plan_summary: { target_duration_ticks: effectiveProject.timebase?.durationTicks || 1440000 },
      deliverable: {
        sha256: session.active_delivery.sha256,
        manifest_id: session.active_delivery.manifest_id,
        media_path: session.active_delivery.media_path
      },
      request: {
        explicit_constraints: session.hard_constraints.map(c => c.constraint_id)
      }
    };

    const revRunRes = RevisionOrchestrator.runRevision({
      rawPrompt: revisionPrompt,
      priorRunDoc,
      project: effectiveProject,
      outputDir,
      options
    });

    const isVerified = revRunRes.status === 'verified';

    // 4. Gate Evaluation & Failure Isolation
    if (!isVerified) {
      // Revision failed or had a conflict. Prior delivery REMAINS 100% ACTIVE!
      session.state = 'revision_failed';
      session.history.push({
        revision_id: nextRevId,
        predecessor_id: currentRevId,
        prompt: revisionPrompt,
        status: 'failed',
        plan_hash: revRunRes.plan_diff?.canonical_plan_hash || 'none',
        manifest_id: null,
        delivery_run_id: revRunRes.revision_run_id,
        media_sha256: null,
        operations_count: revRunRes.plan_diff?.added_operations?.length ?? 0,
        qa_score: revRunRes.reverification?.media_qa?.score ?? 0,
        timestamp,
        error: revRunRes.diagnostics?.join('; ') || 'Revision verification failed'
      });

      session.recovery.status = 'clean';
      session.recovery.pending_transaction_id = null;
      if (fs.existsSync(checkpointPath)) fs.unlinkSync(checkpointPath);

      // Transition back to ready with prior delivery active
      session.state = 'ready';
      session.updated_at = new Date().toISOString();
      this._saveSession(session, outputDir);

      return {
        success: false,
        error: `Revision failed verification: ${revRunRes.diagnostics?.join('; ')}`,
        session,
        activeDelivery: session.active_delivery,
        revisionRun: revRunRes
      };
    }

    // 5. Verification Passed: Transition to revision_verified then atomically activate
    session.state = 'revision_verified';

    // Push predecessor onto undo stack, clear redo stack
    session.undo_redo.undo_stack.push(currentRevId);
    session.undo_redo.redo_stack = [];
    session.undo_redo.current_revision_id = nextRevId;

    // Atomically activate new delivery
    session.active_delivery = {
      delivery_run_id: revRunRes.revision_run_id,
      manifest_id: revRunRes.deliverable.manifest_id,
      media_path: revRunRes.deliverable.media_path,
      sha256: revRunRes.deliverable.sha256,
      revision_id: nextRevId,
      activated_at: new Date().toISOString()
    };

    const finalProj = revRunRes._executedProject || effectiveProject;
    let projectPath = null;
    if (finalProj) {
      projectPath = path.join(outputDir, `${session.session_id}-${nextRevId}-project.json`);
      fs.writeFileSync(projectPath, JSON.stringify(finalProj, null, 2), 'utf8');
    }

    session.history.push({
      revision_id: nextRevId,
      predecessor_id: currentRevId,
      prompt: revisionPrompt,
      status: 'committed',
      plan_hash: revRunRes.plan_diff?.canonical_plan_hash || 'hash',
      manifest_id: revRunRes.deliverable.manifest_id,
      delivery_run_id: revRunRes.revision_run_id,
      media_sha256: revRunRes.deliverable.sha256,
      media_path: revRunRes.deliverable.media_path,
      project_path: projectPath,
      operations_count: (revRunRes.plan_diff?.added_operations?.length || 0) + (revRunRes.plan_diff?.modified_operations?.length || 0),
      qa_score: revRunRes.reverification?.media_qa?.score ?? 100,
      timestamp,
      error: null,
      _revisionRun: revRunRes,
      _project: finalProj
    });

    session.concurrency.version++;
    session.concurrency.last_modified_at = new Date().toISOString();
    session.recovery.status = 'clean';
    session.recovery.pending_transaction_id = null;
    if (fs.existsSync(checkpointPath)) fs.unlinkSync(checkpointPath);

    session.state = 'ready';
    session.updated_at = session.concurrency.last_modified_at;

    this._saveSession(session, outputDir);

    return {
      success: true,
      session,
      newDelivery: session.active_delivery,
      revisionRun: revRunRes
    };
  }

  /**
   * Reverts active delivery to the preceding revision in the history stack.
   *
   * @param {object} params
   * @param {object} params.session Live session document
   * @param {string} [params.outputDir='artifacts/deliverables']
   * @returns {{ success: boolean, session: object, restoredDelivery?: object, error?: string }}
   */
  static undo({ session, outputDir = 'artifacts/deliverables' }) {
    if (!session || !session.undo_redo) {
      return { success: false, error: 'Invalid session document' };
    }

    if (session.state !== 'ready') {
      return { success: false, error: `Cannot undo while session is in state "${session.state}"` };
    }

    if (session.undo_redo.undo_stack.length === 0) {
      return { success: false, error: 'Undo stack is empty; already at baseline revision' };
    }

    const currentId = session.undo_redo.current_revision_id;
    const targetRevId = session.undo_redo.undo_stack.pop();

    const targetRev = session.history.find(h => h.revision_id === targetRevId && h.status === 'committed');
    if (!targetRev) {
      return { success: false, error: `Revision "${targetRevId}" not found in committed history` };
    }

    session.undo_redo.redo_stack.push(currentId);
    session.undo_redo.current_revision_id = targetRevId;

    session.active_delivery = {
      delivery_run_id: targetRev.delivery_run_id,
      manifest_id: targetRev.manifest_id,
      media_path: targetRev.media_path || targetRev._deliveryRun?.deliverable?.media_path || targetRev._revisionRun?.deliverable?.media_path,
      sha256: targetRev.media_sha256,
      revision_id: targetRevId,
      activated_at: new Date().toISOString()
    };

    session.concurrency.version++;
    session.updated_at = new Date().toISOString();
    this._saveSession(session, outputDir);

    return {
      success: true,
      session,
      restoredDelivery: session.active_delivery
    };
  }

  /**
   * Restores a previously undone revision from the redo stack.
   *
   * @param {object} params
   * @param {object} params.session Live session document
   * @param {string} [params.outputDir='artifacts/deliverables']
   * @returns {{ success: boolean, session: object, restoredDelivery?: object, error?: string }}
   */
  static redo({ session, outputDir = 'artifacts/deliverables' }) {
    if (!session || !session.undo_redo) {
      return { success: false, error: 'Invalid session document' };
    }

    if (session.state !== 'ready') {
      return { success: false, error: `Cannot redo while session is in state "${session.state}"` };
    }

    if (session.undo_redo.redo_stack.length === 0) {
      return { success: false, error: 'Redo stack is empty; already at newest revision' };
    }

    const currentId = session.undo_redo.current_revision_id;
    const targetRevId = session.undo_redo.redo_stack.pop();

    const targetRev = session.history.find(h => h.revision_id === targetRevId && h.status === 'committed');
    if (!targetRev) {
      return { success: false, error: `Revision "${targetRevId}" not found in committed history` };
    }

    session.undo_redo.undo_stack.push(currentId);
    session.undo_redo.current_revision_id = targetRevId;

    session.active_delivery = {
      delivery_run_id: targetRev.delivery_run_id,
      manifest_id: targetRev.manifest_id,
      media_path: targetRev.media_path || targetRev._deliveryRun?.deliverable?.media_path || targetRev._revisionRun?.deliverable?.media_path,
      sha256: targetRev.media_sha256,
      revision_id: targetRevId,
      activated_at: new Date().toISOString()
    };

    session.concurrency.version++;
    session.updated_at = new Date().toISOString();
    this._saveSession(session, outputDir);

    return {
      success: true,
      session,
      restoredDelivery: session.active_delivery
    };
  }

  /**
   * Recovers a session from an interrupted or crashed in-flight transaction.
   * Restores last known verified active delivery idempotently.
   *
   * @param {object} params
   * @param {object} params.session Live session document
   * @param {string} [params.outputDir='artifacts/deliverables']
   * @returns {{ success: boolean, session: object, activeDelivery: object }}
   */
  static recoverSession({ session, outputDir = 'artifacts/deliverables' }) {
    if (!session) return { success: false, error: 'Session document is required' };

    if (session.recovery.status === 'in_flight' || session.state === 'verifying' || session.state === 'revision_pending') {
      // Interrupted during revision! Roll back to last verified active delivery
      if (session.recovery.checkpoint_path && fs.existsSync(session.recovery.checkpoint_path)) {
        try {
          const checkpoint = JSON.parse(fs.readFileSync(session.recovery.checkpoint_path, 'utf8'));
          if (checkpoint.active_delivery) {
            session.active_delivery = checkpoint.active_delivery;
          }
          fs.unlinkSync(session.recovery.checkpoint_path);
        } catch (e) {
          // ignore checkpoint read error, fallback to session active_delivery
        }
      }

      session.recovery.status = 'clean';
      session.recovery.pending_transaction_id = null;
      session.state = 'ready';
      session.updated_at = new Date().toISOString();
      session.diagnostics.push(`Idempotent recovery completed: safely preserved active delivery "${session.active_delivery?.revision_id}"`);
      this._saveSession(session, outputDir);
    }

    return {
      success: true,
      session,
      activeDelivery: session.active_delivery
    };
  }

  // Helper to persist session document
  static _saveSession(session, outputDir) {
    const docPath = path.join(outputDir, `${session.session_id}-session.json`);
    const cleanDoc = { ...session };
    // Strip in-memory private objects from persistence
    cleanDoc.history = cleanDoc.history.map(h => {
      const { _deliveryRun, _project, _revisionRun, ...cleanH } = h;
      return cleanH;
    });
    fs.writeFileSync(docPath, JSON.stringify(cleanDoc, null, 2), 'utf8');
    session._docPath = docPath;
    return docPath;
  }

  // Internal helper to bind delivery to session
  static _bindCandidateDeliveryToSession(session, candidateSetDoc, candidateId) {
    const cand = candidateSetDoc.candidates.find(c => c.candidate_id === candidateId);
    if (!cand || !cand.deliverable) return;
    const fullCand = candidateSetDoc._fullCandidates?.find(c => c.candidate_id === candidateId);
    const executedProject = fullCand?._executedProject || cand._executedProject;

    const rootRevId = 'rev-0';
    const timestamp = new Date().toISOString();

    session.active_delivery = {
      delivery_run_id: `run-cand-${candidateId}`,
      manifest_id: cand.deliverable.manifest_id,
      media_path: cand.deliverable.media_path,
      sha256: cand.deliverable.sha256,
      revision_id: rootRevId,
      activated_at: timestamp
    };

    session.history = [{
      revision_id: rootRevId,
      predecessor_id: null,
      prompt: `Candidate Selection: ${cand.variation_profile?.name || candidateId}`,
      status: 'committed',
      plan_hash: cand.canonical_plan_hash,
      manifest_id: cand.deliverable.manifest_id,
      delivery_run_id: `run-cand-${candidateId}`,
      media_sha256: cand.deliverable.sha256,
      media_path: cand.deliverable.media_path,
      project_path: null,
      operations_count: cand.plan_summary?.operations_count || 0,
      qa_score: cand.qa_summary?.score ?? 100,
      timestamp,
      error: null,
      _project: executedProject
    }];

    session.undo_redo.current_revision_id = rootRevId;
    session.undo_redo.undo_stack = [];
    session.undo_redo.redo_stack = [];
  }

  /**
   * Computes an authoritative structural diff between two revision project snapshots.
   *
   * @param {object} params
   * @param {object} params.session Live or loaded session document
   * @param {string} params.fromRevisionId Baseline revision ID (e.g. 'rev-0')
   * @param {string} params.toRevisionId Comparison revision ID (e.g. 'rev-1')
   * @returns {{ success: boolean, diff?: object, error?: string, errorCode?: string }}
   */
  static computeRevisionDiff({ session, fromRevisionId, toRevisionId }) {
    if (!session || !Array.isArray(session.history)) {
      return { success: false, error: 'Session document is required', errorCode: 'VALIDATION_ERROR' };
    }

    const fromRev = session.history.find(h => h.revision_id === fromRevisionId);
    const toRev = session.history.find(h => h.revision_id === toRevisionId);

    if (!fromRev) {
      return { success: false, error: `Revision "${fromRevisionId}" not found in session history`, errorCode: 'NOT_FOUND' };
    }
    if (!toRev) {
      return { success: false, error: `Revision "${toRevisionId}" not found in session history`, errorCode: 'NOT_FOUND' };
    }

    // Resolve snapshots
    let projFrom = fromRev._project;
    if (!projFrom && fromRev.project_path && fs.existsSync(fromRev.project_path)) {
      try { projFrom = JSON.parse(fs.readFileSync(fromRev.project_path, 'utf8')); } catch (e) {}
    }
    let projTo = toRev._project;
    if (!projTo && toRev.project_path && fs.existsSync(toRev.project_path)) {
      try { projTo = JSON.parse(fs.readFileSync(toRev.project_path, 'utf8')); } catch (e) {}
    }

    if (!projFrom || !projTo) {
      return {
        success: false,
        error: `Project snapshot unavailable for comparison (${!projFrom ? fromRevisionId : toRevisionId})`,
        errorCode: 'DIFF_UNAVAILABLE'
      };
    }

    const fromClips = projFrom.clips || [];
    const toClips = projTo.clips || [];
    const fromClipsMap = new Map(fromClips.map(c => [c.id, c]));
    const toClipsMap = new Map(toClips.map(c => [c.id, c]));

    const addedClips = toClips.filter(c => !fromClipsMap.has(c.id)).map(c => ({
      id: c.id,
      trackId: c.trackId,
      type: c.type,
      startTick: c.startTick,
      durationTicks: c.durationTicks
    }));

    const removedClips = fromClips.filter(c => !toClipsMap.has(c.id)).map(c => ({
      id: c.id,
      trackId: c.trackId,
      type: c.type,
      startTick: c.startTick,
      durationTicks: c.durationTicks
    }));

    const modifiedClips = [];
    for (const toClip of toClips) {
      const fromClip = fromClipsMap.get(toClip.id);
      if (!fromClip) continue;

      const startTickChanged = fromClip.startTick !== toClip.startTick;
      const durationChanged = fromClip.durationTicks !== toClip.durationTicks;
      const trackChanged = fromClip.trackId !== toClip.trackId;
      const effectsChanged = JSON.stringify(fromClip.effects || []) !== JSON.stringify(toClip.effects || []);
      const colorGradeChanged = JSON.stringify(fromClip.colorGrade || null) !== JSON.stringify(toClip.colorGrade || null);

      if (startTickChanged || durationChanged || trackChanged || effectsChanged || colorGradeChanged) {
        modifiedClips.push({
          clipId: toClip.id,
          trackId: { from: fromClip.trackId, to: toClip.trackId, changed: trackChanged },
          startTick: {
            from: fromClip.startTick,
            to: toClip.startTick,
            deltaTicks: toClip.startTick - fromClip.startTick,
            deltaSec: (toClip.startTick - fromClip.startTick) / 120000
          },
          durationTicks: {
            from: fromClip.durationTicks,
            to: toClip.durationTicks,
            deltaTicks: toClip.durationTicks - fromClip.durationTicks,
            deltaSec: (toClip.durationTicks - fromClip.durationTicks) / 120000
          },
          effectsChanged,
          colorGradeChanged
        });
      }
    }

    const durationDiff = {
      fromDurationTicks: projFrom.timebase?.durationTicks || 0,
      toDurationTicks: projTo.timebase?.durationTicks || 0,
      deltaTicks: (projTo.timebase?.durationTicks || 0) - (projFrom.timebase?.durationTicks || 0),
      deltaSec: ((projTo.timebase?.durationTicks || 0) - (projFrom.timebase?.durationTicks || 0)) / 120000
    };

    return {
      success: true,
      diff: {
        fromRevisionId,
        toRevisionId,
        prompt: toRev.prompt,
        plan_hash: toRev.plan_hash,
        operations_count: toRev.operations_count,
        qa_score: toRev.qa_score,
        addedClips,
        removedClips,
        modifiedClips,
        durationDiff
      }
    };
  }
}

module.exports = {
  RevisionSessionManager
};
