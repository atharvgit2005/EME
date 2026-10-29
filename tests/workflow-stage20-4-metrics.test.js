/**
 * Phase 20 (Stage 20.4) Test Suite: Production Health Metrics & Observability Endpoints
 *
 * Verifies:
 * - MET-01: MetricsCollector generates standard Prometheus text format (v0.0.4) with HELP/TYPE annotations.
 * - MET-02: Decoupled telemetry aggregation via diagnostics_channel updates transition, lock, and delivery metrics.
 * - MET-03: Render pipeline and QA validation failure counters properly track error events.
 * - MET-04: Visual Control Surface HTTP server exposes GET /metrics endpoint with correct content type.
 * - MET-05: Visual Control Surface tracks incoming request counts, route paths, and HTTP statuses.
 */

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const {
  MetricsCollector,
  defaultMetricsCollector
} = require('../src/ui/metrics-collector.js');
const {
  defaultLogger,
  channels
} = require('../src/prompt-core/logger.js');
const { EditorBackend } = require('../src/ui/server.js');

test('MET-01: MetricsCollector generates standard Prometheus text format (v0.0.4) with HELP/TYPE annotations', () => {
  const collector = new MetricsCollector({ autoSubscribe: false });
  collector.recordJobTransition('ACCEPTED', 'PLANNING');
  collector.recordJobTransition('PLANNING', 'READY_TO_EXECUTE');
  collector.setActiveDeliveries(3);
  collector.recordLockEvent('acquired');
  collector.recordLockEvent('contention');
  collector.recordRenderFailure('ffmpeg_exit_code_1');
  collector.recordQaFailure('bitrate_below_min');
  collector.recordHttpRequest('GET', '/api/health', 200, 0.005);

  const text = collector.toPrometheusText();

  // Validate Prometheus exposition format lines
  assert.ok(text.includes('# HELP eme_uptime_seconds Total running uptime of EME service in seconds'));
  assert.ok(text.includes('# TYPE eme_uptime_seconds gauge'));
  assert.ok(text.includes('eme_uptime_seconds'));

  assert.ok(text.includes('# HELP nodejs_heap_size_used_bytes Used heap size in bytes'));
  assert.ok(text.includes('# TYPE nodejs_heap_size_used_bytes gauge'));

  assert.ok(text.includes('# HELP eme_active_deliveries Number of active or published deliveries in memory'));
  assert.ok(text.includes('# TYPE eme_active_deliveries gauge'));
  assert.ok(text.includes('eme_active_deliveries 3'));

  assert.ok(text.includes('# HELP eme_job_transitions_total Total number of canonical job transitions'));
  assert.ok(text.includes('eme_job_transitions_total{from="ACCEPTED",to="PLANNING"} 1'));
  assert.ok(text.includes('eme_job_transitions_total{from="PLANNING",to="READY_TO_EXECUTE"} 1'));

  assert.ok(text.includes('eme_lock_events_total{status="acquired"} 1'));
  assert.ok(text.includes('eme_lock_events_total{status="contention"} 1'));

  assert.ok(text.includes('eme_render_failures_total{reason="ffmpeg_exit_code_1"} 1'));
  assert.ok(text.includes('eme_qa_failures_total{reason="bitrate_below_min"} 1'));

  assert.ok(text.includes('eme_http_requests_total{method="GET",path="/api/health",status="200"} 1'));

  // Ensure trailing newline
  assert.ok(text.endsWith('\n'));
});

test('MET-02: Decoupled telemetry aggregation via diagnostics_channel updates transition, lock, and delivery metrics', () => {
  const collector = new MetricsCollector({ autoSubscribe: true });
  collector.reset();

  try {
    // 1. Emit job transition event via defaultLogger
    defaultLogger.emitJobTransition({
      jobId: 'job-obs-test-1',
      fromState: 'PLANNING',
      toState: 'EXECUTING',
      reason: 'Plan approved'
    });

    // 2. Emit lock event via defaultLogger
    defaultLogger.emitLockEvent({
      sessionId: 'sess-123',
      status: 'acquired',
      fencingToken: 42
    });

    // 3. Emit delivery publication event via defaultLogger
    defaultLogger.emitDeliveryEvent({
      deliveryId: 'del-999',
      manifestPath: '/tmp/manifest.json',
      activeCount: 5
    });

    const text = collector.toPrometheusText();

    assert.ok(text.includes('eme_job_transitions_total{from="PLANNING",to="EXECUTING"} 1'), 'Transition must be recorded');
    assert.ok(text.includes('eme_lock_events_total{status="acquired"} 1'), 'Lock event must be recorded');
    assert.ok(text.includes('eme_active_deliveries 5'), 'Active deliveries must be updated');
  } finally {
    collector.unsubscribeFromDiagnostics();
  }
});

test('MET-03: Render pipeline and QA validation failure counters properly track error events', () => {
  const collector = new MetricsCollector({ autoSubscribe: true });
  collector.reset();

  try {
    channels.errorEventChannel.publish({
      domain: 'render',
      reason: 'timeout_exceeded'
    });

    channels.errorEventChannel.publish({
      domain: 'qa',
      reason: 'black_frames_detected'
    });

    const text = collector.toPrometheusText();

    assert.ok(text.includes('eme_render_failures_total{reason="timeout_exceeded"} 1'));
    assert.ok(text.includes('eme_qa_failures_total{reason="black_frames_detected"} 1'));
  } finally {
    collector.unsubscribeFromDiagnostics();
  }
});

test('MET-04: Visual Control Surface HTTP server exposes GET /metrics endpoint with correct content type', async () => {
  const testCollector = new MetricsCollector({ autoSubscribe: false });
  testCollector.recordJobTransition('ACCEPTED', 'PLANNING');

  const backend = new EditorBackend({
    port: 4920,
    metricsCollector: testCollector
  });

  await backend.start();

  try {
    const res = await makeHttpRequest('http://localhost:4920/metrics', { method: 'GET' });

    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.headers['content-type'].includes('text/plain'));
    assert.ok(res.headers['content-type'].includes('version=0.0.4'));
    assert.ok(res.body.includes('eme_job_transitions_total{from="ACCEPTED",to="PLANNING"} 1'));
    assert.ok(res.body.includes('eme_uptime_seconds'));
  } finally {
    await backend.stop();
  }
});

test('MET-05: Visual Control Surface tracks incoming request counts, route paths, and HTTP statuses', async () => {
  const testCollector = new MetricsCollector({ autoSubscribe: false });

  const backend = new EditorBackend({
    port: 4921,
    metricsCollector: testCollector
  });

  await backend.start();

  try {
    // Make 2 calls to /api/health and 1 call to /readyz
    await makeHttpRequest('http://localhost:4921/api/health', { method: 'GET' });
    await makeHttpRequest('http://localhost:4921/api/health', { method: 'GET' });
    await makeHttpRequest('http://localhost:4921/readyz', { method: 'GET' });

    // Query /metrics
    const metricsRes = await makeHttpRequest('http://localhost:4921/metrics', { method: 'GET' });
    assert.strictEqual(metricsRes.statusCode, 200);

    const body = metricsRes.body;
    assert.ok(body.includes('eme_http_requests_total{method="GET",path="/api/health",status="200"} 2'));
    assert.ok(body.includes('eme_http_requests_total{method="GET",path="/readyz",status="200"} 1'));
  } finally {
    await backend.stop();
  }
});

function makeHttpRequest(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}
