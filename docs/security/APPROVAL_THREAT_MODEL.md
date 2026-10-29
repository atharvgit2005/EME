# EME Approval Authority Security & Threat Model Specification

> Phase 1 implementation update: see [the current execution approval policy](PHASE1_APPROVAL_POLICY.md).
> It supersedes the historical implementation guarantees below. Approval now binds a
> sealed execution record and is consumed under the protected commit lock. Some legacy
> commit interfaces are withheld. TTY confirmation does not provide non-repudiation
> against unrestricted processes running as the same local user; no macOS modal is
> implemented by the current confirmation CLI.

**Milestone**: EME Phase 34.8 — IDE-Only AI Architecture & Human Authorization Boundary  
**Status**: Authoritative Architectural Standard  
**Document Revision**: 1.0.0  

---

## 1. Executive Summary

The Editing Mechanics Engine (EME) architecture mandates that:
1. **Antigravity IDE** is the sole AI reasoning environment. EME makes zero external model-provider API calls.
2. All mutations to canonical project state execute exclusively through `OperationExecutor` (**OP-AUTH**).
3. The human editor maintains non-repudiable oversight over all creative plan executions via single-use, cryptographic authorization tokens managed by `ApprovalAuthority`.

---

## 2. Invariant Protections Guaranteed by EME

| Protection Invariant | Enforcement Mechanism | Security Guarantee |
| :--- | :--- | :--- |
| **Plan Integrity** | SHA-256 fingerprint bound immutably to the approval token. | Any alteration to the Creative Plan between approval and execution triggers `ERR_APPROVAL_INTEGRITY_MISMATCH` and aborts before mutation. |
| **Revision Freshness** | Project base revision integer bound to the token. | If concurrent edits advance the project revision, the token is invalidated with `ERR_STALE_REVISION`, preventing race conditions. |
| **Anti-Replay & Single-Use** | Atomic status transition to `CONSUMED` upon execution. | Tokens can only be used once. Second execution attempts fail closed with `ERR_APPROVAL_ALREADY_CONSUMED`. |
| **Token Expiration** | 10-minute TTL (`expires_at`). | Stale or abandoned tokens expire and trigger `ERR_APPROVAL_EXPIRED`. |
| **MCP Tool Isolation** | `eme_request_user_approval` only creates pending tickets. | The AI calling agent receives zero authorization tokens. Caller-supplied `userConsent: true` is untrusted. |
| **CLI Bypass Immunity** | Strict argument validation in `bin/eme-confirm.js`. | Automated bypass flags (`--yes`, `-y`, `--test-confirm`) fail closed with `ERR_APPROVAL_BYPASS_FORBIDDEN`. Non-interactive pipes fail closed with `ERR_NON_INTERACTIVE_FORBIDDEN`. |
| **Test Isolation** | Programmatic harness injection only in JavaScript. | Test bypasses are completely absent from the production CLI binary. |

---

## 3. Explicit Threat Model & Operating Boundary

### A. The POSIX Pseudo-Terminal (PTY) Boundary
In Unix/POSIX operating systems, any process running under a user's account with shell privileges can allocate a pseudo-terminal pair via `openpty()`. When a subprocess runs inside a PTY:
- `process.stdin.isTTY` evaluates to `true`.
- The child process cannot distinguish programmatic PTY input from human keyboard input through standard C / POSIX library calls alone.

### B. Formal Operating Boundary Declaration
1. **Interactive TTY Safeguard**:
   Checking `process.stdin.isTTY` and requiring explicit `CONFIRM` input protects against:
   - Accidental headless invocation.
   - Piped standard input from shell scripts (`echo yes | ...`).
   - Unintended automated CI/CD execution without review.

2. **Shell-Capable Agent Threat Model**:
   If an AI agent or process is granted unrestricted local shell access (`run_command`, `exec`, `spawn`) within the user's logged-in desktop environment:
   - The agent has the technical capability to spawn child processes, allocate PTYs, and synthesize input streams.
   - A command-line utility running in the same user space cannot cryptographically prove human physical presence without delegating to an OS-level secure authentication prompt (such as macOS TouchID, Keychain, or WindowServer modal dialogs) or an isolated hardware token.

3. **OS-Native Modal Confirmation**:
   Where supported on macOS desktop environments, `bin/eme-confirm.js` can invoke the macOS WindowServer modal alert (`display dialog`). Because macOS restricts synthetic event injection via System Events (requiring explicit user Accessibility permissions under macOS Transparency, Consent, and Control — TCC), an OS-level modal dialog establishes an independent presentation boundary above standard terminal streams.

4. **Recommendation for High-Trust Enterprise Deployments**:
   For deployments requiring absolute non-repudiation against compromised local processes, the approval CLI should be executed on an isolated user account, an out-of-band mobile/web confirmation webhook, or gated behind Touch ID / WebAuthn hardware keys.
