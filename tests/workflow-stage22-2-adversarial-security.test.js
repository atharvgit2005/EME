/**
 * Phase 22 Stage 22.2 Test Suite: Deep Adversarial Security Assurance
 *
 * Verifies:
 * 1. ADV-01: Deep path traversal & normalization fuzzing (double/triple-encoding, null-bytes, backslashes).
 * 2. ADV-02: Malformed, fragmented, and streaming JSON DoS fuzzing.
 * 3. ADV-03: Correlation-ID header injection, CRLF splitting, and control-character fuzzing.
 * 4. ADV-04: Subprocess privilege separation and adversarial environment key sanitization.
 * 5. ADV-05: Strict client-facing error redaction and information leakage shielding.
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
      if (typeof postData === 'string' || Buffer.isBuffer(postData)) {
        req.write(postData);
      } else {
        req.write(JSON.stringify(postData));
      }
    }
    req.end();
  });
}

test('Stage 22.2: Deep Adversarial Security Assurance', async (t) => {
  const backend = new EditorBackend({ port: 0 });
  const boundPort = await backend.start();

  t.after(async () => {
    await backend.stop();
  });

  await t.test('ADV-01: Deep Path Traversal & Normalization Fuzzing', async () => {
    const attackVectors = [
      '/%252e%252e/package.json',                     // Double-encoded ../
      '/%25252e%25252e/package.json',                 // Triple-encoded ../
      '/..%5c..%5cpackage.json',                      // Mixed backslash encoded ..\..\
      '/index.html%00.png',                           // Null byte extension spoof
      '/public%00/secret.txt',                        // Null byte directory escape
      '/..\\..\\package.json',                        // Raw backslash
      '/.../.../package.json',                        // Multi-dot traversal
      '/%2e%2e/%2e%2e/%2e%2e/etc/passwd',             // Standard encoded
      '/../package.json'                              // Direct traversal
    ];

    for (const vector of attackVectors) {
      const res = await makeRequest({
        hostname: 'localhost',
        port: boundPort,
        path: vector,
        method: 'GET'
      });

      // Must be strictly blocked with 403 Forbidden or 400 Bad Request
      assert.ok(
        res.statusCode === 403 || res.statusCode === 400,
        `Attack vector [${vector}] must be blocked with 403 or 400 (got ${res.statusCode})`
      );

      if (res.json) {
        assert.ok(
          res.json.errorCode === 'FORBIDDEN' || res.json.errorCode === 'BAD_REQUEST',
          `Attack vector [${vector}] must have error code FORBIDDEN or BAD_REQUEST`
        );
      }
    }
  });

  await t.test('ADV-02: Malformed, Fragmented & Streaming JSON DoS Fuzzing', async () => {
    // 1. Truncated malformed JSON
    const resTrunc = await makeRequest({
      hostname: 'localhost',
      port: boundPort,
      path: '/api/session/init',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, '{"name": "test-project", "incomplete": ');

    assert.equal(resTrunc.statusCode, 400);
    assert.equal(resTrunc.json.errorCode, 'ERR_INVALID_JSON');
    assert.ok(resTrunc.json.error.includes('Invalid JSON'));

    // 2. Pure binary/gibberish payload
    const binaryData = Buffer.from([0x00, 0xff, 0xfe, 0x12, 0x34, 0x56, 0x78]);
    const resBin = await makeRequest({
      hostname: 'localhost',
      port: boundPort,
      path: '/api/session/init',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, binaryData);

    assert.equal(resBin.statusCode, 400);
    assert.equal(resBin.json.errorCode, 'ERR_INVALID_JSON');

    // 3. Deeply nested JSON structure (JSON recursion / object bomb)
    let nested = { leaf: true };
    for (let depth = 0; depth < 50; depth++) {
      nested = { child: nested };
    }
    const resNested = await makeRequest({
      hostname: 'localhost',
      port: boundPort,
      path: '/api/session/init',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify(nested));

    // Must be gracefully processed or rejected without crashing server
    assert.ok(resNested.statusCode === 400 || resNested.statusCode === 200 || resNested.statusCode === 500);
  });

  await t.test('ADV-03: Correlation-ID Header Injection & CRLF Splitting Fuzzing', async () => {
    const net = require('node:net');

    // 1. Raw TCP socket fuzzing with CRLF header splitting attempt
    const rawResponse = await new Promise((resolve, reject) => {
      const client = net.connect({ port: boundPort }, () => {
        const rawReq = [
          'GET /api/health HTTP/1.1',
          'Host: localhost',
          'X-Correlation-Id: test-id\r\nInjected-Header: evil-payload',
          'Connection: close',
          '',
          ''
        ].join('\r\n');
        client.write(rawReq);
      });

      let resData = '';
      client.on('data', chunk => { resData += chunk.toString('utf8'); });
      client.on('end', () => resolve(resData));
      client.on('error', reject);
    });

    // Node HTTP parser either rejects with 400 Bad Request or sanitizes
    assert.ok(
      rawResponse.includes('400 Bad Request') || !rawResponse.includes('Injected-Header: evil-payload'),
      'CRLF header splitting must be rejected or stripped'
    );

    // 2. Client headers with hostile non-alphanumerics and overlong padding
    const testCases = [
      { input: 'corr_test#1;DROP TABLE;evil<script>"\'', expected: 'corr_test1DROPTABLEevilscript' },
      { input: 'A'.repeat(300), expectedLength: 128 },
      { input: 'valid-id.123_abc', expected: 'valid-id.123_abc' }
    ];

    for (const tc of testCases) {
      const res = await makeRequest({
        hostname: 'localhost',
        port: boundPort,
        path: '/api/health',
        method: 'GET',
        headers: { 'X-Correlation-Id': tc.input }
      });

      assert.equal(res.statusCode, 200);
      const returnedId = res.headers['x-correlation-id'];
      assert.ok(returnedId, 'X-Correlation-Id must be returned');

      if (tc.expected) {
        assert.equal(returnedId, tc.expected);
      }
      if (tc.expectedLength) {
        assert.equal(returnedId.length, tc.expectedLength);
      }
    }
  });

  await t.test('ADV-04: Subprocess Privilege & Secret Environment Isolation', async () => {
    const hostileEnv = {
      PATH: '/usr/bin:/bin',
      NODE_ENV: 'production',
      AWS_SECRET_ACCESS_KEY: 'AKIAIOSFODNN7EXAMPLE',
      Aws_Secret_Access_Key: 'AKIAIOSFODNN7EXAMPLE_CASE',
      OPENAI_API_KEY: 'sk-proj-supersecretkey123',
      openai_api_key: 'sk-proj-supersecretkey456',
      DATABASE_PASSWORD: 'supersecretpass',
      AUTH_BEARER_TOKEN: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      GCS_AUTH_CREDENTIALS: '{"private_key": "-----BEGIN..."}',
      SYSTEM_SESSION_TOKEN: 'tok_live_12345',
      INTERNAL_HMAC_SECRET: 'hmac_key_999'
    };

    const sanitized = sanitizeChildEnv(hostileEnv);

    // Operational keys preserved
    assert.equal(sanitized.PATH, '/usr/bin:/bin');
    assert.equal(sanitized.NODE_ENV, 'production');

    // ALL secrets purged regardless of casing
    assert.equal(sanitized.AWS_SECRET_ACCESS_KEY, undefined);
    assert.equal(sanitized.Aws_Secret_Access_Key, undefined);
    assert.equal(sanitized.OPENAI_API_KEY, undefined);
    assert.equal(sanitized.openai_api_key, undefined);
    assert.equal(sanitized.DATABASE_PASSWORD, undefined);
    assert.equal(sanitized.AUTH_BEARER_TOKEN, undefined);
    assert.equal(sanitized.GCS_AUTH_CREDENTIALS, undefined);
    assert.equal(sanitized.SYSTEM_SESSION_TOKEN, undefined);
    assert.equal(sanitized.INTERNAL_HMAC_SECRET, undefined);

    // Permitted keys explicit whitelist
    const withAllowed = sanitizeChildEnv(hostileEnv, ['OPENAI_API_KEY']);
    assert.equal(withAllowed.OPENAI_API_KEY, 'sk-proj-supersecretkey123');
    assert.equal(withAllowed.AWS_SECRET_ACCESS_KEY, undefined);
  });

  await t.test('ADV-05: Client-Facing Error Redaction & Information Leakage Shielding', async () => {
    // Attempt request to nonexistent endpoint
    const res404 = await makeRequest({
      hostname: 'localhost',
      port: boundPort,
      path: '/api/nonexistent/endpoint',
      method: 'GET'
    });
    assert.equal(res404.statusCode, 404);
    assert.ok(res404.json);
    assert.equal(res404.json.errorCode, 'NOT_FOUND');
    assert.equal(res404.json.stack, undefined, 'Stack trace must not leak');

    // Attempt request with malformed body
    const res400 = await makeRequest({
      hostname: 'localhost',
      port: boundPort,
      path: '/api/project/operation',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, '{ bad json');

    assert.equal(res400.statusCode, 400);
    assert.ok(res400.json);
    assert.equal(res400.json.errorCode, 'ERR_INVALID_JSON');
    assert.equal(res400.json.stack, undefined, 'Stack trace must never leak to client');
    assert.ok(!res400.raw.includes('node:internal'), 'Internal node modules must not leak in error body');
  });

});
