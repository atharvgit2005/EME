# Milestone PF-01 Completion & Acceptance Report
## Prompt Contract & Project Context (Stage 1 & Stage 2)

### 1. Executive Summary
Milestone **PF-01: Prompt Contract and Context** is fully implemented and verified against the Editing Mechanics Engine (EME) core architecture. It establishes deterministic, untrusted prompt interpretation (`IntentEnvelope`), zero-tolerance hard constraint normalization (`eme-constraint`), and validated readiness evaluation (`EditBrief`) without performing any timeline mutations or render executions.

All existing engine regression tests remain 100% green (142/142 tests passing), and zero modifications were made to manual timeline UI or `OperationExecutor` internals.

---

### 2. Architecture & File Inventory

#### A. Canonical Schemas (`schema/`)
- `schema/eme-intent-envelope.v1.schema.json`: Stage 1 untrusted prompt extraction & project context contract (draft 2020-12).
- `schema/eme-constraint.v1.schema.json`: Zero-tolerance typed hard constraints (`preserve_property`, `forbid_effect`, `preserve_fields`, `scope_limit`) with explicit verification checkpoints (`plan_preflight`, `post_execution`, `pre_render`).
- `schema/eme-edit-brief.v1.schema.json`: Stage 2 canonical `EditBrief` contract consumed by PF-02 task planning, with deterministic readiness status (`ready` | `needs_clarification` | `blocked`).

#### B. Prompt Core Engine (`src/prompt-core/`)
- `src/prompt-core/context-normalizer.js`: Computes deterministic SHA-256 snapshot fingerprints via key-sorted canonical stringification; extracts base revision, timebase ticks (120,000), and available assets.
- `src/prompt-core/reference-resolver.js`: Resolves target selectors (`role: "dialogue"`, `role: "music"`, explicit IDs, and entity hints) against the project snapshot without guessing.
- `src/prompt-core/constraint-normalizer.js`: Compiles negative prohibitions and positive invariants into typed constraints (`strength: "hard"`, `on_violation: "block"`, `on_unknown: "block"`).
- `src/prompt-core/readiness-evaluator.js`: Computes `validation.status`, detecting blocking ambiguities, contradictions (e.g., requested color modification conflicting with hard preserve constraint), and stale revisions.
- `src/prompt-core/brief-validator.js`: Validates envelopes, briefs, and constraints against schemas with cross-file `$ref` resolution.
- `src/prompt-core/index.js`: Main entry point providing `compileEditBrief({ rawPrompt, project, options })`.

#### C. Golden Fixtures (`fixtures/prompt-core/`)
- `fixtures/prompt-core/projects/project-g01-export.json`: Export-only baseline project.
- `fixtures/prompt-core/projects/project-g02-reel.json`: Horizontal interview footage project for vertical reel cut.
- `fixtures/prompt-core/projects/project-g03-contradiction.json`: Project for conflicting color grade requirements.
- `fixtures/prompt-core/expected/brief-g01-expected.json`: Canonical golden output for G01 (`status: "ready"`, constraints intact).
- `fixtures/prompt-core/expected/brief-g02-expected.json`: Canonical golden output for G02 (`status: "ready"`, vertical 1080x1920, dialogue protected).
- `fixtures/prompt-core/expected/brief-g03-expected.json`: Canonical golden output for G03 (`status: "needs_clarification"`, `CONFLICTING_REQUIREMENTS`).

#### D. Non-Executing CLI Inspection
- `src/cli/index.js`: Added `eme prompt inspect --project <file> --prompt "<text>" [--out <file>] [--json]`. Reports brief, constraints, ambiguities, and readiness status without mutation or rendering.

---

### 3. Golden Case Verification Matrix

| Fixture ID | Creative Intent | Invariant / Constraint Requirements | Deliverable Specs | Readiness Status | Blocking Issues | Schema Valid |
|:---|:---|:---|:---|:---|:---|:---:|
| **PF01-G01** | Export-only deliverable | • Preserve existing clip timing<br>• Preserve color grade<br>• Preserve audio edit<br>• Forbid adding music | 1080p MP4 (H.264 / AAC, 30fps) | `ready` | 0 | **PASS** |
| **PF01-G02** | Cut 30s vertical reel from `interview_01` | • Preserve dialogue timing (`timeline_interval`, `source_interval`, `time_remap`, `sync_offset`)<br>• Forbid adding music | 1080x1920 vertical MP4 (H.264 / AAC, 30fps) | `ready` | 0 | **PASS** |
| **PF01-G03** | Make warmer by changing color grade, but preserve existing grade | • Contradictory request vs hard negative constraint | 1080p MP4 | `needs_clarification` | `AMB-COLOR-CONTRADICTION`<br>`CONFLICT_COLOR_GRADE` | **PASS** |

---

### 4. Zero-Tolerance & Fail-Closed Invariants
1. **Hard Constraint Preservation**: Negative prohibitions ("do not add music", "do not modify existing color grade") are compiled into typed constraints with `strength: "hard"`, `on_violation: "block"`, and `on_unknown: "block"`. They are never weakened or silently reinterpreted.
2. **Fail-Closed on Unknowns**: Unknown constraint types and unallowlisted effects throw immediate errors or block readiness evaluation.
3. **Stale Revision Protection**: `ReadinessEvaluator` checks `brief.project_snapshot.base_revision === currentProjectRevision`; any mismatch returns `status: "blocked"` with `ERR_STALE_REVISION`.
4. **Contradiction Blocker**: Contradictory requirements (e.g., G03 requesting color changes while requiring color grade preservation) immediately halt execution with `needs_clarification`.
5. **Project Immutability**: `compileEditBrief` operates with zero side effects; input project JSON is bit-for-bit identical before and after compilation.

---

### 5. Test Commands & Verification Results
- **Dedicated Prompt Core Test Suite**:
  ```bash
  node --test tests/prompt-core.test.js
  ```
  *Result: 10/10 tests passing (0 failures, 0 skipped).*
- **Full Engine Regression Suite**:
  ```bash
  npm test
  ```
  *Result: 142/142 tests passing across all suites.*
