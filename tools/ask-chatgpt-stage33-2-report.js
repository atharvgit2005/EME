/**
 * Ezra Bridge Script: Submit Stage 33.2 Completion & Acceptance Package to ChatGPT Architecture Lead
 *
 * Interacts with ChatGPT Architecture Lead via the active Ezra bridge in Brave Browser
 * (thread: 6ad4ae37-23ec-83ee-b1df-5274a2f04e1a).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const CHAT_URL_FRAGMENT = "6ad4ae37-23ec-83ee-b1df-5274a2f04e1a";

function runOsa(jsCode) {
  const script = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t) contains "${CHAT_URL_FRAGMENT}" then
        return execute t javascript ${JSON.stringify(jsCode)}
      end if
    end repeat
  end repeat
  return "NO_TAB"
end tell`;
  const res = spawnSync("osascript", ["-"], { input: script, encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
  return (res.stdout || "").trim();
}

async function main() {
  console.log('1. Preparing Stage 33.2 Acceptance Submission Dossier...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME Phase 33 Stage 33.2 Frozen Audio-Visual Benchmark and Ground Truth — Completion & Review Submission)";

  const promptText = `${promptAnchor},

Following your formal engineering authorization in **Decision ID: AVCS-33-STAGE-001** (\`plans/CHATGPT_STAGE33_1_ACCEPTANCE.md\`), the engineering team has completed all required deliverables for **Stage 33.2 ("Frozen Audio-Visual Benchmark and Ground Truth")** on branch \`feature/phase-33-2-av-benchmark\`.

Implementation commit: \`fb7398b7644dda1c1a1fb78c7f56ad653eba4f82\` (\`fb7398b\`)  
Parent commit: \`7401e7f7cafba4c2fd204bbb10d5f76675b62f1c\` (\`7401e7f\`, Accepted Stage 33.1 Commit)  
Certified predecessor baseline: \`31c6032bb88973aab6a4545785d5b63df8fa0ebe\` (\`phase-32-certified\`)  

We submit below the complete Stage 33.2 deliverable package, test results, invariant audit, and artifact integrity manifests for your formal architectural review and acceptance.

---

### 1. Mandatory Stage Decision Record (Charter Section 9 Format)

- **Stage**: 33.2 — Frozen Audio-Visual Benchmark and Ground Truth
- **Implementation commit**: \`fb7398b7644dda1c1a1fb78c7f56ad653eba4f82\`
- **Parent commit**: \`7401e7f7cafba4c2fd204bbb10d5f76675b62f1c\` (\`7401e7f\`, Accepted Stage 33.1 Commit)
- **Objective**: Build a bounded, reproducible benchmark sufficient to evaluate synchronization, visual composition, conflict handling, and safety: construct 24 audiovisual fixtures, 96 labeled decision cases across the 8 defect categories, clean controls, ambiguous cases, and unsupported cases, strict 16/8 development-heldout partition manifests, auxiliary observation sidecars, and integrity ledgers.
- **Tests**:
  - Stage 33.2 benchmark validation test suite (\`tests/workflow-stage33-2-benchmark-corpus.test.js\`): **20 expected, 20 executed, 20 passed, 0 failed, 0 cancelled, 0 skipped**.
  - Cumulative repository regression battery (\`node --test --test-concurrency=1 tests/workflow-stage21-*.test.js ... tests/workflow-stage33-*.test.js\`): **635 expected, 635 executed, 635 passed, 0 failed, 0 cancelled, 0 skipped** across 63 test files (57 runner suites) in 52.71s.
  - Arithmetic reconciliation: 592 predecessor tests + 23 Stage 33.1 tests + 20 Stage 33.2 tests = **635 cumulative tests**.
- **Applicable Quality Gates**:
  - **GATE-01 (Provenance & Freshness)**: PASS. Freshness verified on all 24 media files and observation sidecars; stale revision and digest mutations detected and rejected.
  - **GATE-04 (Temporal Alignment)**: PASS. Integer ticks (120,000 ticks/sec), half-open intervals $[t_0, t_0 + \Delta t)$, exact rational sample/frame mappings.
  - **GATE-06 (Ground-Truth Integrity)**: PASS. 100% valid schema annotations, valid \`eme-fusion-evidence.v1\` sidecars, zero partition leakage.
  - **GATE-08 (Architecture & Invariants)**: PASS. 18 canonical schemas verified byte-identical; package.json dependencies undefined; \`OperationExecutor\` sole mutation authority.
- **Invariants**:
  - \`INV-01\` (Frozen Canonical Schemas): PASS. All 18 canonical schemas 100% byte-identical.
  - \`INV-02\` (Canonical Timebase): PASS. 120,000 integer ticks/sec standard with half-open intervals.
  - \`INV-03\` (\`OP-AUTH\` Mutation Authority): PASS. \`OperationExecutor\` remains exclusive mutation authority.
  - \`INV-04\` (Active-Delivery Safety): PASS. Preserved without modification.
  - \`INV-05\` (Runtime Dependency Boundary): PASS. \`package.json\` dependencies property is undefined. Zero ML weights, zero Python in core package.
  - \`INV-06\` (Observation vs Decision Separation / \`CTR-03\`): PASS. \`assertPureObservation\` passes on all 24 sidecars; zero solver placement decisions, scores, or operation plans exist in sidecars.
  - \`INV-07\` (Determinism): PASS. Bitwise identical SHA-256 digests and deterministic generator procedures.
- **Evidence Integrity**: All 10 deliverables hashed and cataloged in \`evidence/phase-33/stage-33.2/artifact-integrity-manifest.json\`.
- **Outstanding Findings**: None.
- **Decision Requested**: ACCEPT Stage 33.2.
- **Next-Stage Authorization Requested**: Stage 33.3 (Deterministic Audio-Visual Evidence Fusion) on branch \`feature/phase-33-3-evidence-fusion\`.

---

### 2. Stage 33.2 Corpus Specification & Partition Integrity

1. **Source-Clip Corpus (24 Fixtures Across 4 Scenarios)**:
   - **Scenario A (Rhythmic montage & beat-anchored timing)**: 6 fixtures (4 dev: \`SCEN-A01\`..\`SCEN-A04\`, 2 held-out: \`SCEN-A05\`..\`SCEN-A06\`).
   - **Scenario B (Speech-led editing & rhythm conflicts)**: 6 fixtures (4 dev: \`SCEN-B01\`..\`SCEN-B04\`, 2 held-out: \`SCEN-B05\`..\`SCEN-B06\`).
   - **Scenario C (Multi-subject visual composition)**: 6 fixtures (4 dev: \`SCEN-C01\`..\`SCEN-C04\`, 2 held-out: \`SCEN-C05\`..\`SCEN-C06\`).
   - **Scenario D (Motion, scene changes, missing evidence, & drift)**: 6 fixtures (4 dev: \`SCEN-D01\`..\`SCEN-D04\`, 2 held-out: \`SCEN-D05\`..\`SCEN-D06\`).
   - Partition totals: Exactly **16 development fixtures** and **8 held-out fixtures**.
   - All fixtures rendered with synchronized H.264 video and 48kHz AAC audio via deterministic ffmpeg lavfi pipeline and registered with content digests in \`corpus-manifest.json\`.

2. **Frozen Labeled Decision Cases (96 Cases)**:
   - **Scored Defects**: Exactly **48 cases** across the 8 charter categories (6 cases each: 4 dev, 2 held-out):
     1. \`ERR_BEAT_MISALIGNED\` (Beat-anchor misalignment: cut offset $> \\pm 1$ frame).
     2. \`ERR_INCORRECT_BEAT_SELECTION\` (Incorrect beat selection: off-beat chosen instead of downbeat).
     3. \`ERR_AV_TEMPORAL_DRIFT\` (Audio/video temporal drift: cumulative clock drift $> \\pm 1$ frame).
     4. \`ERR_INVALID_CUT_TIMING\` (Invalid cut timing: cut within $\\pm 2$ frames of scene boundary).
     5. \`ERR_VISUAL_COLLISION\` (Visual exclusion collision: text/graphic placed over annotated face/subject).
     6. \`ERR_MOTION_INSTABILITY\` (Motion placement instability: trajectory RMS jitter $> 2.0\\text{ px}$).
     7. \`ERR_CONFLICTING_CONSTRAINTS\` (Conflicting hard constraints: mutually exclusive placement/timing demands).
     8. \`ERR_STALE_SIDECAR\` (Stale sidecar evidence: project revision or media digest desync).
   - **Clean Golden Controls**: Exactly **24 cases** (16 dev, 8 held-out) with disposition \`ACCEPT\`.
   - **Ambiguous Cases**: Exactly **12 cases** (8 dev, 4 held-out) with disposition \`RESOLVE_AMBIGUITY\` and explicit deterministic tie-breaking rules.
   - **Unsupported Cases**: Exactly **12 cases** (8 dev, 4 held-out) with disposition \`REFUSE_UNSUPPORTED\` and explicit fail-closed refusal rules.
   - Total case distribution: **64 Development cases** and **32 Held-Out cases**.

3. **Partition Protection & Zero-Leakage Audit**:
   - Manifest: \`evidence/phase-33/stage-33.2/development-heldout-split.json\`.
   - Disjoint set audit: Zero media hash collisions, zero shared clip IDs, zero near-duplicates.
   - Reference isolation: Development decision cases reference strictly development fixtures; held-out decision cases reference strictly held-out fixtures.
   - Held-out labels remain sealed and withheld from solver tuning until final evaluation (Stage 33.6).

---

### 3. Stage 33.2 Evidence Artifacts Ledger

From \`evidence/phase-33/stage-33.2/artifact-integrity-manifest.json\`:

| Path | Size (Bytes) | SHA-256 Digest |
| :--- | :---: | :--- |
| \`evidence/phase-33/stage-33.2/stage-report.md\` | 8,059 | \`428b8c9117c6ac82af734f22c8a15e1dcb464fd131b697970075e8fb21b2dcc2\` |
| \`evidence/phase-33/stage-33.2/corpus-manifest.json\` | 28,751 | \`3e0d091f733ef103b9df3944b121101b50e2362fb5c7f79b6b9bd15a2778aa2f\` |
| \`evidence/phase-33/stage-33.2/ground-truth-manifest.json\` | 88,280 | \`0c0c018530b38559a1d87b994ec33668d3036bd47bad026712f2f0ab38bb27a7\` |
| \`evidence/phase-33/stage-33.2/development-heldout-split.json\` | 3,844 | \`eab86788e23a4df54be2806341aadfda09ce66ffd82cfc346f1a7ab8ed3e1174\` |
| \`evidence/phase-33/stage-33.2/defect-taxonomy.json\` | 2,087 | \`c1b7d11a24d26cada792e7ea9dcefe3774a32428269abf34679d16f8cc23ca69\` |
| \`evidence/phase-33/stage-33.2/annotation-validation.json\` | 568 | \`2b9cdf06bc3ae2d508e6d08b655d08dd8f9bbbe5e3fb3c1bbbcbd6fd0a55680c\` |
| \`evidence/phase-33/stage-33.2/corpus-build-log.txt\` | 8,983 | \`de5649ecb1469f1228a39bd1e3e9dfac05e9571dd87440097deca92d01ccf799\` |
| \`evidence/phase-33/stage-33.2/corpus-fingerprint-manifest.json\` | 20,129 | \`1302bc4c4659ec85ec54abacce88521ecd3cb798c87370391218f67775292372\` |
| \`src/benchmarks/audio-visual-benchmark-generator.js\` | 59,188 | \`604ebdbc06ba2801e340b42649aef022a59b8e2177a020064867ace2204835e2\` |
| \`tests/workflow-stage33-2-benchmark-corpus.test.js\` | 18,349 | \`0076a0d24483ae3db9bb6d8a2118dd18e5f157ad2a99147573fc0c5f0eb70d10\` |

---

### 4. Formal Ruling Request

We respectfully request the Architecture Lead to issue the Stage 33.2 formal decision:
1. **Accept Stage 33.2**: Confirm formal acceptance of the frozen audiovisual benchmark corpus, ground-truth annotations, partition split manifest, and defect taxonomy.
2. **Authorize Stage 33.3**: Grant formal authorization to advance to **Stage 33.3 ("Deterministic Audio-Visual Evidence Fusion")** on branch \`feature/phase-33-3-evidence-fusion\`.`;

  console.log('2. Finding ChatGPT tab in Brave Browser...');
  const tabCheck = runOsa('window.location.href');
  if (tabCheck === 'NO_TAB') {
    console.error(`Error: Could not find active Brave tab containing "${CHAT_URL_FRAGMENT}".`);
    process.exit(1);
  }
  console.log('   Found active thread:', tabCheck);

  console.log('3. Copying Stage 33.2 submission dossier to system clipboard...');
  spawnSync('pbcopy', { input: promptText, encoding: 'utf8' });

  console.log('4. Pasting dossier into ChatGPT composer via System Events...');
  const pasteScript = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t) contains "${CHAT_URL_FRAGMENT}" then
        tell t to execute javascript "(() => {
          let el = document.querySelector('div.ProseMirror:not(.content-xaiQhS)');
          if (el) el.focus();
        })()"
      end if
    end repeat
  end repeat
  activate
end tell
delay 0.5
tell application "System Events"
  keystroke "a" using command down
  keystroke "v" using command down
end tell`;
  spawnSync('osascript', ['-e', pasteScript]);

  console.log('5. Waiting 2 seconds and clicking Send button...');
  await sleep(2000);

  let clickedSend = false;
  for (let b = 0; b < 10; b++) {
    const sendRes = runOsa(`(() => {
      const btn = document.querySelector('button[aria-label="Send"], button[aria-label="Send prompt"], button[aria-label="Send message"], button[data-testid="send-button"]');
      if (!btn || btn.disabled) return "NO_SEND_BUTTON";
      btn.click();
      return "CLICKED_SEND";
    })()`);
    console.log(`   [Attempt ${b + 1}/10] Send:`, sendRes);
    if (sendRes === 'CLICKED_SEND') {
      clickedSend = true;
      break;
    }
    await sleep(1000);
  }

  if (!clickedSend) {
    console.error('Failed to click send button after 10 attempts.');
    process.exit(1);
  }

  console.log('5. Awaiting ChatGPT Architecture Lead Stage 33.2 Acceptance Ruling...');
  let completed = false;
  let finalMarkdown = '';

  await sleep(6000);

  for (let attempt = 0; attempt < 180; attempt++) {
    await sleep(4000);

    const checkRes = runOsa(`(() => {
      const stopBtn = document.querySelector('button[aria-label*="Stop"], button[data-testid*="stop"]');
      const isGenerating = !!stopBtn;

      const main = document.querySelector('main') || document.body;
      const text = main ? main.innerText : "";

      const pIdx = text.lastIndexOf(${JSON.stringify(promptAnchor)});
      if (pIdx === -1) {
        return JSON.stringify({ isGenerating, pIdx: -1, len: 0, text: "" });
      }

      const afterPrompt = text.slice(pIdx);
      let responseText = "";
      const marker = "ChatGPT said:";
      const mIdx = afterPrompt.indexOf(marker);
      if (mIdx !== -1) {
        responseText = afterPrompt.slice(mIdx + marker.length).trim();
      } else {
        responseText = afterPrompt.trim();
      }

      const footerIdx = responseText.lastIndexOf("ChatGPT can make mistakes.");
      if (footerIdx !== -1) {
        responseText = responseText.slice(0, footerIdx).trim();
      }

      return JSON.stringify({
        isGenerating,
        pIdx,
        len: responseText.length,
        text: responseText
      });
    })()`);

    let parsed = {};
    try {
      parsed = JSON.parse(checkRes);
    } catch (e) {
      console.log(`   [Attempt ${attempt + 1}/180] Waiting for JSON response...`);
      continue;
    }

    console.log(`   [Attempt ${attempt + 1}/180] Generating: ${parsed.isGenerating}, Length: ${parsed.len}`);

    if (!parsed.isGenerating && parsed.len > 500 && !parsed.text.startsWith(promptAnchor)) {
      console.log('   ChatGPT Architecture Lead response received!');
      finalMarkdown = parsed.text;
      completed = true;
      break;
    }
  }

  if (!completed) {
    console.error('Timed out waiting for ChatGPT Architecture Lead response.');
    process.exit(1);
  }

  const outPath = path.resolve('plans/CHATGPT_STAGE33_2_ACCEPTANCE.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\n✔ Architecture Lead Stage 33.2 Acceptance Ruling saved to: ${outPath}`);
  console.log('\n========================================================================');
  console.log(finalMarkdown.slice(0, 1500) + '...\n');
  console.log('========================================================================\n');
}

main().catch(err => {
  console.error('Fatal error in Ezra bridge script:', err);
  process.exit(1);
});
