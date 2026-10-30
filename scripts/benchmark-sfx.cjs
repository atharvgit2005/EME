// Deterministic multi-seed signal and editorial-policy gates. Not a listening score.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { listSfxTemplates, renderSfxTemplate, planSfxTemplates } = require('../src/audio/sfx/templates');
const root = path.resolve('.artifacts/engine-hardening/sfx');
fs.mkdirSync(root, { recursive: true });
const runs = [];
for (let round = 0; round < 3; round++) {
  const started = performance.now(), hashes = new Set(); let peak = 0, count = 0;
  for (const { id } of listSfxTemplates()) for (let seed = round * 12; seed < (round + 1) * 12; seed++) {
    const { wav } = renderSfxTemplate(id, { seed, intensity: 1 });
    assert.ok(wav.equals(renderSfxTemplate(id, { seed, intensity: 1 }).wav));
    for (const offset of [44, 46, wav.length - 4, wav.length - 2]) assert.equal(wav.readInt16LE(offset), 0);
    let energy = 0;
    for (let i = 44; i < wav.length; i += 2) { const v = wav.readInt16LE(i) / 32768; peak = Math.max(peak, Math.abs(v)); energy += v * v; }
    assert.ok(energy > 0 && peak < Math.pow(10, -1 / 20));
    hashes.add(crypto.createHash('sha256').update(wav).digest('hex')); count++;
    if (seed === 0) fs.writeFileSync(path.join(root, id + '.wav'), wav);
  }
  assert.equal(hashes.size, count);
  runs.push({ round: round + 1, renders: count, unique: hashes.size, peakDbfs: 20 * Math.log10(peak), wallMs: Math.round(performance.now() - started) });
}
const planning = [];
for (const profile of ['editorial', 'kinetic', 'product', 'cinematic', 'interface']) {
  const events = Array.from({ length: 300 }, (_, i) => ({ id: `event-${i}`, tick: i * 12000, kind: ['cut', 'title', 'reveal', 'transition', 'accent'][i % 5], salience: (i % 11) / 10 }));
  const plan = planSfxTemplates(events, { profile, durationTicks: 3600000, dialogueIntervals: [{ startTick: 1200000, endTick: 2400000 }] });
  for (let i = 0; i < plan.cues.length; i++) {
    const c = plan.cues[i];
    assert.ok(c.startTick >= 0 && c.startTick + c.durationTicks <= 3600000);
    if (i) assert.ok(c.eventTick - plan.cues[i - 1].eventTick >= 60000);
  }
  assert.equal(plan.cues.length + plan.skipped.length, events.length);
  planning.push({ profile, events: events.length, cues: plan.cues.length, skipped: plan.skipped.length });
}
const report = { passed: true, signalRuns: runs, planning, limitation: 'Signal/determinism and policy gates only; aesthetic quality requires listening review.' };
fs.writeFileSync(path.join(root, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
