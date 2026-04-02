/**
 * Social Sentinel — Contract Ontology Layer
 *
 * Domain contracts defining the canonical entities, operations, state machines,
 * authority rules, and surface mappings for the social management domain.
 *
 * These contracts are the single source of truth. Implementation (routes,
 * migrations, SDKs) should derive from these definitions — not the reverse.
 *
 * Philosophy: Ontology-Driven Design (ODD) via TypeScript + Zod.
 * See: aegis-daemon/artifacts/design-philosophy.md §Contract Ontology Layer
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

// ── Domain Contracts ─────────────────────────────────────────────────────
export { PostContract, PostStatus, Platform } from './post.contract';
export { PlatformContract, PlatformType, PlatformStatus, PlatformCredentials, RateLimitPolicy, PLATFORM_RATE_LIMITS } from './platform.contract';
export { QueueContract, DeliveryStatus } from './queue.contract';
export { EngagementContract, PostMetricsContract, EngagementAction, MetricSnapshotInterval } from './engagement.contract';
