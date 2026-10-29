# Model Context Protocol (MCP) Setup Guide

**Server Binary**: `eme-mcp`  
**Protocol Version**: `2024-11-05`  
**Transport**: Standard Input/Output (`stdio`) JSON-RPC 2.0  

---

## 1. Direct Stdio Launch

Run the packaged server directly:
```bash
eme-mcp
```
Or with node:
```bash
node bin/eme-mcp.js
```

---

## 2. Registering with AI Coding Agents (Antigravity)

Add EME MCP server to your Antigravity or MCP client configuration:

```json
{
  "mcpServers": {
    "eme": {
      "command": "eme-mcp",
      "args": [],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

Or when running from the development repository:
```json
{
  "mcpServers": {
    "eme": {
      "command": "node",
      "args": ["/Users/atharvpaharia100/editing-mechanics-engine/bin/eme-mcp.js"]
    }
  }
}
```

---

## 3. Tool Catalog Reference

When connected, the following 9 tools are advertised:
1. `eme_create_project`: Canvas & timebase initialization.
2. `eme_execute_operation`: Atomic editing mutations with rollback on error.
3. `eme_validate_project`: Schema and semantic validation.
4. `eme_inspect_project`: Read-only project summary and status.
5. `eme_query_capabilities`: Query supported renderer effects and easings.
6. `eme_compile_composition`: Intermediate HTML/GSAP compilation.
7. `eme_render_video`: MP4 video rendering via HyperFrames.
8. `eme_inspect_frame`: Deterministic frame extraction to PNG.
9. `eme_inspect_metadata`: ffprobe video container & stream probing.
