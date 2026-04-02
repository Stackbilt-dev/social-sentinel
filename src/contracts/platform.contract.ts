/**
 * Platform Contract — a social platform connection with credentials and constraints.
 *
 * Owns: platform identity, credential lifecycle, rate limit policy.
 * Each tenant can connect multiple platforms. Credentials stored in KV,
 * never in D1 (separation of secrets from data).
 *
 * Consumed by: social-hub (credential management, publisher dispatch).
 * Referenced by: PostContract (target platform), EngagementContract (source).
 */

import { z } from 'zod';
import { defineContract } from './define';

// ── Enums ────────────────────────────────────────────────────────────────

export const PlatformType = z.enum([
  'bluesky',
  'twitter',
  'facebook',
  'linkedin',
  'devto',
]);
export type PlatformType = z.infer<typeof PlatformType>;

export const PlatformStatus = z.enum([
  'disconnected',
  'connected',
  'degraded',
  'suspended',
]);
export type PlatformStatus = z.infer<typeof PlatformStatus>;

// ── Rate limit policy per platform ───────────────────────────────────────

export const RateLimitPolicy = z.object({
  /** Max posts per window */
  maxPosts: z.number().int().positive(),
  /** Window duration in seconds */
  windowSeconds: z.number().int().positive(),
  /** Max API points per hour (platform-enforced) */
  pointsPerHour: z.number().int().positive().optional(),
  /** Max content length (chars or graphemes) */
  maxContentLength: z.number().int().positive(),
  /** Whether the platform counts graphemes (Bluesky) or chars */
  graphemeCounting: z.boolean().default(false),
});

// ── Platform-specific credential schemas ─────────────────────────────────

export const BlueskyCredentials = z.object({
  handle: z.string(),
  appPassword: z.string(),
});

export const TwitterCredentials = z.object({
  apiKey: z.string(),
  apiSecret: z.string(),
  accessToken: z.string(),
  accessSecret: z.string(),
});

export const FacebookCredentials = z.object({
  pageAccessToken: z.string(),
  pageId: z.string(),
});

export const LinkedInCredentials = z.object({
  accessToken: z.string(),
  organizationId: z.string().optional(),
});

export const DevToCredentials = z.object({
  apiKey: z.string(),
});

export const PlatformCredentials = z.discriminatedUnion('platform', [
  z.object({ platform: z.literal('bluesky'), ...BlueskyCredentials.shape }),
  z.object({ platform: z.literal('twitter'), ...TwitterCredentials.shape }),
  z.object({ platform: z.literal('facebook'), ...FacebookCredentials.shape }),
  z.object({ platform: z.literal('linkedin'), ...LinkedInCredentials.shape }),
  z.object({ platform: z.literal('devto'), ...DevToCredentials.shape }),
]);

// ── Contract ─────────────────────────────────────────────────────────────

export const PlatformContract = defineContract({
  name: 'Platform',
  version: '1.0.0',
  description: 'A social platform connection for a tenant',

  schema: z.object({
    id: z.string().uuid(),
    tenantId: z.string(),
    type: PlatformType,
    status: PlatformStatus.default('disconnected'),
    displayName: z.string().max(100),
    /** Consecutive failure count — feeds circuit breaker */
    failureCount: z.number().int().nonnegative().default(0),
    /** Circuit breaker trips after this many consecutive failures */
    circuitBreakerThreshold: z.number().int().positive().default(5),
    lastHealthCheck: z.string().datetime().nullable(),
    connectedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  }),

  operations: {
    connect: {
      input: z.object({
        tenantId: z.string(),
        type: PlatformType,
        displayName: z.string().max(100),
        // Credentials go to KV, not D1 — passed separately
      }),
      output: 'self' as const,
      transition: { from: 'disconnected', to: 'connected' },
      emits: ['platform.connected'],
    },

    disconnect: {
      input: z.object({ id: z.string().uuid() }),
      output: 'self' as const,
      transition: { from: ['connected', 'degraded', 'suspended'], to: 'disconnected' },
      emits: ['platform.disconnected'],
    },

    healthCheck: {
      input: z.object({ id: z.string().uuid() }),
      output: z.object({ healthy: z.boolean(), latencyMs: z.number() }),
      emits: ['platform.health_checked'],
    },

    recordFailure: {
      input: z.object({ id: z.string().uuid(), error: z.string() }),
      output: 'self' as const,
      emits: ['platform.failure_recorded'],
    },

    resetCircuitBreaker: {
      input: z.object({ id: z.string().uuid() }),
      output: 'self' as const,
      transition: { from: ['degraded', 'suspended'], to: 'connected' },
      emits: ['platform.circuit_reset'],
    },
  },

  states: {
    field: 'status',
    initial: 'disconnected',
    transitions: {
      disconnected: { connect: 'connected' },
      connected:    { disconnect: 'disconnected', recordFailure: 'degraded' },
      degraded:     { disconnect: 'disconnected', resetCircuitBreaker: 'connected', recordFailure: 'suspended' },
      suspended:    { disconnect: 'disconnected', resetCircuitBreaker: 'connected' },
    },
  },

  surfaces: {
    api: {
      basePath: '/api/platforms',
      routes: {
        connect:             { method: 'POST',   path: '/' },
        disconnect:          { method: 'DELETE', path: '/:id' },
        list:                { method: 'GET',    path: '/' },
        healthCheck:         { method: 'POST',   path: '/:id/health' },
        resetCircuitBreaker: { method: 'POST',   path: '/:id/reset' },
      },
    },
    db: {
      table: 'platforms',
      indexes: [
        'idx_platform_tenant(tenant_id, type)',
        'idx_platform_status(status)',
      ],
    },
  },

  authority: {
    connect:             { requires: 'authenticated' },
    disconnect:          { requires: 'owner', ownerField: 'tenantId' },
    list:                { requires: 'authenticated' },
    healthCheck:         { requires: 'owner', ownerField: 'tenantId' },
    resetCircuitBreaker: { requires: 'owner', ownerField: 'tenantId' },
  },

  invariants: [
    {
      name: 'circuit_breaker_threshold',
      description: 'Suspend platform when consecutive failures exceed threshold',
      check: (entity: unknown) => {
        const e = entity as { failureCount: number; circuitBreakerThreshold: number };
        if (e.failureCount >= e.circuitBreakerThreshold) {
          return 'Platform suspended — circuit breaker tripped';
        }
        return true;
      },
      appliesTo: ['recordFailure'],
    },
    {
      name: 'credentials_in_kv_not_d1',
      description: 'Platform credentials must be stored in KV, never in D1',
      check: () => true, // Structural — enforced by architecture, not runtime check
      appliesTo: ['connect'],
    },
  ],
});

// ── Rate limit defaults per platform type ────────────────────────────────

export const PLATFORM_RATE_LIMITS: Record<string, z.infer<typeof RateLimitPolicy>> = {
  bluesky:  { maxPosts: 100, windowSeconds: 3600, pointsPerHour: 5000, maxContentLength: 300, graphemeCounting: true },
  twitter:  { maxPosts: 17,  windowSeconds: 86400, maxContentLength: 280, graphemeCounting: false },
  facebook: { maxPosts: 25,  windowSeconds: 86400, maxContentLength: 63206, graphemeCounting: false },
  linkedin: { maxPosts: 100, windowSeconds: 86400, maxContentLength: 3000, graphemeCounting: false },
  devto:    { maxPosts: 10,  windowSeconds: 86400, maxContentLength: 100_000, graphemeCounting: false },
};
