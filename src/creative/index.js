/**
 * Editing Mechanics Engine (EME) - Native Creative Director Module
 */

const { CreativeDirector } = require('./creative-director.js');
const { CreativeContextBuilder, VERIFIED_SUPPORTED_OPERATIONS, VERIFIED_SUPPORTED_EFFECTS, KNOWN_UNSUPPORTED_CAPABILITIES } = require('./creative-context-builder.js');
const { CreativePlanValidator, CreativePlanErrorCodes } = require('./schema-validator.js');
const { CreativePlanCompiler } = require('./creative-plan-compiler.js');
const { PlanStore } = require('./plan-store.js');
const { ReframingEngine } = require('./reframing-engine.js');
const { CompositionRenderer, SUPPORTED_CAPABILITIES, EXPLICITLY_UNSUPPORTED_CAPABILITIES } = require('./composition-renderer.js');
const { CurvedTypography } = require('./curved-typography.js');
const { AudioCatalog, AudioSelector } = require('./audio-catalog.js');
const { SpeechDuckingCompiler, CID03_DUCKING_PROFILE } = require('./speech-ducking-compiler.js');
const { AudioMixerEngine } = require('./audio-mixer-engine.js');
const { BaseLlmAdapter, IdeAgentAdapter, ProviderLlmAdapter, MockLlmAdapter, LlmErrorCodes } = require('./adapter/runtime-llm-adapter.js');
const { ApprovalAuthority } = require('./approval-authority.js');
const { ExecutionAuthority } = require('./execution-authority.js');

module.exports = {
  CreativeDirector,
  CreativeContextBuilder,
  CreativePlanValidator,
  CreativePlanErrorCodes,
  CreativePlanCompiler,
  PlanStore,
  ReframingEngine,
  CompositionRenderer,
  CurvedTypography,
  AudioCatalog,
  AudioSelector,
  SpeechDuckingCompiler,
  CID03_DUCKING_PROFILE,
  AudioMixerEngine,
  ApprovalAuthority,
  ExecutionAuthority,
  SUPPORTED_CAPABILITIES,
  EXPLICITLY_UNSUPPORTED_CAPABILITIES,
  BaseLlmAdapter,
  IdeAgentAdapter,
  ProviderLlmAdapter,
  MockLlmAdapter,
  LlmErrorCodes,
  VERIFIED_SUPPORTED_OPERATIONS,
  VERIFIED_SUPPORTED_EFFECTS,
  KNOWN_UNSUPPORTED_CAPABILITIES
};
