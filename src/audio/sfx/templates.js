// Original procedural recipes. References inform pacing, never supply copied audio.
const { createHash } = require('node:crypto');
const { SAMPLE_RATE, createPrng, BiquadFilter, equalPowerPan, encodeStereoWav } = require('./synth/primitives.js');

const recipes = {
  'editorial-paper': { label: 'Editorial / paper movement', duration: .28, align: .035, cooldown: .7,
    layers: [{ kind: 'noise', freq: 1450, endFreq: 700, gain: .35, decay: 17 }, { kind: 'tone', freq: 180, endFreq: 95, gain: .16, decay: 35 }] },
  'kinetic-type': { label: 'Kinetic type / dry mechanical tap', duration: .16, align: .012, cooldown: .22,
    layers: [{ kind: 'noise', freq: 3200, endFreq: 1700, gain: .28, decay: 65 }, { kind: 'tone', freq: 520, endFreq: 250, gain: .25, decay: 44 }] },
  'product-glass': { label: 'Product reveal / glass resonance', duration: .85, align: .025, cooldown: 1.2,
    layers: [{ kind: 'tone', freq: 1046.5, endFreq: 1046.5, gain: .20, decay: 7 }, { kind: 'tone', freq: 2637, endFreq: 2637, gain: .08, decay: 12, pan: .4 }, { kind: 'noise', freq: 5000, endFreq: 2200, gain: .10, decay: 45 }] },
  'cinematic-weight': { label: 'Cinematic / restrained weight', duration: 1.15, align: .02, cooldown: 1.8,
    layers: [{ kind: 'tone', freq: 130, endFreq: 42, gain: .48, decay: 4.5 }, { kind: 'noise', freq: 800, endFreq: 140, gain: .25, decay: 18 }] },
  'spatial-transition': { label: 'Spatial / directional air pass', duration: .55, align: .275, cooldown: .8,
    layers: [{ kind: 'air', freq: 450, endFreq: 3400, gain: .65, decay: 0, pan: 1 }, { kind: 'air', freq: 2100, endFreq: 800, gain: .20, decay: 0, pan: -.6 }] },
  'digital-lock': { label: 'Interface / two-stage confirmation', duration: .25, align: .07, cooldown: .4,
    layers: [{ kind: 'tone', freq: 880, endFreq: 880, gain: .22, decay: 35 }, { kind: 'tone', freq: 1320, endFreq: 1320, gain: .20, decay: 28, delay: .07 }, { kind: 'noise', freq: 3800, endFreq: 3000, gain: .08, decay: 65 }] },
};
const profiles = {
  editorial: { reveal: 'editorial-paper', title: 'editorial-paper', cut: null, transition: 'spatial-transition', accent: 'kinetic-type' },
  kinetic: { reveal: 'kinetic-type', title: 'kinetic-type', cut: 'editorial-paper', transition: 'spatial-transition', accent: 'cinematic-weight' },
  product: { reveal: 'product-glass', title: 'kinetic-type', cut: null, transition: 'spatial-transition', accent: 'product-glass' },
  cinematic: { reveal: 'cinematic-weight', title: 'editorial-paper', cut: null, transition: 'spatial-transition', accent: 'cinematic-weight' },
  interface: { reveal: 'digital-lock', title: 'kinetic-type', cut: null, transition: 'spatial-transition', accent: 'digital-lock' },
};
function listSfxTemplates() {
  return Object.entries(recipes).map(([id, r]) => ({ id, label: r.label, durationSeconds: r.duration,
    alignmentSeconds: r.align, cooldownSeconds: r.cooldown, source: 'original_procedural',
    alignment: 'designed_gesture_anchor_not_measured_peak' }));
}
function seedFor(value) { return createHash('sha256').update(String(value)).digest().readUInt32LE(0); }
function renderSfxTemplate(id, options = {}) {
  if (!Object.hasOwn(recipes, id)) throw Error('ERR_SFX_TEMPLATE');
  const { seed = 0, intensity = .65, direction = 1 } = options;
  if (!Number.isSafeInteger(seed) || !Number.isFinite(intensity) || intensity < 0 || intensity > 1 ||
      ![-1, 0, 1].includes(direction)) throw Error('ERR_SFX_TEMPLATE_OPTIONS');
  const recipe = recipes[id], n = Math.round(recipe.duration * SAMPLE_RATE);
  const left = new Float32Array(n), right = new Float32Array(n), rng = createPrng(seed);
  for (const layer of recipe.layers) {
    // A stable variation within the same material, rather than identical repeated hits.
    const detune = .96 + rng() * .08, gainVariation = .92 + rng() * .16;
    const filter = new BiquadFilter('bandpass', layer.freq, 1.2);
    let phase = 0;
    const offset = Math.round((layer.delay || 0) * SAMPLE_RATE);
    for (let i = offset; i < n; i++) {
      const time = (i - offset) / SAMPLE_RATE, u = (i - offset) / (n - offset);
      const freq = (layer.kind === 'air' ? layer.freq + (layer.endFreq - layer.freq) * Math.sin(Math.PI * u)
        : layer.endFreq + (layer.freq - layer.endFreq) * Math.exp(-time * 35)) * detune;
      phase += 2 * Math.PI * freq / SAMPLE_RATE;
      filter.setParams(freq, 1.2);
      const source = layer.kind === 'tone' ? Math.sin(phase) : filter.process(rng() * 2 - 1);
      const envelope = layer.kind === 'air' ? Math.sin(Math.PI * u) ** 2 : Math.exp(-time * layer.decay);
      const edge = Math.min(1, (i - offset) / 72) * Math.min(1, (n - 1 - i) / 480);
      const pan = layer.kind === 'air' ? (u * 2 - 1) * (layer.pan || 0) * direction : (layer.pan || 0) * direction;
      const [l, r] = equalPowerPan(pan), sample = source * envelope * edge * layer.gain * gainVariation * intensity;
      left[i] += sample * l; right[i] += sample * r;
    }
  }
  return { wav: encodeStereoWav(left, right), templateId: id, seed, sampleRate: SAMPLE_RATE,
    durationTicks: Math.round(recipe.duration * 120000), alignmentTicks: Math.round(recipe.align * 120000),
    alignment: 'designed_gesture_anchor_not_measured_peak' };
}

