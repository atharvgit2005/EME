const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const {
  ApprovalAuthority: A,
  durableWrite,
} = require("../creative/approval-authority.js");
const { ExecutionAuthority: X } = require("../creative/execution-authority.js");
const { OperationExecutor: E } = require("../engine/operations.js");
const { digest } = require("../creative/execution-record.js");
const {
  operationPlan,
  importOperations,
  titleOperations,
  error,
  TICKS,
} = require("./plans.js");
const ROOT = path.resolve(__dirname, "../.."),
  PUBLIC = path.join(__dirname, "public");
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "",
      err = "";
    child.stdout.on("data", (d) => {
      out += d;
      if (out.length > 4e6) child.kill();
    });
    child.stderr.on("data", (d) => {
      err = (err + d).slice(-12000);
    });
    const timer = setTimeout(() => child.kill(), 120000);
    child.once("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve(out)
        : reject(error(command + " failed: " + err, 422));
    });
  });
}
function safeCompare(a, b) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    a.length === b.length &&
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
function assertData(value) {
  if (value && typeof value === "object")
    for (const [key, v] of Object.entries(value)) {
      if (["__proto__", "constructor", "prototype"].includes(key))
        throw error("Invalid input property");
      assertData(v);
    }
}
class StudioServer {
  constructor({
    port = 4720,
    root = process.env.EME_STUDIO_ROOT || path.join(ROOT, ".eme/studio"),
  } = {}) {
    this.port = port;
    this.root = path.resolve(root);
    this.approvals = path.join(this.root, "approvals");
    this.projectPath = path.join(this.root, "project.json");
    this.statePath = path.join(this.root, "studio.json");
    fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
    fs.mkdirSync(path.join(this.root, "media"), { recursive: true });
    this.csrf = crypto.randomBytes(32).toString("hex");
    this.agentToken = crypto.randomBytes(32).toString("hex");
    this.busy = false;
    this.worker = null;
    if (fs.existsSync(this.statePath))
      this.state = JSON.parse(fs.readFileSync(this.statePath));
    else
      this.state = {
        media: [],
        messages: [],
        requests: [],
        history: [],
        undo: [],
        redo: [],
        outputs: [],
        executionId: null,
        render: null,
        agentSeen: null,
      };
    if (!fs.existsSync(this.projectPath)) {
      const result = E.execute(
        {},
        {
          type: "create_project",
          params: {
            id: "studio-" + crypto.randomUUID(),
            title: "Untitled project",
            width: 960,
            height: 540,
            fps: { numerator: 30, denominator: 1 },
            durationTicks: 12 * TICKS,
          },
        },
      );
      if (!result.success) throw Error(result.error);
      durableWrite(this.projectPath, result.project);
    }
    if (this.state.render?.status === "RENDERING")
      this.state.render = {
        status: "INTERRUPTED",
        message:
          "The previous render stopped. Your project is safe; export again.",
      };
    this.save();
  }
  project() {
    return JSON.parse(fs.readFileSync(this.projectPath));
  }
  save() {
    durableWrite(this.statePath, this.state);
  }
  message(role, text, extra = {}) {
    this.state.messages.push({
      id: crypto.randomUUID(),
      role,
      text,
      at: new Date().toISOString(),
      ...extra,
    });
    this.save();
  }
  view() {
    const { undo, redo, ...state } = this.state;
    return {
      ...state,
      project: this.project(),
      canUndo: undo.length > 0,
      canRedo: redo.length > 0,
      busy: this.busy,
      agentConnected:
        Date.now() - Date.parse(this.state.agentSeen || 0) < 60000,
    };
  }
  json(res, status, data) {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(data));
  }
  async body(req, limit = 1024 * 1024) {
    let n = 0,
      parts = [];
    for await (const chunk of req) {
      n += chunk.length;
      if (n > limit) throw error("Request is too large", 413);
      parts.push(chunk);
    }
    let body;
    try {
      body = JSON.parse(Buffer.concat(parts).toString() || "{}");
    } catch {
      throw error("Invalid JSON");
    }
    assertData(body);
    return body;
  }
  browserAuth(req) {
    if (
      req.headers.origin !== this.origin ||
      !safeCompare(req.headers["x-eme-review"], this.csrf)
    )
      throw error("Open Studio in this browser and retry.", 403);
  }
  agentAuth(req) {
    if (!safeCompare(req.headers.authorization, "Bearer " + this.agentToken))
      throw error("Agent connection is not authorized", 403);
    this.state.agentSeen = new Date().toISOString();
    this.save();
  }
  assertIdle() {
    if (this.busy)
      throw error("Wait for the current import or render to finish.", 409);
  }
  pending(
    operations,
    {
      summary,
      source = "Quick action",
      requestId = null,
      historyAction = null,
    } = {},
  ) {
    this.assertIdle();
    if (this.state.proposal)
      throw error("Review or dismiss the current proposal first.", 409);
    const project = this.project();
    const allowed = new Set(
      this.state.media.flatMap((m) =>
        [m.path, m.audioAsset?.path].filter(Boolean),
      ),
    );
    for (const op of operations) {
      if (op.type === "add_asset" && !allowed.has(op.params?.src))
        throw error("Only media imported into this workspace can be used.");
      const encoded = JSON.stringify(op.params);
      if (/"(?:path|filePath|mediaPath|render_font|lutId)"\s*:/.test(encoded))
        throw error(
          "This operation contains an unsupported external file reference.",
        );
    }
    const plan = operationPlan(project, operations);
    if (plan.target_duration_ticks > 120 * TICKS)
      throw error("Studio exports are limited to two minutes.");
    const ticket = A.createPendingRequest({
      project,
      projectPath: this.projectPath,
      operationPlan: plan,
      storageDir: this.approvals,
    });
    this.state.proposal = {
      id: ticket.request_id,
      digest: ticket.execution_digest,
      summary,
      source,
      requestId,
      historyAction,
      baseRevision: project.revision,
      operations: plan.operations,
      expires: ticket.expires_at,
    };
    this.message("assistant", summary, {
      source,
      proposalId: ticket.request_id,
    });
    return this.state.proposal;
  }
  historyProposal(action) {
    this.assertIdle();
    if (this.state.proposal)
      throw error("Review or dismiss the current proposal first.", 409);
    const stack = this.state[action];
    if (!stack.length) throw error("There is nothing to " + action + ".");
    const project = this.project();
    const ticket = A.createPendingRequest({
      project,
      projectPath: this.projectPath,
      operation: {
        type: "restore_project_history",
        params: { snapshot: stack.at(-1) },
      },
      storageDir: this.approvals,
    });
    this.state.proposal = {
      id: ticket.request_id,
      digest: ticket.execution_digest,
      summary:
        action === "undo"
          ? "Restore the previous edit."
          : "Reapply the next edit.",
      source: "History",
      historyAction: action,
      baseRevision: project.revision,
      operations: ticket.operation_plan.operations,
      expires: ticket.expires_at,
    };
    this.save();
    return this.state.proposal;
  }
  approve(body) {
    this.assertIdle();
    const p = this.state.proposal;
    if (!p || p.id !== body.id || p.digest !== body.digest)
      throw error(
        "This proposal is no longer current. Review the latest changes.",
        409,
      );
    const before = this.project();
    const issued = A.confirmReviewedExecution({
      requestId: p.id,
      executionDigest: body.digest,
      storageDir: this.approvals,
    });
    const result = X.execute({
      approvalToken: issued.token,
      storageDir: this.approvals,
    });
    if (!result.success) throw error(result.error.message, 409);
    if (p.historyAction) {
      const opposite = p.historyAction === "undo" ? "redo" : "undo";
      this.state[p.historyAction].pop();
      this.state[opposite].push(before);
    } else {
      this.state.undo.push(before);
      this.state.redo = [];
    }
    this.state.undo = this.state.undo.slice(-30);
    this.state.redo = this.state.redo.slice(-30);
    this.state.executionId = result.execution_id;
    this.state.history.push({
      revision: result.revision,
      summary: p.summary,
      at: new Date().toISOString(),
      executionId: result.execution_id,
    });
    const request = this.state.requests.find((r) => r.id === p.requestId);
    if (request) request.status = "APPLIED";
    for (const queued of this.state.requests)
      if (queued.status === "QUEUED" && queued.revision !== result.revision)
        queued.status = "STALE";
    this.state.proposal = null;
    this.message("system", "Applied. Your previous edit is saved in history.");
    return result;
  }
  async mediaFromFile(file, name) {
    const raw = await run("ffprobe", [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      file,
    ]);
    const info = JSON.parse(raw);
    const v = info.streams.find((s) => s.codec_type === "video"),
      a = info.streams.find((s) => s.codec_type === "audio");
    const duration = Number(info.format.duration);
    if (
      (!v && !a) ||
      !Number.isFinite(duration) ||
      duration < 0.1 ||
      duration > 600
    )
      throw error(
        "Use an audio or video file between 0.1 seconds and 10 minutes.",
      );
    if (v && (v.width > 7680 || v.height > 4320))
      throw error("Use footage up to 8K.");
    const id = "media-" + crypto.randomUUID();
    const sha256 = crypto
      .createHash("sha256")
      .update(fs.readFileSync(file))
      .digest("hex");
    const m = {
      id,
      name: name.slice(0, 120),
      path: file,
      type: v ? "video" : "audio",
      width: v?.width || 0,
      height: v?.height || 0,
      duration,
      hasAudio: !!a,
      sha256,
    };
    if (v) {
      m.poster = path.join(this.root, "media", id + ".jpg");
      await run("ffmpeg", [
        "-v",
        "error",
        "-n",
        "-i",
        file,
        "-frames:v",
        "1",
        "-vf",
        "scale=320:-2",
        m.poster,
      ]);
    }
    if (v && a) {
      const audioPath = path.join(this.root, "media", id + "-source-audio.wav");
      await run("ffmpeg", [
        "-v",
        "error",
        "-n",
        "-i",
        file,
        "-vn",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-c:a",
        "pcm_s24le",
        audioPath,
      ]);
      const audioInfo = JSON.parse(
        await run("ffprobe", [
          "-v",
          "error",
          "-show_format",
          "-of",
          "json",
          audioPath,
        ]),
      );
      m.audioAsset = {
        id: id + "-audio",
        path: audioPath,
        duration: Number(audioInfo.format.duration),
        sha256: crypto
          .createHash("sha256")
          .update(fs.readFileSync(audioPath))
          .digest("hex"),
      };
    }
    this.state.media.push(m);
    this.save();
    return m;
  }
  async upload(req, url) {
    this.assertIdle();
    this.busy = true;
    const file = path.join(this.root, "media", crypto.randomUUID() + ".bin");
    let fd;
    try {
      const length = Number(req.headers["content-length"]);
      if (length > 250 * 1024 * 1024)
        throw error("Maximum upload size is 250 MB.", 413);
      fd = fs.openSync(file, "wx", 0o600);
      let total = 0;
      for await (const chunk of req) {
        total += chunk.length;
        if (total > 250 * 1024 * 1024)
          throw error("Maximum upload size is 250 MB.", 413);
        fs.writeSync(fd, chunk);
      }
      fs.closeSync(fd);
      fd = null;
      return await this.mediaFromFile(
        file,
        url.searchParams.get("name") || "Imported media",
      );
    } catch (e) {
      if (fd !== null && fd !== undefined) fs.closeSync(fd);
      if (fs.existsSync(file)) fs.unlinkSync(file);
      throw e;
    } finally {
      this.busy = false;
    }
  }
  async demo() {
    this.assertIdle();
    this.busy = true;
    try {
      const dir = fs.mkdtempSync(path.join(this.root, "media/demo-"));
      await run("python3", [path.join(__dirname, "demo-art.py"), dir]);
      const file = path.join(dir, "Mechanics-in-motion.mp4");
      await run("ffmpeg", [
        "-v",
        "error",
        "-n",
        "-loop",
        "1",
        "-t",
        "4",
        "-i",
        path.join(dir, "scene-0.png"),
        "-loop",
        "1",
        "-t",
        "4",
        "-i",
        path.join(dir, "scene-1.png"),
        "-loop",
        "1",
        "-t",
        "4",
        "-i",
        path.join(dir, "scene-2.png"),
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=220:sample_rate=48000:duration=12",
        "-filter_complex",
        "[0:v][1:v][2:v]concat=n=3:v=1:a=0,format=yuv420p[v];[3:a]volume=0.12[a]",
        "-map",
        "[v]",
        "-map",
        "[a]",
        "-r",
        "30",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-c:a",
        "aac",
        "-t",
        "12",
        "-movflags",
        "+faststart",
        file,
      ]);
      const m = await this.mediaFromFile(
        file,
        "Mechanics in motion · generated demo",
      );
      m.generated = true;
      this.save();
      return m;
    } finally {
      this.busy = false;
    }
  }
  async render() {
    this.assertIdle();
    if (!this.state.executionId) throw error("Apply an edit before exporting.");
    const project = this.project();
    if (!project.clips.some((c) => c.type === "video"))
      throw error("Add footage to the timeline first.");
    if (
      !project.clips.some(
        (c) =>
          c.type === "audio" &&
          !project.tracks.find((t) => t.id === c.trackId)?.muted,
      )
    )
      throw error(
        "Verified exports currently need source audio or a soundtrack. Import an audio file and add it to the timeline.",
      );
    const id = "export-" + crypto.randomUUID(),
      dir = path.join(this.root, "exports", id);
    fs.mkdirSync(dir, { recursive: true });
    const requestPath = path.join(dir, "request.json"),
      resultPath = path.join(dir, "result.json");
    durableWrite(requestPath, {
      storageDir: path.join(this.root, "delivery"),
      approvalDir: this.approvals,
      executionId: this.state.executionId,
      outputDir: dir,
    });
    this.busy = true;
    this.state.render = {
      id,
      status: "RENDERING",
      revision: project.revision,
      startedAt: new Date().toISOString(),
    };
    this.save();
    const child = spawn(
      process.execPath,
      [path.join(__dirname, "render-worker.js"), requestPath, resultPath],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    this.worker = child;
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr = (stderr + d).slice(-3000);
    });
    const finish = () => {
      this.busy = false;
      this.worker = null;
      let result;
      try {
        result = JSON.parse(fs.readFileSync(resultPath));
      } catch {
        result = {
          success: false,
          error: {
            message: stderr || "The render process stopped before completion.",
          },
        };
      }
      if (result.success) {
        this.state.outputs.push({
          id,
          path: result.outputPath,
          sha256: result.sha256,
          revision: project.revision,
          at: new Date().toISOString(),
          qa: result.qa_metrics,
          manifestPath: result.manifestPath,
        });
        this.state.render = {
          id,
          status: "SUCCEEDED",
          revision: project.revision,
        };
        this.message(
          "system",
          "Export ready. Video, audio, and file integrity checks passed.",
        );
      } else {
        this.state.render = {
          id,
          status: "FAILED",
          revision: project.revision,
          message: result.error?.message || "Export failed.",
        };
        this.message(
          "system",
          "Export needs attention. " + this.state.render.message,
        );
      }
      this.save();
    };
    child.once("error", (e) => {
      stderr = e.message;
    });
    child.once("close", finish);
    return this.state.render;
  }
  serveFile(
    req,
    res,
    file,
    { download = false, name = "EME-export.mp4", type } = {},
  ) {
    const size = fs.statSync(file).size;
    let start = 0,
      end = size - 1,
      status = 200;
    if (req.headers.range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!m || (!m[1] && !m[2])) {
        res.writeHead(416, { "Content-Range": `bytes */${size}` });
        return res.end();
      }
      if (!m[1]) {
        start = Math.max(0, size - Number(m[2]));
      } else {
        start = Number(m[1]);
        if (m[2]) end = Math.min(end, Number(m[2]));
      }
      if (!Number.isSafeInteger(start) || start > end || start >= size) {
        res.writeHead(416, { "Content-Range": `bytes */${size}` });
        return res.end();
      }
      status = 206;
    }
    const headers = {
      "Content-Type": type || "video/mp4",
      "Content-Length": end - start + 1,
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
    };
    if (status === 206)
      headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    if (download)
      headers["Content-Disposition"] = 'attachment; filename="' + name + '"';
    res.writeHead(status, headers);
    fs.createReadStream(file, { start, end })
      .on("error", () => res.destroy())
      .pipe(res);
  }
  context() {
    return {
      requests: this.state.requests.filter((r) => r.status === "QUEUED"),
      project: this.project(),
      snapshot: digest(this.project()),
      media: this.state.media,
      instructions:
        "You are the local IDE editing agent. Interpret the queued user request, then call eme_studio_submit_plan with requestId, baseRevision, summary, and exact operations. Never approve or execute a proposal. Ask for clarification through eme_studio_reply if needed. Only use imported media. Preserve everything not requested. Units: 120000 ticks/second; centered transform x/y offsets in canvas pixels. Native text typography keys: text,fontSize,color,textAlign. Use modify_clip for text/style/transform/audio; trim_clip for timing and source trims. Canvas size is fixed. Use set_project_duration {durationTicks} to change export length (maximum 120 seconds); trim every overlapping video, audio, and title clip first when shortening. Source audio is a separate audio clip and needs matching timing edits. Available native effects: invert, brightness/contrast {factor}, blur {radius}. No general transitions or color grades. Place text on a separate visual track above footage; avoid conflicting clips on the same track. You can add source assets from the provided inventory, using their exact paths and sha256.",
      examples: [
        {
          type: "modify_clip",
          params: {
            clipId: "selected-title",
            typography: { text: "New title", color: "#f05b32" },
            transform: { y: 140 },
          },
        },
        {
          type: "trim_clip",
          params: {
            clipId: "selected-clip",
            newDurationTicks: 480000,
            trimInTick: 0,
            trimOutTick: 480000,
          },
        },
      ],
    };
  }
  async handle(req, res) {
    const url = new URL(req.url, this.origin),
      p = url.pathname;
    try {
      if (
        !["127.0.0.1:" + this.port, "localhost:" + this.port].includes(
          req.headers.host,
        )
      )
        throw error("Invalid host", 403);
      if (p.startsWith("/api/agent/")) {
        this.agentAuth(req);
        if (p === "/api/agent/context" && req.method === "GET")
          return this.json(res, 200, this.context());
        if (p === "/api/agent/plan" && req.method === "POST") {
          const b = await this.body(req);
          const request = this.state.requests.find(
            (r) => r.id === b.requestId && r.status === "QUEUED",
          );
          if (!request) throw error("Request is no longer queued.", 409);
          if (
            b.baseRevision !== this.project().revision ||
            request.revision !== b.baseRevision
          )
            throw error(
              "Project changed. Read the latest context and ask the user to resubmit.",
              409,
            );
          if (typeof b.summary !== "string" || !b.summary.trim())
            throw error("Explain the proposed changes.");
          const proposal = this.pending(b.operations, {
            summary: b.summary.slice(0, 1800),
            source: "IDE agent",
            requestId: request.id,
          });
          request.status = "PROPOSED";
          this.save();
          return this.json(res, 200, proposal);
        }
        if (p === "/api/agent/reply" && req.method === "POST") {
          const b = await this.body(req);
          const request = this.state.requests.find(
            (r) => r.id === b.requestId && r.status === "QUEUED",
          );
          if (!request) throw error("Request is no longer queued.", 409);
          if (typeof b.message !== "string" || !b.message.trim())
            throw error("Provide a message.");
          request.status = "NEEDS_CLARIFICATION";
          this.message("assistant", b.message.slice(0, 1800), {
            source: "IDE agent",
          });
          return this.json(res, 200, { success: true });
        }
        throw error("Unknown agent route", 404);
      }
      if (req.method === "POST") this.browserAuth(req);
      if (req.method === "GET" && p === "/api/state")
        return this.json(res, 200, this.view());
      if (req.method === "GET" && p === "/api/connection")
        return this.json(res, 200, {
          command: process.execPath,
          args: [path.join(ROOT, "bin/eme-studio-mcp.js")],
          root: this.root,
          configured: "Local IDE / MCP",
          partner: {
            wispr: "Dictation into the request field; no embedded SDK",
            dodo: process.env.DODO_CHECKOUT_URL
              ? "Checkout configured"
              : "Not configured",
          },
        });
      if (req.method === "POST" && p === "/api/upload")
        return this.json(res, 201, await this.upload(req, url));
      if (req.method === "POST" && p === "/api/demo")
        return this.json(res, 201, await this.demo());
      if (req.method === "POST" && p === "/api/import") {
        const b = await this.body(req);
        const media = this.state.media.find((m) => m.id === b.mediaId);
        if (!media) throw error("Media not found", 404);
        return this.json(
          res,
          200,
          this.pending(importOperations(this.project(), media), {
            summary:
              "Add " +
              media.name +
              " to the timeline. " +
              (media.type === "video"
                ? "Center-crop to the project canvas and preserve available source audio."
                : "Mix it as a soundtrack at 25% volume."),
          }),
        );
      }
      if (req.method === "POST" && p === "/api/title") {
        const b = await this.body(req);
        if (typeof b.text !== "string" || !b.text.trim() || b.text.length > 150)
          throw error("Enter a title up to 150 characters.");
        return this.json(
          res,
          200,
          this.pending(titleOperations(this.project(), b.text), {
            summary: "Set the title to “" + b.text + "”.",
          }),
        );
      }
      if (req.method === "POST" && p === "/api/request") {
        this.assertIdle();
        const b = await this.body(req);
        if (
          typeof b.prompt !== "string" ||
          !b.prompt.trim() ||
          b.prompt.length > 4000
        )
          throw error("Enter an editing request up to 4000 characters.");
        if (!this.project().clips.length)
          throw error("Add footage to the timeline first.");
        if (this.state.proposal)
          throw error(
            "Review or dismiss the current proposal before sending another request.",
            409,
          );
        const request = {
          id: crypto.randomUUID(),
          prompt: b.prompt.trim(),
          selection: b.selection || null,
          revision: this.project().revision,
          status: "QUEUED",
          createdAt: new Date().toISOString(),
        };
        this.state.requests.push(request);
        this.message("user", request.prompt);
        return this.json(res, 202, request);
      }
      if (req.method === "POST" && p === "/api/approve")
        return this.json(res, 200, this.approve(await this.body(req)));
      if (req.method === "POST" && p === "/api/reject") {
        const b = await this.body(req);
        if (this.state.proposal?.id !== b.id)
          throw error("Proposal not found", 404);
        A.rejectPendingRequest({ requestId: b.id, storageDir: this.approvals });
        const request = this.state.requests.find(
          (r) => r.id === this.state.proposal.requestId,
        );
        if (request) request.status = "REJECTED";
        this.state.proposal = null;
        this.message("system", "Proposal dismissed. The project is unchanged.");
        return this.json(res, 200, { success: true });
      }
      if (req.method === "POST" && ["/api/undo", "/api/redo"].includes(p))
        return this.json(res, 200, this.historyProposal(p.slice(5)));
      if (req.method === "POST" && p === "/api/render")
        return this.json(res, 202, await this.render());
      if (req.method === "GET" && p === "/api/project/download") {
        const bytes = Buffer.from(JSON.stringify(this.project(), null, 2));
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Content-Disposition": 'attachment; filename="EME-project.json"',
        });
        return res.end(bytes);
      }
      if (req.method === "GET" && p === "/api/billing") {
        const target = process.env.DODO_CHECKOUT_URL;
        if (!target)
          return this.json(res, 503, {
            error: "Dodo checkout is not configured for this local demo.",
          });
        const parsed = new URL(target);
        if (
          parsed.protocol !== "https:" ||
          !/(^|\.)dodopayments\.com$/.test(parsed.hostname)
        )
          throw error("Invalid checkout configuration", 503);
        res.writeHead(303, { Location: target });
        return res.end();
      }
      if (req.method === "GET" && p.startsWith("/api/media/")) {
        const id = p.slice(11),
          m = this.state.media.find((m) => m.id === id),
          o = this.state.outputs.find((o) => o.id === id);
        if (!m && !o) throw error("Media not found", 404);
        const poster = url.searchParams.has("poster");
        const file = poster ? m?.poster : m?.path || o.path;
        if (!file || !fs.existsSync(file))
          throw error("Media unavailable", 404);
        return this.serveFile(req, res, file, {
          download: url.searchParams.has("download"),
          name: `EME-revision-${o?.revision || 0}.mp4`,
          type: poster
            ? "image/jpeg"
            : m?.type === "audio"
              ? "audio/mpeg"
              : "video/mp4",
        });
      }
      if (req.method === "GET" && ["/", "/app.js", "/style.css"].includes(p)) {
        let content = fs.readFileSync(
          path.join(PUBLIC, p === "/" ? "index.html" : p.slice(1)),
        );
        if (p === "/")
          content = Buffer.from(
            content.toString().replace("__REVIEW_TOKEN__", this.csrf),
          );
        res.writeHead(200, {
          "Content-Type":
            p === "/"
              ? "text/html; charset=utf-8"
              : p.endsWith(".js")
                ? "text/javascript"
                : "text/css",
          "Cache-Control": "no-store",
          "Content-Security-Policy":
            "default-src 'self'; img-src 'self' data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
          "X-Content-Type-Options": "nosniff",
        });
        return res.end(content);
      }
      throw error("Not found", 404);
    } catch (e) {
      if (!res.headersSent)
        this.json(res, e.status || 400, {
          error: e.message,
          code: e.code || null,
        });
      else res.destroy();
    }
  }
  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handle(req, res));
      this.server.once("error", reject);
      this.server.listen(this.port, "127.0.0.1", () => {
        this.port = this.server.address().port;
        this.origin = "http://127.0.0.1:" + this.port;
        durableWrite(path.join(this.root, "connection.json"), {
          url: this.origin,
          token: this.agentToken,
        });
        resolve(this);
      });
    });
  }
  close() {
    this.worker?.kill();
    return new Promise((resolve) => this.server.close(resolve));
  }
}
module.exports = { StudioServer, run };
