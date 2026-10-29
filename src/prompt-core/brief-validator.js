/**
 * Editing Mechanics Engine (EME) - Prompt Core Brief & Envelope Validator
 */

const fs = require('node:fs');
const path = require('node:path');
const { validateObject } = require('../engine/validator.js');

const SCHEMA_DIR = path.resolve(__dirname, '../../schema');

class BriefValidator {
  static getSchema(name) {
    if (!this._cache) this._cache = new Map();
    if (!this._cache.has(name)) {
      const p = path.join(SCHEMA_DIR, name);
      if (!fs.existsSync(p)) {
        throw new Error(`Schema file not found: ${p}`);
      }
      this._cache.set(name, JSON.parse(fs.readFileSync(p, 'utf8')));
    }
    return this._cache.get(name);
  }

  static validateIntentEnvelope(envelope) {
    const schema = this.getSchema('eme-intent-envelope.v1.schema.json');
    const errors = validateObject(envelope, schema, schema);
    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validateConstraint(constraint) {
    const schema = this.getSchema('eme-constraint.v1.schema.json');
    const errors = validateObject(constraint, schema, schema);
    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validateEditBrief(brief) {
    const briefSchema = structuredClone(this.getSchema('eme-edit-brief.v1.schema.json'));
    const constraintSchema = this.getSchema('eme-constraint.v1.schema.json');

    // Attach constraint definition so $ref resolves cleanly
    if (!briefSchema.$defs) briefSchema.$defs = {};
    briefSchema.$defs['eme-constraint.v1.schema.json'] = constraintSchema;

    // Custom resolver for cross-file ref
    const errors = [];
    const validateWithDefs = (data, s, root, pathStr = '$') => {
      if (s.$ref === 'eme-constraint.v1.schema.json') {
        return validateObject(data, constraintSchema, constraintSchema, pathStr);
      }
      return validateObject(data, s, root, pathStr);
    };

    // First validate top level
    const topErrors = validateObject(brief, briefSchema, briefSchema);
    errors.push(...topErrors);

    // Validate constraints individually with constraint schema
    if (Array.isArray(brief?.constraints)) {
      brief.constraints.forEach((c, idx) => {
        const cErrors = validateObject(c, constraintSchema, constraintSchema, `$.constraints[${idx}]`);
        errors.push(...cErrors);
      });
    }

    // Filter duplicate ref errors if any
    const uniqueErrors = Array.from(new Set(errors));

    return {
      valid: uniqueErrors.length === 0,
      errors: uniqueErrors
    };
  }

  static validateOperationPlan(plan) {
    const schema = this.getSchema('eme-operation-plan.v1.schema.json');
    const errors = validateObject(plan, schema, schema);
    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validateRenderJob(job) {
    const schema = this.getSchema('eme-render-job.v1.schema.json');
    const errors = validateObject(job, schema, schema);
    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validateMediaQAReport(report) {
    const schema = this.getSchema('eme-media-qa-report.v1.schema.json');
    const errors = validateObject(report, schema, schema);
    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validateDeliveryManifest(manifest) {
    const schema = this.getSchema('eme-delivery-manifest.v1.schema.json');
    const errors = validateObject(manifest, schema, schema);
    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validateDeliveryRun(run) {
    const schema = this.getSchema('eme-delivery-run.v1.schema.json');
    const errors = validateObject(run, schema, schema);
    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validateRevisionRun(run) {
    const schema = this.getSchema('eme-revision-run.v1.schema.json');
    const errors = validateObject(run, schema, schema);
    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validateCandidateSet(candidateSet) {
    const schema = this.getSchema('eme-candidate-set.v1.schema.json');
    const errors = validateObject(candidateSet, schema, schema);
    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validateMusicalStructure(structure) {
    const schema = this.getSchema('eme-musical-structure.v1.schema.json');
    const errors = validateObject(structure, schema, schema);
    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validatePreferenceProfile(profile) {
    const schema = this.getSchema('eme-preference-profile.v1.schema.json');
    const errors = validateObject(profile, schema, schema);
    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validatePreferenceFeedback(feedback) {
    const schema = this.getSchema('eme-preference-feedback.v1.schema.json');
    const errors = validateObject(feedback, schema, schema);
    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validateRevisionSession(session) {
    const schema = this.getSchema('eme-revision-session.v1.schema.json');
    const errors = validateObject(session, schema, schema);
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = {
  BriefValidator
};
