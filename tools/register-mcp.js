/**
 * Register EME with Antigravity IDE MCP Directory
 */

const fs = require('fs');
const path = require('path');
const { TOOL_DEFINITIONS } = require('../src/mcp/server.js');

function registerMcp() {
  const mcpDir = '/Users/atharvpaharia100/.gemini/antigravity-ide/mcp/eme';
  fs.mkdirSync(mcpDir, { recursive: true });

  console.log(`Registering EME MCP tools in: ${mcpDir}`);

  for (const tool of TOOL_DEFINITIONS) {
    const filePath = path.join(mcpDir, `${tool.name}.json`);
    const schemaDoc = {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema
    };
    fs.writeFileSync(filePath, JSON.stringify(schemaDoc, null, 2), 'utf8');
    console.log(`  - Registered tool: ${tool.name}`);
  }

  const instructions = `# Editing Mechanics Engine (EME) MCP Tools

This MCP server enables Antigravity to create, edit, validate, compile, and render video editing projects.

## Core Workflow
1. Use \`eme_create_project\` to initialize a project JSON.
2. Use \`eme_execute_operation\` to execute atomic operations (insert_clip, split_clip, trim_clip, move_clip, delete_clip, ripple_delete, reorder_tracks, animate_property, apply_effect, set_audio_envelope).
3. Use \`eme_validate_project\` to ensure the candidate project state conforms strictly to schema/eme-project.v1.schema.json.
4. Use \`eme_compile_composition\` to translate canonical JSON into a HyperFrames HTML composition.
5. Use \`eme_render_video\` to render the composition into an MP4 video.
6. Use \`eme_inspect_frame\` to extract still frames for visual evaluation.
`;
  fs.writeFileSync(path.join(mcpDir, 'instructions.md'), instructions, 'utf8');
  console.log(`✅ Registered instructions.md`);
  console.log('🎉 EME successfully registered as an Antigravity MCP server!');
}

if (require.main === module) {
  registerMcp();
}

module.exports = { registerMcp };