function planSfxTemplates(events, { profile = 'editorial', durationTicks, dialogueIntervals = [], seed = 0, maxCuesPerSecond = 2 } = {}) {
  if (!Object.hasOwn(profiles, profile) || !Number.isSafeInteger(durationTicks) || durationTicks <= 0 ||
      !Array.isArray(events) || events.length > 10000 || !Number.isSafeInteger(seed) ||
      !Number.isFinite(maxCuesPerSecond) || maxCuesPerSecond < .1 || maxCuesPerSecond > 8 ||
      !Array.isArray(dialogueIntervals)) throw Error('ERR_SFX_PLAN_OPTIONS');
  const ids = new Set();
  for (const e of events) {
    if (!e || typeof e.id !== 'string' || !e.id || ids.has(e.id) || !Object.hasOwn(profiles[profile], e.kind) ||
        !Number.isSafeInteger(e.tick) || e.tick < 0 || e.tick >= durationTicks ||
        (e.salience !== undefined && (!Number.isFinite(e.salience) || e.salience < 0 || e.salience > 1)))
      throw Error('ERR_SFX_EVENT');
    ids.add(e.id);
  }
  for (const d of dialogueIntervals)
    if (!d || !Number.isSafeInteger(d.startTick) || !Number.isSafeInteger(d.endTick) || d.startTick < 0 || d.endTick <= d.startTick || d.endTick > durationTicks)
      throw Error('ERR_SFX_DIALOGUE');
  const cues = [], skipped = [], last = new Map();
  // Important beats win crowded windows. Same-time ties use a stable ID.
  const ordered = [...events].sort((a, b) => (b.salience ?? .5) - (a.salience ?? .5) || a.tick - b.tick || a.id.localeCompare(b.id));
  for (const e of ordered) {
    const templateId = profiles[profile][e.kind];
    let reason = !templateId ? 'intentional_silence' : null;
    if (reason) { skipped.push({ id: e.id, reason }); continue; }
    const r = recipes[templateId], startTick = e.tick - Math.round(r.align * 120000), endTick = startTick + Math.round(r.duration * 120000);
    if (startTick < 0 || endTick > durationTicks) reason = 'insufficient_handles';
    else if (cues.some(c => Math.abs(c.eventTick - e.tick) < 120000 / maxCuesPerSecond)) reason = 'density_limit';
    else if ((last.get(templateId) || []).some(t => Math.abs(t - e.tick) < r.cooldown * 120000)) reason = 'material_cooldown';
    const speech = dialogueIntervals.some(d => d.startTick < endTick && d.endTick > startTick);
    if (!reason && speech && (e.salience ?? .5) < .8) reason = 'dialogue_priority';
    if (reason) { skipped.push({ id: e.id, reason }); continue; }
    cues.push({ id: e.id, templateId, eventTick: e.tick, startTick, durationTicks: endTick - startTick,
      alignmentTicks: e.tick - startTick, seed: seedFor(`${seed}:${profile}:${e.id}`),
      intensity: speech ? .25 : .4 + (e.salience ?? .5) * .35,
      reason: speech ? 'salient_accent_under_dialogue' : `${profile}_${e.kind}` });
    last.set(templateId, [...(last.get(templateId) || []), e.tick]);
  }
  return { profile, cues: cues.sort((a, b) => a.eventTick - b.eventTick || a.id.localeCompare(b.id)),
    skipped: skipped.sort((a, b) => a.id.localeCompare(b.id)), authority: 'proposal_only', seed };
}
module.exports = { listSfxTemplates, renderSfxTemplate, planSfxTemplates };
