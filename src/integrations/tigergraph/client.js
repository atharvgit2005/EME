// REST++ adapter. Credentials stay in this process; no admin/schema endpoint is exposed.
const { digest } = require("../../creative/execution-record.js");
function failure(message) {
  return Object.assign(Error("ERR_TIGERGRAPH: " + message), {
    code: "ERR_TIGERGRAPH",
  });
}
function configuration(env = process.env) {
  if (!env.EME_TIGERGRAPH_URL)
    return { enabled: false, state: "not_configured" };
  try {
    const url = new URL(env.EME_TIGERGRAPH_URL);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
    )
      throw Error(
        "Use an HTTPS REST++ base URL, or HTTP on loopback, without embedded credentials or query parameters.",
      );
    const graph = env.EME_TIGERGRAPH_GRAPH || "EME";
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(graph))
      throw Error("Use a valid graph identifier.");
    const token = env.EME_TIGERGRAPH_TOKEN || "";
    const secret = env.EME_TIGERGRAPH_SECRET || "";
    if (token && secret)
      throw Error(
        "Set either EME_TIGERGRAPH_TOKEN or EME_TIGERGRAPH_SECRET, not both.",
      );
    if (
      (!loopback && !token && !secret) ||
      [token, secret].some((v) => typeof v !== "string" || /[\x00\r\n]/.test(v))
    )
      throw Error(
        "Set a valid TigerGraph bearer token or database secret for the remote instance.",
      );
    const timeoutMs = Number(env.EME_TIGERGRAPH_TIMEOUT_MS || 8000);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 30000)
      throw Error("Timeout must be 500–30000 milliseconds.");
    const namespace = env.EME_TIGERGRAPH_NAMESPACE || "";
    if (namespace && !/^[A-Za-z0-9_-]{1,64}$/.test(namespace))
      throw Error(
        "Namespace must use 1–64 letters, numbers, underscores or hyphens.",
      );
    return {
      enabled: true,
      state: "configured",
      baseUrl: url.href.replace(/\/+$/, "") + "/",
      graph,
      token,
      secret,
      timeoutMs,
      namespace,
    };
  } catch (e) {
    // URL parse errors can contain the supplied URL and embedded secrets.
    const message =
      e instanceof TypeError ? "Use a valid REST++ base URL." : e.message;
    return { enabled: false, state: "configuration_error", message };
  }
}
class TigerGraphClient {
  constructor(config, fetchImpl = fetch) {
    this.config = config;
    this.fetch = fetchImpl;
  }
  get target() {
    return digest({ url: this.config.baseUrl, graph: this.config.graph });
  }
  async request(parts, { method = "GET", query = {}, body } = {}) {
    const url = new URL(
      parts.map(encodeURIComponent).join("/"),
      this.config.baseUrl,
    );
    for (const [key, value] of Object.entries(query))
      url.searchParams.set(key, String(value));
    let response;
    try {
      response = await this.fetch(url, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(this.config.timeoutMs),
        headers: {
          Accept: "application/json",
          ...(this.config.secret
            ? { Authorization: "GSQL-Secret " + this.config.secret }
            : this.config.token
              ? { Authorization: "Bearer " + this.config.token }
              : {}),
          ...(body
            ? {
                "Content-Type": "application/json",
                "gsql-atomic-level": "atomic",
              }
            : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw failure(
          `Request failed (HTTP ${response.status}). Check the endpoint, schema and graph privileges.`,
        );
      }
      const chunks = [];
      let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > 4 * 1024 * 1024)
          throw failure("Response exceeded the four-megabyte limit.");
        chunks.push(chunk);
      }
      const data = JSON.parse(Buffer.concat(chunks).toString());
      if (data.error !== false || !Array.isArray(data.results))
        throw failure(
          "The server rejected the request or returned an unsupported response. Check the schema and graph privileges.",
        );
      return data.results;
    } catch (e) {
      if (e.code === "ERR_TIGERGRAPH") throw e;
      throw failure(
        "Connection failed, timed out or returned invalid JSON. Local editing is still available.",
      );
    }
  }
  async upsert(body) {
    const rows = await this.request(["graph", this.config.graph], {
      method: "POST",
      query: { ack: "all" },
      body,
    });
    if (
      rows.some(
        (r) => Number(r.skipped_vertices || 0) || Number(r.skipped_edges || 0),
      )
    )
      throw failure(
        "The server skipped graph records; sync was not acknowledged.",
      );
    const expectedVertices = Object.values(body.vertices || {}).reduce(
      (n, entries) => n + Object.keys(entries).length,
      0,
    );
    const expectedEdges = Object.values(body.edges || {}).reduce(
      (n, byId) =>
        n +
        Object.values(byId).reduce(
          (n, byType) =>
            n +
            Object.values(byType).reduce(
              (n, byTarget) =>
                n +
                Object.values(byTarget).reduce(
                  (n, entries) => n + Object.keys(entries).length,
                  0,
                ),
              0,
            ),
          0,
        ),
      0,
    );
    if (
      rows.reduce((n, r) => n + (Number(r.accepted_vertices) || 0), 0) <
        expectedVertices ||
      rows.reduce((n, r) => n + (Number(r.accepted_edges) || 0), 0) <
        expectedEdges
    )
      throw failure("The server did not acknowledge all graph records.");
    return rows;
  }
  async vertex(type, id) {
    const rows = await this.request([
      "graph",
      this.config.graph,
      "vertices",
      type,
      id,
    ]);
    if (rows.length !== 1 || rows[0].v_type !== type || rows[0].v_id !== id)
      throw failure(
        "The requested graph record is missing or has an unexpected identity.",
      );
    return rows[0];
  }
  edges(type, id, edgeType, targetType, query) {
    return this.request(
      ["graph", this.config.graph, "edges", type, id, edgeType, targetType],
      { query },
    );
  }
}
module.exports = { configuration, TigerGraphClient, failure };
