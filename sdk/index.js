/**
 * CIVITAS INTELLIGENTIAE SDK v2.0
 * 
 * The complete SDK for building living intelligent systems.
 * 
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║  VERSION 2.0: UNIFIED ORGANISM ARCHITECTURE                                   ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 * 
 * NEW in v2.0:
 *   - Central Nervous System (CNS) orchestrates all components
 *   - Unified organism bootstrap wires everything together
 *   - All agents, engines, organs communicate through CNS
 *   - Protocol mesh for intelligent signal routing
 *   - Kingdom organs integrated as support systems
 *   - Spider MoE & Nova Bridge augment ANIMUS
 *   - Organism Arms provide unified sensory-motor interface
 * 
 * Architecture (v2.0 Unified):
 *   STEP 1: UNIFIED ORGANISM
 *     - bootstrapOrganism(): One call activates entire organism
 *     - CNS: Central coordination and signal routing
 *     - StateBus: Organism-wide state management
 * 
 *   STEP 2: CORE SYSTEMS (wired through CNS)
 *     - Engines (CHRONO, NEXORIS, QUANTUM_FLUX, COREOGRAPH)
 *     - Agents (ANIMUS, CORPUS, SENSUS, MEMORIA)
 *     - Intelligence (Spider MoE, Nova Bridge)
 * 
 *   STEP 3: SUPPORT SYSTEMS (organs)
 *     - Power (circulatory), Thermal (cooling)
 *     - Immune (gate keepers), Treasury (resources)
 * 
 *   STEP 4: COMMUNICATION LAYER
 *     - Protocol mesh (253 protocols)
 *     - Organism Arms (sensory-motor)
 * 
 * Usage (v2.0):
 *   import { bootstrapOrganism } from '@medina/civitas-intelligentiae';
 *   const organism = await bootstrapOrganism({ name: 'MyOrganism' });
 *   // Entire organism is now ALIVE with all systems wired together
 * 
 * Usage (v1.x - deprecated):
 *   import { bootstrapCivitas } from '@medina/civitas-intelligentiae';
 *   const civitas = bootstrapCivitas('my-meridian');
 *   // Still works but will show deprecation warning
 */

// Constants
export const PHI = 1.618033988749895;
export const PHI_INV = 1 / PHI;
export const HEARTBEAT_MS = 873;
export const GOLDEN_ANGLE = 137.508;
export const EMERGENCE_THRESHOLD = PHI_INV;
export const VERSION = '2.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// V2.0 UNIFIED ORGANISM — PRIMARY API
// ═══════════════════════════════════════════════════════════════════════════

// Unified Organism (v2.0 - NEW)
export {
  UnifiedOrganism,
  bootstrapOrganism,
  DEFAULT_CONFIG as UNIFIED_ORGANISM_CONFIG,
} from './unified-organism/index.js';

// Central Nervous System
export {
  CNSOrchestrator,
  StateBus,
  SignalRouter,
  SIGNAL_TYPES,
  COMPONENT_TYPES,
  CONNECTION_STATUS,
  ROUTING_STRATEGIES,
} from './central-nervous-system/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// V1.X LEGACY API — Still supported, use v2.0 for new projects
// ═══════════════════════════════════════════════════════════════════════════

// Engines
export {
  ChronoEngine,
  chronoEngine,
  NexorisEngine,
  nexorisEngine,
  QuantumFluxEngine,
  quantumFluxEngine,
  CoreographEngine,
  coreographEngine,
  CenterfoldEngine,
  centerfoldEngine,
  CHRONO,
  NEXORIS,
  QUANTUM_FLUX,
  COREOGRAPH,
  CENTERFOLD,
  PRIORITY,
  REGISTERS,
  DIMENSIONS,
  CENTERFOLD_DEFAULT_MODEL,
  CENTERFOLD_DEFAULT_KERNEL_ID,
  CENTERFOLD_KERNEL_CATALOG,
  CENTERFOLD_KERNEL_BANK,
  selectCenterfoldKernel,
  selectCenterfoldKernelByEntropy,
  CenterfoldStateStore,
  CenterfoldObservability,
  createEngines,
} from './engines/index.js';

// Agents
export {
  AnimusAgent,
  CorpusAgent,
  SensusAgent,
  MemoriaAgent,
  createAgents,
} from './agents/index.js';

