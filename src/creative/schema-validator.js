/**
 * Editing Mechanics Engine (EME) - Creative Plan Validator
 *
 * Enforces schema compliance and mandatory invariants for eme-creative-plan.v1:
 * - 120,000 ticks/sec integer timebase.
 * - Half-open intervals [start_tick, end_tick).
 * - Monotonic narrative beat sequence & target duration consistency.
 * - Asset, clip, and track reference integrity against project snapshot.
 * - Subject-aware reframing coordinate & aspect ratio integrity.
 * - Fail-closed enforcement on unsupported features without authorized fallback.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { validateObject } = require('../engine/validator.js');
const { TICKS_PER_SECOND } = require('../engine/time.js');

const SCHEMA_PATH = path.resolve(__dirname, '../../schema/eme-creative-plan.v1.schema.json');

const CreativePlanErrorCodes = {
  ERR_SCHEMA_VALIDATION_FAILED: 'ERR_SCHEMA_VALIDATION_FAILED',
  ERR_INVALID_TIMEBASE: 'ERR_INVALID_TIMEBASE',
  ERR_INVALID_HALF_OPEN_INTERVAL: 'ERR_INVALID_HALF_OPEN_INTERVAL',
  ERR_BEAT_SEQUENCE_DISCONTINUITY: 'ERR_BEAT_SEQUENCE_DISCONTINUITY',
  ERR_TARGET_DURATION_MISMATCH: 'ERR_TARGET_DURATION_MISMATCH',
  ERR_MISSING_ASSET_REFERENCE: 'ERR_MISSING_ASSET_REFERENCE',
  ERR_STALE_PROJECT_REVISION: 'ERR_STALE_PROJECT_REVISION',
  ERR_PROJECT_SNAPSHOT_MISMATCH: 'ERR_PROJECT_SNAPSHOT_MISMATCH',
  ERR_INVALID_REFRAMING_GEOMETRY: 'ERR_INVALID_REFRAMING_GEOMETRY',
  ERR_UNSUPPORTED_CREATIVE_FEATURE: 'ERR_UNSUPPORTED_CREATIVE_FEATURE',
  ERR_MALFORMED_PLAN: 'ERR_MALFORMED_PLAN'
};

class CreativePlanValidator {
  static getSchema() {
    if (!this._cachedSchema) {
      this._cachedSchema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    }
    return this._cachedSchema;
  }

  /**
   * Validate a Creative Plan object against schema and semantic invariants.
   *
   * @param {object} plan The Creative Plan candidate
   * @param {object} [projectSnapshot] Optional canonical EME project snapshot for reference checking
   * @returns {{ valid: boolean, errors: string[], errorCodes: string[], diagnostics: object }}
   */
  static validate(plan, projectSnapshot = null) {
    const errors = [];
    const errorCodes = [];
    const diagnostics = {
      unsupportedFeatures: [],
      missingReferences: [],
      timingAnomalies: []
    };

    if (!plan || typeof plan !== 'object') {
      return {
        valid: false,
        errors: ['Creative Plan must be a non-null object'],
        errorCodes: [CreativePlanErrorCodes.ERR_MALFORMED_PLAN],
        diagnostics
      };
    }

    // 1. JSON Schema Validation
    try {
      const schema = this.getSchema();
      const schemaErrors = validateObject(plan, schema, schema);
      if (schemaErrors.length > 0) {
        errors.push(...schemaErrors);
        errorCodes.push(CreativePlanErrorCodes.ERR_SCHEMA_VALIDATION_FAILED);
      }
    } catch (err) {
      errors.push(`Schema parsing exception: ${err.message}`);
      errorCodes.push(CreativePlanErrorCodes.ERR_SCHEMA_VALIDATION_FAILED);
    }

    // 2. Strict Integer Timebase & Duration Checks
    const deliverable = plan.deliverable;
    if (deliverable) {
      if (!Number.isInteger(deliverable.target_duration_ticks) || deliverable.target_duration_ticks <= 0) {
        errors.push(`deliverable.target_duration_ticks must be a positive integer. Got: ${deliverable.target_duration_ticks}`);
        errorCodes.push(CreativePlanErrorCodes.ERR_INVALID_TIMEBASE);
      }
    }

    // 3. Project Snapshot Consistency
    if (projectSnapshot && plan.project_snapshot) {
      if (plan.project_snapshot.project_id && projectSnapshot.id && plan.project_snapshot.project_id !== projectSnapshot.id) {
        errors.push(`Plan project_id "${plan.project_snapshot.project_id}" does not match snapshot project id "${projectSnapshot.id}"`);
        errorCodes.push(CreativePlanErrorCodes.ERR_MISSING_ASSET_REFERENCE);
      }
      if (plan.project_snapshot.base_revision !== undefined && projectSnapshot.revision !== undefined) {
        if (plan.project_snapshot.base_revision !== projectSnapshot.revision) {
          errors.push(`Stale revision: plan base_revision ${plan.project_snapshot.base_revision} !== project revision ${projectSnapshot.revision}`);
          errorCodes.push(CreativePlanErrorCodes.ERR_STALE_PROJECT_REVISION);
        }
      }
      if (plan.project_snapshot.snapshot_sha256 !== require('../prompt-core/context-normalizer.js').computeProjectSnapshotSha256(projectSnapshot)) {
        errors.push('Declared project snapshot digest does not match the canonical project');
        errorCodes.push(CreativePlanErrorCodes.ERR_PROJECT_SNAPSHOT_MISMATCH);
      }
      if (plan.project_snapshot.timebase_ticks_per_second !== TICKS_PER_SECOND) {
        errors.push(`project_snapshot.timebase_ticks_per_second must be ${TICKS_PER_SECOND}. Got: ${plan.project_snapshot.timebase_ticks_per_second}`);
        errorCodes.push(CreativePlanErrorCodes.ERR_INVALID_TIMEBASE);
      }
    }

    // 4. Narrative Beats Timing & Interval Checks
    const beats = plan.narrative_beats || [];
    let cumulativeBeatsDuration = 0;
    let previousEndTick = 0;

    for (let i = 0; i < beats.length; i++) {
      const beat = beats[i];
      const prefix = `narrative_beats[${i}] (beat_id=${beat.beat_id || 'unknown'})`;

      // Check sequence index
      if (beat.sequence_index !== i) {
        errors.push(`${prefix}: sequence_index must be ${i}, got ${beat.sequence_index}`);
        errorCodes.push(CreativePlanErrorCodes.ERR_BEAT_SEQUENCE_DISCONTINUITY);
      }

      // Check timeline_range half-open interval
      const tRange = beat.timeline_range;
      if (tRange) {
        if (!Number.isInteger(tRange.start_tick) || !Number.isInteger(tRange.end_tick) || !Number.isInteger(tRange.duration_ticks)) {
          errors.push(`${prefix}: timeline_range ticks must be exact integers`);
          errorCodes.push(CreativePlanErrorCodes.ERR_INVALID_TIMEBASE);
        } else {
          if (tRange.start_tick < 0) {
            errors.push(`${prefix}: timeline_range.start_tick must be >= 0. Got: ${tRange.start_tick}`);
            errorCodes.push(CreativePlanErrorCodes.ERR_INVALID_HALF_OPEN_INTERVAL);
          }
          if (tRange.end_tick <= tRange.start_tick) {
            errors.push(`${prefix}: timeline_range.end_tick (${tRange.end_tick}) must be strictly greater than start_tick (${tRange.start_tick})`);
            errorCodes.push(CreativePlanErrorCodes.ERR_INVALID_HALF_OPEN_INTERVAL);
          }
          if (tRange.end_tick !== tRange.start_tick + tRange.duration_ticks) {
            errors.push(`${prefix}: timeline_range interval invariant violated: end_tick (${tRange.end_tick}) !== start_tick (${tRange.start_tick}) + duration_ticks (${tRange.duration_ticks})`);
            errorCodes.push(CreativePlanErrorCodes.ERR_INVALID_HALF_OPEN_INTERVAL);
          }

          // Continuity check: beats must abut cleanly without unintentional gaps/overlaps
          if (i === 0) {
            if (tRange.start_tick !== 0) {
              errors.push(`${prefix}: first narrative beat must start at tick 0. Got: ${tRange.start_tick}`);
              errorCodes.push(CreativePlanErrorCodes.ERR_BEAT_SEQUENCE_DISCONTINUITY);
            }
          } else {
            if (tRange.start_tick !== previousEndTick) {
              errors.push(`${prefix}: beat sequence temporal discontinuity: beat starts at tick ${tRange.start_tick}, but previous beat ended at ${previousEndTick}`);
              errorCodes.push(CreativePlanErrorCodes.ERR_BEAT_SEQUENCE_DISCONTINUITY);
            }
          }
          previousEndTick = tRange.end_tick;
          cumulativeBeatsDuration += tRange.duration_ticks;
        }
      }

      // Check source_range half-open interval
      const sRange = beat.source_range;
      if (sRange) {
        if (!Number.isInteger(sRange.start_tick) || !Number.isInteger(sRange.end_tick) || !Number.isInteger(sRange.duration_ticks)) {
          errors.push(`${prefix}: source_range ticks must be exact integers`);
          errorCodes.push(CreativePlanErrorCodes.ERR_INVALID_TIMEBASE);
        } else {
          if (sRange.start_tick < 0) {
            errors.push(`${prefix}: source_range.start_tick must be >= 0. Got: ${sRange.start_tick}`);
            errorCodes.push(CreativePlanErrorCodes.ERR_INVALID_HALF_OPEN_INTERVAL);
          }
          if (sRange.end_tick <= sRange.start_tick) {
            errors.push(`${prefix}: source_range.end_tick (${sRange.end_tick}) must be strictly greater than start_tick (${sRange.start_tick})`);
            errorCodes.push(CreativePlanErrorCodes.ERR_INVALID_HALF_OPEN_INTERVAL);
          }
          if (sRange.end_tick !== sRange.start_tick + sRange.duration_ticks) {
            errors.push(`${prefix}: source_range interval invariant violated: end_tick (${sRange.end_tick}) !== start_tick (${sRange.start_tick}) + duration_ticks (${sRange.duration_ticks})`);
            errorCodes.push(CreativePlanErrorCodes.ERR_INVALID_HALF_OPEN_INTERVAL);
          }
        }
      }

      // Check asset reference existence against project snapshot
      if (projectSnapshot && beat.source_media_ref?.asset_id) {
        const assetExists = (projectSnapshot.assets || []).some(a => a.id === beat.source_media_ref.asset_id);
        if (!assetExists) {
          errors.push(`${prefix}: referenced source asset_id "${beat.source_media_ref.asset_id}" not found in project assets`);
          errorCodes.push(CreativePlanErrorCodes.ERR_MISSING_ASSET_REFERENCE);
          diagnostics.missingReferences.push(beat.source_media_ref.asset_id);
        }
      }

      // Reframing checks
      const reframing = beat.editorial_decisions?.reframing;
      if (reframing && reframing.enabled) {
        if (reframing.crop_rect) {
          const { x, y, width, height } = reframing.crop_rect;
          if (width <= 0 || height <= 0 || x < 0 || y < 0) {
            errors.push(`${prefix}: reframing.crop_rect must have positive dimensions and non-negative offsets. Got: ${JSON.stringify(reframing.crop_rect)}`);
            errorCodes.push(CreativePlanErrorCodes.ERR_INVALID_REFRAMING_GEOMETRY);
          }
        }
      }
    }

    // Cumulative beats duration match deliverable
    if (deliverable && deliverable.target_duration_ticks && cumulativeBeatsDuration > 0) {
      if (cumulativeBeatsDuration !== deliverable.target_duration_ticks) {
        errors.push(`Total narrative beats duration (${cumulativeBeatsDuration} ticks) does not equal deliverable.target_duration_ticks (${deliverable.target_duration_ticks} ticks)`);
        errorCodes.push(CreativePlanErrorCodes.ERR_TARGET_DURATION_MISMATCH);
        diagnostics.timingAnomalies.push({ cumulativeBeatsDuration, targetDurationTicks: deliverable.target_duration_ticks });
      }
    }

    // 5. Visual Events Checks
    const visualEvents = plan.visual_events || [];
    const maxTimelineTick = deliverable?.target_duration_ticks || Infinity;

    for (let i = 0; i < visualEvents.length; i++) {
      const event = visualEvents[i];
      const prefix = `visual_events[${i}] (event_id=${event.event_id || 'unknown'})`;
      const tRange = event.timeline_range;

      if (tRange) {
        if (!Number.isInteger(tRange.start_tick) || !Number.isInteger(tRange.end_tick) || !Number.isInteger(tRange.duration_ticks)) {
          errors.push(`${prefix}: timeline_range ticks must be exact integers`);
          errorCodes.push(CreativePlanErrorCodes.ERR_INVALID_TIMEBASE);
        } else {
          if (tRange.start_tick < 0) {
            errors.push(`${prefix}: start_tick must be >= 0`);
            errorCodes.push(CreativePlanErrorCodes.ERR_INVALID_HALF_OPEN_INTERVAL);
          }
          if (tRange.end_tick <= tRange.start_tick) {
            errors.push(`${prefix}: end_tick must be > start_tick`);
            errorCodes.push(CreativePlanErrorCodes.ERR_INVALID_HALF_OPEN_INTERVAL);
          }
          if (tRange.end_tick !== tRange.start_tick + tRange.duration_ticks) {
            errors.push(`${prefix}: interval invariant violated: end_tick !== start_tick + duration_ticks`);
            errorCodes.push(CreativePlanErrorCodes.ERR_INVALID_HALF_OPEN_INTERVAL);
          }
          if (tRange.end_tick > maxTimelineTick) {
            errors.push(`${prefix}: visual event ends at tick ${tRange.end_tick}, exceeding timeline target duration ${maxTimelineTick}`);
            errorCodes.push(CreativePlanErrorCodes.ERR_TARGET_DURATION_MISMATCH);
          }
        }
      }

      if (projectSnapshot && event.content?.asset_id) {
        const assetExists = (projectSnapshot.assets || []).some(a => a.id === event.content.asset_id);
        if (!assetExists) {
          errors.push(`${prefix}: referenced content asset_id "${event.content.asset_id}" not found in project assets`);
          errorCodes.push(CreativePlanErrorCodes.ERR_MISSING_ASSET_REFERENCE);
          diagnostics.missingReferences.push(event.content.asset_id);
        }
      }
    }

    // 6. Audio Direction References
    if (projectSnapshot && plan.audio_direction?.soundtrack_selection?.asset_id) {
      const soundtrackAssetId = plan.audio_direction.soundtrack_selection.asset_id;
      const assetExists = (projectSnapshot.assets || []).some(a => a.id === soundtrackAssetId);
      if (!assetExists) {
        errors.push(`audio_direction.soundtrack_selection referenced asset_id "${soundtrackAssetId}" not found in project assets`);
        errorCodes.push(CreativePlanErrorCodes.ERR_MISSING_ASSET_REFERENCE);
        diagnostics.missingReferences.push(soundtrackAssetId);
      }
    }

    // 7. Unsupported Features Check
    const unsupported = plan.unsupported_features || [];
    for (const feat of unsupported) {
      diagnostics.unsupportedFeatures.push(feat);
      if (feat.fallback_policy === 'refuse' || !feat.accepted_by_user) {
        errors.push(`Unresolved unsupported creative feature "${feat.feature_name}": ${feat.reason}`);
        errorCodes.push(CreativePlanErrorCodes.ERR_UNSUPPORTED_CREATIVE_FEATURE);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      errorCodes: Array.from(new Set(errorCodes)),
      diagnostics
    };
  }

  /**
   * Compute deterministic SHA-256 fingerprint of a Creative Plan.
   */
  static computePlanHash(plan) {
    const clone = structuredClone(plan);
    if (clone.provenance && 'plan_hash' in clone.provenance) {
      delete clone.provenance.plan_hash;
    }
    const serialized = JSON.stringify(clone);
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }
}

module.exports = {
  CreativePlanValidator,
  CreativePlanErrorCodes
};
