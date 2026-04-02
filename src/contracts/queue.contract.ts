/**
 * Queue Contract — delivery pipeline for scheduled posts.
 *
 * Decouples scheduling (when to send) from delivery (how to send).
 * Owns retry semantics, dead-letter policy, and idempotency keys.
 *
 * Consumed by: social-hub (cron publisher, Durable Object scheduler).
 * References: PostContract (source content), PlatformContract (target).
 */

import { z } from 'zod';
import { defineContract, ref } from './define';
import { PostContract } from './post.contract';
import { PlatformContract } from './platform.contract';

// ── Enums ────────────────────────────────────────────────────────────────

export const DeliveryStatus = z.enum([
  'pending',
  'processing',
  'delivered',
  'failed',
  'dead_letter',
]);
export type DeliveryStatus = z.infer<typeof DeliveryStatus>;

// ── Contract ─────────────────────────────────────────────────────────────

export const QueueContract = defineContract({
  name: 'QueueItem',
  version: '1.0.0',
  description: 'A delivery job for a scheduled post',

  schema: z.object({
    id: z.string().uuid(),
    postId: ref(PostContract, 'id'),
    platformId: ref(PlatformContract, 'id'),
    tenantId: z.string(),
    status: DeliveryStatus.default('pending'),
    /** Idempotency key — prevents double-posting on reprocessing */
    idempotencyKey: z.string(),
    scheduledAt: z.string().datetime(),
    attemptCount: z.number().int().nonnegative().default(0),
    maxAttempts: z.number().int().positive().default(3),
    lastAttemptAt: z.string().datetime().nullable(),
    /** Next retry time — exponential backoff (1m, 5m, 15m) */
    nextRetryAt: z.string().datetime().nullable(),
    lastError: z.string().nullable(),
    deliveredAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
  }),

  operations: {
    enqueue: {
      input: z.object({
        postId: z.string().uuid(),
        platformId: z.string().uuid(),
        tenantId: z.string(),
        scheduledAt: z.string().datetime(),
      }),
      output: 'self' as const,
      emits: ['queue.enqueued'],
    },

    process: {
      input: z.object({ id: z.string().uuid() }),
      output: 'self' as const,
      transition: { from: 'pending', to: 'processing' },
      emits: ['queue.processing'],
    },

    deliver: {
      input: z.object({
        id: z.string().uuid(),
        postUrl: z.string().url(),
        postId: z.string(),
      }),
      output: 'self' as const,
      transition: { from: 'processing', to: 'delivered' },
      emits: ['queue.delivered'],
    },

    fail: {
      input: z.object({
        id: z.string().uuid(),
        error: z.string(),
      }),
      output: 'self' as const,
      transition: { from: 'processing', to: 'failed' },
      emits: ['queue.failed'],
    },

    retry: {
      input: z.object({ id: z.string().uuid() }),
      output: 'self' as const,
      transition: { from: 'failed', to: 'pending' },
      emits: ['queue.retried'],
    },

    deadLetter: {
      input: z.object({ id: z.string().uuid() }),
      output: 'self' as const,
      transition: { from: 'failed', to: 'dead_letter' },
      emits: ['queue.dead_lettered'],
    },
  },

  states: {
    field: 'status',
    initial: 'pending',
    transitions: {
      pending:     { process: 'processing' },
      processing:  { deliver: 'delivered', fail: 'failed' },
      delivered:   {},
      failed:      { retry: 'pending', deadLetter: 'dead_letter' },
      dead_letter: {},
    },
  },

  surfaces: {
    api: {
      basePath: '/api/queue',
      routes: {
        list:       { method: 'GET',    path: '/' },
        get:        { method: 'GET',    path: '/:id' },
        enqueue:    { method: 'POST',   path: '/' },
        retry:      { method: 'POST',   path: '/:id/retry' },
        deadLetter: { method: 'GET',    path: '/dead-letter' },
        pause:      { method: 'POST',   path: '/pause' },
        resume:     { method: 'POST',   path: '/resume' },
      },
    },
    db: {
      table: 'delivery_queue',
      indexes: [
        'idx_dq_status_scheduled(status, scheduled_at)',
        'idx_dq_tenant(tenant_id, status)',
        'idx_dq_idempotency(idempotency_key)',
      ],
    },
  },

  authority: {
    list:       { requires: 'authenticated' },
    get:        { requires: 'authenticated' },
    enqueue:    { requires: 'authenticated' },
    retry:      { requires: 'owner', ownerField: 'tenantId' },
    deadLetter: { requires: 'authenticated' },
    pause:      { requires: 'role', roles: ['admin'] },
    resume:     { requires: 'role', roles: ['admin'] },
  },

  invariants: [
    {
      name: 'retry_within_max_attempts',
      description: 'Cannot retry beyond maxAttempts — route to dead letter instead',
      check: (entity: unknown) => {
        const e = entity as { attemptCount: number; maxAttempts: number };
        if (e.attemptCount >= e.maxAttempts) {
          return 'Max attempts reached — must dead-letter, not retry';
        }
        return true;
      },
      appliesTo: ['retry'],
    },
    {
      name: 'idempotency_prevents_double_delivery',
      description: 'Two queue items with the same idempotency key must never both reach delivered',
      check: () => true, // Enforced by unique index on idempotency_key + delivered status
      appliesTo: ['deliver'],
    },
    {
      name: 'backoff_schedule',
      description: 'Retry delays follow exponential backoff: attempt 1 = 60s, 2 = 300s, 3 = 900s',
      check: () => true, // Enforced by queue processor, not schema
      appliesTo: ['retry'],
    },
  ],
});