// Runtime
export {
  CivitasRuntime,
  bootstrapCivitas,
  bootstrapMultiple,
  bootstrapWithHashRouting,
} from './runtime/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL SDKs — Professional Pattern
// ═══════════════════════════════════════════════════════════════════════════

// Timers SDK (@medina/medina-timers)
export {
  // Ancient Calendars
  createMayanTzolkinTimer,
  createMayanHaabTimer,
  createMayanLongCountTimer,
  createSumerianSexagesimalTimer,
  createSumerianLunarTimer,
  createVedicPanchangaTimer,
  createVedicYugaTimer,
  createEgyptianDecanTimer,
  createEgyptianSeasonTimer,
  createChineseSexagenaryCycleTimer,
  createChineseSolarTermsTimer,
  // Sacred Geometry
  createFibonacciTimer,
  createFibonacciSpiralTimer,
  createPhiOscillator,
  createDualPhiOscillator,
  createGoldenAngleRotator,
  createPhyllotaxisTimer,
  createMetatronRouter,
  createMultiHeartGenerator,
  createSacredGeometrySuite,
  // Cosmic Cycles
  createLunarPhaseTimer,
  createLunarNodeTimer,
  createSolarDeclinationTimer,
  createSunspotCycleTimer,
  createPlanetarySynodicTimer,
  createAllPlanetsTimer,
  createPrecessionTimer,
  createMultiBrainTimer,
  createCosmicCycleSuite,
  // Agent Suite Factory
  createAgentTimerSuite,
  createMultiAgentTimerSuites,
} from './medina-timers/src/index.js';

// Calls SDK (@medina/medina-calls)
export {
  // Civitas Calls
  callBootstrapCivitas,
  callAwakenCivitas,
  callDormantCivitas,
  callTerminateCivitas,
  callUpdateAgentState,
  callSendStimulus,
  callTriggerReflection,
  callSetAgentGoal,
  callCompleteGoal,
  callStoreMemory,
  callConsolidateMemories,
  callForgetMemory,
  callUpdateMemoryImportance,
  callCreateArtifact,
  callUpdateArtifact,
  callArchiveArtifact,
  callApplyReward,
  callApplyPunishment,
  callUpdateLearningRate,
  // Organism Calls
  callDeployOrganism,
  callUpgradeOrganism,
  callDeleteOrganism,
  callStartHeartbeat,
  callStopHeartbeat,
  callRegisterCitizen,
  callCreateProposal,
  callVote,
  callExecuteProposal,
  callTransfer,
  callStake,
  callUnstake,
  callClaimRewards,
  callDepositFunds,
  callWithdrawFunds,
  callAllocateFunds,
  // Governance Calls
  callCreateEffectTrace,
  callUpdateTraceMetrics,
  callArchiveTrace,
  callLinkTraces,
  callSubmitEvidence,
  callVerifyEvidence,
  callChallengeEvidence,
  callCreateCouncil,
  callAddCouncilMember,
  callRemoveCouncilMember,
  callCreateCouncilDecision,
  callCouncilVote,
  callFinalizeDecision,
  callRegisterFieldAgent,
  callSubmitFieldCollection,
  callCreateAllocation,
  callApproveMilestone,
  callDisburseFunds,
  // Context
  createCallContext,
  batchExecute,
} from './medina-calls/src/index.js';

// Queries SDK (@medina/medina-queries)
export {
  // Civitas Queries
  queryCivitasStatus,
  queryCivitasHealth,
  queryAllAgentStatuses,
  queryAgentStatus,
  queryAgentRegisters,
  queryMemories,
  queryMemory,
  queryMemoryAssociations,
  queryConsolidationStatus,
  queryActiveGoals,
  queryGoalProgress,
  queryGoalHistory,
  queryArtifacts,
  queryArtifact,
  queryArtifactLineage,
  queryCollectiveCoherence,
  queryEmergenceState,
  queryLearningMetrics,
  queryRewardHistory,
  // Organism Queries
  queryCanisterStatus,
  queryCanisterCycles,
  queryCanisterMemory,
  queryOrganismState,
  queryHeartbeatStatus,
  queryGovernanceSnapshot,
  queryCitizen,
  queryAllCitizens,
  queryProposals,
  queryProposal,
  queryBalance,
  queryTokenSupply,
  queryStakeInfo,
  queryTransferHistory,
  queryFundBalance,
  queryFundAllocations,
  querySynapseHealth,
  querySynapseImprints,
  querySynapseBinding,
  queryInnovationZones,
  queryEnergyCredits,
  queryTotalEnergyCredits,
  queryDistrictSnapshot,
  queryStudent,
  queryStudentsBySchool,
  queryLearningPathways,
  querySchools,
  // Governance Queries
  queryGovernanceDashboard,
  querySystemMetrics,
  queryActivityFeed,
  queryEffectTraces,
  queryEffectTrace,
  queryTraceMetricsHistory,
  queryTraceDelta,
  queryLinkedTraces,
  queryTraceEvidence,
  queryEvidence,
  queryEvidenceBySubmitter,
  queryPendingEvidence,
  queryCouncils,
  queryCouncil,
  queryCouncilMember,
  queryCouncilDecisions,
  queryDecision,
  queryFieldAgents,
  queryFieldAgent,
  queryFieldCollections,
  queryAllocations,
  queryAllocation,
  queryAllocationMilestones,
  queryDisbursementHistory,
  queryOverallImpact,
  queryImpactByDomain,
  queryImpactTimeline,
  // Context & Cache
  createQueryContext,
  createQueryCache,
  batchQuery,
} from './medina-queries/src/index.js';

