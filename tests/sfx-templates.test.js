const test = require('node:test'), assert = require('node:assert/strict');
const { AudioIntelligenceFacade: audio } = require('../src/audio/facade.js');
const { StudioMcpServer } = require('../src/studio/mcp.js');
const { synthesizeImpact, synthesizeRiser, synthesizeGlitch, synthesizeWhoosh } = require('../src/audio/sfx');
const { encodeStereoWav } = require('../src/audio/sfx/synth/primitives.js');

test('Procedural edges are silent, seed zero is honored and invalid DSP inputs fail', () => {
  for (const synth of [synthesizeImpact, synthesizeRiser, synthesizeGlitch, synthesizeWhoosh]) {
    const wav = synth({ durationSeconds: .2, seed: 0 });
    for (const offset of [44, 46, wav.length - 4, wav.length - 2]) assert.equal(wav.readInt16LE(offset), 0);
    assert.ok(!wav.equals(synth({ durationSeconds: .2, seed: 1 })));
    for (const durationSeconds of [NaN, Infinity, -1, 0, 1000]) assert.throws(() => synth({ durationSeconds }), /ERR_SFX_DURATION/);
  }
  assert.throws(() => encodeStereoWav(new Float32Array([NaN]), new Float32Array([0])), /NONFINITE/);
});

test('All six materials are reproducible, distinct and bounded', () => {
  const hashes = new Set();
  for (const { id } of audio.listSfxTemplates()) {
    const r = audio.renderSfxTemplate(id, { seed: 0 });
    assert.ok(r.wav.equals(audio.renderSfxTemplate(id, { seed: 0 }).wav));
    assert.ok(!r.wav.equals(audio.renderSfxTemplate(id, { seed: 1 }).wav));
    assert.equal(r.wav.readUInt32LE(24), 48000);
    assert.equal(r.durationTicks, (r.wav.length - 44) / 4 * 2.5);
    for (const offset of [44, 46, r.wav.length - 4, r.wav.length - 2]) assert.equal(r.wav.readInt16LE(offset), 0);
    hashes.add(require('node:crypto').createHash('sha256').update(r.wav).digest('hex'));
  }
  assert.equal(hashes.size, 6);
  assert.throws(() => audio.renderSfxTemplate('__proto__'), /TEMPLATE/);
  assert.throws(() => audio.renderSfxTemplate('digital-lock', { intensity: NaN }), /OPTIONS/);
});

test('Context planner preserves silence, speech, handles and stable seeds', () => {
  const events = [
    { id: 'cut', kind: 'cut', tick: 120000 },
    { id: 'opening', kind: 'transition', tick: 0 },
    { id: 'title', kind: 'title', tick: 240000, salience: .4 },
    { id: 'hero', kind: 'accent', tick: 300000, salience: 1 },
    { id: 'repeat', kind: 'accent', tick: 301000, salience: .9 },
    { id: 'end', kind: 'transition', tick: 599999 },
  ];
  const options = { profile: 'editorial', durationTicks: 600000, dialogueIntervals: [{ startTick: 220000, endTick: 360000 }] };
  const plan = audio.planSfxTemplates(events, options);
  assert.deepEqual(plan, audio.planSfxTemplates([...events].reverse(), options));
  assert.equal(plan.cues.length, 1);
  assert.equal(plan.cues[0].id, 'hero');
  assert.equal(plan.cues[0].intensity, .25);
  assert.equal(plan.cues[0].startTick + plan.cues[0].alignmentTicks, 300000);
  for (const reason of ['intentional_silence', 'insufficient_handles', 'dialogue_priority', 'density_limit'])
    assert.ok(plan.skipped.some(s => s.reason === reason), reason);
  assert.throws(() => audio.planSfxTemplates([...events, events[0]], options), /EVENT/);
  assert.throws(() => audio.planSfxTemplates(events, { ...options, dialogueIntervals: [{ startTick: 2, endTick: 1 }] }), /DIALOGUE/);
});

test('The IDE can list templates and plan SFX without mutating a project', async () => {
  assert.equal((await StudioMcpServer.handleToolCall('eme_studio_list_sfx_templates')).length, 6);
  const plan = await StudioMcpServer.handleToolCall('eme_studio_plan_sfx', {
    events: [{ id: 'hero', kind: 'reveal', tick: 120000 }], options: { profile: 'product', durationTicks: 600000 },
  });
  assert.equal(plan.cues[0].templateId, 'product-glass');
  assert.equal(plan.authority, 'proposal_only');
});
