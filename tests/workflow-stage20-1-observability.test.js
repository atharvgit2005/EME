/**
 * Phase 20 (Stage 20.1) Test Suite: Production Observability & Structured Telemetry
 *
 * Verifies:
 * - OBS-01: Structured JSON output format conforms to log aggregator standards.
 * - OBS-02: Correlation ID propagates across asynchronous execution trees via AsyncLocalStorage.
 * - OBS-03: Log level filtering respects configured thresholds (DEBUG, INFO, WARN, ERROR, SILENT).
 * - OBS-04: Child loggers preserve bound contextual metadata while merging dynamic correlation context.
 * - OBS-05: Error instances are safely serialized with error code, message, and structured stack.
 * - OBS-06: Decoupled lifecycle event distribution via node:diagnostics_channel.
 * - OBS-07: Visual Control Surface HTTP server extracts, binds, and echoes X-Correlation-Id.
 * - OBS-08: Fail-safe output handling prevents destination writer errors from terminating caller execution.
 */

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const diagnosticsChannel = require('node:diagnostics_channel');
const {
  Logger,
  LogLevels,
  runWithCorrelation,
  getActiveCorrelationId,
  getActiveContext,
  serializeError,
  channels
} = require('../src/prompt-core/logger.js');
const { EditorBackend } = require('../src/ui/server.js');

test('OBS-01: Structured JSON output format conforms to log aggregator standards', () => {
  const records = [];
  const testLogger = new Logger({
    service: 'eme-test',
    level: 'INFO',
    destination: (line) => records.push(JSON.parse(line))
  });

  testLogger.info('Test operation started', { operation_id: 'op-123', target: 'video_clip' });

  assert.strictEqual(records.length, 1);
  const rec = records[0];

  assert.strictEqual(rec.service, 'eme-test');
  assert.strictEqual(rec.level, 'INFO');
  assert.strictEqual(rec.level_num, LogLevels.INFO);
  assert.strictEqual(rec.message, 'Test operation started');
  assert.strictEqual(rec.operation_id, 'op-123');
  assert.strictEqual(rec.target, 'video_clip');
  assert.ok(rec.timestamp, 'Timestamp must exist');
  assert.ok(!isNaN(Date.parse(rec.timestamp)), 'Timestamp must be valid ISO-8601');
});

test('OBS-02: Correlation ID propagates across asynchronous execution trees via AsyncLocalStorage', async () => {
  const records = [];
  const testLogger = new Logger({
    service: 'eme-async',
    destination: (line) => records.push(JSON.parse(line))
  });

  const traceId = 'trace-obs-02-abcde';

  await runWithCorrelation(traceId, async () => {
    testLogger.info('Inside async root');
    assert.strictEqual(getActiveCorrelationId(), traceId);

    await new Promise((resolve) => {
      setTimeout(() => {
        testLogger.info('Inside async timer callback');
        assert.strictEqual(getActiveCorrelationId(), traceId);
        resolve();
      }, 10);
    });

    testLogger.info('After async timer completion');
  });

  assert.strictEqual(records.length, 3);
  for (const rec of records) {
    assert.strictEqual(rec.correlation_id, traceId);
  }

  // Outside the correlation context, active correlation ID must be null
  assert.strictEqual(getActiveCorrelationId(), null);
});

test('OBS-03: Log level filtering respects configured thresholds', () => {
  const records = [];
  const testLogger = new Logger({
    level: 'WARN',
    destination: (line) => records.push(JSON.parse(line))
  });

  testLogger.debug('Debug message - should be ignored');
  testLogger.info('Info message - should be ignored');
  testLogger.warn('Warning message - should be logged');
  testLogger.error('Error message - should be logged');

  assert.strictEqual(records.length, 2);
  assert.strictEqual(records[0].level, 'WARN');
  assert.strictEqual(records[1].level, 'ERROR');

  // Dynamic level reconfiguration
  testLogger.setLevel('DEBUG');
  testLogger.debug('Debug message after level change');
  assert.strictEqual(records.length, 3);
  assert.strictEqual(records[2].level, 'DEBUG');

  // SILENT suppresses everything
  testLogger.setLevel('SILENT');
  testLogger.error('Critical failure - should be suppressed in silent mode');
  assert.strictEqual(records.length, 3);
});

test('OBS-04: Child loggers preserve bound contextual metadata while merging dynamic correlation context', async () => {
  const records = [];
  const rootLogger = new Logger({
    service: 'eme-service',
    destination: (line) => records.push(JSON.parse(line))
  });

  const jobLogger = rootLogger.child({
    component: 'JobOrchestrator',
    job_id: 'job-98765'
  });

  const traceId = 'trace-child-context-42';

  await runWithCorrelation(traceId, () => {
    jobLogger.info('Starting rendering phase', { phase: 'hyperframes' });
  });

  assert.strictEqual(records.length, 1);
  const rec = records[0];

  assert.strictEqual(rec.service, 'eme-service');
  assert.strictEqual(rec.component, 'JobOrchestrator');
  assert.strictEqual(rec.job_id, 'job-98765');
  assert.strictEqual(rec.correlation_id, traceId);
  assert.strictEqual(rec.phase, 'hyperframes');
});

