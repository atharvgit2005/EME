/**
 * Programmatic Reference LUT Generator (CG-01 / Phase 17)
 * Generates verified, reproducible .cube fixtures with known mathematical ground truth.
 */

const fs = require('fs');
const path = require('path');

const LUT_OUT_DIR = path.resolve(__dirname, '../assets/luts');

function generateCubeString(size, title, transformFn) {
  let out = `# EME Reference 3D LUT Generator\n`;
  out += `TITLE "${title}"\n`;
  out += `LUT_3D_SIZE ${size}\n`;
  out += `DOMAIN_MIN 0.0 0.0 0.0\n`;
  out += `DOMAIN_MAX 1.0 1.0 1.0\n\n`;

  const scale = size - 1;
  // Format: R fastest, G second, B slowest
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const nr = r / scale;
        const ng = g / scale;
        const nb = b / scale;
        const [outR, outG, outB] = transformFn(nr, ng, nb);
        out += `${outR.toFixed(6)} ${outG.toFixed(6)} ${outB.toFixed(6)}\n`;
      }
    }
  }
  return out;
}

function main() {
  fs.mkdirSync(LUT_OUT_DIR, { recursive: true });

  // 1. Identity 17x17x17
  const identity17 = generateCubeString(17, 'EME_Identity_17', (r, g, b) => [r, g, b]);
  fs.writeFileSync(path.join(LUT_OUT_DIR, 'identity_17.cube'), identity17);

  // 2. Identity 33x33x33
  const identity33 = generateCubeString(33, 'EME_Identity_33', (r, g, b) => [r, g, b]);
  fs.writeFileSync(path.join(LUT_OUT_DIR, 'identity_33.cube'), identity33);

  // 3. Inversion 17x17x17
  const invert17 = generateCubeString(17, 'EME_Invert_17', (r, g, b) => [1.0 - r, 1.0 - g, 1.0 - b]);
  fs.writeFileSync(path.join(LUT_OUT_DIR, 'invert_17.cube'), invert17);

  // 4. Channel Swap (B -> R, R -> G, G -> B) 17x17x17
  const swap17 = generateCubeString(17, 'EME_ChannelSwap_17', (r, g, b) => [b, r, g]);
  fs.writeFileSync(path.join(LUT_OUT_DIR, 'channel_swap_17.cube'), swap17);

  // 5. Cinematic Teal & Orange 33x33x33
  // Pushes shadows toward teal (cyan-blue), highlights toward warm amber/orange
  const tealOrange33 = generateCubeString(33, 'EME_Cine_Teal_Orange_33', (r, g, b) => {
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // Shadows: add cyan-blue
    const shadowWeight = Math.pow(1.0 - luma, 1.5);
    // Highlights: add warm amber
    const highlightWeight = Math.pow(luma, 1.5);

    let tr = r + 0.18 * highlightWeight - 0.12 * shadowWeight;
    let tg = g + 0.06 * highlightWeight + 0.08 * shadowWeight;
    let tb = b - 0.15 * highlightWeight + 0.22 * shadowWeight;

    // Slight contrast S-curve
    tr = Math.max(0.0, Math.min(1.0, tr));
    tg = Math.max(0.0, Math.min(1.0, tg));
    tb = Math.max(0.0, Math.min(1.0, tb));
    return [tr, tg, tb];
  });
  fs.writeFileSync(path.join(LUT_OUT_DIR, 'cine_teal_orange_33.cube'), tealOrange33);

  // 6. Filmic Bleach Bypass 33x33x33 (Silver retention look: high contrast, desaturated)
  const bleachBypass33 = generateCubeString(33, 'EME_Bleach_Bypass_33', (r, g, b) => {
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // Overlay blend mode between RGB and Luma
    const overlay = (base, blend) => {
      return base < 0.5 ? (2.0 * base * blend) : (1.0 - 2.0 * (1.0 - base) * (1.0 - blend));
    };
    let tr = overlay(r, luma);
    let tg = overlay(g, luma);
    let tb = overlay(b, luma);

    // Partial desaturation (mix with luma)
    const sat = 0.45;
    tr = luma * (1 - sat) + tr * sat;
    tg = luma * (1 - sat) + tg * sat;
    tb = luma * (1 - sat) + tb * sat;

    return [
      Math.max(0.0, Math.min(1.0, tr)),
      Math.max(0.0, Math.min(1.0, tg)),
      Math.max(0.0, Math.min(1.0, tb))
    ];
  });
  fs.writeFileSync(path.join(LUT_OUT_DIR, 'bleach_bypass_33.cube'), bleachBypass33);

  // 7. Cine Monochrome 17x17x17 (Panatomic-X style black & white)
  const mono17 = generateCubeString(17, 'EME_Cine_Monochrome_17', (r, g, b) => {
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    // Filmic S-curve on luma
    const curved = Math.pow(luma, 1.25);
    return [curved, curved, curved];
  });
  fs.writeFileSync(path.join(LUT_OUT_DIR, 'cine_monochrome_17.cube'), mono17);

  console.log(`Generated 7 reference LUTs in ${LUT_OUT_DIR}`);
}

main();
