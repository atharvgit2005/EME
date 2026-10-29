/**
 * Editing Mechanics Engine (EME) - Production Metrics Collector
 * Conforms to Phase 20 (Stage 20.4): Production Health Metrics & Observability Endpoints
 *
 * Implements Prometheus text exposition format (version 0.0.4) for:
 * 1. Canonical job transitions and lifecycle status.
 * 2. Active delivery tracking and QA pass/fail counters.
 * 3. Lock coordination events and contention tracking.
 * 4. Visual Control Surface HTTP request counts and latency.
 * 5. Native Node.js process runtime memory and uptime gauges.
 *
 * Zero external runtime npm dependencies.
 */

const { channels } = require('../prompt-core/logger.js');

class MetricsCollector {
  constructor(options = {}) {
    this.startTime = Date.now();
    this.subscribed = false;
    this._subscribers = [];

    this.reset();

    if (options.autoSubscribe !== false) {
      this.subscribeToDiagnostics();
    }
  }

  /**
   * Resets all collected metrics to their initial state.
   */
  reset() {
    this.jobTransitions = new Map(); // "from:to" -> count
    this.activeDeliveries = 0;
    this.renderFailures = new Map(); // reason -> count
    this.qaFailures = new Map(); // reason -> count
    this.lockEvents = new Map(); // status -> count
    this.httpRequests = new Map(); // "method:path:status" -> count
    this.httpRequestDurationSum = 0;
    this.httpRequestCount = 0;
  }

  /**
   * Subscribes to node:diagnostics_channel events for zero-coupling telemetry aggregation.
   */
  subscribeToDiagnostics() {
    if (this.subscribed) return;

    const onJobTransition = (event) => {
      if (event && event.fromState && event.toState) {
        this.recordJobTransition(event.fromState, event.toState);
      }
    };

    const onLockEvent = (event) => {
      if (event && event.status) {
        this.recordLockEvent(event.status);
      }
    };

    const onDeliveryEvent = (event) => {
      if (event && event.activeCount !== undefined) {
        this.setActiveDeliveries(event.activeCount);
      } else {
        this.setActiveDeliveries(this.activeDeliveries + 1);
      }
    };

    const onErrorEvent = (event) => {
      if (event && event.domain === 'render') {
        this.recordRenderFailure(event.reason || 'render_error');
      } else if (event && event.domain === 'qa') {
        this.recordQaFailure(event.reason || 'qa_rejection');
      }
    };

    channels.jobTransitionChannel.subscribe(onJobTransition);
    channels.lockEventChannel.subscribe(onLockEvent);
    channels.deliveryEventChannel.subscribe(onDeliveryEvent);
    channels.errorEventChannel.subscribe(onErrorEvent);

    this._subscribers = [
      { channel: channels.jobTransitionChannel, handler: onJobTransition },
      { channel: channels.lockEventChannel, handler: onLockEvent },
      { channel: channels.deliveryEventChannel, handler: onDeliveryEvent },
      { channel: channels.errorEventChannel, handler: onErrorEvent }
    ];

    this.subscribed = true;
  }

  /**
   * Unsubscribes from diagnostic channels.
   */
  unsubscribeFromDiagnostics() {
    if (!this.subscribed) return;

    for (const sub of this._subscribers) {
      try {
        sub.channel.unsubscribe(sub.handler);
      } catch (_) {}
    }
    this._subscribers = [];
    this.subscribed = false;
  }

  recordJobTransition(fromState, toState) {
    const key = `${fromState}:${toState}`;
    this.jobTransitions.set(key, (this.jobTransitions.get(key) || 0) + 1);
  }

  setActiveDeliveries(count) {
    this.activeDeliveries = Math.max(0, Number(count) || 0);
  }

  recordLockEvent(status) {
    const key = String(status).toLowerCase();
    this.lockEvents.set(key, (this.lockEvents.get(key) || 0) + 1);
  }

  recordRenderFailure(reason = 'unknown') {
    const key = String(reason);
    this.renderFailures.set(key, (this.renderFailures.get(key) || 0) + 1);
  }

  recordQaFailure(reason = 'unknown') {
    const key = String(reason);
    this.qaFailures.set(key, (this.qaFailures.get(key) || 0) + 1);
  }

  recordHttpRequest(method, routePath, statusCode, durationSeconds = 0) {
    const normPath = routePath.split('?')[0] || '/';
    const key = `${method.toUpperCase()}:${normPath}:${statusCode}`;
    this.httpRequests.set(key, (this.httpRequests.get(key) || 0) + 1);
    this.httpRequestDurationSum += Number(durationSeconds) || 0;
    this.httpRequestCount += 1;
  }

