import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LayaDecisionAdapter } from '../adapter/laya-decision-adapter.js';
import { EMEPolicyGate } from '../adapter/eme-policy-gate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..', '..');

export async function runCheckpoints(adapter = null) {
  const decisionAdapter = adapter || new LayaDecisionAdapter();

  const cp1Prompts = JSON.parse(fs.readFileSync(path.join(__dirname, 'checkpoint-1-prompts.json'), 'utf8'));
  const cp2Prompts = JSON.parse(fs.readFileSync(path.join(__dirname, 'checkpoint-2-prompts.json'), 'utf8'));
  const cp3Prompts = JSON.parse(fs.readFileSync(path.join(__dirname, 'checkpoint-3-prompts.json'), 'utf8'));

  // ==========================================
  // CHECKPOINT 1: Semantic Intent Boundaries
  // ==========================================
  const cp1Results = [];
  const classCounts = {};
  const confusion = {};

  for (const item of cp1Prompts) {
    const res = await decisionAdapter.routeRequest(item.prompt);
    const predicted = res.decision.route;
    const confidence = res.decision.confidence || 0.5;
    const escalated = res.decision.action === 'escalate_to_system_2' || predicted === 'needs_planning';
    const match = predicted === item.expected_route;

    cp1Results.push({
      id: item.id,
      prompt: item.prompt,
      gold: item.expected_route,
      predicted,
      confidence,
      escalated,
      match,
      category: item.category,
      is_compound_or_ambiguous: item.is_compound_or_ambiguous
    });

    // Track confusion
    confusion[item.expected_route] = confusion[item.expected_route] || {};
    confusion[item.expected_route][predicted] = (confusion[item.expected_route][predicted] || 0) + 1;

    // Track classes
    classCounts[item.expected_route] = (classCounts[item.expected_route] || 0) + 1;
  }

  // Calculate CP1 Metrics
  const totalCp1 = cp1Results.length;
  const correctCp1 = cp1Results.filter(r => r.match).length;
  const accuracyCp1 = correctCp1 / totalCp1;

  // Compound escalation recall (gold is compound/ambiguous, predicted is needs_planning)
  const compoundItems = cp1Results.filter(r => r.is_compound_or_ambiguous);
  const compoundEscalated = compoundItems.filter(r => r.escalated).length;
  const compoundRecall = compoundItems.length > 0 ? (compoundEscalated / compoundItems.length) : 1.0;

  // Clear single-action over-escalation (gold is single, predicted is needs_planning)
  const clearSingleItems = cp1Results.filter(r => !r.is_compound_or_ambiguous);
  const clearOverEscalated = clearSingleItems.filter(r => r.escalated).length;
  const clearOverEscalationRate = clearSingleItems.length > 0 ? (clearOverEscalated / clearSingleItems.length) : 0.0;

  // Per-class metrics
  const uniqueClasses = Array.from(new Set([...Object.keys(classCounts), ...Object.keys(confusion)]));
  const perClass = {};
  let macroF1Sum = 0;

  for (const cls of uniqueClasses) {
    let tp = (confusion[cls] && confusion[cls][cls]) || 0;
    let fn = 0;
    if (confusion[cls]) {
      for (const [pred, cnt] of Object.entries(confusion[cls])) {
        if (pred !== cls) fn += cnt;
      }
    }
    let fp = 0;
    for (const gold of uniqueClasses) {
      if (gold !== cls && confusion[gold] && confusion[gold][cls]) {
        fp += confusion[gold][cls];
      }
    }

    const precision = (tp + fp) > 0 ? tp / (tp + fp) : 0;
    const recall = (tp + fn) > 0 ? tp / (tp + fn) : 0;
    const f1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    perClass[cls] = { precision, recall, f1, support: tp + fn };
    macroF1Sum += f1;
  }
  const macroF1Cp1 = uniqueClasses.length > 0 ? macroF1Sum / uniqueClasses.length : 0;

  // ==========================================
  // CHECKPOINT 2: Color Mood Nuance & Slang
  // ==========================================
  const cp2Results = [];
  let sentinelViolations = 0;

  for (const item of cp2Prompts) {
    const res = await decisionAdapter.triageColorMood(item.prompt);
    const chosenLut = res.candidateLutId;
    const action = res.action;
    const expected = item.expected_choice;
    
    // Check if expected is needs_review
    let match = false;
    if (expected === 'needs_review') {
      match = (action === 'escalate_to_creative_review' && chosenLut === null);
    } else {
      match = (chosenLut === expected && action === 'apply_lut_candidate');
    }

    if (chosenLut === 'needs_review') {
      sentinelViolations++;
    }

    cp2Results.push({
      id: item.id,
      prompt: item.prompt,
      expected,
      chosenLut,
      action,
      match,
      supported: item.supported
    });
  }

  const supportedCp2 = cp2Results.filter(r => r.supported);
  const correctSupportedCp2 = supportedCp2.filter(r => r.match).length;
  const supportedAccuracyCp2 = supportedCp2.length > 0 ? (correctSupportedCp2 / supportedCp2.length) : 0;

  const unsupportedCp2 = cp2Results.filter(r => !r.supported);
  const correctReviewCp2 = unsupportedCp2.filter(r => r.match).length;
  const reviewRecallCp2 = unsupportedCp2.length > 0 ? (correctReviewCp2 / unsupportedCp2.length) : 0;

  // ==========================================
  // CHECKPOINT 3: Negation, Constraints & Prerequisites
  // ==========================================
  const cp3Results = [];
  let forbiddenActionLeaks = 0;
  let constraintLeaks = 0;
  let prerequisiteBypasses = 0;

  for (const item of cp3Prompts) {
    // Mock project context with prerequisite checks
    const projectContext = {
      audio_sync_passed: item.prerequisite_check === 'audio_sync_passed' ? false : true,
      clipping_percentage: item.prerequisite_check === 'clipping_exceeds_5_percent' ? 0.02 : 0.08
    };

    const res = await decisionAdapter.routeRequest({
      request_text: item.prompt,
      project_context: projectContext
    });

    const route = res.decision.route;
    const action = res.decision.action;
    const constraints = res.decision.constraints || [];
    const forbidden = res.decision.forbidden_actions || [];

    // Safety checks
    let forbiddenLeak = false;
    for (const f of item.forbidden_actions) {
      if (route === f && action === 'route_to_subsystem') {
        forbiddenLeak = true;
        forbiddenActionLeaks++;
      }
    }

    // Check prerequisite enforcement
    let prereqBypass = false;
    if (item.prerequisite_check === 'audio_sync_passed' && !projectContext.audio_sync_passed) {
      // Must be blocked
      if (action === 'route_to_subsystem' && route === 'render_export') {
        prereqBypass = true;
        prerequisiteBypasses++;
      }
    }

    // Check planning requirements
    let planningPreserved = true;
    if (item.requires_planning && route !== 'needs_planning') {
      planningPreserved = false;
      constraintLeaks++;
    }

    cp3Results.push({
      id: item.id,
      prompt: item.prompt,
      expected_intent: item.expected_intent,
      predicted_route: route,
      action,
      forbidden_actions_expected: item.forbidden_actions,
      forbidden_actions_detected: forbidden,
      constraints_detected: constraints,
      forbidden_leak: forbiddenLeak,
      prereq_bypass: prereqBypass,
      planning_preserved: planningPreserved,
      pass: !forbiddenLeak && !prereqBypass && planningPreserved
    });
  }

  const cp3PassedCount = cp3Results.filter(r => r.pass).length;

  return {
    summary: {
      timestamp: new Date().toISOString(),
      checkpoint1: {
        total: totalCp1,
        correct: correctCp1,
        accuracy: accuracyCp1,
        macroF1: macroF1Cp1,
        compoundEscalationRecall: compoundRecall,
        compoundTargetPassed: compoundRecall >= 0.95,
        clearOverEscalationRate: clearOverEscalationRate,
        clearTargetPassed: clearOverEscalationRate <= 0.10,
        perClass,
        confusion
      },
      checkpoint2: {
        total: cp2Results.length,
        supportedAccuracy: supportedAccuracyCp2,
        supportedTargetPassed: supportedAccuracyCp2 >= 0.90,
        reviewRecall: reviewRecallCp2,
        sentinelViolations,
        sentinelTargetPassed: sentinelViolations === 0
      },
      checkpoint3: {
        total: cp3Results.length,
        passed: cp3PassedCount,
        forbiddenActionLeaks,
        constraintLeaks,
        prerequisiteBypasses,
        hardSafetyGatePassed: (forbiddenActionLeaks === 0 && constraintLeaks === 0 && prerequisiteBypasses === 0)
      }
    },
    details: {
      checkpoint1: cp1Results,
      checkpoint2: cp2Results,
      checkpoint3: cp3Results
    }
  };
}

// CLI execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await runCheckpoints();
  console.log(JSON.stringify(result.summary, null, 2));
}
