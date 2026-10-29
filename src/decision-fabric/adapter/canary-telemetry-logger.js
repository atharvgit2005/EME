import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_LOG_PATH = path.resolve(__dirname, '../reports/canary-telemetry.json');
const DEFAULT_SAFETY_INCIDENT_PATH = path.resolve(__dirname, '../reports/canary-safety-incidents.json');

const CANDIDATE_COMPONENT_HASHES = {
  adapter: 'fe2d8b0f8f1a93e0e875c7c2f88f5700eca396884692d1d53360ba20b716eae0',
  policyGate: 'e3c6804bad8677771f3c216f9a1bbb75d49a786cb89945d7cd5cf86ebb2c07c5',
  deterministicRouter: '22cf6a2109ea753dcb55be7987e3265d472acb7d391270542020ceaafd00f056',
  routingPolicy: 'e516cc4e4c144ec56f6ed875b5b4d56bea95b28a3fd1196911c7d61574416858'
};

function sanitizeContent(data) {
  if (typeof data === 'string') {
    // Redact local user directory paths to preserve privacy and prevent sensitive leakage
    return data.replace(/\/Users\/[^\s'"]+/g, '[REDACTED_LOCAL_PATH]');
  }
  if (Array.isArray(data)) {
    return data.map(sanitizeContent);
  }
  if (data && typeof data === 'object') {
    const sanitized = {};
    for (const [k, v] of Object.entries(data)) {
      sanitized[k] = sanitizeContent(v);
    }
    return sanitized;
  }
  return data;
}

export class CanaryTelemetryLogger {
  constructor(options = {}) {
    this.maxEntries = options.maxEntries || 1000;
    this.buffer = [];
    this.safetyIncidents = [];
    this.logFilePath = options.logFilePath || DEFAULT_LOG_PATH;
    this.safetyIncidentPath = options.safetyIncidentPath || DEFAULT_SAFETY_INCIDENT_PATH;
    this.circuitBreakerTripped = false;
    this.circuitBreakerReason = null;
  }

  isCanaryActive() {
    if (this.circuitBreakerTripped) {
      return false;
    }
    return process.env.CANARY_ADVISORY_MODE === 'true';
  }

  tripCircuitBreaker(reason, incidentDetails = {}) {
    this.circuitBreakerTripped = true;
    this.circuitBreakerReason = reason;

    const incident = {
      incidentId: `inc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      type: 'circuit_breaker_tripped',
      reason: sanitizeContent(reason),
      details: sanitizeContent(incidentDetails),
      action: 'immediate_emergency_rollback',
      candidateId: 'candidate2',
      buildIdentifier: 'eme-v0.1.0-rc1-candidate2'
    };

    this.recordSafetyIncident(incident);
    this.logEvent(incident);
  }

  recordSafetyIncident(incident) {
    this.safetyIncidents.push(incident);
    this.persistSafetyIncidents();
  }

  resetCircuitBreaker() {
    this.circuitBreakerTripped = false;
    this.circuitBreakerReason = null;
  }

  logEvaluation({
    type = 'route',
    traceId,
    baselineDecision,
    layaRecommendation,
    policyResult,
    fallbackInvoked = false,
    errors = null,
    latencyMs = 0.1
  }) {
    if (!this.isCanaryActive()) {
      return null;
    }

    const entry = {
      timestamp: new Date().toISOString(),
      traceId: traceId || `canary_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      candidateId: 'candidate2',
      buildIdentifier: 'eme-v0.1.0-rc1-candidate2',
      manifestFile: 'src/decision-fabric/artifacts/m6-candidate2-manifest.json',
      componentHashes: CANDIDATE_COMPONENT_HASHES,
      type,
      authoritativeEngine: 'deterministic_router',
      baselineDecision: baselineDecision || null,
      layaRecommendation: layaRecommendation || null,
      policyResult: {
        action: policyResult?.action || 'pass',
        policyEnforced: true,
        forbiddenActions: policyResult?.forbidden_actions || [],
        constraints: policyResult?.constraints || []
      },
      fallbackInvoked: Boolean(fallbackInvoked),
      errors: errors ? (Array.isArray(errors) ? errors.map(sanitizeContent) : [sanitizeContent(errors)]) : [],
      latencyMs: Number(latencyMs.toFixed(3)),
      executionPrivilege: 'none'
    };

    this.logEvent(entry);
    return entry;
  }

  logEvent(event) {
    if (this.buffer.length >= this.maxEntries) {
      // Bounded operational telemetry: FIFO ring buffer
      this.buffer.shift();
    }
    this.buffer.push(event);
  }

  getEntries() {
    return [...this.buffer];
  }

  getSafetyIncidents() {
    return [...this.safetyIncidents];
  }

  clear() {
    this.buffer = [];
    this.safetyIncidents = [];
    this.circuitBreakerTripped = false;
    this.circuitBreakerReason = null;
  }

  persist() {
    try {
      const dir = path.dirname(this.logFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.logFilePath, JSON.stringify({
        canary: 'eme-v0.1.0-rc1-candidate2',
        updatedAt: new Date().toISOString(),
        totalLogged: this.buffer.length,
        retentionLimit: this.maxEntries,
        circuitBreaker: {
          tripped: this.circuitBreakerTripped,
          reason: this.circuitBreakerReason
        },
        entries: this.buffer
      }, null, 2), 'utf8');
      return true;
    } catch (err) {
      console.error('[CanaryTelemetryLogger] Failed to persist log:', err.message);
      return false;
    }
  }

  persistSafetyIncidents() {
    try {
      const dir = path.dirname(this.safetyIncidentPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.safetyIncidentPath, JSON.stringify({
        canary: 'eme-v0.1.0-rc1-candidate2',
        updatedAt: new Date().toISOString(),
        totalIncidents: this.safetyIncidents.length,
        durableRecords: this.safetyIncidents
      }, null, 2), 'utf8');
      return true;
    } catch (err) {
      console.error('[CanaryTelemetryLogger] Failed to persist safety incidents:', err.message);
      return false;
    }
  }
}

export const canaryLogger = new CanaryTelemetryLogger();
export { CANDIDATE_COMPONENT_HASHES, sanitizeContent };
