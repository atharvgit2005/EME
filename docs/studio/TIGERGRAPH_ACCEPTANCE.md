# TigerGraph integration acceptance — 2026-10-30

`npm test` passed 261 tests: 165 bounded engine checks, seven Studio, fourteen
scene, five protected-title placement, twenty editor/waveform, thirty-four
design/ranking/revision and sixteen TigerGraph checks. Contract and portable-input
verification also exited zero. The latest aggregate output is retained under
ignored `.artifacts/tigergraph/neo-full-test-output.txt`.

The TigerGraph suite exercises the real HTTP adapter against a strict REST++
contract double. It checks configuration/authentication, bounded and verified
retrieval, idempotent replay, namespace isolation, full-corpus recovery,
correction/retraction, request and browser authority, component lineage, undo,
partial acknowledgments, corruption, live writer locks and concurrent changes.
Two additional race checks ensure that removed component relationships are filtered
by projection revision and that a retraction arriving during a remote request is
absent from the refreshed local fallback.
The database-secret test verifies `GSQL-Secret` authentication, rejects mixed
secret/token settings and header injection, and checks that neither cookies nor
credentials appear in runtime status.

The complete verification pipeline ran against that same contract double. It
generated footage/artwork/audio, planned and applied lower-third and title-card
variants, synchronized them, saved/corrected/retracted controlled comparisons,
revised both components, verified graph lineage, performed undo/redo, exported a
native MP4 with verified audio, restarted Studio and retrieved graph memory through
the production stdio tool. The report has `evidenceKind: "restpp_contract_double"`.
All controlled preferences were retracted; no human aesthetic acceptance is claimed.

The aggregate run's retained example is
`.artifacts/tigergraph/e2e-contract-6e4bcf9f-9ca5-4b4e-892d-a5ad7f748316/verification.json`.
Its `delivery` links the actual rendered MP4 and native delivery evidence. The live
CLI command is `node --env-file=.env.local bin/eme-tigergraph.js verify`; it refuses
unconfigured endpoints and fails if graph reads fall back locally.

The complete pipeline also passed against the user's existing active Savanna
4.2.5 workspace, `MyWorkspace`. GSQL installed a separate `EME` graph with seven
vertex types and fourteen forward edges plus their reverses. The existing
`Transaction_Fraud` graph was preserved. A dedicated runtime user has only
`READ_SCHEMA`, `READ_DATA`, `CREATE_DATA` and `UPDATE_DATA` on `EME` through the
`eme_memory_writer` role. A database secret authenticated direct database requests;
schema access returned HTTP 200 for `EME` and HTTP 403 for the sample graph.

Live evidence is retained at
`.artifacts/tigergraph/live-1a6e68ec-ee8e-4f37-a665-09e8a2ccd9e3/verification.json`,
with `success: true` and `evidenceKind: "tigergraph_instance"`. All seven stages
passed, including three related graph examples, zero active controlled feedback
after correction/retraction, component lineage and undo/redo, a native H.264/AAC
MP4 with verified audio, restart and production MCP retrieval with
`source: "tigergraph"`. The video is linked from the report's `delivery` object.
Cloud schema/role and isolation evidence are in `cloud-setup-proof.json` and
`runtime-access-proof.json` alongside the report directories.

The main Studio workspace was synchronized and its CLI retrieval returned
`source: "tigergraph"`. It currently has no registered design examples. A browser
check at `http://127.0.0.1:4720` showed **TigerGraph: ready** and completed retrieval;
the screenshot is `.artifacts/tigergraph/studio-live-memory.png`. These checks did
not add test designs or preferences to the main project.

The ignored `.env.local` stores the dedicated database secret with file mode 0600.
Start Studio using `node --env-file=.env.local bin/eme-studio.js`; the IDE uses the
normal Studio MCP configuration and does not receive the database credential.
The supplied account session was used only for setup and is not persisted in EME.
The temporary database password file was removed. No new cloud infrastructure,
billing changes or Community image download was needed. This run establishes
compatibility with 4.2.5; other versions and deployments need their own live check.

No credentials were added to source files. The isolated checks did not change the
user's active project. See [setup, data model and live verification](TIGERGRAPH.md).

The subsequent real editing session added the explicit Neobrutalism profile and
verified three measured title/spacing variants on the active project. The IDE
retrieved all three from live TigerGraph memory. The CLI helper now permits the
design, ranking and memory tools already exposed by Studio MCP. The new regression
checks measured footprint and readability for footage and portrait-card variants.
The user requested this style; that request did not fabricate a comparison vote.
The human preference comparison remains pending.
