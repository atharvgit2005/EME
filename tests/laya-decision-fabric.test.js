import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LayaDecisionAdapter } from '../src/decision-fabric/adapter/laya-decision-adapter.js';
import { EMEPolicyGate } from '../src/decision-fabric/adapter/eme-policy-gate.js';

test('Laya Decision Fabric: System 1 Decision Engine & Policy Gate', async (t) => {
  const adapter = new LayaDecisionAdapter();
  const policyGate = new EMEPolicyGate();

  await t.test('1. All 10 canonical single-step intents route to approved subsystems', async () => {
    const testCases = [
      { text: 'Transcribe the spoken dialogue from interview take 3', expected: 'transcription' },
      { text: 'Generate word-level timed captions with yellow highlight styling', expected: 'subtitle_generation' },
      { text: 'Remove background air conditioner hum and normalize audio to -14 LUFS', expected: 'audio_cleanup' },
      { text: 'Find the strongest 15-second soundbites and select B-roll candidates', expected: 'clip_selection' },
      { text: 'Add animated lower-third title card for Dr. Sarah Chen', expected: 'motion_graphics' },
      { text: 'Apply warm golden 3D LUT look with protected highlights', expected: 'color_grading' },
      { text: 'Ripple trim clip 2 tail by 24 frames on track 1', expected: 'timeline_manipulation' },
      { text: 'Render final project to 1080p MP4 deliverable with verified manifest', expected: 'render_export' },
      { text: 'Run QA audit inspecting timeline for blank frame flashes and audio clipping', expected: 'media_qa' },
      { text: 'Interpret this complex brief and plan out a multi-step sequence', expected: 'needs_planning' }
    ];

    for (const tc of testCases) {
      const res = await adapter.routeRequest(tc.text);
      assert.equal(res.success, true);
      assert.equal(res.decision.route, tc.expected, `Failed for input: "${tc.text}"`);
      assert.ok(['route_to_subsystem', 'escalate_to_system_2'].includes(res.decision.action));
      assert.ok(res.traceId, 'Must include audit trace ID');
      assert.ok(res.timestamp, 'Must include audit timestamp');
    }
  });

  await t.test('2. Compound requests trigger multistep escalation to System 2', async () => {
    const compoundPrompt = 'Find the strongest clips, create captions, add animated titles, balance audio, and export a polished vertical reel';
    const res = await adapter.routeRequest(compoundPrompt);

    assert.equal(res.success, true);
    assert.equal(res.decision.route, 'needs_planning');
    assert.equal(res.decision.action, 'escalate_to_system_2');
    assert.match(res.decision.reason, /needs_planning|multistep/i);
  });

  await t.test('3. Deterministic project invariant failure halts execution before model inference', () => {
    const state = {
      request_text: 'Ripple trim clip 2 tail by 10 frames',
      project_context: {
        missing_assets: true
      }
    };

    const mockPred = {
      answers: {
        intent: { choice: 'timeline_manipulation', confidence: 0.99 },
        requires_multistep_plan: { noul: 0.01 }
      }
    };

    const res = policyGate.evaluateRoute(mockPred, state);
    assert.equal(res.decision.approved, false);
    assert.equal(res.decision.action, 'reject');
    assert.match(res.decision.reason, /Deterministic project invariant failure: missing source assets/);
  });

  await t.test('4. Closed vocabulary strictly rejects unknown routes and falls back safely', () => {
    const malformedPred = {
      answers: {
        intent: { choice: 'generate_unreal_engine_level', confidence: 0.99 },
        requires_multistep_plan: { noul: 0.01 }
      }
    };

    const res = policyGate.evaluateRoute(malformedPred, { request_text: 'Make 3D game level' });
    assert.equal(res.decision.approved, false);
    assert.equal(res.decision.action, 'escalate_to_system_2');
    assert.equal(res.decision.route, 'needs_planning');
    assert.match(res.decision.reason, /outside allowlisted vocabulary/);
  });

  await t.test('5. Color mood triage maps to certified LUTs and isolates needs_review sentinel', async () => {
    // Certified looks
    const goldenRes = await adapter.triageColorMood('Please give this outdoor scene a warm golden sunlit look');
    assert.equal(goldenRes.approved, true);
    assert.equal(goldenRes.candidateLutId, 'warm_golden');
    assert.equal(goldenRes.action, 'apply_lut_candidate');

    const tealOrangeRes = await adapter.triageColorMood('Apply teal and orange blockbuster grade');
    assert.equal(tealOrangeRes.approved, true);
    assert.equal(tealOrangeRes.candidateLutId, 'teal_orange');

    const bleachRes = await adapter.triageColorMood('Desaturated high contrast bleach bypass aesthetic');
    assert.equal(bleachRes.approved, true);
    assert.equal(bleachRes.candidateLutId, 'bleach_bypass');

    const trueToneRes = await adapter.triageColorMood('Natural true tone faithful color balance');
    assert.equal(trueToneRes.approved, true);
    assert.equal(trueToneRes.candidateLutId, 'true_tone');

    // Ambiguous look -> must trigger sentinel needs_review
    const ambiguousRes = await adapter.triageColorMood('make it pop with weird neon purple vibes');
    assert.equal(ambiguousRes.approved, true);
    assert.equal(ambiguousRes.candidateLutId, null, 'needs_review MUST NEVER be passed as candidate LUT ID');
    assert.equal(ambiguousRes.action, 'escalate_to_creative_review');
  });

  await t.test('6. Timeline arbiter evaluates gap risk, pacing energy, and snapping mode without mutations', async () => {
    // Case A: Unintended cut gaps detected in audit
    const gapAudit = { cut_gaps_count: 3, user_permitted_gaps: false };
    const arbA = await adapter.arbitrateTimeline(gapAudit, 'fast energetic pacing, snap to beat');

    assert.equal(arbA.advisoryOnly, true, 'Must remain advisory only');
    assert.equal(arbA.gapReviewRequired, true, 'Unintended gaps must trigger review');
    assert.ok(arbA.gapRiskProbability >= 0.60);
    assert.equal(arbA.pacingEnergyScore, 4);
    assert.equal(arbA.proposedSnappingMode, 'beat');

    // Case B: Explicitly permitted gaps
    const permittedAudit = { cut_gaps_count: 2, user_permitted_gaps: true };
    const arbB = await adapter.arbitrateTimeline(permittedAudit, 'calm and slow pacing, snap to frame');

    assert.equal(arbB.gapReviewRequired, false, 'User permitted gaps must not flag as critical risk');
    assert.ok(arbB.gapRiskProbability < 0.60);
    assert.equal(arbB.pacingEnergyScore, 1);
    assert.equal(arbB.proposedSnappingMode, 'frame');
  });

  await t.test('7. Interface resilience: handles null, empty, and corrupt predictions safely', () => {
    const corruptCases = [
      null,
      {},
      { answers: null },
      { answers: { intent: null } }
    ];

    for (const c of corruptCases) {
      const res = policyGate.evaluateRoute(c, {});
      assert.equal(res.decision.approved, false);
      assert.equal(res.decision.route, 'needs_planning');
      assert.equal(res.decision.action, 'escalate_to_system_2');
    }
  });

  await t.test('8. Latency requirement: warm routing is sub-10ms (well within <= 100ms release gate)', async () => {
    const prompt = 'Apply warm golden grade to clip 1';
    // Warmup
    await adapter.routeRequest(prompt);

    const iters = 20;
    const times = [];
    for (let i = 0; i < iters; i++) {
      const t0 = performance.now();
      await adapter.routeRequest(prompt);
      times.push(performance.now() - t0);
    }

    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)];
    assert.ok(p95 <= 10.0, `P95 latency was ${p95.toFixed(2)}ms, expected <= 10.0ms`);
  });
});
