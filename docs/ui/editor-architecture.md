# Architecture of the EME Visual Control Surface

## 1. Core Design Philosophy
The Visual Control Surface is not a separate video editor that happens to export video; it is a direct visual control surface for the **Editing Mechanics Engine (EME)**. Both human operators in the browser interface and AI agents operating via the Model Context Protocol (MCP) interact with the exact same canonical project schema (`schema/eme-project.v1.schema.json`) and execute the exact same atomic operation catalog (`OperationExecutor`).

```
+------------------------------------+        +-----------------------------------+
|     Autonomous AI Agent (Antigravity)    |        |        Human Operator (Browser UI)        |
+------------------------------------+        +-----------------------------------+
                  |                                             |
                  | (Model Context Protocol / stdio)            | (HTTP / JSON-RPC / REST)
                  v                                             v
+---------------------------------------------------------------------------------+
|                        Editing Mechanics Engine (EME) Core                       |
|                                                                                 |
|  - Integer Timebase Engine (120,000 ticks/sec, half-open intervals)            |
|  - Atomic Operation Executor (OperationExecutor with transactional rollback)     |
|  - Canonical Project Validator (Strict JSON Schema + semantic invariants)        |
|  - Security Sandbox & Path Boundary Guard (assertSafePath)                       |
+---------------------------------------------------------------------------------+
                                      |
                     +----------------+----------------+
                     |                                 |
                     v                                 v
+-----------------------------------+   +------------------------------------+
| HyperFrames Compiler & Renderer    |   | Quality Assurance Engine (VQA)     |
| (Headless Chrome / 60fps MP4)     |   | (Safe bounds, audio, clipping)     |
+-----------------------------------+   +------------------------------------+
```

## 2. Server Architecture (`src/ui/server.js`)
The editor backend is a lightweight Node.js HTTP service bound strictly to local port `4321` (or custom):
- `GET /api/health`: Health & capability diagnostics.
- `GET /api/project?path=...`: Loads canonical project JSON safely using `assertSafePath`.
- `POST /api/project/operation`: Executes any atomic EME operation (`modify_clip`, `move_clip`, `trim_clip`, `insert_clip`, `delete_clip`, etc.). Pushes prior state to `undoStack`, clears `redoStack`, increments monotonic revision.
- `POST /api/project/undo`: Pops previous state from `undoStack`, pushes current to `redoStack`, updates revision monotonically.
- `POST /api/project/redo`: Re-applies undone state.
- `POST /api/project/save`: Validates and saves canonical project JSON.
- `POST /api/render`: Triggers headless compilation and MP4 rendering.
- `POST /api/qa`: Executes the deterministic Quality Assurance engine on the project and rendered media.

## 3. Client Frontend Architecture (`src/ui/public/`)
Built with vanilla JavaScript and CSS for maximum responsiveness and zero heavy bundle overhead:
- **Left Panel**: Asset inventory and track stacking hierarchy (z-indexes).
- **Center Canvas**: Live composition preview at the current integer tick with responsive scale calculation.
- **Right Panel**: Real-time property inspector dynamically rendering forms for selected clip type (text, graphic, audio).
- **Bottom Timeline**: Multitrack timeline with scrubbable playhead, play/pause controls, zoom slider, and visual clip blocks.
