/**
 * EME 3D LUT Parser (.cube format) (CG-01 / Phase 17)
 */

const fs = require('fs');
const crypto = require('crypto');

class CubeLut {
  constructor({ title, size, domainMin, domainMax, data, sha256 }) {
    this.title = title || 'Untitled LUT';
    this.size = size; // e.g. 17, 33, 65
    this.domainMin = domainMin || [0.0, 0.0, 0.0];
    this.domainMax = domainMax || [1.0, 1.0, 1.0];
    this.data = data; // Float32Array of size * size * size * 3 (R, G, B)
    this.sha256 = sha256;
  }

  // Get table entry at integer grid coordinates (ir, ig, ib)
  // Index order in standard .cube format: R changes fastest, then G, then B
  getEntry(ir, ig, ib) {
    const s = this.size;
    const r = Math.max(0, Math.min(s - 1, ir));
    const g = Math.max(0, Math.min(s - 1, ig));
    const b = Math.max(0, Math.min(s - 1, ib));
    const offset = (r + g * s + b * s * s) * 3;
    return [
      this.data[offset],
      this.data[offset + 1],
      this.data[offset + 2]
    ];
  }
}

function parseCubeLutContent(content, expectedHash = null) {
  const sha256 = crypto.createHash('sha256').update(content).digest('hex');
  if (expectedHash && expectedHash !== sha256) {
    throw new Error(`LUT content hash mismatch: expected ${expectedHash}, got ${sha256}`);
  }

  const lines = content.split(/\r?\n/);
  let title = '';
  let size = 0;
  let domainMin = [0.0, 0.0, 0.0];
  let domainMax = [1.0, 1.0, 1.0];
  const entries = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    const parts = line.split(/\s+/);
    const keyword = parts[0].toUpperCase();

    if (keyword === 'TITLE') {
      title = line.substring(5).trim().replace(/^"(.*)"$/, '$1');
    } else if (keyword === 'LUT_3D_SIZE') {
      size = parseInt(parts[1], 10);
      if (isNaN(size) || size < 2 || size > 256) {
        throw new Error(`Invalid LUT_3D_SIZE: ${parts[1]}`);
      }
    } else if (keyword === 'DOMAIN_MIN') {
      domainMin = [parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])];
    } else if (keyword === 'DOMAIN_MAX') {
      domainMax = [parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])];
    } else if (keyword === 'LUT_1D_SIZE') {
      throw new Error('1D LUTs are not supported by the 3D LUT engine');
    } else if (parts.length === 3) {
      const r = parseFloat(parts[0]);
      const g = parseFloat(parts[1]);
      const b = parseFloat(parts[2]);
      if (isNaN(r) || isNaN(g) || isNaN(b) || !isFinite(r) || !isFinite(g) || !isFinite(b)) {
        throw new Error(`Malformed numeric entry at line ${i + 1}: "${line}"`);
      }
      entries.push(r, g, b);
    }
  }

  if (size === 0) {
    throw new Error('Missing LUT_3D_SIZE header');
  }

  const expectedEntries = size * size * size;
  const actualEntries = entries.length / 3;
  if (actualEntries !== expectedEntries) {
    throw new Error(`Entry count mismatch: expected ${expectedEntries} (${size}^3), got ${actualEntries}`);
  }

  const data = new Float32Array(entries);

  return new CubeLut({
    title,
    size,
    domainMin,
    domainMax,
    data,
    sha256
  });
}

function parseCubeLutFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return parseCubeLutContent(content);
}

module.exports = {
  CubeLut,
  parseCubeLutContent,
  parseCubeLutFile
};
