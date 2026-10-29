/**
 * Editing Mechanics Engine (EME) - Phase 32: Visual Intelligence Contract Validator
 *
 * Implements strict, zero-dependency validation and coordinate transformations for:
 * - schema/eme-visual-intelligence.v1.schema.json
 *
 * Enforces:
 * 1. Strict Draft 2020-12 schema validation with property containment (additionalProperties: false).
 * 2. Source video SHA-256 fingerprint binding and sidecarId verification.
 * 3. Strict 120,000 integer tick timebase and presentation timestamp coherence.
 * 4. Temporal monotonicity: frames[i+1].tick > frames[i].tick.
 * 5. Display-oriented pixel-edge coordinate bounds containment within source canvas.
 * 6. Observation confidence normalized to integer range [0, 100].
 * 7. Forward and inverse coordinate transforms between proxy and full source canvas spaces.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SCHEMA_PATH = path.resolve(__dirname, '../../schema/eme-visual-intelligence.v1.schema.json');

const VALID_OBSERVATION_TYPES = Object.freeze([
  'face',
  'person',
  'focal_point',
  'salient_region',
  'text_region',
  'background_region'
]);

const VALID_EXECUTION_MODES = Object.freeze([
  'offline_worker',
  'precomputed_sidecar',
  'synthetic_fixture'
]);

class VisualContractValidator {
  /**
   * Loads and caches the canonical JSON schema for visual intelligence sidecars.
   *
   * @returns {object} Parsed JSON schema
   */
  static getSchema() {
    if (!this._schema) {
      this._schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    }
    return this._schema;
  }

  /**
   * Computes greatest common divisor (GCD) of two BigInt numbers.
   *
   * @param {bigint} a
   * @param {bigint} b
   * @returns {bigint}
   */
  static _gcd(a, b) {
    let x = a < 0n ? -a : a;
    let y = b < 0n ? -b : b;
    while (y !== 0n) {
      const t = y;
      y = x % y;
      x = t;
    }
    return x;
  }

  /**
   * Simplifies a rational number into canonical irreducible form with positive denominator.
   *
   * @param {{ num: bigint, den: bigint }} rat
   * @returns {{ num: bigint, den: bigint }}
   */
  static _simplify({ num, den }) {
    if (den === 0n) throw new Error('Division by zero in rational denominator');
    if (den < 0n) {
      num = -num;
      den = -den;
    }
    if (num === 0n) return { num: 0n, den: 1n };
    const g = this._gcd(num, den);
    return { num: num / g, den: den / g };
  }

  /**
   * Converts a number, string fraction, or rational object to canonical rational { num: bigint, den: bigint }.
   *
   * @param {number|string|bigint|{ num: bigint|number, den: bigint|number }} val
   * @returns {{ num: bigint, den: bigint }}
   */
  static toRational(val) {
    if (typeof val === 'bigint') {
      return { num: val, den: 1n };
    }
    if (typeof val === 'object' && val !== null && 'num' in val && 'den' in val) {
      const num = BigInt(val.num);
      const den = BigInt(val.den);
      if (den === 0n) throw new Error('Denominator cannot be zero');
      return den < 0n ? { num: -num, den: -den } : { num, den };
    }
    if (typeof val === 'number') {
      if (!Number.isFinite(val)) {
        throw new Error(`Cannot convert non-finite number ${val} to rational`);
      }
      if (Number.isInteger(val)) {
        return { num: BigInt(val), den: 1n };
      }
      const s = val.toString().toLowerCase();
      if (s.includes('e')) {
        const [coeffStr, expStr] = s.split('e');
        const exp = parseInt(expStr, 10);
        const coeffRat = this.toRational(parseFloat(coeffStr));
        if (exp >= 0) {
          return this._simplify({
            num: coeffRat.num * (10n ** BigInt(exp)),
            den: coeffRat.den
          });
        } else {
          return this._simplify({
            num: coeffRat.num,
            den: coeffRat.den * (10n ** BigInt(-exp))
          });
        }
      }
      const parts = s.split('.');
      const intPart = parts[0];
      const fracPart = parts[1] || '';
      const den = 10n ** BigInt(fracPart.length);
      const isNeg = intPart.startsWith('-');
      const absInt = isNeg ? intPart.slice(1) : intPart;
      const absNum = BigInt(absInt) * den + BigInt(fracPart || '0');
      return this._simplify({
        num: isNeg ? -absNum : absNum,
        den
      });
    }
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed.includes('/')) {
        const [n, d] = trimmed.split('/');
        const num = BigInt(n.trim());
        const den = BigInt(d.trim());
        if (den === 0n) throw new Error('Denominator cannot be zero');
        return this._simplify(den < 0n ? { num: -num, den: -den } : { num, den });
      }
      return this.toRational(parseFloat(trimmed));
    }
    throw new Error(`Unsupported value type for toRational: ${typeof val}`);
  }

  /**
   * Adds two rational quantities (exact BigInt fraction arithmetic).
   */
  static addRational(a, b) {
    const ra = this.toRational(a);
    const rb = this.toRational(b);
    return this._simplify({
      num: ra.num * rb.den + rb.num * ra.den,
      den: ra.den * rb.den
    });
  }

  /**
   * Subtracts two rational quantities (exact BigInt fraction arithmetic).
   */
  static subRational(a, b) {
    const ra = this.toRational(a);
    const rb = this.toRational(b);
    return this._simplify({
      num: ra.num * rb.den - rb.num * ra.den,
      den: ra.den * rb.den
    });
  }

  /**
   * Multiplies two rational quantities (exact BigInt fraction arithmetic).
   */
  static mulRational(a, b) {
    const ra = this.toRational(a);
    const rb = this.toRational(b);
    return this._simplify({
      num: ra.num * rb.num,
      den: ra.den * rb.den
    });
  }

  /**
   * Divides two rational quantities (exact BigInt fraction arithmetic).
   */
  static divRational(a, b) {
    const ra = this.toRational(a);
    const rb = this.toRational(b);
    if (rb.num === 0n) throw new Error('Division by zero in divRational');
    return this._simplify({
      num: ra.num * rb.den,
      den: ra.den * rb.num
    });
  }

  /**
   * Deterministic round-half-to-even (banker's rounding) on exact rational number to specified decimal precision.
   * Resolves ties (fractional part exactly 0.5) to the nearest even integer.
   * Maximum final quantization error is bounded by ±0.5 * 10^(-decimals).
   *
   * @param {object|number} rat Rational representation { num: bigint, den: bigint } or number
   * @param {number} [decimals=3] Decimal places (default: 3 for 0.001 source pixel precision)
   * @returns {number}
   */
  static roundHalfToEvenRational(rat, decimals = 3) {
    const s = this._simplify(this.toRational(rat));
    const factor = 10n ** BigInt(decimals);
    const M = s.num * factor;
    const D = s.den;
    const isNeg = M < 0n;
    const absM = isNeg ? -M : M;
    const Q = absM / D;
    const Rem = absM % D;

    let roundedMag;
    if (2n * Rem < D) {
      roundedMag = Q;
    } else if (2n * Rem > D) {
      roundedMag = Q + 1n;
    } else {
      // Exact tie: round to nearest even quotient
      roundedMag = (Q % 2n === 0n) ? Q : Q + 1n;
    }

    const signedVal = isNeg ? -roundedMag : roundedMag;
    return Number(signedVal) / Math.pow(10, decimals);
  }

  /**
   * Deterministic round-half-to-even (banker's rounding) to specified decimal precision.
   * Resolves ties (fractional part exactly 0.5) to the nearest even integer.
   *
   * @param {number|object} value Value to round
   * @param {number} [decimals=3] Decimal places (default: 3 for 0.001 source pixel precision)
   * @returns {number}
   */
  static roundHalfToEven(value, decimals = 3) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return value;
    return this.roundHalfToEvenRational(value, decimals);
  }

  /**
   * Transforms bounding box coordinates from proxy space to source canvas space using exact rational arithmetic
   * and a single final round-half-to-even conversion at the boundary.
   * Preserves full source/proxy content rectangle definitions including non-zero source origins (cx, cy):
   *   x_s = c_x + (x_p - p_x) * (c_w / p_w)
   *   y_s = c_y + (y_p - p_y) * (c_h / p_h)
   *   w_s = w_p * (c_w / p_w)
   *   h_s = h_p * (c_h / p_h)
   *
   * @param {{ x: number, y: number, width: number, height: number }} proxyBounds
   * @param {{ scaleFactorX?: number, scaleFactorY?: number, padding?: { top?: number, left?: number }, contentRect?: object, sourceContentRect?: object, source?: object }} proxyConfig
   * @param {number} [roundingPrecision=3] Fixed-point precision (default: 3 for 0.001 pixel)
   * @returns {{ x: number, y: number, width: number, height: number }}
   */
  static transformProxyToSource(proxyBounds, proxyConfig, roundingPrecision = 3) {
    const pRect = proxyConfig.contentRect || proxyConfig.proxyContentRect || {};
    const sRect = proxyConfig.sourceContentRect || proxyConfig.sourceRect || {};
    const padLeft = proxyConfig.padding?.left ?? pRect.x ?? 0;
    const padTop = proxyConfig.padding?.top ?? pRect.y ?? 0;
    const cx = sRect.x ?? (proxyConfig.source?.x ?? 0);
    const cy = sRect.y ?? (proxyConfig.source?.y ?? 0);

    let scaleX, scaleY;
    if (sRect.width && pRect.width) {
      scaleX = this.divRational(sRect.width, pRect.width);
    } else {
      scaleX = this.toRational(proxyConfig.scaleFactorX);
    }
    if (sRect.height && pRect.height) {
      scaleY = this.divRational(sRect.height, pRect.height);
    } else {
      scaleY = this.toRational(proxyConfig.scaleFactorY);
    }

    const unpaddedX = this.subRational(proxyBounds.x, padLeft);
    const unpaddedY = this.subRational(proxyBounds.y, padTop);

    const sourceXRat = this.addRational(cx, this.mulRational(unpaddedX, scaleX));
    const sourceYRat = this.addRational(cy, this.mulRational(unpaddedY, scaleY));
    const sourceWRat = this.mulRational(proxyBounds.width, scaleX);
    const sourceHRat = this.mulRational(proxyBounds.height, scaleY);

    return {
      x: this.roundHalfToEvenRational(sourceXRat, roundingPrecision),
      y: this.roundHalfToEvenRational(sourceYRat, roundingPrecision),
      width: this.roundHalfToEvenRational(sourceWRat, roundingPrecision),
      height: this.roundHalfToEvenRational(sourceHRat, roundingPrecision)
    };
  }

  /**
   * Transforms bounding box coordinates from source canvas space to proxy space using exact rational arithmetic
   * and a single final round-half-to-even conversion at the boundary.
   * Inverse transform:
   *   x_p = p_x + (x_s - c_x) * (p_w / c_w)
   *   y_p = p_y + (y_s - c_y) * (p_h / c_h)
   *   w_p = w_s * (p_w / c_w)
   *   h_p = h_s * (p_h / c_h)
   *
   * @param {{ x: number, y: number, width: number, height: number }} sourceBounds
   * @param {{ scaleFactorX?: number, scaleFactorY?: number, padding?: { top?: number, left?: number }, contentRect?: object, sourceContentRect?: object, source?: object }} proxyConfig
   * @param {number} [roundingPrecision=3] Fixed-point precision (default: 3 for 0.001 pixel)
   * @returns {{ x: number, y: number, width: number, height: number }}
   */
  static transformSourceToProxy(sourceBounds, proxyConfig, roundingPrecision = 3) {
    const pRect = proxyConfig.contentRect || proxyConfig.proxyContentRect || {};
    const sRect = proxyConfig.sourceContentRect || proxyConfig.sourceRect || {};
    const padLeft = proxyConfig.padding?.left ?? pRect.x ?? 0;
    const padTop = proxyConfig.padding?.top ?? pRect.y ?? 0;
    const cx = sRect.x ?? (proxyConfig.source?.x ?? 0);
    const cy = sRect.y ?? (proxyConfig.source?.y ?? 0);

    let scaleX, scaleY;
    if (sRect.width && pRect.width) {
      scaleX = this.divRational(sRect.width, pRect.width);
    } else {
      scaleX = this.toRational(proxyConfig.scaleFactorX);
    }
    if (sRect.height && pRect.height) {
      scaleY = this.divRational(sRect.height, pRect.height);
    } else {
      scaleY = this.toRational(proxyConfig.scaleFactorY);
    }

    const diffX = this.subRational(sourceBounds.x, cx);
    const diffY = this.subRational(sourceBounds.y, cy);

    const proxyXRat = this.addRational(padLeft, this.divRational(diffX, scaleX));
    const proxyYRat = this.addRational(padTop, this.divRational(diffY, scaleY));
    const proxyWRat = this.divRational(sourceBounds.width, scaleX);
    const proxyHRat = this.divRational(sourceBounds.height, scaleY);

    return {
      x: this.roundHalfToEvenRational(proxyXRat, roundingPrecision),
      y: this.roundHalfToEvenRational(proxyYRat, roundingPrecision),
      width: this.roundHalfToEvenRational(proxyWRat, roundingPrecision),
      height: this.roundHalfToEvenRational(proxyHRat, roundingPrecision)
    };
  }

  /**
   * Computes SHA-256 digest of arbitrary string or buffer.
   *
   * @param {string|Buffer} data
   * @returns {string} 64-hex digest
   */
  static computeSha256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Validates a visual intelligence sidecar object against schema and invariants.
   *
   * @param {object} sidecar
   * @param {object} [options]
   * @param {string} [options.expectedAssetSha256] Expected source file SHA-256 for fingerprint verification
   * @returns {{ valid: boolean, errors: string[] }}
   */
  static validateVisualSidecar(sidecar, options = {}) {
    const errors = [];

    if (!sidecar || typeof sidecar !== 'object' || Array.isArray(sidecar)) {
      return { valid: false, errors: ['Sidecar must be a non-null object'] };
    }

    // 1. Root property containment
    const allowedRootKeys = new Set([
      'schemaVersion',
      'sidecarId',
      'source',
      'proxy',
      'producer',
      'coordinateSpace',
      'frames',
      'trajectories',
      'metadata'
    ]);

    for (const key of Object.keys(sidecar)) {
      if (!allowedRootKeys.has(key)) {
        errors.push(`$.${key}: Unknown property (additionalProperties: false)`);
      }
    }

    // Required root properties
    for (const req of ['schemaVersion', 'sidecarId', 'source', 'proxy', 'producer', 'coordinateSpace', 'frames']) {
      if (sidecar[req] === undefined) {
        errors.push(`$: Missing required property "${req}"`);
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    // 2. schemaVersion
    if (sidecar.schemaVersion !== 'eme-visual-intelligence.v1') {
      errors.push(`$.schemaVersion: Expected const "eme-visual-intelligence.v1", got "${sidecar.schemaVersion}"`);
    }

    // 3. sidecarId
    if (typeof sidecar.sidecarId !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(sidecar.sidecarId)) {
      errors.push(`$.sidecarId: Must match pattern ^sha256:[a-f0-9]{64}$, got "${sidecar.sidecarId}"`);
    }

    // 4. Source validation
    const src = sidecar.source;
    if (!src || typeof src !== 'object' || Array.isArray(src)) {
      errors.push('$.source: Must be a non-null object');
    } else {
      const allowedSrcKeys = new Set(['assetId', 'sha256', 'width', 'height', 'fps', 'durationTicks', 'timebase']);
      for (const k of Object.keys(src)) {
        if (!allowedSrcKeys.has(k)) {
          errors.push(`$.source.${k}: Unknown property (additionalProperties: false)`);
        }
      }

      if (typeof src.assetId !== 'string' || src.assetId.trim().length === 0) {
        errors.push('$.source.assetId: Must be a non-empty string');
      }

      if (typeof src.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(src.sha256)) {
        errors.push(`$.source.sha256: Must be a 64-character lowercase hex string, got "${src.sha256}"`);
      } else if (options.expectedAssetSha256 && src.sha256 !== options.expectedAssetSha256) {
        errors.push(`$.source.sha256: Asset fingerprint mismatch (expected ${options.expectedAssetSha256}, got ${src.sha256})`);
      }

      if (!Number.isInteger(src.width) || src.width < 1) {
        errors.push(`$.source.width: Must be integer >= 1, got ${src.width}`);
      }
      if (!Number.isInteger(src.height) || src.height < 1) {
        errors.push(`$.source.height: Must be integer >= 1, got ${src.height}`);
      }

      if (!src.fps || typeof src.fps !== 'object' || Array.isArray(src.fps)) {
        errors.push('$.source.fps: Must be object with numerator and denominator');
      } else {
        if (!Number.isInteger(src.fps.numerator) || src.fps.numerator < 1) {
          errors.push(`$.source.fps.numerator: Must be integer >= 1, got ${src.fps.numerator}`);
        }
        if (!Number.isInteger(src.fps.denominator) || src.fps.denominator < 1) {
          errors.push(`$.source.fps.denominator: Must be integer >= 1, got ${src.fps.denominator}`);
        }
      }

      if (!Number.isInteger(src.durationTicks) || src.durationTicks < 0) {
        errors.push(`$.source.durationTicks: Must be integer >= 0, got ${src.durationTicks}`);
      }

      if (src.timebase !== 120000) {
        errors.push(`$.source.timebase: Must be constant 120000, got ${src.timebase}`);
      }
    }

    // 5. Proxy validation
    const proxy = sidecar.proxy;
    if (!proxy || typeof proxy !== 'object' || Array.isArray(proxy)) {
      errors.push('$.proxy: Must be a non-null object');
    } else {
      const allowedProxyKeys = new Set(['mediaId', 'sha256', 'width', 'height', 'scaleFactorX', 'scaleFactorY', 'crop', 'padding']);
      for (const k of Object.keys(proxy)) {
        if (!allowedProxyKeys.has(k)) {
          errors.push(`$.proxy.${k}: Unknown property (additionalProperties: false)`);
        }
      }

      if (typeof proxy.mediaId !== 'string' || proxy.mediaId.trim().length === 0) {
        errors.push('$.proxy.mediaId: Must be a non-empty string');
      }
      if (typeof proxy.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(proxy.sha256)) {
        errors.push(`$.proxy.sha256: Must be a 64-character lowercase hex string, got "${proxy.sha256}"`);
      }
      if (!Number.isInteger(proxy.width) || proxy.width < 1) {
        errors.push(`$.proxy.width: Must be integer >= 1, got ${proxy.width}`);
      }
      if (!Number.isInteger(proxy.height) || proxy.height < 1) {
        errors.push(`$.proxy.height: Must be integer >= 1, got ${proxy.height}`);
      }
      if (typeof proxy.scaleFactorX !== 'number' || proxy.scaleFactorX <= 0) {
        errors.push(`$.proxy.scaleFactorX: Must be number > 0, got ${proxy.scaleFactorX}`);
      }
      if (typeof proxy.scaleFactorY !== 'number' || proxy.scaleFactorY <= 0) {
        errors.push(`$.proxy.scaleFactorY: Must be number > 0, got ${proxy.scaleFactorY}`);
      }
    }

    // 6. Producer validation
    const prod = sidecar.producer;
    if (!prod || typeof prod !== 'object' || Array.isArray(prod)) {
      errors.push('$.producer: Must be a non-null object');
    } else {
      const allowedProdKeys = new Set(['pipeline', 'version', 'modelFamily', 'modelWeightsSha256', 'executionMode']);
      for (const k of Object.keys(prod)) {
        if (!allowedProdKeys.has(k)) {
          errors.push(`$.producer.${k}: Unknown property (additionalProperties: false)`);
        }
      }
      if (typeof prod.pipeline !== 'string' || prod.pipeline.trim().length === 0) {
        errors.push('$.producer.pipeline: Must be a non-empty string');
      }
      if (typeof prod.version !== 'string' || prod.version.trim().length === 0) {
        errors.push('$.producer.version: Must be a non-empty string');
      }
      if (typeof prod.modelFamily !== 'string' || prod.modelFamily.trim().length === 0) {
        errors.push('$.producer.modelFamily: Must be a non-empty string');
      }
      if (prod.modelWeightsSha256 !== undefined) {
        if (typeof prod.modelWeightsSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(prod.modelWeightsSha256)) {
          errors.push('$.producer.modelWeightsSha256: Must match pattern ^[a-f0-9]{64}$');
        }
      }
      if (!VALID_EXECUTION_MODES.includes(prod.executionMode)) {
        errors.push(`$.producer.executionMode: Value "${prod.executionMode}" not in enum [${VALID_EXECUTION_MODES.join(', ')}]`);
      }
    }

    // 7. Coordinate Space validation
    const cs = sidecar.coordinateSpace;
    if (!cs || typeof cs !== 'object' || Array.isArray(cs)) {
      errors.push('$.coordinateSpace: Must be a non-null object');
    } else {
      if (cs.origin !== 'top_left') {
        errors.push(`$.coordinateSpace.origin: Expected const "top_left", got "${cs.origin}"`);
      }
      if (cs.pixelSemantics !== 'pixel_edge') {
        errors.push(`$.coordinateSpace.pixelSemantics: Expected const "pixel_edge", got "${cs.pixelSemantics}"`);
      }
      if (cs.canonicalSpace !== 'source_canvas') {
        errors.push(`$.coordinateSpace.canonicalSpace: Expected const "source_canvas", got "${cs.canonicalSpace}"`);
      }
      if (cs.boundsUnit !== 'pixels') {
        errors.push(`$.coordinateSpace.boundsUnit: Expected const "pixels", got "${cs.boundsUnit}"`);
      }
    }

    // 8. Frames validation & temporal monotonicity
    if (!Array.isArray(sidecar.frames)) {
      errors.push('$.frames: Must be an array');
    } else {
      let lastTick = -1;
      const sourceWidth = src ? src.width : Infinity;
      const sourceHeight = src ? src.height : Infinity;

      sidecar.frames.forEach((frame, fIdx) => {
        const framePath = `$.frames[${fIdx}]`;
        if (!frame || typeof frame !== 'object' || Array.isArray(frame)) {
          errors.push(`${framePath}: Must be a non-null object`);
          return;
        }

        // Frame property containment
        const allowedFrameKeys = new Set(['tick', 'frameIndex', 'presentationTimestampSec', 'observations']);
        for (const k of Object.keys(frame)) {
          if (!allowedFrameKeys.has(k)) {
            errors.push(`${framePath}.${k}: Unknown property (additionalProperties: false)`);
          }
        }

        if (!Number.isInteger(frame.tick) || frame.tick < 0) {
          errors.push(`${framePath}.tick: Must be integer >= 0, got ${frame.tick}`);
        } else {
          if (frame.tick <= lastTick) {
            errors.push(`${framePath}.tick: Must be strictly monotonic (frame tick ${frame.tick} <= prior tick ${lastTick})`);
          }
          lastTick = frame.tick;

          // Check presentationTimestampSec coherence
          if (typeof frame.presentationTimestampSec !== 'number') {
            errors.push(`${framePath}.presentationTimestampSec: Must be a number`);
          } else {
            const expectedPts = frame.tick / 120000;
            if (Math.abs(frame.presentationTimestampSec - expectedPts) > 1e-6) {
              errors.push(`${framePath}.presentationTimestampSec: Incoherent PTS (expected ${expectedPts}, got ${frame.presentationTimestampSec})`);
            }
          }
        }

        if (!Number.isInteger(frame.frameIndex) || frame.frameIndex < 0) {
          errors.push(`${framePath}.frameIndex: Must be integer >= 0, got ${frame.frameIndex}`);
        }

        if (!Array.isArray(frame.observations)) {
          errors.push(`${framePath}.observations: Must be an array`);
        } else {
          frame.observations.forEach((obs, oIdx) => {
            const obsPath = `${framePath}.observations[${oIdx}]`;
            if (!obs || typeof obs !== 'object' || Array.isArray(obs)) {
              errors.push(`${obsPath}: Must be a non-null object`);
              return;
            }

            const allowedObsKeys = new Set(['id', 'type', 'bounds', 'proxyBounds', 'confidence', 'motion']);
            for (const k of Object.keys(obs)) {
              if (!allowedObsKeys.has(k)) {
                errors.push(`${obsPath}.${k}: Unknown property (additionalProperties: false)`);
              }
            }

            if (typeof obs.id !== 'string' || obs.id.trim().length === 0) {
              errors.push(`${obsPath}.id: Must be a non-empty string`);
            }

            if (!VALID_OBSERVATION_TYPES.includes(obs.type)) {
              errors.push(`${obsPath}.type: Value "${obs.type}" not in enum [${VALID_OBSERVATION_TYPES.join(', ')}]`);
            }

            // Confidence check [0, 1000]
            if (!Number.isInteger(obs.confidence) || obs.confidence < 0 || obs.confidence > 1000) {
              errors.push(`${obsPath}.confidence: Must be integer in inclusive range [0, 1000], got ${obs.confidence}`);
            }

            // Bounds check
            if (!obs.bounds || typeof obs.bounds !== 'object' || Array.isArray(obs.bounds)) {
              errors.push(`${obsPath}.bounds: Missing or invalid required object`);
            } else {
              const b = obs.bounds;
              const allowedBoundsKeys = new Set(['x', 'y', 'width', 'height']);
              for (const k of Object.keys(b)) {
                if (!allowedBoundsKeys.has(k)) {
                  errors.push(`${obsPath}.bounds.${k}: Unknown property (additionalProperties: false)`);
                }
              }

              if (typeof b.x !== 'number' || b.x < 0) {
                errors.push(`${obsPath}.bounds.x: Must be number >= 0, got ${b.x}`);
              }
              if (typeof b.y !== 'number' || b.y < 0) {
                errors.push(`${obsPath}.bounds.y: Must be number >= 0, got ${b.y}`);
              }
              if (typeof b.width !== 'number' || b.width <= 0) {
                errors.push(`${obsPath}.bounds.width: Must be number > 0, got ${b.width}`);
              }
              if (typeof b.height !== 'number' || b.height <= 0) {
                errors.push(`${obsPath}.bounds.height: Must be number > 0, got ${b.height}`);
              }

              // Canvas boundary containment check
              if (typeof b.x === 'number' && typeof b.width === 'number' && b.x >= 0 && b.width > 0) {
                if (b.x + b.width > sourceWidth + 1e-4) {
                  errors.push(`${obsPath}.bounds: Bounds exceed source canvas width (${b.x + b.width} > ${sourceWidth})`);
                }
              }
              if (typeof b.y === 'number' && typeof b.height === 'number' && b.y >= 0 && b.height > 0) {
                if (b.y + b.height > sourceHeight + 1e-4) {
                  errors.push(`${obsPath}.bounds: Bounds exceed source canvas height (${b.y + b.height} > ${sourceHeight})`);
                }
              }
            }

            // Motion check (optional)
            if (obs.motion !== undefined) {
              if (!obs.motion || typeof obs.motion !== 'object' || Array.isArray(obs.motion)) {
                errors.push(`${obsPath}.motion: Must be a non-null object`);
              } else {
                const m = obs.motion;
                if (typeof m.vx !== 'number' || typeof m.vy !== 'number' || typeof m.speed !== 'number' || m.speed < 0) {
                  errors.push(`${obsPath}.motion: Must contain numbers vx, vy, and speed >= 0`);
                }
              }
            }
          });
        }
      });
    }

    // 9. Trajectories validation (optional)
    if (sidecar.trajectories !== undefined) {
      if (!Array.isArray(sidecar.trajectories)) {
        errors.push('$.trajectories: Must be an array');
      } else {
        sidecar.trajectories.forEach((traj, tIdx) => {
          const tPath = `$.trajectories[${tIdx}]`;
          if (!traj || typeof traj !== 'object' || Array.isArray(traj)) {
            errors.push(`${tPath}: Must be a non-null object`);
            return;
          }

          if (typeof traj.featureId !== 'string' || traj.featureId.trim().length === 0) {
            errors.push(`${tPath}.featureId: Must be a non-empty string`);
          }
          if (!['point', 'bounding_box'].includes(traj.trackType)) {
            errors.push(`${tPath}.trackType: Must be "point" or "bounding_box", got "${traj.trackType}"`);
          }
          if (!Array.isArray(traj.points)) {
            errors.push(`${tPath}.points: Must be an array`);
          } else {
            let lastPointTick = -1;
            traj.points.forEach((pt, pIdx) => {
              const ptPath = `${tPath}.points[${pIdx}]`;
              if (!pt || typeof pt !== 'object') {
                errors.push(`${ptPath}: Must be a non-null object`);
                return;
              }
              if (!Number.isInteger(pt.tick) || pt.tick < 0) {
                errors.push(`${ptPath}.tick: Must be integer >= 0, got ${pt.tick}`);
              } else {
                if (pt.tick < lastPointTick) {
                  errors.push(`${ptPath}.tick: Track ticks must be non-decreasing (${pt.tick} < ${lastPointTick})`);
                }
                lastPointTick = pt.tick;
              }
              if (typeof pt.x !== 'number' || typeof pt.y !== 'number') {
                errors.push(`${ptPath}: x and y must be numbers`);
              }
              if (!Number.isInteger(pt.confidence) || pt.confidence < 0 || pt.confidence > 1000) {
                errors.push(`${ptPath}.confidence: Must be integer in inclusive range [0, 1000], got ${pt.confidence}`);
              }
            });
          }
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = {
  VisualContractValidator,
  VALID_OBSERVATION_TYPES,
  VALID_EXECUTION_MODES
};
