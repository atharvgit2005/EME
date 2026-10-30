// Opt-in live end-to-end check. Uses an isolated namespace and generated media.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { configuration, failure } = require("./client.js");
const { digest } = require("../../creative/execution-record.js");
function ensure(condition, message) {
  if (!condition) throw failure(message);
}
async function stdioMemory(root, query) {
  const child = spawn(
    process.execPath,
    [path.resolve(__dirname, "../../..", "bin/eme-studio-mcp.js")],
    {
      env: { ...process.env, EME_STUDIO_ROOT: root },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(failure("Production MCP retrieval timed out."));
    }, 30000);
    child.once("error", () => {
      clearTimeout(timer);
      reject(failure("Production MCP process could not start."));
    });
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const end = buffer.indexOf("\n");
      if (end < 0) return;
      clearTimeout(timer);
      child.kill();
      try {
        const response = JSON.parse(buffer.slice(0, end));
        ensure(
          !response.error && !response.result?.isError,
          "Production MCP memory tool failed.",
        );
        resolve(JSON.parse(response.result.content[0].text));
      } catch (e) {
        reject(e);
      }
    });
    child.once("exit", (code, signal) => {
      if (!buffer && !signal) {
        clearTimeout(timer);
        reject(failure("Production MCP process exited before answering."));
      }
    });
    child.stdin.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "eme_studio_get_design_memory", arguments: query },
      }) + "\n",
    );
  });
}
async function verifyGraphIntegration({
  env = process.env,
  outputDir,
  render = true,
  evidenceKind = "tigergraph_instance",
  progress = () => {},
} = {}) {
  const config = configuration(env);
  ensure(
    config.enabled,
    config.message ||
      "Configure EME_TIGERGRAPH_URL and install the EME schema before running a live verification.",
  );
  const root = path.resolve(
    outputDir ||
      path.join(
        __dirname,
        "../../..",
        ".artifacts/tigergraph",
        "live-" + crypto.randomUUID(),
      ),
  );
  fs.mkdirSync(path.dirname(root), { recursive: true });
  fs.mkdirSync(root, { mode: 0o700 }); // Never overwrite an existing workspace.
  const namespace = "verify_" + crypto.randomUUID().replaceAll("-", "");
  const isolatedEnv = { ...env, EME_TIGERGRAPH_NAMESPACE: namespace };
  // Lazy import avoids a cycle: Studio owns DesignMemory and this verifier owns a Studio fixture.
  const { StudioServer } = require("../../studio/server.js");
  const { importOperations } = require("../../studio/plans.js");
  let server, report, csrf;
  const stages = [],
    records = [];
  function stage(name, facts = {}) {
    stages.push({ name, ...facts });
    progress({ stage: name, ...facts });
  }
  const approve = (proposal) => {
    const result = server.approve({ id: proposal.id, digest: proposal.digest });
    ensure(result.success, "Controlled fixture approval failed.");
  };
  const apply = (set, candidate) =>
    approve(
      server.proposeDesign({
        baseRevision: set.baseRevision,
        setId: set.id,
        candidateId: candidate.id,
      }),
    );
  const ready = async () => {
    let lastStatus;
    for (let attempt = 0; attempt < 4; attempt++) {
      const status = await server.designMemory.sync();
      lastStatus = status;
      if (
        status.state === "ready" &&
        status.lastSyncedRevision === server.designMemory.snapshot().revision
      )
        return status;
      // Restart can expose an expired keep-alive connection. Reconcile idempotently.
      if (attempt < 3)
        await new Promise((resolve) =>
          setTimeout(resolve, 250 * (attempt + 1)),
        );
    }
    throw failure(
      "Live sync did not reach a stable graph revision. Install the EME schema and check the endpoint/token privileges. " +
        (lastStatus?.message || ""),
    );
  };
  const post = async (route, body) => {
    const response = await fetch(server.origin + "/api/" + route, {
      method: "POST",
      headers: {
        Origin: server.origin,
        "X-EME-Review": csrf,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    ensure(
      response.ok,
      "Controlled Studio browser route failed (HTTP " + response.status + ").",
    );
    return response.json();
  };
  const recall = async (query = {}) => {
    const result = await post("design/memory/query", query);
    ensure(
      result.source === "tigergraph",
      "The live verification received local fallback instead of a verified TigerGraph read. " +
        result.notice,
    );
    return result;
  };
  try {
    server = await new StudioServer({
      root,
      port: 0,
      tigergraphEnv: isolatedEnv,
    }).start();
    const html = await (await fetch(server.origin)).text();
    csrf = /name="eme-review" content="([a-f0-9]+)"/.exec(html)?.[1];
    ensure(csrf, "Studio browser review capability was unavailable.");
    await ready();
    stage("live_connection_and_workspace_manifest");
    const media = await server.demo();
    approve(
      server.pending(importOperations(server.project(), media), {
        summary:
          "Controlled TigerGraph verification: generated artwork and tone.",
      }),
    );
    const videoClipId = server
      .project()
      .clips.find((c) => c.type === "video").id;
    const components = [];
    for (const brief of [
      {
        recipe: "lower-third",
        title: "Made to move",
        eyebrow: "GRAPH VERIFICATION",
        videoClipId,
        startTick: 0,
        durationTicks: 720000,
      },
      {
        recipe: "title-card",
        title: "Ideas in motion",
        body: "Measured. Composed. Reviewed.",
        startTick: 720000,
        durationTicks: 720000,
      },
    ]) {
      const set = server.planDesign({
        baseRevision: server.project().revision,
        brief: {
          ...brief,
          profiles: ["balanced"],
          variationMode: "parameters",
          variationAxes: ["titleScale", "motionScale"],
        },
      });
      const candidate = set.candidates.find((c) => c.variantId === "requested");
      ensure(candidate, "The requested controlled design did not fit.");
      apply(set, candidate);
      const clip = server
        .project()
        .clips.find(
          (c) =>
            server.project().assets.find((a) => a.id === c.source?.assetId)
              ?.metadata?.design?.candidateId === candidate.id,
        );
      components.push({
        clipId: clip.id,
        before: server.designComponent(clip.id),
        set,
      });
    }
    await ready();
    const initial = await recall({
      recipe: "title-card",
      profileId: "balanced",
      limit: 3,
    });
    ensure(
      initial.examples.length === 3,
      "The live graph did not return all expected within-style variants.",
    );
    stage("measured_footage_and_graphics_memory", {
      examples: initial.examples.length,
    });
    const set = components[1].set,
      requested = set.candidates.find((c) => c.variantId === "requested"),
      larger = set.candidates.find((c) => c.variantId === "titleScale");
    ensure(larger, "The controlled larger-title alternative did not fit.");
    const beforeFeedback = digest(server.project());
    const submit = async (preferred, compared) => {
      const result = await post("design/feedback", {
        submissionId: crypto.randomUUID(),
        setId: set.id,
        preferredCandidateId: preferred.id,
        comparedCandidateIds: [compared.id],
        note: "Automated live integration fixture in an isolated verify namespace; not human aesthetic evidence.",
      });
      records.push(result.feedback.id);
      return result.feedback;
    };
    const first = await submit(larger, requested);
    await ready();
    const learned = await recall({ recipe: "title-card", limit: 3 });
    ensure(
      learned.examples.some((e) =>
        e.feedback.some((f) => f.feedbackId === first.id && f.preferred),
      ),
      "Preferred candidate evidence was not recalled from the live graph.",
    );
    const correction = await submit(requested, larger);
    await ready();
    const corrected = await recall({ recipe: "title-card", limit: 3 });
    ensure(
      correction.replacesId === first.id &&
        corrected.examples.every((e) =>
          e.feedback.every((f) => f.feedbackId !== first.id),
        ),
      "Superseded feedback retained active graph influence.",
    );
    await post("design/feedback/withdraw", {
      submissionId: crypto.randomUUID(),
      feedbackId: correction.id,
    });
    await ready();
    ensure(
      (await recall({ recipe: "title-card", limit: 3 })).examples.every(
        (e) => !e.feedback.length,
      ),
      "Retracted feedback retained active graph influence.",
    );
    ensure(
      digest(server.project()) === beforeFeedback,
      "Feedback altered the controlled project.",
    );
    stage("explicit_feedback_correction_and_retraction", {
      activeFeedback: server.designFeedback.history().activeCount,
    });
    for (const component of components) {
      const revision = server.reviseDesign({
        baseRevision: server.project().revision,
        clipId: component.clipId,
        changes: { adjustments: { typography: "larger", motion: "less" } },
        explore: true,
      });
      const selected = revision.candidates.find(
        (c) => c.variantId === "requested",
      );
      ensure(selected, "The requested controlled revision did not fit.");
      apply(revision, selected);
      component.after = server.designComponent(component.clipId);
      await ready();
      const history = await recall({
        componentId: component.clipId,
        limit: 10,
      });
      ensure(
        history.examples.some(
          (e) =>
            e.candidateId === selected.id &&
            e.previousCandidateId === component.before.candidateId,
        ),
        "Component revision lineage was absent from the live graph.",
      );
      ensure(
        component.after.measurements.titleFontPx >
          component.before.measurements.titleFontPx &&
          component.after.measurements.travel <
            component.before.measurements.travel,
        "The controlled revision did not measurably change title size and motion.",
      );
    }
    stage("component_revisions_and_graph_lineage");
    approve(server.historyProposal("undo"));
    await ready();
    ensure(
      server.designComponent(components[1].clipId).candidateId ===
        components[1].before.candidateId,
      "Undo failed to restore the controlled component.",
    );
    ensure(
      (
        await recall({ componentId: components[1].clipId, limit: 10 })
      ).examples.every(
        (e) => e.candidateId !== components[1].after.candidateId,
      ),
      "Undo left an old component relation in the published projection.",
    );
    approve(server.historyProposal("redo"));
    await ready();
    stage("undo_redo_reconciliation");
    let delivery = null;
    if (render) {
      delivery =
        new (require("../../prompt-core/native-delivery.js").NativeDelivery)({
          storageDir: path.join(root, "delivery"),
          approvalDir: server.approvals,
        }).run({
          executionId: server.state.executionId,
          outputDir: path.join(root, "export"),
        });
      ensure(
        delivery.success,
        "The controlled native export failed final-media verification.",
      );
      stage("native_export_with_audio", { outputPath: delivery.outputPath });
    }
    await server.close();
    server = null;
    server = await new StudioServer({
      root,
      port: 0,
      tigergraphEnv: isolatedEnv,
    }).start();
    await ready();
    const mcp = await stdioMemory(root, {
      recipe: "title-card",
      profileId: "balanced",
      limit: 3,
    });
    ensure(
      mcp.source === "tigergraph" && mcp.examples.length === 3,
      "Production stdio did not retrieve the restarted live graph memory.",
    );
    stage("restart_and_production_stdio_retrieval", { source: mcp.source });
    ensure(
      server.designFeedback.history().activeCount === 0,
      "Controlled preference labels were not completely retracted.",
    );
    report = {
      kind: "tigergraph-integration-verification",
      evidenceKind,
      success: true,
      workspaceId: server.designMemory.workspaceId,
      schemaVersion: server.designMemory.status().schemaVersion,
      graphRevision: server.designMemory.snapshot().revision,
      fixture:
        "Generated artwork/tone and controlled comparisons; no human aesthetic evidence. Separate verify namespace; zero active feedback.",
      stages,
      components: components.map(({ clipId, before, after }) => ({
        clipId,
        before,
        after,
      })),
      delivery,
    };
    fs.writeFileSync(
      path.join(root, "verification.json"),
      JSON.stringify(report, null, 2) + "\n",
      { mode: 0o600 },
    );
    return {
      success: true,
      root,
      reportPath: path.join(root, "verification.json"),
      outputPath: delivery?.outputPath || null,
      stages,
    };
  } finally {
    if (server) {
      // Clean up controlled labels even if a later stage fails. Never delete the graph/schema.
      for (const event of server.designFeedback
        .history()
        .records.filter((r) => r.active && records.includes(r.id))) {
        server.designFeedback.withdraw({
          submissionId: crypto.randomUUID(),
          feedbackId: event.id,
        });
      }
      if (records.length) await server.designMemory.sync();
      await server.close();
    }
    if (!report)
      fs.writeFileSync(
        path.join(root, "verification.json"),
        JSON.stringify(
          {
            kind: "tigergraph-integration-verification",
            evidenceKind,
            success: false,
            stages,
            message:
              "Live verification did not finish. No successful end-to-end result is claimed.",
          },
          null,
          2,
        ) + "\n",
        { mode: 0o600 },
      );
  }
}
module.exports = { verifyGraphIntegration };
