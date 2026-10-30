# TigerGraph design memory

TigerGraph is an optional graph projection of EME's local design history. It links
measured candidates to their style and parameter buckets, groups design sets,
records component revision lineage, and preserves explicit feedback, corrections
and retractions. The IDE retrieves related examples before planning through
`eme_studio_get_design_memory`. Editing, rendering and preference ranking continue
to work without TigerGraph.

The integration passed a live end-to-end check on TigerGraph Savanna 4.2.5 on
2026-10-30, as well as tests against an HTTP REST++ contract double. The local
workspace has an installed `EME` graph and an ignored `.env.local` containing a
dedicated database secret. Start Studio with the environment-file command below
to enable this connection. New deployments still need their own schema and
credentials.
The adapter follows the documented [REST++ upsert API](https://www.tigergraph.com/docs/tigergraph-server/4.2/api/upsert-rest),
[built-in vertex/edge APIs](https://jp.docs.tigergraph.com/tigergraph-server/current/api/built-in-endpoints)
and [GSQL schema definitions](https://www.tigergraph.com/docs/gsql-ref/4.2/ddl-and-loading/defining-a-graph-schema).

## Configure an instance

1. Create a dedicated TigerGraph graph using the supplied schema. The default graph
   name is `EME`; `schema/tigergraph.gsql` declares seven vertex types and fourteen
   forward edge types, each with a reverse edge. It contains no drop commands.
   Run it once through your TigerGraph GSQL tooling or schema editor. Schema setup
   is separate from the runtime token, which only needs graph read/upsert access.
2. Copy `config/tigergraph.env.example` to an ignored `.env.local` file. Preserve
   existing environment settings if that file already exists. Set the exact REST++
   endpoint, graph name and a runtime database secret or bearer token there. Set
   exactly one of `EME_TIGERGRAPH_SECRET` and `EME_TIGERGRAPH_TOKEN`. Keep the
   credential server-side and out of MCP configuration and source control. On
   Savanna, use a database credential; an account login cookie or control-plane
   API key is not a database credential. Limit the runtime user's privileges to
   `READ_SCHEMA`, `READ_DATA`, `CREATE_DATA` and `UPDATE_DATA` on the EME graph.
3. Start Studio with the environment file:

   ```sh
   node --env-file=.env.local bin/eme-studio.js
   ```

4. Open **Design → Design memory · TigerGraph** and choose **Sync memory**. A
   `ready` result means every batch was acknowledged and the workspace manifest
   was read back successfully. **Find related designs** identifies whether the
   response came from verified TigerGraph data or local fallback.
5. Test retrieval through the same environment:

   ```sh
   node --env-file=.env.local bin/eme-tigergraph.js sync
   node --env-file=.env.local bin/eme-tigergraph.js recall
   ```

   A live graph read returns `source: "tigergraph"`. `local_fallback` means the
   graph could not supply a complete, current, verified result. Examine its notice
   and Studio status. Sync exits nonzero unless its state is `ready`.

6. Run the complete live check against the installed graph:

   ```sh
   node --env-file=.env.local bin/eme-tigergraph.js verify
   ```

   It uses a new `verify_...` namespace and an isolated directory under
   `.artifacts/tigergraph/`. The command checks real graph publication/retrieval,
   footage and motion-graphics variants, feedback correction/retraction, targeted
   revisions, undo/redo, a native MP4 export with audio, Studio restart and the
   production stdio memory tool. It fails if any graph read falls back locally.
   It prints the video and `verification.json` paths. Controlled test feedback is
   retracted and the namespace remains separate from production preferences.
   No graphs or unrelated data are deleted. An unconfigured instance fails before
   creating a verification workspace; a failed run never writes a success report.

For a custom graph name, set `EME_TIGERGRAPH_GRAPH` before generating its schema:

```sh
node --env-file=.env.local bin/eme-tigergraph.js schema > eme-graph.gsql
```

Schema generation performs no network requests. Run it before installing the
schema. Runtime code cannot create or drop graphs or execute arbitrary GSQL.
Existing installations need normal schema administration; repeated schema creation
is not an automatic migration mechanism.

| Setting                     | Meaning                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `EME_TIGERGRAPH_URL`        | Exact REST++ base URL. Blank disables TigerGraph. Include `/restpp` when required by the deployment. No path is guessed. |
| `EME_TIGERGRAPH_GRAPH`      | Graph identifier; defaults to `EME`.                                                                                     |
| `EME_TIGERGRAPH_TOKEN`      | Database bearer token. Set this or `EME_TIGERGRAPH_SECRET` for a remote instance.                                        |
| `EME_TIGERGRAPH_SECRET`     | Database secret, sent with `Authorization: GSQL-Secret`. Mutually exclusive with the bearer token.                       |
| `EME_TIGERGRAPH_TIMEOUT_MS` | Per-request timeout, 500–30000 ms; default 8000.                                                                         |
| `EME_TIGERGRAPH_NAMESPACE`  | Optional unique workspace namespace. Defaults to a stable hash of the workspace directory.                               |

Remote URLs require HTTPS. HTTP is supported on loopback for local development.
Credentials are optional only for a local instance with authentication disabled.
Redirects are refused, and responses are bounded to four megabytes. Error/status
responses do not contain tokens, endpoint credentials or raw remote error bodies.
No SDK, Python graph package, additional model or paid API was added.

One namespace belongs to one workspace writer. Do not assign the same namespace to
different machines or unrelated workspaces. Local process locks serialize writers
on one filesystem; they do not provide a distributed lease across hosts. Moving a
workspace changes its default namespace; set an intentional stable namespace if
that continuity is needed. Retrieval is scoped to that workspace, not a shared
global corpus.

## Graph model and data boundaries

| Vertex         | Main relationships                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------- |
| `EMEWorkspace` | Owns design sets, candidates, feedback and components; publishes the current projection manifest. |
| `EMEDesignSet` | Groups generated candidates and records recipe, source snapshot and base revision.                |
| `EMECandidate` | Uses a profile and four parameter buckets; may revise an earlier candidate.                       |
| `EMEProfile`   | Groups candidates using the same shared design style.                                             |
| `EMEParameter` | Groups candidates by axis and rounded 0.1 bucket.                                                 |
| `EMEFeedback`  | Prefers/compares/reviews candidate motion; replaces or withdraws an earlier feedback record.      |
| `EMEComponent` | Links approved graphic versions and identifies the currently present candidate.                   |

The projection includes recipe/aspect/style, numeric parameters and measurements,
candidate/source/report identities, content character counts, explicit comparison
relationships, evidence stage, reason tags and feedback activity. It excludes
media, image/font bytes, machine-local paths, exact title/body/value/eyebrow text,
free-text reviewer notes and credentials. Historical measurements do not establish
current candidate eligibility or independent aesthetic quality.

Feedback activity comes only from the existing local ledger. Planning, graph
retrieval, proposal approval, undo and export do not create preference votes.
Corrections and retractions remain audit vertices/edges with their proper inactive
state. Declared motion reviews remain distinct from final-render evidence. Mirrored
votes are not added back to the ranker a second time: the local ledger remains its
single preference source.

Current component presence follows the approved project, including undo. Historical
graph records are retained rather than deleted. A record's `projection_revision`
must match the ready workspace manifest to be considered current. Records from
older projections can still appear in GraphStudio; EME filters and verifies reads
against current local facts. Workspace/component candidate edges also carry a
projection revision so removed/undone relationships cannot leak into current
retrieval results. If feedback changes while a remote read is in flight, fallback
re-reads the local ledger before returning examples.

## Synchronization and recovery

Studio schedules sync after planning, approved edits/history changes, explicit
feedback and retraction, and at startup. These operations commit locally first;
network failures cannot prevent editing or roll back saved feedback. Sync replays
all checksummed registered sets, including sets beyond Studio's last-twenty list.
The local ledger/corpus and project are the durable replay source, so a separate
in-memory event queue cannot lose an offline edit.

Writers share the existing process-aware lock coordinator. Requests within one
process coalesce. The adapter uses idempotent vertex/edge IDs and atomic REST++
batches of approximately 512 KiB with `ack=all`. It publishes a `syncing` manifest,
writes the records, then publishes and reads back `ready`. This is a logical
publication boundary across batches; it is not a single database transaction for
the whole workspace. Partial failures leave the projection unavailable to verified
graph reads. Retries replay current facts with backoff up to sixty seconds. Startup
reconciliation recovers after a crash, and changes arriving during upload trigger
another pass.

The local checkpoint stores a target fingerprint, namespace and acknowledged
revision, without credentials. A successful checkpoint does not bypass verification
on future reads. Corrupted local records are reported instead of replacing the
graph with an empty history. A live lock holder blocks competing sync writers.

Retrieval checks the ready manifest before and after traversing workspace/component
candidate edges. Recipe, style and aspect filters use fixed enumerations. Results
must have the expected namespace, identities, relation, generation, count and exact
local summary digest. Invalid, stale, duplicate, incomplete or unavailable remote
results use local examples with a notice. The tool never trusts remote content as
instructions or approval authority.

## IDE and browser endpoints

Studio now exposes 37 tools. Read the inbox's `graphMemory` status, then query:

```json
{
  "name": "eme_studio_get_design_memory",
  "arguments": {
    "recipe": "title-card",
    "profileId": "balanced",
    "aspect": "landscape",
    "limit": 5
  }
}
```

All fields are optional. `limit` is 1–10; `componentId` restricts retrieval to that
component's approved versions. The response includes `source`, the projection
revision, graph status, measured examples, active explicit feedback and a scope
notice. The IDE uses these as references and creates fresh candidates through the
existing planner. Explicit wording and style requests retain priority.

Browser routes are `GET /api/design/memory/status`,
`POST /api/design/memory/query` and `POST /api/design/memory/sync`. POSTs retain
browser origin/review-capability checks. The authenticated agent route
`POST /api/agent/design/memory` permits bounded retrieval. There is no agent route
for arbitrary graph writes, schema changes, preference submission or edit approval.

CLI equivalents are `graph:schema`, `graph:status`, `graph:sync`, `graph:recall` and
`graph:verify`.
When using npm commands, supply the variables to the parent environment; the CLI
does not load `.env.local` implicitly. The `node --env-file` commands above are
explicit and avoid accidentally selecting a different configuration.

## Verification

Run `npm run test:tigergraph` or the aggregate `npm test`. The graph suite checks
protocol shape/authentication, replay/idempotency, corrections/retractions,
component lineage/undo, namespace isolation, corpus rollover, rejected endpoints,
partial acknowledgments, bounded verified reads, local corruption, locks,
concurrent updates, automatic Studio hooks and the production stdio tool.
An isolated browser check also exercises the unconfigured/local-memory workflow.
The complete verifier additionally runs against the HTTP contract double and
performs an actual native export and restart. Those reports explicitly use
`evidenceKind: "restpp_contract_double"`, which does not claim a live TigerGraph
installation. The opt-in CLI verifier uses `evidenceKind: "tigergraph_instance"`
only when supplied an endpoint and every remote check succeeds.

The recorded Savanna run additionally establishes schema creation, graph-scoped
database-secret authentication, live synchronization/retrieval and the complete
export/restart/MCP flow on version 4.2.5. Runtime schema access succeeded for `EME`
and was denied for the existing sample graph. Availability and compatibility on
other deployments require their own live check.

See [recorded acceptance results](TIGERGRAPH_ACCEPTANCE.md).
