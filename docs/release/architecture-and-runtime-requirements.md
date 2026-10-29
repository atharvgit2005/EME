# Architecture & Runtime Requirements

**Release Candidate**: `v0.1.0-rc1`  

---

## 1. System Architecture

```mermaid
graph TD
    subgraph Orchestration ["Orchestration Layer"]
        CLI["CLI (bin/eme.js)"]
        Agent["AI Agent (Antigravity)"]
        MCPServer["MCP Server (bin/eme-mcp.js)"]
    end

    subgraph Core ["EME Core Engine"]
        Time["MediaTime (120,000 integer ticks/sec)"]
        ProjectMgr["ProjectManager & Schema Validator"]
        OpExec["OperationExecutor (13 atomic operations)"]
        Env["EnvironmentResolver"]
    end

    subgraph Renderers ["Rendering & Inspection"]
        HFComp["HyperFramesCompiler (HTML5/CSS/GSAP)"]
        HFRender["HyperFramesRenderer (Node 22 headless browser)"]
        Insp["FrameInspector (FFmpeg / ffprobe)"]
    end

    CLI --> ProjectMgr
    CLI --> OpExec
    CLI --> HFComp
    CLI --> HFRender
    CLI --> Insp

    Agent --> MCPServer
    MCPServer --> OpExec
    MCPServer --> ProjectMgr
    MCPServer --> HFRender
    MCPServer --> Insp

    HFRender --> Env
    Insp --> Env
```

---

## 2. Runtime Requirements

### Minimum & Recommended Versions
- **Node.js**:
  - Minimum supported: `>= 20.0.0`
  - Recommended: `>= 22.12.0` (for direct HyperFrames execution without delegation)
- **FFmpeg**: `5.0+` (tested with `FFmpeg 9.0.2` on macOS Darwin)
- **ffprobe**: Matching FFmpeg build
- **HyperFrames**: `0.8.162`
- **Supported OS**: macOS Darwin (arm64 / x64), Linux (x64)
