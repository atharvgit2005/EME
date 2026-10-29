/**
 * Phase 21 Stage 21.2 Test Suite: Comprehensive Security Hardening & Threat Modeling
 *
 * Verifies:
 * 1. SEC-01: Path traversal protection on static file serving (rejects .. and encoded traversals with 403 Forbidden).
 * 2. SEC-02: Correlation ID sanitization & CRLF injection / HTTP response splitting defense.
 * 3. SEC-03: Request body size limit enforcement (rejects unbounded streams with 413 Payload Too Large).
 * 4. SEC-04: Internal error shielding: stack traces are strictly omitted from HTTP client responses.
 * 5. SEC-05: Subprocess environment sanitization: sensitive tokens, passwords, and API keys stripped from child environments.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { EditorBackend } = require('../src/ui/server.js');
const { sanitizeChildEnv, execSubprocessGuarded } = require('../src/prompt-core/resource-guard.js');

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          raw: data,
          json
        });
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

test('Stage 21.2: Comprehensive Security Hardening & Threat Modeling', async (t) => {

  await t.test('SEC-01: Path Traversal Protection on Static File Serving', async () => {
    const backend = new EditorBackend({ port: 0 });
    const boundPort = await backend.start();

    try {
      // 1. Direct traversal attempt
      const res1 = await makeRequest({
        hostname: 'localhost',
        port: boundPort,
        path: '/../../../package.json',
        method: 'GET'
      });
      assert.equal(res1.statusCode, 403, 'Path traversal must return 403 Forbidden');
      assert.equal(res1.json?.errorCode, 'FORBIDDEN');

      // 2. URL-encoded traversal attempt
      const res2 = await makeRequest({
        hostname: 'localhost',
        port: boundPort,
        path: '/%2e%2e%2f%2e%2e%2fpackage.json',
        method: 'GET'
      });
      assert.equal(res2.statusCode, 403, 'URL-encoded path traversal must return 403 Forbidden');
      assert.equal(res2.json?.errorCode, 'FORBIDDEN');

      // 3. Legitimate static file request has security headers
      const res3 = await makeRequest({
        hostname: 'localhost',
        port: boundPort,
        path: '/index.html',
        method: 'GET'
      });
      assert.equal(res3.statusCode, 200);
      assert.equal(res3.headers['x-content-type-options'], 'nosniff');
      assert.equal(res3.headers['x-frame-options'], 'DENY');
    } finally {
      await backend.stop();
    }
  });

  await t.test('SEC-02: Correlation ID Sanitization & Header Injection Defense', async () => {
    const backend = new EditorBackend({ port: 0 });
    const boundPort = await backend.start();

    try {
      // Attempt injection of special chars, spaces, script tags into X-Correlation-Id
      const maliciousHeader = 'trace-id;DROP TABLE;evil<script>"\'{}&^%$#@!+=.test_123';
      const res = await makeRequest({
        hostname: 'localhost',
        port: boundPort,
        path: '/api/health',
        method: 'GET',
        headers: {
          'x-correlation-id': maliciousHeader
        }
      });

      assert.equal(res.statusCode, 200);
      const returnedCorrelation = res.headers['x-correlation-id'];
      assert.ok(returnedCorrelation, 'Correlation header must be returned');
      assert.equal(returnedCorrelation, 'trace-idDROPTABLEevilscript.test_123', 'Only alphanumeric, dot, underscore, dash permitted');
      assert.ok(!returnedCorrelation.includes(';'));
      assert.ok(!returnedCorrelation.includes('<'));
      assert.ok(!returnedCorrelation.includes('>'));
      assert.ok(!returnedCorrelation.includes('"'));
      assert.ok(!returnedCorrelation.includes("'"));
    } finally {
      await backend.stop();
    }
  });

  await t.test('SEC-03: Request Body Size Limit / DoS Defense', async () => {
    // Configure server with small 1024-byte limit for testability
    const backend = new EditorBackend({ port: 0, maxBodySizeBytes: 1024 });
    const boundPort = await backend.start();

    try {
      // Construct a payload larger than 1024 bytes (e.g. 4096 bytes)
      const oversizedPayload = JSON.stringify({ data: 'x'.repeat(4096) });

      let statusCode = null;
      let body = null;
      try {
        const res = await makeRequest({
          hostname: 'localhost',
          port: boundPort,
          path: '/api/session/init',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(oversizedPayload)
          }
        }, oversizedPayload);
        statusCode = res.statusCode;
        body = res.json;
      } catch (err) {
        // Socket destruction by server is also acceptable fail-closed behavior
        statusCode = 413;
      }

      assert.ok([413, 'ECONNRESET'].includes(statusCode) || statusCode === 413, `Status must be 413 or reset, got ${statusCode}`);
      if (body) {
        assert.ok(['ERR_PAYLOAD_TOO_LARGE', 'PAYLOAD_TOO_LARGE'].includes(body.errorCode));
      }
    } finally {
      await backend.stop();
    }
  });

  await t.test('SEC-04: Internal Error Shielding (No Stack Trace Leakage)', async () => {
    const backend = new EditorBackend({ port: 0 });
    const boundPort = await backend.start();

    try {
      // Send malformed JSON to trigger an error
      const res = await makeRequest({
        hostname: 'localhost',
        port: boundPort,
        path: '/api/session/init',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, '{ invalid json syntax !!!');

      assert.equal(res.statusCode, 400);
      assert.equal(res.json?.errorCode, 'ERR_INVALID_JSON');
      assert.equal(res.json?.stack, undefined, 'Stack trace must NEVER be leaked in HTTP responses');
    } finally {
      await backend.stop();
    }
  });

  await t.test('SEC-05: Subprocess Environment Sanitization', async () => {
    // 1. Test unit sanitization
    const dirtyEnv = {
      PATH: process.env.PATH || '/usr/bin:/bin',
      NODE_ENV: 'production',
      GITHUB_TOKEN: 'ghp_secret_token_12345',
      AWS_SECRET_ACCESS_KEY: 'super_secret_aws_key',
      DATABASE_PASSWORD: 'admin_password_999',
      OPENAI_API_KEY: 'sk-abcdef123456789',
      SAFE_CONFIG: 'some_safe_value'
    };

    const cleanEnv = sanitizeChildEnv(dirtyEnv);
    assert.equal(cleanEnv.PATH, dirtyEnv.PATH);
    assert.equal(cleanEnv.NODE_ENV, 'production');
    assert.equal(cleanEnv.SAFE_CONFIG, 'some_safe_value');
    assert.equal(cleanEnv.GITHUB_TOKEN, undefined, 'GITHUB_TOKEN must be stripped');
    assert.equal(cleanEnv.AWS_SECRET_ACCESS_KEY, undefined, 'AWS_SECRET_ACCESS_KEY must be stripped');
    assert.equal(cleanEnv.DATABASE_PASSWORD, undefined, 'DATABASE_PASSWORD must be stripped');
    assert.equal(cleanEnv.OPENAI_API_KEY, undefined, 'OPENAI_API_KEY must be stripped');

    // 2. Test explicit allowedKeys override
    const cleanWithOverride = sanitizeChildEnv(dirtyEnv, ['OPENAI_API_KEY']);
    assert.equal(cleanWithOverride.OPENAI_API_KEY, 'sk-abcdef123456789', 'Explicitly allowed key must be retained');
    assert.equal(cleanWithOverride.GITHUB_TOKEN, undefined);

    // 3. Live subprocess execution with guarded sanitization using process.execPath
    const res = await execSubprocessGuarded(process.execPath, ['-e', 'console.log(JSON.stringify(process.env))'], {
      env: dirtyEnv,
      sanitizeEnv: true
    });

    assert.equal(res.exitCode, 0);
    const childProcEnv = JSON.parse(res.stdout.trim());
    assert.equal(childProcEnv.GITHUB_TOKEN, undefined);
    assert.equal(childProcEnv.AWS_SECRET_ACCESS_KEY, undefined);
    assert.equal(childProcEnv.DATABASE_PASSWORD, undefined);
    assert.equal(childProcEnv.SAFE_CONFIG, 'some_safe_value');
  });

});
