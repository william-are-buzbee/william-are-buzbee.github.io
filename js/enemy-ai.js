// ==================== TURN MANAGEMENT + ENEMY AI ====================
// Drive-based creature AI. Every creature runs the same drive/behavior loop.
//
// This file has been split into focused modules:
//   physiology.js — body physics (bleed, substrate, healing, stress chemistry)
//   ai.js         — per-creature AI tick, reactive-deliberative decisions, drives
//   turn-loop.js  — endPlayerTurn orchestrator, dormancy, callbacks
//   debug.js      — debug/testing console helpers
//
// All exports are re-exported here for backward compatibility. Import directly
// from the specific module for clarity; this bridge stays until imports are migrated.

// ==================== RE-EXPORTS (transition bridge) ====================
export * from './physiology.js';
export * from './ai.js';
export * from './turn-loop.js';
export * from './debug.js';

// Re-exports from existing modules (already split in prior sessions)
export { monsterMelee } from './behaviors.js';
export { canSeePlayer, canSeePlayerTile, monsterViewRadius,
         applySafetyFromDamage, computePlayerPerception } from './detection.js';
export { hasCladeTerritory, wouldExceedTerritory,
         isWaterLocked, isWaterTile } from './ai-utils.js';