// Organism Bootstrap SDK (@medina/organism-bootstrap)
export {
  bootstrapOrganism,
  generateMotokoOrganism,
  generateDfxConfig,
  // Hash Routing
  createHashRouter,
  createGovernanceRouter,
  bootstrapWithHashRouting as bootstrapOrganismWithHashRouting,
} from './organism-bootstrap/src/index.js';

// Organism Marketplace SDK (@medina/organism-marketplace)
export {
  ToolSchemaBuilder,
  ToolRegistry,
  ToolInvoker,
  MarketplaceSettlement,
  MarketplaceRouter,
  ChatGPTToolAdapter,
  RepoIntelligenceBridge,
} from './organism-marketplace/src/index.js';

// Agent Workspace SDK (@medina/agent-workspace-sdk)
export {
  AgentWorkspace,
  WORKSPACE_STATUS,
  HANDOFF_STATUS,
  DEFAULT_AI_WORKSPACES,
  createDefaultAIWorkspaces,
} from './agent-workspace-sdk/src/index.js';

// Nova Bindings SDK (@organism/nova-bindings)
export {
  // Constants
  NOVA_ENDPOINTS,
  DEPLOYMENT_TARGETS,
  MESSAGE_TYPES,
  // Classes
  NovaBinding,
  JarvisNovaBinding,
  DeploymentNovaBinding,
  WorkerNovaBinding,
  NovaBindingManager,
  // Singleton Manager
  novaBindings,
  // Factory Functions
  createJarvisBinding,
  createDeploymentBinding,
  createWorkerBinding,
} from './nova-bindings/src/index.js';

// Git Knowledge Engine (@medina/git-knowledge-engine)
// Entry point to the X ecosystem — indexes any Git repo into a sovereign
// knowledge graph and dispatches missions through the X protocol layer.
export {
  GitKnowledgeEngine,
  GitIndexer,
  GitKnowledgeGraph,
  GitMissionRouter,
  GitExecutor,
  GIT_NODE_TYPES,
  GIT_EDGE_TYPES,
  MISSION_TYPES as GIT_MISSION_TYPES,
} from './git-knowledge-engine/src/index.js';

// X Ecosystem Engine (@medina/x-ecosystem)
// Sovereign multi-tenant, multi-platform AI orchestration layer.
// Binds Git knowledge engine, protocols, microbots, and platforms
// into a single governed runtime with hash-chained audit.
export {
  XEcosystem,
  XEcosystemConfig,
  XTenant,
  X_PERMISSIONS,
  XGovernanceRuntime,
  XProtocolRegistry,
  XPlatformRegistry,
  XMicrobotOrchestrator,
  XMissionDispatch,
  X_MISSION_TYPES,
} from './x-ecosystem/src/index.js';

// X Platform Connectors (@medina/x-platform-connectors)
// Commerce platform adapters: Square, Shopify, Stripe, QuickBooks, PayPal,
// WooCommerce, and a generic REST adapter for any API.
export {
  XPlatformConnector,
  SquareConnector,
  ShopifyConnector,
  StripeConnector,
  QuickBooksConnector,
  PayPalConnector,
  WooCommerceConnector,
  GenericRestConnector,
} from './x-platform-connectors/src/index.js';

// Default export is the bootstrap function
export { default } from './runtime/bootstrap.js';
