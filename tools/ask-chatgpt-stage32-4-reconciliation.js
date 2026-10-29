/**
 * Ezra Bridge Script: Submit Stage 32.4 Fifth Reconciliation Package to ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 32.4 Fifth Reconciliation Package (Findings D & E Resolution, 158+258=416 Ledger)...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME Phase 32 Stage 32.4 Fifth Reconciliation Dossier — Findings D & E Resolution, Preflight Drawbox Evidence & Reconciled Partition Ledger)";

  const promptText = `${promptAnchor},

In response to your Stage 32.4 Fifth Review Ruling (\`plans/CHATGPT_STAGE32_4_FINAL_CERTIFICATION.md\`), the engineering team has completed the required empirical investigations and documentation on branch \`feature/phase-32-4-offline-vision-worker\` at commit \`b22b310\` (originating from baseline \`fdc50bd\`, predecessor submission \`0b171ee\`, and prior review rounds \`ec533e6\`, \`5ae9901\`, \`941ae5f\`, and \`a459822\`).

We formally submit below the complete technical resolutions for **Predecessor Suite Ledger Arithmetic ($158 + 258 = 416$)**, **Finding D (FFmpeg Drawbox Root-Cause Preflight Record)**, and **Finding E (Ground-Truth Counting Unit & Partition Arithmetic)**, and respectfully request formal approval of **Benchmark Specification Revision v1.2.0 (Amended)** to proceed with official fixture generation and evaluation.

---

### 1. Executive Summary & Resolution Matrix

| Issue / Finding | Status in Fifth Ruling | Engineering Resolution in this Fifth Resubmission | Final Status |
| :--- | :--- | :--- | :--- |
| **Historical Battery (416/416)** | Accepted as historical evidence. | Preserved intact ($416/416$ passed across 17 suites). | **ACCEPTED & PRESERVED** |
| **17-Suite Ledger Subtotals** | Arithmetic correction required: $158 + 258 = 416$. | Corrected: 158 tests in 17 \`describe()\` suites + 258 tests in 38 standalone test files. | **AMENDED & RECONCILED** |
| **Benchmark Direction** | Approved in principle (Pathway 1 selected). | Maintained: Visually grounded synthetic benchmark v1.2.0. | **APPROVED IN PRINCIPLE** |
| **Finding D (FFmpeg Root Cause)** | Status: OPEN — BLOCKING. Proof of drawbox behavior required. | Empirical preflight artifact committed (\`ffmpeg-drawbox-preflight-investigation.md\`). Retracted color syntax error; proved \`drawbox\` lacks temporal \`t\` variable ($x \\to \\text{INT\\_MAX} = 2147483647$); proved \`overlay\` filter draws exact $72,000$ px animated boxes. | **PROVEN & RESOLVED** |
| **Finding E (Partition Arithmetic)** | Status: OPEN — BLOCKING. Counting unit definition and count reconciliation required. | Explicit counting unit defined (1 face instance = 1 bounding box in 1 frame). Counts reconciled: Development = 882 frames / 948 faces; Held-out = 414 frames / 408 faces; Total = 1,296 frames / 1,356 faces. | **RECONCILED & FROZEN** |
| **Official Generation & Scoring** | Awaiting corrected specification. | Formal approval of Amended v1.2.0 Proposal requested to proceed to fixture generation and scoring. | **AWAITING APPROVAL** |
| **Stage 32.5 Boundary** | Not granted. | Zero Stage 32.5 code implemented. | **VERIFIED & PRESERVED** |

---

### 2. Predecessor Regression Ledger Arithmetic Amendment (Closing Item 2)

**Status:** AMENDED & RECONCILED

As directed in Section 2 of your ruling:
$$158 + 258 = 416$$

We have updated \`artifacts/phase-32/stage-32.4/system-characterization-and-lineage-reconciliation.md\` to reflect the exact row-level sum of the 55 test files:

#### 2.1. The 17 Registered Suite Files (Invoking \`describe()\`): Exactly 158 Tests
1. \`tests/workflow-stage26-1-kit-contract.test.js\` (4 tests, 1 suite)
2. \`tests/workflow-stage26-2-kit-bridge.test.js\` (5 tests, 1 suite)
3. \`tests/workflow-stage26-3-kit-catalog.test.js\` (5 tests, 1 suite)
4. \`tests/workflow-stage26-4-placement-engine.test.js\` (5 tests, 1 suite)
5. \`tests/workflow-stage26-sound-kit.test.js\` (12 tests, 1 suite)
6. \`tests/workflow-stage30-1-failure-model.test.js\` (7 tests, 1 suite)
7. \`tests/workflow-stage30-2-crash-recovery.test.js\` (9 tests, 1 suite)
8. \`tests/workflow-stage30-2-real-process-crash.test.js\` (4 tests, 1 suite)
9. \`tests/workflow-stage30-3-concurrency-fencing.test.js\` (8 tests, 1 suite)
10. \`tests/workflow-stage30-4-artifact-integrity.test.js\` (12 tests, 1 suite)
11. \`tests/workflow-stage30-5-recovery-evidence.test.js\` (9 tests, 1 suite)
12. \`tests/workflow-stage31-1-protocol.test.js\` (9 tests, 1 suite)
13. \`tests/workflow-stage31-2-corpus.test.js\` (13 tests, 1 suite)
14. \`tests/workflow-stage31-3-shadow-eval.test.js\` (13 tests, 1 suite)
15. \`tests/workflow-stage31-4-candidate-validation.test.js\` (13 tests, 1 suite)
16. \`tests/workflow-stage31-5-analysis.test.js\` (15 tests, 1 suite)
17. \`tests/workflow-stage31-6-certification.test.js\` (15 tests, 1 suite)  
*Subtotal Registered Suites:* **17 suites**, **158 tests** ($31 + 49 + 78 = 158$).

#### 2.2. The 38 Standalone Test Files (Invoking Top-Level \`test()\`): Exactly 258 Tests
- Stages 21–24 (16 files): 16 tests (4 tests per stage)
- Stage 25 (6 files): 29 tests
- Stages 27–28 (10 files): 116 tests
- Stage 29 (6 files): 97 tests  
*Subtotal Standalone Test Files:* **0 suites**, **258 tests** ($16 + 29 + 116 + 97 = 258$).

#### 2.3. Grand Total Alignment
$$\\text{Total Predecessor Tests} = 158 + 258 = \\mathbf{416\\text{ tests}}$$
$$\\text{Total Predecessor Suites} = 17 + 0 = \\mathbf{17\\text{ suites}}$$
Historical runner record: \`ℹ tests 416 | suites 17 | pass 416 | fail 0\`.

---

### 3. Finding D Resolution — FFmpeg Drawbox Preflight Record

**Status:** PROVEN & RESOLVED  
**Committed Artifact:** \`artifacts/phase-32/stage-32.4/ffmpeg-drawbox-preflight-investigation.md\`

#### 3.1. Retraction of the Color-Syntax Claim
The engineering team explicitly acknowledges that the prior claim attributing missing rectangles to \`color=0xd4a373@1\` was incorrect. As noted by the Architecture Lead, FFmpeg supports \`[0x|#]RRGGBB[AA]@alpha\`.
Empirical sampling of Stage 32.2's \`artifacts/phase-32/stage-32.2/fixtures/SCEN-B01-MULTI-SUBJECT-DUAL-INTERVIEW.mp4\` proves that \`color=0xd4a373@1\` **successfully drew 72,000 face pixels at \`RGB(212, 162, 116)\`** when static coordinates were used.

#### 3.2. The True Technical Root Cause: Coordinate Expression Failure
1. **FFmpeg \`drawbox\` Variable Scope:** In FFmpeg's \`libavfilter/vf_drawbox.c\`, the coordinate expression evaluator only recognizes spatial frame constants: \`iw\`, \`ih\`, \`in_w\`, \`in_h\`, \`w\`, \`h\`, \`x\`, \`y\`, \`sar\`, \`dar\`, \`hsub\`, \`vsub\`. It **does not support temporal variables \`t\` (timestamp) or \`n\` (frame index)**.
2. **Evaluation Saturation to \`INT_MAX\`:** When \`SyntheticVisualGenerator.generateVideoFile\` passed dynamic expressions containing \`t\` (e.g. \`x='if(lte(t,0),760,760+t*(840-760)/5.0)'\` in \`SCEN-A01\`..\`A04\` or \`x='t*80'\` in \`SCEN-C01\`..\`C04\`), FFmpeg's \`av_expr\` parser failed on \`t\` and evaluated to \`NAN\`, which saturated to \`INT_MAX = 2147483647\`.
   The exact stderr log with \`-v debug\` confirms:
   \`\`\`text
   [Parsed_drawbox_1 @ 0x785408900] x:2147483647 y:300 w:240 h:300 color:0xA46499FF
   \`\`\`
   Because $x = 2,147,483,647$ is over 2.14 billion pixels to the right of the $1920$-pixel canvas, zero rectangle pixels intersected the video frame, resulting in uniform background pixels.
3. **Missing Generator Clauses:** For scenarios \`SCEN-B02\`, \`SCEN-B03\`, and \`SCEN-B04\`, \`SyntheticVisualGenerator.generateVideoFile\` omitted filter construction branches in its \`if/else\` ladder, producing solid background test patterns.

#### 3.3. Minimal Reproducible Command Matrix
Testing on 1920x1080 canvas:
- \`drawbox=x='if(lte(t,0),760,...)':y=300:w=240:h=300:color=0xd4a373@1:t=fill\` $\\implies$ 1 unique color (solid \`0x181824\`), pixel at $(800, 400) = (24, 24, 36)$ (Failed, $x = \\text{INT\\_MAX}$).
- \`drawbox=x='if(lte(t,0),760,...)':y=300:w=240:h=300:color=red:t=fill\` $\\implies$ 1 unique color (Failed, $x = \\text{INT\\_MAX}$).
- \`drawbox=x=760:y=300:w=240:h=300:color=0xd4a373@1:t=fill\` $\\implies$ 2 unique colors, pixel at $(800, 400) = \\mathbf{(212, 162, 116)}$ (Passed, exactly $72,000$ face pixels).
- \`drawbox=x=760:y=300:w=240:h=300:color=red:t=fill\` $\\implies$ 2 unique colors, pixel at $(800, 400) = (254, 0, 0)$ (Passed).

#### 3.4. Proven Remediation for Benchmark Revision v1.2.0
Dynamic temporal animation is achieved via FFmpeg's \`overlay\` filter chain, which natively evaluates \`t\` and \`n\` per frame:
\`\`\`bash
ffmpeg -y -f lavfi -i "color=c=0x181824:s=1920x1080:d=1.0:r=24 [bg]; color=c=0xd4a373:s=240x300:d=1.0:r=24 [face]; [bg][face] overlay=x='760+t*(840-760)/5.0':y=300" ...
\`\`\`
- **Frame 0 ($t = 0.00\\text{s}$):** Bounding box $X \\in [760, 999]$, $Y \\in [300, 599]$ (Width = 240, Height = 300, exactly 72,000 pixels at \`RGB(212, 162, 116)\`).
- **Frame 23 ($t = 0.958\\text{s}$):** Bounding box $X \\in [774, 1013]$, $Y \\in [300, 599]$ (Width = 240, Height = 300, exactly 72,000 pixels at \`RGB(212, 162, 116)\`, smoothly displaced by 14px).

---

### 4. Finding E Resolution — Counting Unit & Partition Arithmetic

**Status:** RECONCILED & FROZEN  
**Committed Artifact:** \`artifacts/phase-32/stage-32.4/benchmark-specification-v1.2.0-proposal.md\`

#### 4.1. Explicit Definition of the Counting Unit
- A **ground-truth face instance** is defined as **a single annotated 2D face bounding box occurrence within an individual video frame**.
- Total face instances in a clip = $\\sum_{\\text{frames}} (\\text{faces in frame})$.
- A unique person tracked continuously across $120$ frames represents **120 ground-truth face instances**. A dual-interview clip with 2 subjects across $120$ frames represents **240 ground-truth face instances**. Negative control clips with 0 subjects represent **0 ground-truth face instances**.

#### 4.2. Partition Summary Table (100% Reconciled)

| Partition | Number of Fixtures | Total Frames | Total GT Face Instances | Negative Control Frames | Negative Control Face Instances |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Development Partition** | 8 | **882** | **948** | 336 | 0 |
| **Frozen Held-Out Partition** | 4 | **414** | **408** | 150 | 0 |
| **Complete Corpus Total** | **12** | **1,296** | **1,356** | **486** | **0** |

#### 4.3. Development Partition Breakdown (8 Clips / 882 Frames / 948 Face Instances)
1. \`SCEN-A01-TALKING-HEAD-STANDARD\` ($1920\\times 1080$, 24 fps, 5.0s): **120 frames**, **120 face instances** (1 face/frame).
2. \`SCEN-A02-TALKING-HEAD-CONSTRAINED\` ($1920\\times 1080$, 30 fps, 4.0s): **120 frames**, **120 face instances** (1 face/frame).
3. \`SCEN-B01-MULTI-SUBJECT-DUAL-INTERVIEW\` ($1920\\times 1080$, 24 fps, 5.0s): **120 frames**, **240 face instances** (2 faces/frame).
4. \`SCEN-B02-MULTI-SUBJECT-CROWD-OVERLAP\` ($1920\\times 1080$, 24 fps, 4.0s): **96 frames**, **288 face instances** (3 faces/frame).
5. \`SCEN-B03-MULTI-SUBJECT-LIGHTING-FLICKER\` ($1920\\times 1080$, 30 fps, 3.0s): **90 frames**, **180 face instances** (2 faces/frame).
6. \`SCEN-C01-LATERAL-MOTION-SMOOTH\` ($1920\\times 1080$, 24 fps, 5.0s): **120 frames**, **0 face instances** (Negative Control).
7. \`SCEN-C02-LATERAL-MOTION-PARALLAX\` ($1920\\times 1080$, 24 fps, 4.0s): **96 frames**, **0 face instances** (Negative Control).
8. \`SCEN-C03-LATERAL-MOTION-SHOT-CUT\` ($1920\\times 1080$, 24 fps, 5.0s): **120 frames**, **0 face instances** (Negative Control).
*Development Subtotal:* **882 frames**, **948 ground-truth face instances**.

#### 4.4. Frozen Held-Out Partition Breakdown (4 Clips / 414 Frames / 408 Face Instances)
9. \`SCEN-A03-TALKING-HEAD-EDGE-ADVERSARIAL\` ($1920\\times 1080$, 24 fps, 3.0s): **72 frames**, **72 face instances** (1 face/frame).
10. \`SCEN-A04-TALKING-HEAD-9-16-VERTICAL\` ($1080\\times 1920$, 30 fps, 4.0s): **120 frames**, **120 face instances** (1 face/frame).
11. \`SCEN-B04-MULTI-SUBJECT-4K-HIGH-DENSITY\` ($3840\\times 2160$, 24 fps, 3.0s): **72 frames**, **216 face instances** (3 faces/frame).
12. \`SCEN-C04-LATERAL-MOTION-SUBPIXEL-STRESS\` ($1920\\times 1080$, 60 fps, 2.5s): **150 frames**, **0 face instances** (Negative Control).
*Held-Out Subtotal:* **414 frames**, **408 ground-truth face instances**.

#### 4.5. Arithmetic Consistency Check
$$\\text{Frames}: 882 + 414 = \\mathbf{1,296\\text{ frames}}$$
$$\\text{Face Instances}: 948 + 408 = \\mathbf{1,356\\text{ ground-truth face instances}}$$

---

### 5. Master Deliverables & Checksum Inventory

All 14 Stage 32.4 deliverables verified with \`shasum -c artifacts/phase-32/stage-32.4/evidence-inventory.sha256\` (100% OK):
- \`src/renderers/vision-worker-client.js\` (\`eb1b3ec2fe1b6947fd5867c26b8c1d2dfb53d70fd188abb4eb898643a00430ba\`)
- \`src/renderers/vision-worker-bridge.py\` (\`251c4ba926c7b6a7229726c61086d4ddfb5709b4776dd3d8459e7cbb7f04e00e\`)
- \`src/renderers/vision-worker-pipeline.js\` (\`7adaf9408f3c9426e291e0f161f5e9138ec089c5020aecdaf133b128fed940ac\`)
- \`tests/workflow-stage32-4-vision-worker.test.js\` (\`530d9536204c200b1924ab51e57153eb2d5c95c960ef87921152f952f900b1ea\`)
- \`artifacts/phase-32/stage-32.4/scoring-specification-addendum-v1.1.1.md\` (\`aa139604a306ad6f3560d93decd3ca39232cd60d79833141222c1b9e7e56f756\`)
- \`artifacts/phase-32/stage-32.4/vision-extraction-provenance.md\` (\`28c490d6ea4ecd57c60b8a97085559b962cc9667fa284def855aab3458304a2c\`)
- \`artifacts/phase-32/stage-32.4/reconciliation-addendum.md\` (\`8fc3118ddf8aa20f90d543980f4d1520f195fda681c3e929368cbe71254fc622\`)
- \`artifacts/phase-32/stage-32.4/system-characterization-and-lineage-reconciliation.md\` (\`a043f5ede038dc0182fdd8a203f3db866115112b45408bcb27e4ad203711cb98\`)
- \`artifacts/phase-32/stage-32.4/benchmark-specification-v1.2.0-proposal.md\` (\`0625f49ee3ff2e3d84bf0f3277a723f59563f85c6e377b858a4e45e324876dcb\`)
- \`artifacts/phase-32/stage-32.4/ffmpeg-drawbox-preflight-investigation.md\` (\`a70a56b13caba6a527a843caa3c97ded793ea5564e2758bbaf72f1adfed5a7a0\`)
- \`artifacts/phase-32/stage-32.4/worker-specification.md\` (\`32cecfa7e23a2adc9c23c828fddc10e3e973b1b90da5ee85e70e2e62ecaa76a6\`)
- \`artifacts/phase-32/stage-32.4/model-extraction-report.md\` (\`a397024037da1dbe15e6f95f911e18e670e75cc6b25a6006977d6bd4c9bc39fd\`)
- \`artifacts/phase-32/stage-32.4/stage-report.md\` (\`689645f26234c92b0c58871ad064be0c763db0904524e9be35fdcbe74f283618\`)
- \`artifacts/phase-32/stage-32.4/benchmark-recall-results.json\` (\`aa4ff12c07e3f4c5f03072ec91145c1495f3b89600e5e23a2057fd6bf3fe0922\`)

---

### 6. Formal Action Request

The engineering team respectfully requests:
1. **Formal Approval of Benchmark Specification Revision v1.2.0 (Amended)** as detailed above.
2. **Formal Authorization to Proceed with Benchmark v1.2.0 Fixture Generation & Evaluation**:
   - Generate the 12 visually rendered fixtures in \`artifacts/phase-32/stage-32.4/benchmark-v1.2.0/\` under the approved \`overlay\` mechanism.
   - Calibrate the pixel segmentation extractor in \`vision-worker-bridge.py\` against the 8 development fixtures.
   - Freeze the implementation and evaluate once against the 4 held-out fixtures.
   - Report TP, FN, FP, recall (at $\\text{IoU} \\ge 0.50$), and FAR across all scenarios and partitions for final unconditional certification of Stage 32.4.`;

  console.log('2. Writing reconciliation prompt to scratch/stage32-4-fifth-reconciliation-prompt.txt...');
  fs.mkdirSync(path.resolve('scratch'), { recursive: true });
  fs.writeFileSync(path.resolve('scratch/stage32-4-fifth-reconciliation-prompt.txt'), promptText, 'utf8');

  console.log('3. Injecting Stage 32.4 Fifth Reconciliation Dossier into [aria-label="Ask ChatGPT"] composer...');
  const injectRes = runOsa(`(() => {
    const el = document.querySelector("div[contenteditable='true'][aria-label='Ask ChatGPT']");
    if (!el) return JSON.stringify({ error: "NO_COMPOSER" });

    el.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.addRange(range);
    document.execCommand("delete", false);
    const ok = document.execCommand("insertText", false, ${JSON.stringify(promptText)});

    const form = el.closest("form") || el.closest("[data-composer-body]") || el.parentElement.parentElement.parentElement;
    const sendBtn = form ? form.querySelector("button[aria-label='Send'], button[data-testid*='send']") : null;

    return JSON.stringify({
      success: ok,
      length: el.innerText.length,
      hasSendBtn: !!sendBtn,
      sendAria: sendBtn ? sendBtn.getAttribute("aria-label") : null
    });
  })()`);
  console.log('   Injection result:', injectRes);

  let parsedInj = {};
  try {
    parsedInj = JSON.parse(injectRes);
  } catch (e) {
    console.error('Failed to parse injection response:', injectRes);
    process.exit(1);
  }

  if (!parsedInj.success || parsedInj.length < 500) {
    console.error('Composer injection did not succeed:', parsedInj);
    process.exit(1);
  }

  console.log('4. Waiting 1 second and clicking Send button...');
  await sleep(1000);

  let clickedSend = false;
  for (let b = 0; b < 10; b++) {
    const sendRes = runOsa(`(() => {
      const btn = document.querySelector('button[aria-label="Send"], button[data-testid="send-button"]');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Ruling on Amended Benchmark v1.2.0...');
  let completed = false;
  let finalMarkdown = '';

  await sleep(6000);

  for (let attempt = 0; attempt < 120; attempt++) {
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
      console.log(`   [Attempt ${attempt + 1}/120] Waiting for JSON response...`);
      continue;
    }

    console.log(`   [Attempt ${attempt + 1}/120] Generating: ${parsed.isGenerating}, Length: ${parsed.len}`);

    if (!parsed.isGenerating && parsed.len > 150) {
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

  const outPath = path.resolve('plans/CHATGPT_STAGE32_4_FINAL_CERTIFICATION.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\n✔ Architecture Lead Stage 32.4 Ruling saved to: ${outPath}`);
  console.log('\n========================================================================');
  console.log(finalMarkdown);
  console.log('========================================================================\n');
}

main().catch(err => {
  console.error('Fatal error in Ezra bridge script:', err);
  process.exit(1);
});
