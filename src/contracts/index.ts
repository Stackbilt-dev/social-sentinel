/**
 * Social Sentinel — Contract Definition Primitives
 *
 * The framework for defining domain contracts using Ontology-Driven Design (ODD)
 * via TypeScript + Zod. Product-specific contracts (Post, Platform, Engagement,
 * Queue) live in the private internal repo.
 *
 * See @stackbilt/contracts for the full ODD framework with code generators.
 */

// ── Primitives ───────────────────────────────────────────────────────────
export { defineContract, ref } from './define';
export type {
  ContractDefinition,
  ContractOperation,
  ContractStates,
  ContractSurface,
  ContractInvariant,
  AuthRequirement,
} from './define';