test('OBS-05: Error instances are safely serialized with error code, message, and structured stack', () => {
  const records = [];
  const testLogger = new Logger({
    destination: (line) => records.push(JSON.parse(line))
  });

  const sampleError = new Error('FFmpeg failed with exit code 1');
  sampleError.code = 'ERR_FFMPEG_CRASH';
  sampleError.details = { exitCode: 1, signal: null };

  testLogger.error('Rendering failed', { error: sampleError, job_id: 'job-err-1' });

  assert.strictEqual(records.length, 1);
  const rec = records[0];

  assert.strictEqual(rec.level, 'ERROR');
  assert.strictEqual(rec.message, 'Rendering failed');
  assert.ok(rec.error);
  assert.strictEqual(rec.error.name, 'Error');
  assert.strictEqual(rec.error.message, 'FFmpeg failed with exit code 1');
  assert.strictEqual(rec.error.code, 'ERR_FFMPEG_CRASH');
  assert.deepStrictEqual(rec.error.details, { exitCode: 1, signal: null });
  assert.ok(Array.isArray(rec.error.stack));
  assert.ok(rec.error.stack.length > 0);
});

test('OBS-06: Decoupled lifecycle event distribution via node:diagnostics_channel', async () => {
  const receivedTransitions = [];
  const receivedDeliveries = [];

  const transitionSub = (msg) => receivedTransitions.push(msg);
  const deliverySub = (msg) => receivedDeliveries.push(msg);

  channels.jobTransitionChannel.subscribe(transitionSub);
  channels.deliveryEventChannel.subscribe(deliverySub);

  const testLogger = new Logger({ destination: () => {} });

  try {
    const traceId = 'trace-event-bus-77';
    await runWithCorrelation(traceId, () => {
      testLogger.emitJobTransition({
        jobId: 'job-diag-1',
        fromState: 'RENDERING_MEDIA',
        toState: 'EVALUATING_MEDIA_QA',
        reason: 'Render completed successfully'
      });

      testLogger.emitDeliveryEvent({
        deliveryId: 'del-diag-1',
        qaScore: 94.5,
        manifestSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
      });
    });

    assert.strictEqual(receivedTransitions.length, 1);
    assert.strictEqual(receivedTransitions[0].jobId, 'job-diag-1');
    assert.strictEqual(receivedTransitions[0].fromState, 'RENDERING_MEDIA');
    assert.strictEqual(receivedTransitions[0].toState, 'EVALUATING_MEDIA_QA');
    assert.strictEqual(receivedTransitions[0].correlation_id, traceId);

    assert.strictEqual(receivedDeliveries.length, 1);
    assert.strictEqual(receivedDeliveries[0].deliveryId, 'del-diag-1');
    assert.strictEqual(receivedDeliveries[0].qaScore, 94.5);
    assert.strictEqual(receivedDeliveries[0].correlation_id, traceId);
  } finally {
    channels.jobTransitionChannel.unsubscribe(transitionSub);
    channels.deliveryEventChannel.unsubscribe(deliverySub);
  }
});

test('OBS-07: Visual Control Surface HTTP server extracts, binds, and echoes X-Correlation-Id', async () => {
  const testPort = 4912;
  const backend = new EditorBackend({ port: testPort });
  await backend.start();

  try {
    const customCorrelationId = 'custom-client-req-998877';

    // 1. Request with client-supplied X-Correlation-Id
    const resWithHeader = await makeHttpRequest(testPort, '/healthz', {
      headers: { 'X-Correlation-Id': customCorrelationId }
    });

    assert.strictEqual(resWithHeader.statusCode, 200);
    assert.strictEqual(resWithHeader.headers['x-correlation-id'], customCorrelationId);
    assert.strictEqual(resWithHeader.body.status, 'ok');
    assert.strictEqual(resWithHeader.body.correlation_id, customCorrelationId);

    // 2. Request without correlation header: server generates unique correlation ID
    const resAuto = await makeHttpRequest(testPort, '/readyz');
    assert.strictEqual(resAuto.statusCode, 200);
    assert.ok(resAuto.headers['x-correlation-id']);
    assert.ok(resAuto.headers['x-correlation-id'].startsWith('req-'));
    assert.strictEqual(resAuto.body.status, 'ready');
    assert.strictEqual(resAuto.body.correlation_id, resAuto.headers['x-correlation-id']);
  } finally {
    await backend.stop();
  }
});

test('OBS-08: Fail-safe output handling prevents destination writer errors from terminating caller execution', () => {
  const faultyLogger = new Logger({
    destination: () => {
      throw new Error('EIO: Disk write failed');
    }
  });

  // Must not throw or crash calling code
  assert.doesNotThrow(() => {
    faultyLogger.info('This log output fails gracefully');
  });
});

/**
 * Helper to make a lightweight HTTP request for testing
 */
function makeHttpRequest(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port,
      path,
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let body = null;
        try {
          body = JSON.parse(data);
        } catch (e) {
          body = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}
