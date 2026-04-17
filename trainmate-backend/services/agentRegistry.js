import { orchestrator } from './agentOrchestrator.service.js';

/**
 * Initialize all agents in the orchestrator
 */
export function initializeAgentRegistry() {
  orchestrator.ensureCoreAgentsRegistered();
}

/**
 * Get agent registry info
 */
export function getRegistryInfo() {
  return {
    agentCount: orchestrator.agents.size,
    agents: Array.from(orchestrator.agents.keys()),
    timestamp: new Date(),
  };
}

/**
 * Reset all agents (for testing)
 */
export function resetRegistry() {
  orchestrator.agents.clear();
  orchestrator.executionHistory = [];
  orchestrator.coreAgentsRegistered = false;
}
