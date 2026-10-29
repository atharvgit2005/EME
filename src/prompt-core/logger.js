/**
 * Editing Mechanics Engine (EME) - Production Structured Logger & Diagnostic Telemetry
 * Conforms to Phase 20 (Stage 20.1): Production Observability & Telemetry Architecture
 *
 * Capabilities:
 * 1. Zero external runtime dependencies (Node.js core modules only).
 * 2. Structured JSON output format for log aggregation (Datadog, Loki, CloudWatch).
 * 3. Contextual correlation ID propagation via AsyncLocalStorage (node:async_hooks).
 * 4. Decoupled lifecycle event distribution via node:diagnostics_channel.
 * 5. Robust error object serialization with code, message, and stack traces.
 * 6. Configurable log levels (DEBUG, INFO, WARN, ERROR, SILENT).
 * 7. Child loggers with permanent context bindings.
 */

const { AsyncLocalStorage } = require('node:async_hooks');
const diagnosticsChannel = require('node:diagnostics_channel');
const crypto = require('node:crypto');

const LogLevels = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
  SILENT: 100
};

const LogLevelNames = {
  10: 'DEBUG',
  20: 'INFO',
  30: 'WARN',
  40: 'ERROR',
  100: 'SILENT'
};

// Global asynchronous correlation context storage
const correlationStorage = new AsyncLocalStorage();

// Diagnostic channels for decoupled operational telemetry
const jobTransitionChannel = diagnosticsChannel.channel('eme:job:transition');
const lockEventChannel = diagnosticsChannel.channel('eme:lock:event');
const deliveryEventChannel = diagnosticsChannel.channel('eme:delivery:event');
const errorEventChannel = diagnosticsChannel.channel('eme:error:event');

/**
 * Executes an asynchronous function within a bound correlation context.
 *
 * @template T
 * @param {string} correlationId
 * @param {() => Promise<T>|T} fn
 * @param {object} [extraContext={}]
 * @returns {Promise<T>|T}
 */
function runWithCorrelation(correlationId, fn, extraContext = {}) {
  const context = {
    correlationId: correlationId || `trace-${crypto.randomBytes(8).toString('hex')}`,
    ...extraContext
  };
  return correlationStorage.run(context, fn);
}

/**
 * Returns the active correlation ID in the current async execution tree, or null.
 *
 * @returns {string|null}
 */
function getActiveCorrelationId() {
  const store = correlationStorage.getStore();
  return store ? store.correlationId : null;
}

/**
 * Returns the active context object in the current async execution tree, or empty object.
 *
 * @returns {object}
 */
function getActiveContext() {
  const store = correlationStorage.getStore();
  return store ? { ...store } : {};
}

/**
 * Serializes an Error instance into a structured JSON-safe object.
 *
 * @param {Error|any} err
 * @returns {object}
 */
function serializeError(err) {
  if (!err) return null;
  if (!(err instanceof Error)) {
    return { message: String(err) };
  }
  return {
    name: err.name,
    message: err.message,
    code: err.code || err.statusCode || null,
    stack: err.stack ? err.stack.split('\n').map(s => s.trim()) : null,
    ...(err.details ? { details: err.details } : {})
  };
}

class Logger {
  /**
   * @param {object} [options={}]
   * @param {string} [options.service='eme']
   * @param {string|number} [options.level='INFO']
   * @param {object} [options.bindings={}]
   * @param {function} [options.destination=console.log]
   */
  constructor(options = {}) {
    this.service = options.service || 'eme';
    this.bindings = options.bindings || {};
    this.destination = options.destination || ((msg) => process.stdout.write(msg + '\n'));
    this.setLevel(options.level || process.env.EME_LOG_LEVEL || 'INFO');
  }

  /**
   * Sets the active logging threshold.
   *
   * @param {string|number} level
   */
  setLevel(level) {
    if (typeof level === 'number') {
      this.level = level;
    } else {
      const upper = String(level).toUpperCase();
      this.level = LogLevels[upper] !== undefined ? LogLevels[upper] : LogLevels.INFO;
    }
  }

  /**
   * Creates a child logger with bound contextual metadata.
   *
   * @param {object} bindings
   * @returns {Logger}
   */
  child(bindings = {}) {
    return new Logger({
      service: this.service,
      level: this.level,
      bindings: { ...this.bindings, ...bindings },
      destination: this.destination
    });
  }

