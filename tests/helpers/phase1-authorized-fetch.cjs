// Existing timeline regressions now acquire genuine CLI-issued test approvals.
const { ApprovalAuthority } = require('../../src/creative/approval-authority.js');
const { approve } = require('./phase1-approval.cjs');

function authorizedFetch(getBackend, store) {
  const transport = globalThis.fetch;
  const tokens = new Map();
  return (url, init = {}) => {
    const route = new URL(url).pathname;
    if (init.method !== 'POST' || !['/api/project/operation', '/api/project/undo', '/api/project/redo'].includes(route)) return transport(url, init);
    const backend = getBackend();
    if (backend.isMutating) return transport(url, init);
    const body = init.body ? JSON.parse(init.body) : {};
    let operation = body.operation;
    if (route.endsWith('/undo') || route.endsWith('/redo')) {
      const stack = route.endsWith('/undo') ? backend.undoStack : backend.redoStack;
      if (!stack.length) return transport(url, init);
      operation = { type: 'restore_project_history', params: { snapshot: stack[stack.length - 1] } };
    }
    const key = operation?.operationId || body.operationId || body.idempotencyKey;
    let token = key && tokens.get(key);
    if (!token) {
      try {
        const pending = ApprovalAuthority.createPendingRequest({ project: backend.currentProject, operation, storageDir: store });
        token = approve(pending.request_id, store);
        if (key) tokens.set(key, token);
      } catch (error) {
        // A stale/invalid gesture remains a pure engine diagnostic; no commit follows.
        if (!error.code) throw error;
        return transport(url, init);
      }
    }
    return transport(url, { ...init, headers: { ...init.headers, 'x-eme-approval-token': token } });
  };
}

module.exports = { authorizedFetch };
