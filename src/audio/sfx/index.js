/**
 * Editing Mechanics Engine (EME) - SFX Engine Entry Point (Phase A4)
 * Unifies procedural audio synthesis, SJC sound pack catalog, dialogue ducking, and master mixing.
 */

const fs = require('node:fs');
const path = require('node:path');
const { validateObject } = require('../../engine/validator.js');
const { synthesizeWhoosh } = require('./synth/whoosh.js');
const { synthesizeImpact } = require('./synth/impact.js');
const { synthesizeRiser } = require('./synth/riser.js');
const { synthesizeGlitch } = require('./synth/glitch.js');
const { defaultCatalog, SfxCatalog } = require('./catalog.js');
const { applyDialogueDucking } = require('./ducking.js');
const { mixAudioLayers, measureMetrics } = require('./mixer.js');

const SFX_CUE_SCHEMA_PATH = path.resolve(__dirname, '../../../schema/eme-sfx-cue.v1.schema.json');
let cachedSfxSchema = null;

function getSfxCueSchema() {
  if (!cachedSfxSchema) {
    cachedSfxSchema = JSON.parse(fs.readFileSync(SFX_CUE_SCHEMA_PATH, 'utf8'));
  }
  return cachedSfxSchema;
}

/**
 * Validates an SFX cue object against eme-sfx-cue.v1.schema.json.
 * @param {object} cue
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateSfxCue(cue) {
  const schema = getSfxCueSchema();
  const errors = validateObject(cue, schema, schema);
  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  // Synthesis
  synthesizeWhoosh,
  synthesizeImpact,
  synthesizeRiser,
  synthesizeGlitch,
  // Catalog
  defaultCatalog,
  SfxCatalog,
  // Processing
  applyDialogueDucking,
  mixAudioLayers,
  measureMetrics,
  // Contracts
  validateSfxCue,
  getSfxCueSchema
};
