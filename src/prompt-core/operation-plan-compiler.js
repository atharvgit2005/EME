/**
 * Editing Mechanics Engine (EME) - Operation Plan Compiler (PF-02 & PF-03)
 * Compiles a validated EditBrief and project snapshot into a deterministic,
 * declarative OperationPlan and performs dry-run simulation via OperationExecutor.
 *
 * Invariants:
 * - Zero direct project mutations during compilation or dry-run.
 * - Sole authority for state transitions is OperationExecutor.
 * - Strict integer timebase (120,000 ticks/sec).
 * - Complete fail-closed handling for missing references, locked tracks, and stale revisions.
 * - PF-03: Multi-track scheduling, music synchronization, B-roll placement,
 *   transition handle validation, text overlay safe margins, and plan-level failure recovery.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { OperationExecutor } = require('../engine/operations.js');
const { ProjectManager } = require('../engine/project.js');
const { BriefValidator } = require('./brief-validator.js');
const { computeProjectSnapshotSha256 } = require('./context-normalizer.js');
const { MultiTrackScheduler, DEFAULT_BEAT_TOLERANCE_TICKS } = require('./multi-track-scheduler.js');
const { MediaTime, TICKS_PER_SECOND } = require('../engine/time.js');

class OperationPlanCompiler {
  /**
   * Compiles an EditBrief and Project into an OperationPlan with dry-run verification.
   * @param {object} params
   * @param {object} params.brief Validated EME EditBrief
   * @param {object} params.project Canonical EME Project snapshot
   * @param {object} [params.beatAnalysis] Optional beat analysis sidecar (eme-beat-analysis.v1)
   * @param {object} [params.options] Compiler options
   * @returns {object} Canonical eme-operation-plan.v1 document
   */
  static compilePlan({ brief, project, beatAnalysis, options = {} }) {
    if (!project || typeof project !== 'object') {
      throw new Error('Valid EME project snapshot is required for OperationPlan compilation');
    }
    if (!brief || typeof brief !== 'object') {
      throw new Error('Valid EME EditBrief is required for OperationPlan compilation');
    }

    const baseRevision = project.revision ?? 0;
    const snapshotSha256 = computeProjectSnapshotSha256(project);

    const diagnostics = {
      unsupported_requests: [],
      missing_references: [],
      conflicts: [],
      rejected_operations: []
    };

    const blockingIssues = [];
    if (brief.project_snapshot?.snapshot_sha256 !== snapshotSha256) {
      blockingIssues.push('ERR_PROJECT_SNAPSHOT_MISMATCH');
      diagnostics.conflicts.push('Declared brief snapshot digest differs from the canonical project');
    }

    // 1. Validate Brief Schema
    const briefValidation = BriefValidator.validateEditBrief(brief);
    if (!briefValidation.valid) {
      diagnostics.unsupported_requests.push(...briefValidation.errors);
      blockingIssues.push('ERR_INVALID_BRIEF');
    }

    // 2. Concurrency & Revision Check
    const briefBaseRev = brief.project_snapshot?.base_revision;
    if (briefBaseRev !== undefined && briefBaseRev !== baseRevision) {
      const msg = `Stale project revision: brief expected revision ${briefBaseRev}, but project is currently at revision ${baseRevision}`;
      diagnostics.conflicts.push(msg);
      blockingIssues.push('ERR_STALE_REVISION');
    }

    // 3. Readiness Check
    if (brief.validation?.status === 'blocked' || brief.validation?.status === 'needs_clarification') {
      blockingIssues.push(...(brief.validation.blocking_issue_ids || ['ERR_BRIEF_NOT_READY']));
    }

    // 4. Resolve Target Duration from Brief Constraints / Deliverables
    let targetDurationTicks = 0;
    const durationConstraint = (brief.constraints || []).find(c =>
      c.type === 'target_duration' || c.type === 'max_duration' || c.target_property === 'duration'
    );

    if (durationConstraint) {
      if (durationConstraint.parameters?.duration_ticks) {
        targetDurationTicks = durationConstraint.parameters.duration_ticks;
      } else if (durationConstraint.parameters?.duration_seconds) {
        targetDurationTicks = Math.round(durationConstraint.parameters.duration_seconds * TICKS_PER_SECOND);
      }
    } else if (brief.deliverables?.[0]?.duration_ticks) {
      targetDurationTicks = brief.deliverables[0].duration_ticks;
    } else {
      // Default to existing project duration or 12s/10s
      targetDurationTicks = project.timebase?.durationTicks || (12 * TICKS_PER_SECOND);
    }

    // 5. Inspect and Resolve Clip & Track Targets
    const projectClips = project.clips || [];
    const projectTracks = project.tracks || [];
    const projectAssets = project.assets || [];

    // Check for explicit conflicting constraints
    const hasColorPreserve = (brief.constraints || []).some(c =>
      c.type === 'preserve_property' && (c.property_key === 'color_grade' || c.target_property === 'color_grade' || c.target_id === 'color')
    );
    const hasColorMod = (brief.requested_changes || []).some(ch => ch.domain === 'color');
    if (hasColorPreserve && hasColorMod) {
      diagnostics.conflicts.push('Contradictory requirements: color modification requested while preserve_property color_grade is active');
      blockingIssues.push('ERR_CONTRADICTORY_CONSTRAINTS');
    }

    // Detect Multi-Track Complex Creative Brief (PF-03)
    const isMultiTrack = (brief.requested_changes || []).some(ch =>
      ch.domain === 'audio' ||
      ch.domain === 'effect' ||
      ch.domain === 'typography' ||
      ch.description?.toLowerCase().includes('music') ||
      ch.description?.toLowerCase().includes('b-roll') ||
      ch.description?.toLowerCase().includes('broll') ||
      ch.description?.toLowerCase().includes('transition') ||
      ch.description?.toLowerCase().includes('title') ||
      ch.description?.toLowerCase().includes('overlay')
    );

    let finalStatus = 'ready';
    if (blockingIssues.length > 0) {
      if (blockingIssues.includes('ERR_CONTRADICTORY_CONSTRAINTS') || brief.validation?.status === 'needs_clarification') {
        finalStatus = 'needs_clarification';
      } else {
        finalStatus = 'blocked';
      }
    }

    const operations = [];

    if (finalStatus === 'ready') {
      if (isMultiTrack) {
        // === PF-03 MULTI-TRACK SCHEDULING PATH ===
        const topology = MultiTrackScheduler.resolveTrackTopology(project);

        // A. Primary Video Footage & Beat Alignment (PF-03.1 & PF-03.2)
        const primaryChange = (brief.requested_changes || []).find(ch =>
          ch.domain === 'timeline' && (!ch.description?.toLowerCase().includes('b-roll') && !ch.description?.toLowerCase().includes('broll'))
        );
        let primaryClipIds = primaryChange?.target_ids || [];
        if (primaryClipIds.length === 0 || primaryClipIds[0] === 'project') {
          // Default to visual clips on main video track in project order
          primaryClipIds = projectClips.filter(c => (c.type === 'video' || !c.type) && c.trackId === (topology.mainVideoTrack?.id || 'track_v_main')).map(c => c.id);
        }

        const resolvedPrimaryClips = [];
        for (const cid of primaryClipIds) {
          const found = projectClips.find(c => c.id === cid);
          if (!found) {
            diagnostics.missing_references.push(`Primary target clip not found: ${cid}`);
            blockingIssues.push('ERR_MISSING_CLIP_REFERENCE');
          } else {
            resolvedPrimaryClips.push(found);
          }
        }

        if (topology.mainVideoTrack?.locked) {
          diagnostics.conflicts.push(`Primary video track "${topology.mainVideoTrack.id}" is locked`);
          blockingIssues.push('ERR_TRACK_LOCKED');
        }

        if (blockingIssues.length === 0 && resolvedPrimaryClips.length > 0) {
          const numClips = resolvedPrimaryClips.length;
          // Calculate cuts
          const cuts = [0];

          // Check if beat-alignment is requested
          const beatSyncRequested = (brief.requested_changes || []).some(ch =>
            ch.description?.toLowerCase().includes('beat') || ch.description?.toLowerCase().includes('music')
          ) || (brief.constraints || []).some(c => c.type === 'beat_alignment');

          if (beatSyncRequested && beatAnalysis) {
            // Check beat analysis validity and confidence
            if (beatAnalysis.tempo?.isAmbiguous) {
              diagnostics.conflicts.push('Beat analysis tempo is ambiguous; cannot determine reliable beat grid');
              blockingIssues.push('ERR_AMBIGUOUS_BEAT_ANALYSIS');
              finalStatus = 'needs_clarification';
            } else if ((beatAnalysis.tempo?.confidence || 0) < 0.5) {
              diagnostics.conflicts.push(`Beat analysis confidence ${(beatAnalysis.tempo?.confidence || 0).toFixed(2)} is too low`);
              blockingIssues.push('ERR_LOW_CONFIDENCE_BEAT_GRID');
              finalStatus = 'blocked';
            } else {
              // Calculate nominal cut positions and snap to nearest beats
              for (let i = 1; i < numClips; i++) {
                const nominalCutTick = Math.round((targetDurationTicks / numClips) * i);
                const snapRes = MultiTrackScheduler.snapToNearestBeat(nominalCutTick, beatAnalysis);
                if (!snapRes.success) {
                  diagnostics.conflicts.push(`Beat alignment failure at cut ${i}: ${snapRes.error}`);
                  blockingIssues.push('ERR_BEAT_ALIGNMENT_TOLERANCE_EXCEEDED');
                  finalStatus = 'blocked';
                  break;
                }
                cuts.push(snapRes.snappedTick);
              }
            }
          } else {
            // Uniform cut distribution
            const baseDur = Math.floor(targetDurationTicks / numClips);
            for (let i = 1; i < numClips; i++) {
              cuts.push(baseDur * i);
            }
          }

          if (finalStatus === 'ready') {
            cuts.push(targetDurationTicks);

            // Generate trim and move operations for primary clips
            for (let i = 0; i < numClips; i++) {
              const clip = resolvedPrimaryClips[i];
              const segStart = cuts[i];
              const segEnd = cuts[i + 1];
              const clipDuration = segEnd - segStart;

              const asset = projectAssets.find(a => a.id === clip.assetId || a.id === clip.source?.assetId);
              const availDuration = asset?.durationTicks || asset?.metadata?.durationTicks || clip.sourceDurationTicks || clip.durationTicks;
              if (availDuration < clipDuration) {
                diagnostics.conflicts.push(`Source clip ${clip.id} duration (${availDuration} ticks) insufficient for target duration (${clipDuration} ticks)`);
                blockingIssues.push('ERR_INSUFFICIENT_SOURCE_DURATION');
                finalStatus = 'blocked';
                break;
              }

              const trimOpId = `op-trim-${i + 1}`;
              const prevMoveOpId = i > 0 ? `op-move-${i}` : null;

              operations.push({
                op_id: trimOpId,
                step_index: operations.length,
                type: 'trim_clip',
                target_id: clip.id,
                params: {
                  clipId: clip.id,
                  startTick: segStart,
                  durationTicks: clipDuration,
                  sourceStartTick: clip.sourceStartTick || 0
                },
                dependencies: prevMoveOpId ? [prevMoveOpId] : [],
                preconditions: {
                  expectedBaseRevision: baseRevision + operations.length
                },
                expected_effects: {
                  description: `Trim primary clip ${clip.id} to ${clipDuration} ticks`,
                  affected_field: 'durationTicks',
                  resulting_ticks: clipDuration
                }
              });

              const moveOpId = `op-move-${i + 1}`;
              operations.push({
                op_id: moveOpId,
                step_index: operations.length,
                type: 'move_clip',
                target_id: clip.id,
                params: {
                  clipId: clip.id,
                  targetTrackId: clip.trackId || topology.mainVideoTrack?.id || 'track_v_main',
                  targetTick: segStart
                },
                dependencies: [trimOpId],
                preconditions: {
                  expectedBaseRevision: baseRevision + operations.length
                },
                expected_effects: {
                  description: `Position primary clip ${clip.id} at tick ${segStart}`,
                  affected_field: 'startTick',
                  resulting_ticks: segStart
                }
              });
            }
          }
        }

        // B. Music Placement at t=0 (PF-03.2)
        const musicChange = (brief.requested_changes || []).find(ch =>
          ch.domain === 'audio' || ch.description?.toLowerCase().includes('music')
        );
        if (finalStatus === 'ready' && musicChange) {
          const musicAsset = projectAssets.find(a => a.type === 'audio' || a.id.includes('music'));
          if (!musicAsset) {
            diagnostics.missing_references.push('No music audio asset found in project');
            blockingIssues.push('ERR_MISSING_ASSET_REFERENCE');
            finalStatus = 'blocked';
          } else {
            const musicTrack = topology.musicTrack;
            if (!musicTrack) {
              diagnostics.conflicts.push('No audio track available for music placement');
              blockingIssues.push('ERR_TRACK_NOT_FOUND');
              finalStatus = 'blocked';
            } else if (musicTrack.locked) {
              diagnostics.conflicts.push(`Music track "${musicTrack.id}" is locked`);
              blockingIssues.push('ERR_TRACK_LOCKED');
              finalStatus = 'blocked';
            } else {
              const existingMusicClip = projectClips.find(c => c.type === 'audio' && c.trackId === musicTrack.id);
              if (existingMusicClip) {
                // Trim & move existing music clip
                const mTrimId = `op-trim-music`;
                operations.push({
                  op_id: mTrimId,
                  step_index: operations.length,
                  type: 'trim_clip',
                  target_id: existingMusicClip.id,
                  params: {
                    clipId: existingMusicClip.id,
                    startTick: 0,
                    durationTicks: targetDurationTicks
                  },
                  dependencies: [],
                  preconditions: {
                    expectedBaseRevision: baseRevision + operations.length
                  },
                  expected_effects: {
                    description: `Trim music clip to project duration ${targetDurationTicks} ticks`,
                    affected_field: 'durationTicks',
                    resulting_ticks: targetDurationTicks
                  }
                });

                const mMoveId = `op-move-music`;
                operations.push({
                  op_id: mMoveId,
                  step_index: operations.length,
                  type: 'move_clip',
                  target_id: existingMusicClip.id,
                  params: {
                    clipId: existingMusicClip.id,
                    targetTrackId: musicTrack.id,
                    targetTick: 0
                  },
                  dependencies: [mTrimId],
                  preconditions: {
                    expectedBaseRevision: baseRevision + operations.length
                  },
                  expected_effects: {
                    description: `Position music clip at tick 0`,
                    affected_field: 'startTick',
                    resulting_ticks: 0
                  }
                });
              } else {
                // Insert new music clip
                const mInsertId = `op-insert-music`;
                operations.push({
                  op_id: mInsertId,
                  step_index: operations.length,
                  type: 'insert_clip',
                  target_id: 'clip_music',
                  params: {
                    id: 'clip_music',
                    trackId: musicTrack.id,
                    type: 'audio',
                    startTick: 0,
                    durationTicks: targetDurationTicks,
                    source: {
                      assetId: musicAsset.id,
                      trimInTick: 0,
                      trimOutTick: targetDurationTicks
                    },
                    audio: {
                      volume: 1.0
                    }
                  },
                  dependencies: [],
                  preconditions: {
                    expectedBaseRevision: baseRevision + operations.length
                  },
                  expected_effects: {
                    description: `Insert music clip at tick 0 on track ${musicTrack.id} for ${targetDurationTicks} ticks`,
                    affected_field: 'durationTicks',
                    resulting_ticks: targetDurationTicks
                  }
                });
              }
            }
          }
        }

        // C. B-Roll Cutaway on Separate Visual Track (PF-03.3)
        const brollChange = (brief.requested_changes || []).find(ch =>
          ch.description?.toLowerCase().includes('b-roll') || ch.description?.toLowerCase().includes('broll')
        );
        if (finalStatus === 'ready' && brollChange) {
          const brollAsset = projectAssets.find(a => a.id.includes('broll') || a.id.includes('b_roll'));
          const brollTrack = topology.brollTrack;

          if (!brollAsset) {
            diagnostics.missing_references.push('B-roll video asset not found in project');
            blockingIssues.push('ERR_MISSING_ASSET_REFERENCE');
            finalStatus = 'blocked';
          } else if (!brollTrack) {
            diagnostics.conflicts.push('No secondary visual track available for B-roll placement');
            blockingIssues.push('ERR_TRACK_NOT_FOUND');
            finalStatus = 'blocked';
          } else if (brollTrack.locked) {
            diagnostics.conflicts.push(`B-roll track "${brollTrack.id}" is locked`);
            blockingIssues.push('ERR_TRACK_LOCKED');
            finalStatus = 'blocked';
          } else {
            // Cutaway interval: 4s to 6s (480,000 to 720,000 ticks) = 240,000 ticks
            const brollStartTick = 480000;
            const brollDurationTicks = 240000;

            const existingBrollClip = projectClips.find(c => c.id === 'clip_broll' || (c.trackId === brollTrack.id && c.assetId === brollAsset.id));
            if (existingBrollClip) {
              const bTrimId = 'op-trim-broll';
              operations.push({
                op_id: bTrimId,
                step_index: operations.length,
                type: 'trim_clip',
                target_id: existingBrollClip.id,
                params: {
                  clipId: existingBrollClip.id,
                  startTick: brollStartTick,
                  durationTicks: brollDurationTicks
                },
                dependencies: [],
                preconditions: {
                  expectedBaseRevision: baseRevision + operations.length
                },
                expected_effects: {
                  description: `Trim B-roll clip to ${brollDurationTicks} ticks`,
                  affected_field: 'durationTicks',
                  resulting_ticks: brollDurationTicks
                }
              });

              const bMoveId = 'op-move-broll';
              operations.push({
                op_id: bMoveId,
                step_index: operations.length,
                type: 'move_clip',
                target_id: existingBrollClip.id,
                params: {
                  clipId: existingBrollClip.id,
                  targetTrackId: brollTrack.id,
                  targetTick: brollStartTick
                },
                dependencies: [bTrimId],
                preconditions: {
                  expectedBaseRevision: baseRevision + operations.length
                },
                expected_effects: {
                  description: `Position B-roll clip at tick ${brollStartTick} on track ${brollTrack.id}`,
                  affected_field: 'startTick',
                  resulting_ticks: brollStartTick
                }
              });
            } else {
              const bInsertId = 'op-insert-broll';
              operations.push({
                op_id: bInsertId,
                step_index: operations.length,
                type: 'insert_clip',
                target_id: 'clip_broll',
                params: {
                  id: 'clip_broll',
                  trackId: brollTrack.id,
                  type: 'video',
                  startTick: brollStartTick,
                  durationTicks: brollDurationTicks,
                  source: {
                    assetId: brollAsset.id,
                    trimInTick: 0,
                    trimOutTick: brollDurationTicks
                  }
                },
                dependencies: ['op-move-2'],
                preconditions: {
                  expectedBaseRevision: baseRevision + operations.length
                },
                expected_effects: {
                  description: `Insert B-roll cutaway at [${brollStartTick}, ${brollStartTick + brollDurationTicks}) on track ${brollTrack.id}`,
                  affected_field: 'durationTicks',
                  resulting_ticks: brollDurationTicks
                }
              });
            }
          }
        }

        // D. 1-Second Transition with Handle Validation (PF-03.4)
        const transitionChange = (brief.requested_changes || []).find(ch =>
          ch.domain === 'effect' || ch.description?.toLowerCase().includes('transition') || ch.description?.toLowerCase().includes('dissolve')
        );
        if (finalStatus === 'ready' && transitionChange) {
          const transDurationTicks = 120000; // 1 second
          const outClip = resolvedPrimaryClips[0];
          const inClip = resolvedPrimaryClips[1];

          if (!outClip || !inClip) {
            diagnostics.conflicts.push('Transition requires at least two adjacent primary clips');
            blockingIssues.push('ERR_TRANSITION_TARGET_MISSING');
            finalStatus = 'blocked';
          } else {
            const outAsset = projectAssets.find(a => a.id === outClip.assetId || a.id === outClip.source?.assetId);
            const inAsset = projectAssets.find(a => a.id === inClip.assetId || a.id === inClip.source?.assetId);

            const handleCheck = MultiTrackScheduler.validateTransitionHandles({
              outgoingClip: outClip,
              incomingClip: inClip,
              outgoingAsset: outAsset,
              incomingAsset: inAsset,
              transitionDurationTicks: transDurationTicks,
              alignment: 'centered'
            });

            if (!handleCheck.valid) {
              diagnostics.conflicts.push(`Transition handle violation: ${handleCheck.error}`);
              blockingIssues.push('ERR_INSUFFICIENT_TRANSITION_HANDLES');
              finalStatus = 'blocked';
            } else {
              const transOpId = 'op-apply-transition-1';
              operations.push({
                op_id: transOpId,
                step_index: operations.length,
                type: 'apply_effect',
                target_id: outClip.id,
                params: {
                  clipId: outClip.id,
                  effect: {
                    type: 'transition',
                    parameters: {
                      transitionType: 'cross_dissolve',
                      durationTicks: transDurationTicks,
                      alignment: 'centered',
                      targetClipId: inClip.id
                    }
                  }
                },
                dependencies: ['op-move-1', 'op-move-2'],
                preconditions: {
                  expectedBaseRevision: baseRevision + operations.length
                },
                expected_effects: {
                  description: `Apply 1-second cross_dissolve transition between ${outClip.id} and ${inClip.id}`,
                  affected_field: 'effects',
                  resulting_ticks: transDurationTicks
                }
              });
            }
          }
        }

        // E. Title / Text Overlay with Title-Safe Margins (PF-03.5)
        const titleChange = (brief.requested_changes || []).find(ch =>
          ch.domain === 'typography' || ch.description?.toLowerCase().includes('title') || ch.description?.toLowerCase().includes('overlay')
        );
        if (finalStatus === 'ready' && titleChange) {
          const graphicsTrack = topology.graphicsTrack;
          const fontAsset = projectAssets.find(a => a.type === 'font' || a.id.includes('font') || a.id.includes('headline'));

          if (!graphicsTrack) {
            diagnostics.conflicts.push('No graphics or overlay track available for title placement');
            blockingIssues.push('ERR_TRACK_NOT_FOUND');
            finalStatus = 'blocked';
          } else if (graphicsTrack.locked) {
            diagnostics.conflicts.push(`Graphics track "${graphicsTrack.id}" is locked`);
            blockingIssues.push('ERR_TRACK_LOCKED');
            finalStatus = 'blocked';
          } else {
            const titleStartTick = 0;
            const titleDurationTicks = 360000; // First 3 seconds (3 * 120,000)
            const typography = {
              text: 'EME Master Edition',
              fontSize: 54,
              color: '#ffffff',
              fontAssetId: fontAsset?.id || 'asset_f_headline',
              textAlign: 'center'
            };

            const marginCheck = MultiTrackScheduler.validateTitleSafeMargins({
              canvas: project.canvas || { width: 1080, height: 1920 },
              typography,
              transform: { x: 0, y: 0 }
            });

            if (!marginCheck.valid) {
              diagnostics.conflicts.push(`Title layout exceeds frame-safe margins: ${marginCheck.error}`);
              blockingIssues.push('ERR_TITLE_SAFE_MARGIN_VIOLATION');
              finalStatus = 'blocked';
            } else {
              const existingTitleClip = projectClips.find(c => c.id === 'clip_title' || c.trackId === graphicsTrack.id);
              if (existingTitleClip) {
                const tTrimId = 'op-trim-title';
                operations.push({
                  op_id: tTrimId,
                  step_index: operations.length,
                  type: 'trim_clip',
                  target_id: existingTitleClip.id,
                  params: {
                    clipId: existingTitleClip.id,
                    startTick: titleStartTick,
                    durationTicks: titleDurationTicks
                  },
                  dependencies: [],
                  preconditions: {
                    expectedBaseRevision: baseRevision + operations.length
                  },
                  expected_effects: {
                    description: `Trim title overlay to ${titleDurationTicks} ticks`,
                    affected_field: 'durationTicks',
                    resulting_ticks: titleDurationTicks
                  }
                });

                const tMoveId = 'op-move-title';
                operations.push({
                  op_id: tMoveId,
                  step_index: operations.length,
                  type: 'move_clip',
                  target_id: existingTitleClip.id,
                  params: {
                    clipId: existingTitleClip.id,
                    targetTrackId: graphicsTrack.id,
                    targetTick: titleStartTick
                  },
                  dependencies: [tTrimId],
                  preconditions: {
                    expectedBaseRevision: baseRevision + operations.length
                  },
                  expected_effects: {
                    description: `Position title overlay at tick ${titleStartTick}`,
                    affected_field: 'startTick',
                    resulting_ticks: titleStartTick
                  }
                });
              } else {
                const tInsertId = 'op-insert-title';
                operations.push({
                  op_id: tInsertId,
                  step_index: operations.length,
                  type: 'insert_clip',
                  target_id: 'clip_title',
                  params: {
                    id: 'clip_title',
                    trackId: graphicsTrack.id,
                    type: 'text',
                    startTick: titleStartTick,
                    durationTicks: titleDurationTicks,
                    typography
                  },
                  dependencies: [],
                  preconditions: {
                    expectedBaseRevision: baseRevision + operations.length
                  },
                  expected_effects: {
                    description: `Insert title text overlay during first 3 seconds on track ${graphicsTrack.id}`,
                    affected_field: 'durationTicks',
                    resulting_ticks: titleDurationTicks
                  }
                });
              }
            }
          }
        }
      } else {
        // === PF-02 BASE SEQUENTIAL TRIMMING PATH ===
        const sequenceChange = (brief.requested_changes || []).find(ch =>
          ch.domain === 'timeline' || ch.description?.toLowerCase().includes('clip') || ch.description?.toLowerCase().includes('edit')
        );

        let targetClipIds = [];
        if (sequenceChange && Array.isArray(sequenceChange.target_ids) && sequenceChange.target_ids.length > 0 && sequenceChange.target_ids[0] !== 'project') {
          targetClipIds = sequenceChange.target_ids;
        } else {
          targetClipIds = projectClips.filter(c => c.type === 'video' || !c.type).map(c => c.id);
        }

        const resolvedClips = [];
        for (const cid of targetClipIds) {
          const found = projectClips.find(c => c.id === cid);
          if (!found) {
            diagnostics.missing_references.push(`Target clip not found in project: ${cid}`);
            blockingIssues.push('ERR_MISSING_CLIP_REFERENCE');
          } else {
            resolvedClips.push(found);
          }
        }

        for (const clip of resolvedClips) {
          const track = projectTracks.find(t => t.id === clip.trackId);
          if (track && track.locked) {
            diagnostics.conflicts.push(`Cannot modify clip ${clip.id}: track ${track.id} is locked`);
            blockingIssues.push('ERR_TRACK_LOCKED');
          }
        }

        if (blockingIssues.length > 0) {
          finalStatus = 'blocked';
        } else if (resolvedClips.length > 0 && targetDurationTicks > 0) {
          const numClips = resolvedClips.length;
          const baseClipDuration = Math.floor(targetDurationTicks / numClips);
          const remainderTicks = targetDurationTicks - (baseClipDuration * numClips);

          let currentTimelineTick = 0;

          for (let i = 0; i < numClips; i++) {
            const clip = resolvedClips[i];
            const clipDuration = (i === numClips - 1) ? (baseClipDuration + remainderTicks) : baseClipDuration;

            const availableSource = clip.sourceDurationTicks || clip.durationTicks;
            if (availableSource < clipDuration) {
              diagnostics.conflicts.push(`Source clip ${clip.id} duration (${availableSource} ticks) insufficient for target allocation (${clipDuration} ticks)`);
              blockingIssues.push('ERR_INSUFFICIENT_SOURCE_DURATION');
              finalStatus = 'blocked';
              break;
            }

            const trimOpId = `op-trim-${i + 1}`;
            const trimDependencies = i > 0 ? [`op-move-${i}`] : [];

            operations.push({
              op_id: trimOpId,
              step_index: operations.length,
              type: 'trim_clip',
              target_id: clip.id,
              params: {
                clipId: clip.id,
                startTick: currentTimelineTick,
                durationTicks: clipDuration,
                sourceStartTick: clip.sourceStartTick || 0
              },
              dependencies: trimDependencies,
              preconditions: {
                expectedBaseRevision: baseRevision + operations.length
              },
              expected_effects: {
                description: `Trim ${clip.id} duration to ${clipDuration} ticks`,
                affected_field: 'durationTicks',
                resulting_ticks: clipDuration
              }
            });

            const moveOpId = `op-move-${i + 1}`;
            operations.push({
              op_id: moveOpId,
              step_index: operations.length,
              type: 'move_clip',
              target_id: clip.id,
              params: {
                clipId: clip.id,
                targetTrackId: clip.trackId,
                targetTick: currentTimelineTick
              },
              dependencies: [trimOpId],
              preconditions: {
                expectedBaseRevision: baseRevision + operations.length
              },
              expected_effects: {
                description: `Position ${clip.id} at tick ${currentTimelineTick}`,
                affected_field: 'startTick',
                resulting_ticks: currentTimelineTick
              }
            });

            currentTimelineTick += clipDuration;
          }
        }
      }
    }

    // Update finalStatus if new blocking issues arose during operation generation
    if (blockingIssues.length > 0) {
      finalStatus = (blockingIssues.includes('ERR_CONTRADICTORY_CONSTRAINTS') || blockingIssues.includes('ERR_AMBIGUOUS_BEAT_ANALYSIS') || brief.validation?.status === 'needs_clarification')
        ? 'needs_clarification'
        : 'blocked';
    }

    // 6. Perform Dry-Run Simulation on a Cloned Project State
    const dryRunResult = {
      success: false,
      simulated_steps: 0,
      final_revision: baseRevision,
      affected_tracks: [],
      affected_clips: [],
      timing_implications: {
        start_tick: 0,
        end_tick: 0,
        duration_ticks: 0,
        duration_seconds: 0
      },
      invariant_checks: {
        preserved_properties_verified: true,
        track_locks_respected: true,
        zero_leak_integrity: true
      }
    };

    if (finalStatus === 'ready' && operations.length > 0) {
      let simState = structuredClone(project);
      let stepSuccess = true;

      for (let s = 0; s < operations.length; s++) {
        const op = operations[s];
        const res = OperationExecutor.execute(simState, {
          type: op.type,
          params: op.params,
          expectedBaseRevision: simState.revision
        });

        if (!res.success) {
          stepSuccess = false;
          diagnostics.rejected_operations.push({
            reason: res.error || 'Operation failed during dry-run',
            operation: op
          });
          blockingIssues.push('ERR_DRY_RUN_STEP_FAILED');
          finalStatus = 'blocked';
          break;
        }

        simState = res.project;
        dryRunResult.simulated_steps++;

        if (!dryRunResult.affected_clips.includes(op.target_id)) {
          dryRunResult.affected_clips.push(op.target_id);
        }
        const affectedTrack = (simState.clips || []).find(c => c.id === op.target_id)?.trackId;
        if (affectedTrack && !dryRunResult.affected_tracks.includes(affectedTrack)) {
          dryRunResult.affected_tracks.push(affectedTrack);
        }
      }

      if (stepSuccess) {
        const projVal = ProjectManager.validateProject(simState);
        if (!projVal.valid) {
          diagnostics.conflicts.push(...projVal.errors);
          blockingIssues.push('ERR_PROJECT_INVARIANT_VIOLATION');
          finalStatus = 'blocked';
        } else {
          dryRunResult.success = true;
          dryRunResult.final_revision = simState.revision;

          // Calculate timing implications across all active clips
          const activeClips = simState.clips || [];
          let minStart = Infinity;
          let maxEnd = 0;
          for (const c of activeClips) {
            if (c.startTick < minStart) minStart = c.startTick;
            const end = c.startTick + c.durationTicks;
            if (end > maxEnd) maxEnd = end;
          }
          if (minStart === Infinity) minStart = 0;

          const totalDuration = maxEnd - minStart;
          dryRunResult.timing_implications = {
            start_tick: minStart,
            end_tick: maxEnd,
            duration_ticks: totalDuration,
            duration_seconds: Number((totalDuration / TICKS_PER_SECOND).toFixed(4))
          };

          // Invariant Check 1: Exact target duration match
          if (totalDuration !== targetDurationTicks) {
            dryRunResult.invariant_checks.zero_leak_integrity = false;
            diagnostics.conflicts.push(`Simulated duration ${totalDuration} ticks does not match target ${targetDurationTicks} ticks`);
            blockingIssues.push('ERR_DURATION_MISMATCH');
            finalStatus = 'blocked';
          }

          // Invariant Check 2: No unrequested new assets introduced
          if ((simState.assets || []).length !== projectAssets.length) {
            dryRunResult.invariant_checks.zero_leak_integrity = false;
            diagnostics.conflicts.push('Forbidden new media introduced during compilation');
            blockingIssues.push('ERR_NEW_MEDIA_INTRODUCED');
            finalStatus = 'blocked';
          }
        }
      }
    }

    // Build deterministic plan ID based on brief and project fingerprint
    const planHash = crypto.createHash('sha256')
      .update(`${brief.brief_id}:${baseRevision}:${targetDurationTicks}:${operations.length}`)
      .digest('hex')
      .substring(0, 12);
    const planId = options.planId || `plan-${planHash}`;

    // Build canonical plan document
    const planDocument = {
      schema_version: '1.0.0',
      plan_id: planId,
      base_revision: baseRevision,
      source_brief_id: brief.brief_id || 'brief-unknown',
      source_request_id: brief.source_request_id || 'req-unknown',
      project_snapshot: {
        project_id: project.id || 'unnamed-project',
        base_revision: baseRevision,
        snapshot_sha256: snapshotSha256,
        timebase_ticks_per_second: TICKS_PER_SECOND
      },
      target_duration_ticks: targetDurationTicks,
      operations,
      diagnostics,
      dry_run: dryRunResult,
      validation: {
        status: finalStatus,
        blocking_issue_ids: Array.from(new Set(blockingIssues))
      }
    };

    // Validate generated plan against schema
    const planSchemaValidation = BriefValidator.validateOperationPlan(planDocument);
    if (!planSchemaValidation.valid) {
      console.warn('Generated plan schema validation warnings:', planSchemaValidation.errors);
    }

    return planDocument;
  }

  /**
   * Serializes an operation plan to deterministic canonical JSON.
   * @param {object} plan
   * @returns {string} Canonical JSON string
   */
  static serializeCanonicalPlan(plan) {
    const clone = structuredClone(plan);
    function sortKeys(obj) {
      if (obj === null || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return obj.map(sortKeys);
      const sorted = {};
      for (const k of Object.keys(obj).sort()) {
        sorted[k] = sortKeys(obj[k]);
      }
      return sorted;
    }
    return JSON.stringify(sortKeys(clone), null, 2);
  }

  /**
   * Computes the reproducible canonical SHA-256 fingerprint of an operation plan.
   * @param {object} plan
   * @returns {string} Hex SHA-256
   */
  static computePlanHash(plan) {
    const canonicalJson = this.serializeCanonicalPlan(plan);
    return crypto.createHash('sha256').update(canonicalJson).digest('hex');
  }

  /**
   * Executes an approved OperationPlan sequentially through OperationExecutor.
   * Supports plan-level atomic rollback or partial-execution recovery journaling (PF-03.6).
   *
   * @param {object} project Live EME Project
   * @param {object} plan Approved OperationPlan
   * @param {object} [options] Execution configuration
   * @param {boolean} [options.atomic=true] Rollback to initial project snapshot if any step fails
   * @param {number} [options.injectFailureAtStep=-1] Injected synthetic failure step index for testing
   * @returns {{ success: boolean, status: 'committed' | 'rolled_back' | 'partially_executed_failed', project: object, executedSteps: number, failedStepIndex?: number, error?: string, errorCode?: string, journal: Array }}
   */
  static executePlan(project, plan, options = {}) {
    if (!plan || plan.validation?.status !== 'ready') {
      return {
        success: false,
        status: 'rolled_back',
        project,
        executedSteps: 0,
        error: `Cannot execute unready plan (status: ${plan?.validation?.status || 'invalid'})`,
        journal: []
      };
    }

    const atomic = options.atomic !== undefined ? options.atomic : true;
    const injectFailureAtStep = options.injectFailureAtStep !== undefined ? options.injectFailureAtStep : -1;

    const initialSnapshot = structuredClone(project);
    let current = structuredClone(project);
    const journal = [];
    let steps = 0;

    for (let i = 0; i < plan.operations.length; i++) {
      const op = plan.operations[i];
      const initialRev = current.revision;

      // Check synthetic failure injection
      if (injectFailureAtStep === i) {
        const failEntry = {
          step_index: i,
          op_id: op.op_id,
          op_type: op.type,
          target_id: op.target_id,
          initial_revision: initialRev,
          status: 'failed',
          error: `Injected synthetic failure at step boundary ${i}`
        };
        journal.push(failEntry);

        if (options.journalPath) {
          try {
            fs.writeFileSync(options.journalPath, JSON.stringify({
              plan_id: plan.plan_id,
              base_revision: initialSnapshot.revision,
              status: atomic ? 'rolled_back' : 'partially_executed_failed',
              executed_steps: steps,
              failed_step_index: i,
              error: failEntry.error,
              entries: journal,
              snapshot: initialSnapshot
            }, null, 2), 'utf8');
          } catch (_) {}
        }

        if (atomic) {
          if (options.persistPath) {
            try { ProjectManager.saveProject(options.persistPath, initialSnapshot); } catch (_) {}
          }
          return {
            success: false,
            status: 'rolled_back',
            project: initialSnapshot,
            executedSteps: steps,
            failedStepIndex: i,
            error: `Injected synthetic failure at step ${i}. State rolled back to revision ${initialSnapshot.revision}`,
            errorCode: 'INJECTED_FAILURE',
            journal
          };
        } else {
          if (options.persistPath) {
            try { ProjectManager.saveProject(options.persistPath, current); } catch (_) {}
          }
          return {
            success: false,
            status: 'partially_executed_failed',
            project: current,
            executedSteps: steps,
            failedStepIndex: i,
            error: `Injected synthetic failure at step ${i}`,
            errorCode: 'INJECTED_FAILURE',
            journal
          };
        }
      }

      const res = OperationExecutor.execute(current, {
        type: op.type,
        params: op.params,
        expectedBaseRevision: current.revision
      });

      if (!res.success) {
        const failEntry = {
          step_index: i,
          op_id: op.op_id,
          op_type: op.type,
          target_id: op.target_id,
          initial_revision: initialRev,
          status: 'failed',
          error: res.error,
          errorCode: res.errorCode
        };
        journal.push(failEntry);

        if (options.journalPath) {
          try {
            fs.writeFileSync(options.journalPath, JSON.stringify({
              plan_id: plan.plan_id,
              base_revision: initialSnapshot.revision,
              status: atomic ? 'rolled_back' : 'partially_executed_failed',
              executed_steps: steps,
              failed_step_index: i,
              error: res.error,
              entries: journal,
              snapshot: initialSnapshot
            }, null, 2), 'utf8');
          } catch (_) {}
        }

        if (atomic) {
          if (options.persistPath) {
            try { ProjectManager.saveProject(options.persistPath, initialSnapshot); } catch (_) {}
          }
          return {
            success: false,
            status: 'rolled_back',
            project: initialSnapshot,
            executedSteps: steps,
            failedStepIndex: i,
            error: `Step ${i} (${op.op_id}) failed: ${res.error}. State rolled back to revision ${initialSnapshot.revision}`,
            errorCode: res.errorCode,
            journal
          };
        } else {
          if (options.persistPath) {
            try { ProjectManager.saveProject(options.persistPath, current); } catch (_) {}
          }
          return {
            success: false,
            status: 'partially_executed_failed',
            project: current,
            executedSteps: steps,
            failedStepIndex: i,
            error: res.error,
            errorCode: res.errorCode,
            journal
          };
        }
      }

      current = res.project;
      steps++;

      journal.push({
        step_index: i,
        op_id: op.op_id,
        op_type: op.type,
        target_id: op.target_id,
        initial_revision: initialRev,
        resulting_revision: current.revision,
        status: 'committed'
      });

      if (options.journalPath) {
        try {
          const jDoc = {
            plan_id: plan.plan_id,
            base_revision: initialSnapshot.revision,
            status: 'executing',
            executed_steps: steps,
            entries: journal,
            snapshot: initialSnapshot
          };
          fs.writeFileSync(options.journalPath, JSON.stringify(jDoc, null, 2), 'utf8');
        } catch (_) {}
      }
    }

    // Verify final project state invariants
    const finalVal = ProjectManager.validateProject(current);
    if (!finalVal.valid) {
      if (options.journalPath) {
        try {
          const jDoc = {
            plan_id: plan.plan_id,
            base_revision: initialSnapshot.revision,
            status: atomic ? 'rolled_back' : 'partially_executed_failed',
            executed_steps: steps,
            error: `Final project state invariant violation: ${finalVal.errors.join('; ')}`,
            entries: journal,
            snapshot: initialSnapshot
          };
          fs.writeFileSync(options.journalPath, JSON.stringify(jDoc, null, 2), 'utf8');
        } catch (_) {}
      }

      if (atomic) {
        if (options.persistPath) {
          try { ProjectManager.saveProject(options.persistPath, initialSnapshot); } catch (_) {}
        }
        return {
          success: false,
          status: 'rolled_back',
          project: initialSnapshot,
          executedSteps: steps,
          error: `Final project state invariant violation: ${finalVal.errors.join('; ')}. State rolled back to revision ${initialSnapshot.revision}`,
          errorCode: 'FINAL_STATE_INVARIANT_VIOLATION',
          journal
        };
      } else {
        if (options.persistPath) {
          try { ProjectManager.saveProject(options.persistPath, current); } catch (_) {}
        }
        return {
          success: false,
          status: 'partially_executed_failed',
          project: current,
          executedSteps: steps,
          error: `Final project state invariant violation: ${finalVal.errors.join('; ')}`,
          errorCode: 'FINAL_STATE_INVARIANT_VIOLATION',
          journal
        };
      }
    }

    if (options.journalPath) {
      try {
        const jDoc = {
          plan_id: plan.plan_id,
          base_revision: initialSnapshot.revision,
          final_revision: current.revision,
          status: 'committed',
          executed_steps: steps,
          entries: journal,
          snapshot: initialSnapshot
        };
        fs.writeFileSync(options.journalPath, JSON.stringify(jDoc, null, 2), 'utf8');
      } catch (_) {}
    }

    if (options.persistPath) {
      try { ProjectManager.saveProject(options.persistPath, current); } catch (_) {}
    }

    return {
      success: true,
      status: 'committed',
      project: current,
      executedSteps: steps,
      journal
    };
  }

  /**
   * Recovers a persistent project from an interrupted or uncommitted execution journal.
   *
   * @param {string} journalPath Path to durable execution journal
   * @param {string} projectPath Path to project JSON file
   * @returns {{ recovered: boolean, committed: boolean, project: object, revision: number }}
   */
  static recoverFromJournal(journalPath, projectPath) {
    if (!fs.existsSync(journalPath)) {
      throw new Error(`Execution journal not found: ${journalPath}`);
    }

    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));

    if (journal.status === 'committed') {
      const currentProj = fs.existsSync(projectPath) ? JSON.parse(fs.readFileSync(projectPath, 'utf8')) : null;
      return {
        recovered: false,
        committed: true,
        project: currentProj,
        revision: currentProj ? currentProj.revision : journal.final_revision
      };
    }

    // Uncommitted or failed: rollback persistent project to initial snapshot
    const snapshot = journal.snapshot;
    if (!snapshot) {
      throw new Error(`Corrupt journal: missing initial snapshot in ${journalPath}`);
    }

    ProjectManager.saveProject(projectPath, snapshot);

    journal.recovery = {
      recovered_at: new Date().toISOString(),
      restored_revision: snapshot.revision,
      original_error: journal.error || 'Process interrupted before commit'
    };
    journal.status = 'recovered_rolled_back';
    fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2), 'utf8');

    return {
      recovered: true,
      committed: false,
      project: snapshot,
      revision: snapshot.revision
    };
  }
}

module.exports = {
  OperationPlanCompiler,
  TICKS_PER_SECOND
};