  /**
   * Core output formatter and writer.
   *
   * @private
   * @param {number} levelNum
   * @param {string} message
   * @param {object} [meta={}]
   */
  _log(levelNum, message, meta = {}) {
    if (levelNum < this.level) return;

    const activeCtx = getActiveContext();
    const correlationId = meta.correlationId || activeCtx.correlationId || null;

    let errorObj = null;
    if (meta.error) {
      errorObj = serializeError(meta.error);
    } else if (meta.err) {
      errorObj = serializeError(meta.err);
    }

    const payload = {
      timestamp: new Date().toISOString(),
      service: this.service,
      level: LogLevelNames[levelNum] || 'INFO',
      level_num: levelNum,
      message,
      correlation_id: correlationId,
      ...this.bindings,
      ...activeCtx,
      ...meta
    };

    if (errorObj) {
      payload.error = errorObj;
      delete payload.err;
    }

    // Diagnostics channel notification for ERROR level
    if (levelNum >= LogLevels.ERROR && errorEventChannel.hasSubscribers) {
      errorEventChannel.publish(payload);
    }

    try {
      this.destination(JSON.stringify(payload));
    } catch (e) {
      // Fail-safe fallback to prevent unhandled logger crash
      process.stderr.write(`[LOGGER-FALLBACK] ${message}\n`);
    }
  }

  debug(message, meta) {
    this._log(LogLevels.DEBUG, message, meta);
  }

  info(message, meta) {
    this._log(LogLevels.INFO, message, meta);
  }

  warn(message, meta) {
    this._log(LogLevels.WARN, message, meta);
  }

  error(message, meta) {
    this._log(LogLevels.ERROR, message, meta);
  }

  /**
   * Emits a canonical job state transition diagnostic event.
   *
   * @param {object} transitionData
   * @param {string} transitionData.jobId
   * @param {string} transitionData.fromState
   * @param {string} transitionData.toState
   * @param {string} [transitionData.reason]
   * @param {object} [transitionData.metadata]
   */
  emitJobTransition(transitionData) {
    const correlationId = getActiveCorrelationId();
    const event = {
      timestamp: new Date().toISOString(),
      correlation_id: correlationId,
      event_type: 'JOB_TRANSITION',
      ...transitionData
    };

    this.info(`Job transition: ${transitionData.fromState} -> ${transitionData.toState}`, {
      job_id: transitionData.jobId,
      transition: `${transitionData.fromState}->${transitionData.toState}`,
      reason: transitionData.reason || null
    });

    if (jobTransitionChannel.hasSubscribers) {
      try {
        jobTransitionChannel.publish(event);
      } catch (err) {
        this.warn(`Diagnostics jobTransitionChannel subscriber failed: ${err.message}`, { error: err });
      }
    }
  }

  /**
   * Emits a lock coordination diagnostic event.
   *
   * @param {object} lockData
   */
  emitLockEvent(lockData) {
    const correlationId = getActiveCorrelationId();
    const event = {
      timestamp: new Date().toISOString(),
      correlation_id: correlationId,
      event_type: 'LOCK_COORDINATION',
      ...lockData
    };

    if (lockEventChannel.hasSubscribers) {
      try {
        lockEventChannel.publish(event);
      } catch (err) {
        this.warn(`Diagnostics lockEventChannel subscriber failed: ${err.message}`, { error: err });
      }
    }
  }

  /**
   * Emits a verified delivery publication diagnostic event.
   *
   * @param {object} deliveryData
   */
  emitDeliveryEvent(deliveryData) {
    const correlationId = getActiveCorrelationId();
    const event = {
      timestamp: new Date().toISOString(),
      correlation_id: correlationId,
      event_type: 'DELIVERY_PUBLISHED',
      ...deliveryData
    };

    this.info(`Delivery published: ${deliveryData.deliveryId || deliveryData.manifestPath}`, {
      delivery_id: deliveryData.deliveryId,
      qa_score: deliveryData.qaScore,
      sha256: deliveryData.manifestSha256
    });

    if (deliveryEventChannel.hasSubscribers) {
      try {
        deliveryEventChannel.publish(event);
      } catch (err) {
        this.warn(`Diagnostics deliveryEventChannel subscriber failed: ${err.message}`, { error: err });
      }
    }
  }
}

// Default singleton instance
const defaultLogger = new Logger();

module.exports = {
  Logger,
  LogLevels,
  LogLevelNames,
  defaultLogger,
  runWithCorrelation,
  getActiveCorrelationId,
  getActiveContext,
  serializeError,
  channels: {
    jobTransitionChannel,
    lockEventChannel,
    deliveryEventChannel,
    errorEventChannel
  }
};
