#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const baseline = require('../docs/remediation/baseline.json');
for (const entry of [...baseline.contracts, ...baseline.fixtures]) {
  const bytes = fs.readFileSync(path.join(root, entry.path));
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error(`Baseline mismatch: ${entry.path}`);
}
console.log(`Verified ${baseline.contracts.length} schema and ${baseline.fixtures.length} fixture hashes; missing/altered files fail closed.`);
