#!/usr/bin/env node
// Explicit local generation; never applies timeline edits or preference feedback.
const fs = require('node:fs');
const path = require('node:path');
const { listSfxTemplates, renderSfxTemplate, planSfxTemplates } = require('../src/audio/sfx/templates.js');
function main(args = process.argv.slice(2)) {
  const [command, input, output, seed = '0', intensity = '0.65'] = args;
  if (command === 'list') return listSfxTemplates();
  if (command === 'plan' && input) {
    const request = JSON.parse(fs.readFileSync(input, 'utf8'));
    return planSfxTemplates(request.events, request.options);
  }
  if (command === 'render' && input && output) {
    const result = renderSfxTemplate(input, { seed: Number(seed), intensity: Number(intensity) });
    const target = path.resolve(output);
    // Exclusive creation prevents accidentally overwriting source media.
    fs.writeFileSync(target, result.wav, { flag: 'wx' });
    const { wav, ...metadata } = result;
    return { ...metadata, path: target };
  }
  throw Error('Usage: eme-sfx list | plan request.json | render template-id output.wav [seed] [intensity]');
}
if (require.main === module) {
  try { console.log(JSON.stringify(main(), null, 2)); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = { main };
