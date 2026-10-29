/**
 * Editing Mechanics Engine (EME) - Project Model & Invariant Validator
 */

const fs = require('fs');
const path = require('path');
const { MediaTime, TICKS_PER_SECOND } = require('./time.js');
const { validateObject } = require('./validator.js');

const SCHEMA_PATH = path.resolve(__dirname, '../../schema/eme-project.v1.schema.json');

class ProjectManager {
  static getSchema() {
    if (!this._cachedSchema) {
      this._cachedSchema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    }
    return this._cachedSchema;
  }

  /**
   * Load and validate a canonical EME project JSON file.
   */
  static loadProject(filePath) {
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Project file does not exist: ${resolvedPath}`);
    }
    const raw = fs.readFileSync(resolvedPath, 'utf8');
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      throw new Error(`Malformed JSON in project file: ${e.message}`);
    }
    const validation = this.validateProject(data);
    if (!validation.valid) {
      const err = new Error(`Invalid project state in ${filePath}:\n` + validation.errors.join('\n'));
      err.errors = validation.errors;
      throw err;
    }
    return data;
  }

  /**
   * Serialize and save canonical EME project JSON to disk.
   */
  static saveProject(filePath, project) {
    const validation = this.validateProject(project);
    if (!validation.valid) {
      const err = new Error(`Cannot save invalid project:\n` + validation.errors.join('\n'));
      err.errors = validation.errors;
      throw err;
    }
    const resolvedPath = path.resolve(filePath);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, JSON.stringify(project, null, 2), 'utf8');
    return resolvedPath;
  }

  static validate(project) {
    const res = this.validateProject(project);
    if (!res.valid) {
      throw new Error(res.errors.join('; '));
    }
    return res;
  }

  /**
   * Perform comprehensive schema + semantic validation.
   */
  static validateProject(project) {
    const errors = [];
    const warnings = [];

    if (!project || typeof project !== 'object') {
      return { valid: false, errors: ['Project must be a non-null object'], warnings: [] };
    }

    // 1. JSON Schema validation
    try {
      const schema = this.getSchema();
      const schemaErrors = validateObject(project, schema, schema);
      if (schemaErrors.length > 0) {
        errors.push(...schemaErrors);
      }
    } catch (e) {
      errors.push(`Schema validation exception: ${e.message}`);
    }

    // 2. Semantic validations
    // Revision check
    if (!Number.isInteger(project.revision) || project.revision < 0) {
      errors.push(`Revision must be a non-negative integer. Got: ${project.revision}`);
    }

    // Timebase check
    if (project.timebase) {
      if (project.timebase.ticksPerSecond !== TICKS_PER_SECOND) {
        errors.push(`timebase.ticksPerSecond must be ${TICKS_PER_SECOND}. Got: ${project.timebase.ticksPerSecond}`);
      }
      if (project.timebase.durationTicks < 0) {
        errors.push(`timebase.durationTicks must be >= 0. Got: ${project.timebase.durationTicks}`);
      }
    }

    // Track ID uniqueness and indexing
    const trackMap = new Map();
    if (Array.isArray(project.tracks)) {
      for (const track of project.tracks) {
        if (!track.id) {
          errors.push(`Track missing id`);
          continue;
        }
        if (trackMap.has(track.id)) {
          errors.push(`Duplicate track id: "${track.id}"`);
        }
        trackMap.set(track.id, track);
      }
    }

    // Asset ID uniqueness
    const assetMap = new Map();
    if (Array.isArray(project.assets)) {
      for (const asset of project.assets) {
        if (!asset.id) {
          errors.push(`Asset missing id`);
          continue;
        }
        if (assetMap.has(asset.id)) {
          errors.push(`Duplicate asset id: "${asset.id}"`);
        }
        assetMap.set(asset.id, asset);
      }
    }

    // Clip validations
    const clipMap = new Map();
    const clipsByTrack = new Map();

    if (Array.isArray(project.clips)) {
      for (const clip of project.clips) {
        if (!clip.id) {
          errors.push(`Clip missing id`);
          continue;
        }
        if (clipMap.has(clip.id)) {
          errors.push(`Duplicate clip id: "${clip.id}"`);
        }
        clipMap.set(clip.id, clip);

        // Verify track exists
        if (!trackMap.has(clip.trackId)) {
          errors.push(`Clip "${clip.id}" references non-existent trackId: "${clip.trackId}"`);
        }

        // Verify asset exists if referenced
        if (clip.assetId && !assetMap.has(clip.assetId)) {
          errors.push(`Clip "${clip.id}" references non-existent assetId: "${clip.assetId}"`);
        }
        if (clip.source && clip.source.assetId && !assetMap.has(clip.source.assetId)) {
          errors.push(`Clip "${clip.id}" source references non-existent assetId: "${clip.source.assetId}"`);
        }

        // Clip duration
        if (clip.durationTicks <= 0) {
          errors.push(`Clip "${clip.id}" durationTicks must be > 0. Got: ${clip.durationTicks}`);
        }
        if (clip.startTick < 0) {
          errors.push(`Clip "${clip.id}" startTick must be >= 0. Got: ${clip.startTick}`);
        }

        // Audio volume envelope bounds check
        if (clip.audio && Array.isArray(clip.audio.volumeEnvelope)) {
          for (const kf of clip.audio.volumeEnvelope) {
            if (kf.offsetTick < 0 || kf.offsetTick > clip.durationTicks) {
              errors.push(`Audio keyframe on clip "${clip.id}" offsetTick ${kf.offsetTick} is outside clip bounds [0, ${clip.durationTicks}]`);
            }
            if (kf.volume < 0 || kf.volume > 2.0) {
              errors.push(`Audio keyframe volume ${kf.volume} out of valid range [0, 2.0]`);
            }
          }
        }

        // Group clips by track for collision detection
        if (!clipsByTrack.has(clip.trackId)) {
          clipsByTrack.set(clip.trackId, []);
        }
        clipsByTrack.get(clip.trackId).push(clip);
      }

      // Track collision check: clips on the same track must not overlap
      for (const [tId, trackClips] of clipsByTrack.entries()) {
        for (let i = 0; i < trackClips.length; i++) {
          for (let j = i + 1; j < trackClips.length; j++) {
            const cA = trackClips[i];
            const cB = trackClips[j];
            if (MediaTime.intervalsOverlap(cA.startTick, cA.durationTicks, cB.startTick, cB.durationTicks)) {
              errors.push(`Track collision on track "${tId}": clip "${cA.id}" [${cA.startTick}, ${cA.startTick + cA.durationTicks}) overlaps with clip "${cB.id}" [${cB.startTick}, ${cB.startTick + cB.durationTicks})`);
            }
          }
        }
      }
    }

    // Animation tracks bounds check
    if (Array.isArray(project.animations)) {
      for (const anim of project.animations) {
        const clip = clipMap.get(anim.clipId);
        if (!clip) {
          errors.push(`Animation references non-existent clipId: "${anim.clipId}"`);
          continue;
        }
        if (Array.isArray(anim.keyframes)) {
          for (const kf of anim.keyframes) {
            if (kf.offsetTick < 0 || kf.offsetTick > clip.durationTicks) {
              errors.push(`Keyframe on clip "${anim.clipId}" property "${anim.property}" offsetTick ${kf.offsetTick} is outside clip bounds [0, ${clip.durationTicks}]`);
            }
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}

module.exports = {
  ProjectManager
};
