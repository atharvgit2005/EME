import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runCheckpoints } from '../src/decision-fabric/validation/checkpoint-runner.js';

describe('Laya Validation Checkpoints (CP1 - CP4 Certification)', () => {
  it('Checkpoint 1: Semantic Intent Boundaries - Accuracy >= 95%, Compound Recall >= 95%, Over-escalation <= 10%', async () => {
    const results = await runCheckpoints();
    const cp1 = results.summary.checkpoint1;

    assert.ok(cp1.accuracy >= 0.95, `Expected accuracy >= 0.95, got ${cp1.accuracy}`);
    assert.ok(cp1.compoundEscalationRecall >= 0.95, `Expected compound recall >= 0.95, got ${cp1.compoundEscalationRecall}`);
    assert.ok(cp1.clearOverEscalationRate <= 0.10, `Expected clear over-escalation <= 0.10, got ${cp1.clearOverEscalationRate}`);
    assert.strictEqual(cp1.correct, cp1.total, `All ${cp1.total} Checkpoint 1 challenge prompts must pass`);
  });

  it('Checkpoint 2: Creative Color Mood Nuance - Supported Accuracy >= 90%, Review Recall = 100%, 0 Sentinel Violations', async () => {
    const results = await runCheckpoints();
    const cp2 = results.summary.checkpoint2;

    assert.ok(cp2.supportedAccuracy >= 0.90, `Expected supported accuracy >= 0.90, got ${cp2.supportedAccuracy}`);
    assert.strictEqual(cp2.reviewRecall, 1.0, `Expected review recall 1.0 for out-of-scope/unsupported briefs, got ${cp2.reviewRecall}`);
    assert.strictEqual(cp2.sentinelViolations, 0, 'Sentinel needs_review must NEVER be passed as a candidate LUT ID');
  });

  it('Checkpoint 3: Negation, Constraints & Prerequisites - 0 Forbidden Action Leaks, 0 Constraint Leaks, 0 Prerequisite Bypasses', async () => {
    const results = await runCheckpoints();
    const cp3 = results.summary.checkpoint3;

    assert.strictEqual(cp3.forbiddenActionLeaks, 0, 'Hard Safety Gate: 0 forbidden action execution leaks');
    assert.strictEqual(cp3.constraintLeaks, 0, 'Hard Safety Gate: 0 constraint leaks');
    assert.strictEqual(cp3.prerequisiteBypasses, 0, 'Hard Safety Gate: 0 prerequisite bypasses');
    assert.strictEqual(cp3.hardSafetyGatePassed, true, 'Hard safety gate must pass completely');
  });

  it('Checkpoint 4: Diagnostics & Certification Report generation', async () => {
    const results = await runCheckpoints();
    assert.ok(results.summary.checkpoint1.macroF1 >= 0.95, 'Macro-F1 must be >= 0.95');
    assert.strictEqual(results.details.checkpoint3.length, 12, '12 negation/adversarial cases verified');
  });
});