  /**
   * Formats all collected metrics into standard Prometheus text format (v0.0.4).
   *
   * @returns {string}
   */
  toPrometheusText() {
    const lines = [];
    const uptimeSec = ((Date.now() - this.startTime) / 1000).toFixed(2);
    const mem = process.memoryUsage();

    // 1. Service Uptime
    lines.push('# HELP eme_uptime_seconds Total running uptime of EME service in seconds');
    lines.push('# TYPE eme_uptime_seconds gauge');
    lines.push(`eme_uptime_seconds ${uptimeSec}`);

    // 2. Memory Gauges
    lines.push('# HELP nodejs_heap_size_total_bytes Total size of the allocated heap in bytes');
    lines.push('# TYPE nodejs_heap_size_total_bytes gauge');
    lines.push(`nodejs_heap_size_total_bytes ${mem.heapTotal}`);

    lines.push('# HELP nodejs_heap_size_used_bytes Used heap size in bytes');
    lines.push('# TYPE nodejs_heap_size_used_bytes gauge');
    lines.push(`nodejs_heap_size_used_bytes ${mem.heapUsed}`);

    lines.push('# HELP nodejs_rss_bytes Resident Set Size in bytes');
    lines.push('# TYPE nodejs_rss_bytes gauge');
    lines.push(`nodejs_rss_bytes ${mem.rss}`);

    // 3. Active Deliveries
    lines.push('# HELP eme_active_deliveries Number of active or published deliveries in memory');
    lines.push('# TYPE eme_active_deliveries gauge');
    lines.push(`eme_active_deliveries ${this.activeDeliveries}`);

    // 4. Job State Transitions
    lines.push('# HELP eme_job_transitions_total Total number of canonical job transitions');
    lines.push('# TYPE eme_job_transitions_total counter');
    if (this.jobTransitions.size === 0) {
      lines.push('eme_job_transitions_total 0');
    } else {
      for (const [key, val] of this.jobTransitions.entries()) {
        const [from, to] = key.split(':');
        lines.push(`eme_job_transitions_total{from="${from}",to="${to}"} ${val}`);
      }
    }

    // 5. Lock Coordination Events
    lines.push('# HELP eme_lock_events_total Total lock coordination events and contentions');
    lines.push('# TYPE eme_lock_events_total counter');
    if (this.lockEvents.size === 0) {
      lines.push('eme_lock_events_total 0');
    } else {
      for (const [status, val] of this.lockEvents.entries()) {
        lines.push(`eme_lock_events_total{status="${status}"} ${val}`);
      }
    }

    // 6. Render Failures
    lines.push('# HELP eme_render_failures_total Total failed render pipeline runs');
    lines.push('# TYPE eme_render_failures_total counter');
    if (this.renderFailures.size === 0) {
      lines.push('eme_render_failures_total 0');
    } else {
      for (const [reason, val] of this.renderFailures.entries()) {
        lines.push(`eme_render_failures_total{reason="${reason}"} ${val}`);
      }
    }

    // 7. QA Validation Failures
    lines.push('# HELP eme_qa_failures_total Total QA score rejections below quality threshold');
    lines.push('# TYPE eme_qa_failures_total counter');
    if (this.qaFailures.size === 0) {
      lines.push('eme_qa_failures_total 0');
    } else {
      for (const [reason, val] of this.qaFailures.entries()) {
        lines.push(`eme_qa_failures_total{reason="${reason}"} ${val}`);
      }
    }

    // 8. Visual Control Surface HTTP Requests
    lines.push('# HELP eme_http_requests_total Total HTTP requests handled by Visual Control Surface');
    lines.push('# TYPE eme_http_requests_total counter');
    if (this.httpRequests.size === 0) {
      lines.push('eme_http_requests_total 0');
    } else {
      for (const [key, val] of this.httpRequests.entries()) {
        const [method, routePath, status] = key.split(':');
        lines.push(`eme_http_requests_total{method="${method}",path="${routePath}",status="${status}"} ${val}`);
      }
    }

    lines.push(''); // trailing newline required by prometheus text spec
    return lines.join('\n');
  }
}

// Global default instance for application runtime
const defaultMetricsCollector = new MetricsCollector();

module.exports = {
  MetricsCollector,
  defaultMetricsCollector
};
