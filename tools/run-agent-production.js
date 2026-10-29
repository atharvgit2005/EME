/**
 * Runner for Phase 5 Agent-Driven Production Pipeline
 */

const { AgentProductionPipeline } = require('../src/agent/agent-production.js');

async function main() {
  console.log('====================================================');
  console.log('  Phase 5: Agent-Driven Automated Production Runner');
  console.log('====================================================\n');

  const brief = 'Generate a 6.0-second vertical kinetic-typography video (1080x1920 @ 60fps) introducing the Editing Mechanics Engine. Include a primary title ("EDITING MECHANICS ENGINE") and secondary text ("AUTONOMOUS VIDEO INFRASTRUCTURE"), at least two visual layers, the staged Instrument Serif font, deterministic opacity and scale entrance animations, a scene transition at 3.0s to a second scene ("VERIFIED AGENT PIPELINE"), background audio (snowfall.mp3) with fade envelope, and inspect frames for visual QA.';

  const trace = await AgentProductionPipeline.runBrief(brief, 'artifacts/phase-5/production-test');
  console.log('\nFinal Verdict:', trace.verdict);
  console.log('Final Deliverable:', trace.finalDeliverable);
}

main().catch(err => {
  console.error('Agent production failed:', err);
  process.exit(1);
});
