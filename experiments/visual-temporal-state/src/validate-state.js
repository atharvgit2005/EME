/**
 * VTSM-01 State Validator
 * 
 * Zero-dependency, deterministic schema and semantic validator for VTSM-01 documents.
 * Enforces finite numbers, monotonic timestamps, reference integrity, bounding box validity,
 * and explicit confidence ranges.
 */

const { VtsmTimebase } = require('./timebase.js');

class VtsmValidator {
  /**
   * Validate a VTSM document. Returns { valid: boolean, errors: string[] }.
   */
  static validate(doc) {
    const errors = [];

    if (!doc || typeof doc !== 'object') {
      return { valid: false, errors: ['Document must be a non-null object'] };
    }

    // 1. Version
    if (doc.version !== '1.0.0' && doc.version !== 'v1') {
      errors.push(`Invalid version: expected "1.0.0" or "v1", got ${JSON.stringify(doc.version)}`);
    }

    // 2. Source
    if (!doc.source || typeof doc.source !== 'object') {
      errors.push('source property is required and must be an object');
    } else {
      const s = doc.source;
      if (typeof s.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(s.sha256)) {
        errors.push(`source.sha256 must be a 64-char hexadecimal string, got ${JSON.stringify(s.sha256)}`);
      }
      if (typeof s.filePath !== 'string' || s.filePath.length === 0) {
        errors.push('source.filePath must be a non-empty string');
      }
      if (!s.dimensions || typeof s.dimensions !== 'object') {
        errors.push('source.dimensions must be an object { width, height }');
      } else {
        if (!Number.isInteger(s.dimensions.width) || s.dimensions.width <= 0) {
          errors.push(`source.dimensions.width must be positive integer, got ${s.dimensions.width}`);
        }
        if (!Number.isInteger(s.dimensions.height) || s.dimensions.height <= 0) {
          errors.push(`source.dimensions.height must be positive integer, got ${s.dimensions.height}`);
        }
      }
      if (typeof s.durationSec !== 'number' || !Number.isFinite(s.durationSec) || s.durationSec < 0) {
        errors.push(`source.durationSec must be a non-negative finite number, got ${s.durationSec}`);
      }
      if (!Number.isInteger(s.totalFrames) || s.totalFrames < 1) {
        errors.push(`source.totalFrames must be an integer >= 1, got ${s.totalFrames}`);
      }
    }

    // 3. Timebase
    if (!doc.timebase || typeof doc.timebase !== 'object') {
      errors.push('timebase property is required and must be an object');
    } else {
      const tb = doc.timebase;
      if (tb.ticksPerSecond !== VtsmTimebase.TICKS_PER_SECOND) {
        errors.push(`timebase.ticksPerSecond must be ${VtsmTimebase.TICKS_PER_SECOND}, got ${tb.ticksPerSecond}`);
      }
      if (!tb.rationalFps || typeof tb.rationalFps !== 'object') {
        errors.push('timebase.rationalFps is required');
      } else {
        if (!Number.isInteger(tb.rationalFps.numerator) || tb.rationalFps.numerator <= 0) {
          errors.push(`timebase.rationalFps.numerator must be positive integer, got ${tb.rationalFps.numerator}`);
        }
        if (!Number.isInteger(tb.rationalFps.denominator) || tb.rationalFps.denominator <= 0) {
          errors.push(`timebase.rationalFps.denominator must be positive integer, got ${tb.rationalFps.denominator}`);
        }
      }
      if (!Number.isInteger(tb.durationTicks) || tb.durationTicks < 0) {
        errors.push(`timebase.durationTicks must be non-negative integer, got ${tb.durationTicks}`);
      }
    }

    // 4. Shots
    const shotIds = new Set();
    if (!Array.isArray(doc.shots) || doc.shots.length === 0) {
      errors.push('shots must be a non-empty array');
    } else {
      let prevEndFrame = -1;
      for (let i = 0; i < doc.shots.length; i++) {
        const shot = doc.shots[i];
        if (!shot.shotId && shot.shotId !== 0) {
          errors.push(`Shot at index ${i} missing shotId`);
        } else {
          shotIds.add(String(shot.shotId));
        }
        if (!Number.isInteger(shot.startFrame) || shot.startFrame < 0) {
          errors.push(`Shot ${shot.shotId}: startFrame must be integer >= 0`);
        }
        if (!Number.isInteger(shot.endFrame) || shot.endFrame < shot.startFrame) {
          errors.push(`Shot ${shot.shotId}: endFrame (${shot.endFrame}) must be >= startFrame (${shot.startFrame})`);
        }
        if (typeof shot.cutConfidence !== 'number' || shot.cutConfidence < 0 || shot.cutConfidence > 1) {
          errors.push(`Shot ${shot.shotId}: cutConfidence must be in [0.0, 1.0], got ${shot.cutConfidence}`);
        }
        const validCutTypes = ['initial', 'hard_cut', 'dissolve', 'fade', 'final'];
        if (!validCutTypes.includes(shot.cutType)) {
          errors.push(`Shot ${shot.shotId}: cutType invalid: ${shot.cutType}`);
        }
      }
    }

    // 5. Entities
    const entityIds = new Set();
    if (!Array.isArray(doc.entities)) {
      errors.push('entities must be an array');
    } else {
      for (let i = 0; i < doc.entities.length; i++) {
        const ent = doc.entities[i];
        if (typeof ent.entityId !== 'string' || ent.entityId.length === 0) {
          errors.push(`Entity at index ${i} missing valid entityId`);
        } else {
          if (entityIds.has(ent.entityId)) {
            errors.push(`Duplicate entityId: ${ent.entityId}`);
          }
          entityIds.add(ent.entityId);
        }
        if (typeof ent.label !== 'string') {
          errors.push(`Entity ${ent.entityId} missing label`);
        }
        if (!shotIds.has(String(ent.shotId))) {
          errors.push(`Entity ${ent.entityId} references unknown shotId: ${ent.shotId}`);
        }
        const validPolicies = ['reset_on_cut', 'reid_probabilistic', 'persistent_global'];
        if (!validPolicies.includes(ent.policyAcrossCuts)) {
          errors.push(`Entity ${ent.entityId} invalid policyAcrossCuts: ${ent.policyAcrossCuts}`);
        }
      }
    }

    // 6. Frames
    if (!Array.isArray(doc.frames) || doc.frames.length === 0) {
      errors.push('frames must be a non-empty array');
    } else {
      let prevFrameIdx = -1;
      let prevPts = -Infinity;
      let prevTick = -1;

      for (let i = 0; i < doc.frames.length; i++) {
        const f = doc.frames[i];

        // Discontinuity checks
        if (f.frameIndex !== prevFrameIdx + 1) {
          errors.push(`Frame index non-consecutive at index ${i}: expected ${prevFrameIdx + 1}, got ${f.frameIndex}`);
        }
        if (typeof f.pts !== 'number' || !Number.isFinite(f.pts) || f.pts < 0) {
          errors.push(`Frame ${f.frameIndex}: PTS must be non-negative finite number, got ${f.pts}`);
        } else if (f.pts <= prevPts) {
          errors.push(`Frame ${f.frameIndex}: PTS non-monotonic (${f.pts} <= ${prevPts})`);
        }
        if (!Number.isInteger(f.tick) || f.tick < 0) {
          errors.push(`Frame ${f.frameIndex}: tick must be non-negative integer, got ${f.tick}`);
        } else if (f.tick <= prevTick) {
          errors.push(`Frame ${f.frameIndex}: tick non-monotonic (${f.tick} <= ${prevTick})`);
        }

        prevFrameIdx = f.frameIndex;
        prevPts = f.pts;
        prevTick = f.tick;

        // Shot reference
        if (!shotIds.has(String(f.shotId))) {
          errors.push(`Frame ${f.frameIndex} references unknown shotId: ${f.shotId}`);
        }

        // Camera motion
        const cm = f.cameraMotion;
        if (!cm || typeof cm !== 'object') {
          errors.push(`Frame ${f.frameIndex} missing cameraMotion object`);
        } else {
          const validModels = ['identity', 'translation', 'affine', 'homography', 'perspective_3d'];
          if (!validModels.includes(cm.model)) {
            errors.push(`Frame ${f.frameIndex}: invalid cameraMotion.model: ${cm.model}`);
          }
          if (!cm.translation || !Number.isFinite(cm.translation.dx) || !Number.isFinite(cm.translation.dy)) {
            errors.push(`Frame ${f.frameIndex}: cameraMotion translation must contain finite dx and dy`);
          }
          if (typeof cm.scale !== 'number' || !Number.isFinite(cm.scale) || cm.scale <= 0) {
            errors.push(`Frame ${f.frameIndex}: cameraMotion.scale must be positive finite number, got ${cm.scale}`);
          }
          if (typeof cm.rotation !== 'number' || !Number.isFinite(cm.rotation)) {
            errors.push(`Frame ${f.frameIndex}: cameraMotion.rotation must be finite number`);
          }
          if (typeof cm.confidence !== 'number' || cm.confidence < 0 || cm.confidence > 1) {
            errors.push(`Frame ${f.frameIndex}: cameraMotion.confidence must be in [0.0, 1.0], got ${cm.confidence}`);
          }
          if (typeof cm.valid !== 'boolean') {
            errors.push(`Frame ${f.frameIndex}: cameraMotion.valid must be boolean`);
          }
        }

        // Observations
        if (!Array.isArray(f.observations)) {
          errors.push(`Frame ${f.frameIndex}: observations must be an array`);
        } else {
          for (let oIdx = 0; oIdx < f.observations.length; oIdx++) {
            const obs = f.observations[oIdx];
            if (!entityIds.has(obs.entityId)) {
              errors.push(`Frame ${f.frameIndex} obs ${oIdx}: references unregistered entityId: ${obs.entityId}`);
            }

            // Bbox validation
            if (!obs.bbox || !obs.bbox.pixel || !obs.bbox.normalized) {
              errors.push(`Frame ${f.frameIndex} entity ${obs.entityId}: bbox must have pixel and normalized objects`);
            } else {
              const p = obs.bbox.pixel;
              if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.width) || !Number.isFinite(p.height)) {
                errors.push(`Frame ${f.frameIndex} entity ${obs.entityId}: pixel bbox coordinates must be finite`);
              }
              if (p.width <= 0 || p.height <= 0) {
                errors.push(`Frame ${f.frameIndex} entity ${obs.entityId}: pixel bbox dimensions must be positive`);
              }

              const n = obs.bbox.normalized;
              if (!Number.isFinite(n.x) || !Number.isFinite(n.y) || !Number.isFinite(n.width) || !Number.isFinite(n.height)) {
                errors.push(`Frame ${f.frameIndex} entity ${obs.entityId}: normalized bbox coordinates must be finite`);
              }
              if (n.x < -0.1 || n.x > 1.1 || n.y < -0.1 || n.y > 1.1) {
                errors.push(`Frame ${f.frameIndex} entity ${obs.entityId}: normalized bbox [${n.x}, ${n.y}] out of range`);
              }
              if (n.width <= 0 || n.height <= 0) {
                errors.push(`Frame ${f.frameIndex} entity ${obs.entityId}: normalized bbox dimensions must be positive`);
              }
            }

            // Center
            if (!obs.center || !Array.isArray(obs.center.pixel) || !Array.isArray(obs.center.normalized)) {
              errors.push(`Frame ${f.frameIndex} entity ${obs.entityId}: center must have pixel and normalized [x, y]`);
            } else {
              if (obs.center.pixel.length !== 2 || !Number.isFinite(obs.center.pixel[0]) || !Number.isFinite(obs.center.pixel[1])) {
                errors.push(`Frame ${f.frameIndex} entity ${obs.entityId}: pixel center must be 2 finite numbers`);
              }
              if (obs.center.normalized.length !== 2 || !Number.isFinite(obs.center.normalized[0]) || !Number.isFinite(obs.center.normalized[1])) {
                errors.push(`Frame ${f.frameIndex} entity ${obs.entityId}: normalized center must be 2 finite numbers`);
              }
            }

            // Visibility
            const validVis = ['visible', 'partially_occluded', 'occluded', 'out_of_frame'];
            if (!validVis.includes(obs.visibility)) {
              errors.push(`Frame ${f.frameIndex} entity ${obs.entityId}: invalid visibility: ${obs.visibility}`);
            }
            if (typeof obs.visibilityConfidence !== 'number' || obs.visibilityConfidence < 0 || obs.visibilityConfidence > 1) {
              errors.push(`Frame ${f.frameIndex} entity ${obs.entityId}: visibilityConfidence must be [0..1]`);
            }
            if (typeof obs.trackingConfidence !== 'number' || obs.trackingConfidence < 0 || obs.trackingConfidence > 1) {
              errors.push(`Frame ${f.frameIndex} entity ${obs.entityId}: trackingConfidence must be [0..1]`);
            }

            // Motion
            if (!obs.motion || !obs.motion.raw || !obs.motion.compensated) {
              errors.push(`Frame ${f.frameIndex} entity ${obs.entityId}: motion must contain raw and compensated vectors`);
            } else {
              if (typeof obs.motion.raw.valid !== 'boolean' || typeof obs.motion.compensated.valid !== 'boolean') {
                errors.push(`Frame ${f.frameIndex} entity ${obs.entityId}: motion vectors must define boolean valid flags`);
              }
              if (!Number.isFinite(obs.motion.raw.dx) || !Number.isFinite(obs.motion.raw.dy)) {
                errors.push(`Frame ${f.frameIndex} entity ${obs.entityId}: raw motion vectors must be finite`);
              }
              if (!Number.isFinite(obs.motion.compensated.dx) || !Number.isFinite(obs.motion.compensated.dy)) {
                errors.push(`Frame ${f.frameIndex} entity ${obs.entityId}: compensated motion vectors must be finite`);
              }
            }
          }
        }
      }
    }

    // 7. Events
    if (!Array.isArray(doc.events)) {
      errors.push('events must be an array');
    } else {
      for (let i = 0; i < doc.events.length; i++) {
        const ev = doc.events[i];
        if (typeof ev.eventId !== 'string') errors.push(`Event ${i}: missing eventId`);
        const validEventTypes = ['entrance', 'exit', 'occlusion_start', 'occlusion_end', 'zoom_change', 'motion_discontinuity', 'shot_boundary'];
        if (!validEventTypes.includes(ev.type)) {
          errors.push(`Event ${ev.eventId}: invalid type: ${ev.type}`);
        }
        if (ev.entityId && !entityIds.has(ev.entityId)) {
          errors.push(`Event ${ev.eventId}: references unregistered entityId: ${ev.entityId}`);
        }
        if (!Number.isInteger(ev.frameIndex) || ev.frameIndex < 0) {
          errors.push(`Event ${ev.eventId}: frameIndex must be integer >= 0`);
        }
        if (typeof ev.confidence !== 'number' || ev.confidence < 0 || ev.confidence > 1) {
          errors.push(`Event ${ev.eventId}: confidence must be in [0..1], got ${ev.confidence}`);
        }
      }
    }

    // 8. Provenance
    if (!doc.provenance || typeof doc.provenance !== 'object') {
      errors.push('provenance is required and must be an object');
    } else {
      const p = doc.provenance;
      if (typeof p.extractor !== 'string') errors.push('provenance.extractor must be string');
      if (typeof p.version !== 'string') errors.push('provenance.version must be string');
      if (typeof p.license !== 'string') errors.push('provenance.license must be string');
      if (!p.parameters || typeof p.parameters !== 'object') errors.push('provenance.parameters must be an object');
      if (typeof p.timestamp !== 'string') errors.push('provenance.timestamp must be an ISO string');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Throw if validation fails.
   */
  static assertValid(doc) {
    const res = this.validate(doc);
    if (!res.valid) {
      throw new Error(`VTSM Schema Validation Failed:\n${res.errors.map(e => `  - ${e}`).join('\n')}`);
    }
    return true;
  }
}

module.exports = { VtsmValidator };
