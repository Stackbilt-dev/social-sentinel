/**
 * Post Contract — the canonical entity for social content.
 *
 * Owns: content lifecycle (draft → publish → archive),
 * per-platform rendering constraints, PII redaction requirement.
 *
 * Consumed by: social-hub (D1 store, API routes, cron publisher).
 * Referenced by: QueueContract (delivery), EngagementContract (metrics).
 */

import { z } from 'zod';
import { defineContract } from './define';

// ── Enums ────────────────────────────────────────────────────────────────

export const PostStatus = z.enum([
  'draft',
  'scheduled',
  'publishing',
  'published',
  'failed',
  'cancelled',
]);
export type PostStatus = z.infer<typeof PostStatus>;

export const Platform = z.enum([
  'bluesky',
  'twitter',
  'facebook',
  'linkedin',
  'devto',
]);
export type Platform = z.infer<typeof Platform>;

// ── Contract ─────────────────────────────────────────────────────────────

export const PostContract = defineContract({
  name: 'Post',
  version: '1.0.0',
  description: 'A piece of social content targeting one or more platforms',

  schema: z.object({
    id: z.string().uuid(),
    tenantId: z.string(),
    platform: Platform,
    content: z.string().min(1).max(10_000),
    mediaUrl: z.string().url().nullable(),
    mediaAlt: z.string().max(1000).nullable(),
    linkUrl: z.string().url().nullable(),
    langs: z.array(z.string()).default(['en']),
    scheduledAt: z.string().datetime().nullable(),
    status: PostStatus.default('draft'),
    publishedAt: z.string().datetime().nullable(),
    postUrl: z.string().url().nullable(),
    postId: z.string().nullable(),
    error: z.string().nullable(),
    retryCount: z.number().int().nonnegative().default(0),
    maxRetries: z.number().int().nonnegative().default(3),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  }),

  operations: {
    create: {
      input: z.object({
        tenantId: z.string(),
        platform: Platform,
        content: z.string().min(1).max(10_000),
        mediaUrl: z.string().url().optional(),
        mediaAlt: z.string().max(1000).optional(),
        linkUrl: z.string().url().optional(),
        langs: z.array(z.string()).optional(),
      }),
      output: 'self' as const,
      emits: ['post.created'],
    },

    schedule: {
      input: z.object({
        id: z.string().uuid(),
        scheduledAt: z.string().datetime(),
      }),
      output: 'self' as const,
      transition: { from: 'draft', to: 'scheduled' },
      emits: ['post.scheduled'],
    },

    publish: {
      input: z.object({ id: z.string().uuid() }),
      output: 'self' as const,
      transition: { from: ['draft', 'scheduled'], to: 'publishing' },
      emits: ['post.publishing'],
    },

    markPublished: {
      input: z.object({
        id: z.string().uuid(),
        postUrl: z.string().url(),
        postId: z.string(),
      }),
      output: 'self' as const,
      transition: { from: 'publishing', to: 'published' },
      emits: ['post.published'],
    },

    fail: {
      input: z.object({
        id: z.string().uuid(),
        error: z.string(),
      }),
      output: 'self' as const,
      transition: { from: 'publishing', to: 'failed' },
      emits: ['post.failed'],
    },

    cancel: {
      input: z.object({ id: z.string().uuid() }),
      output: 'self' as const,
      transition: { from: ['draft', 'scheduled', 'failed'], to: 'cancelled' },
      emits: ['post.cancelled'],
    },

    retry: {
      input: z.object({ id: z.string().uuid() }),
      output: 'self' as const,
      transition: { from: 'failed', to: 'scheduled' },
      emits: ['post.retried'],
    },
  },

  states: {
    field: 'status',
    initial: 'draft',
    transitions: {
      draft:      { schedule: 'scheduled', publish: 'publishing', cancel: 'cancelled' },
      scheduled:  { publish: 'publishing', cancel: 'cancelled' },
      publishing: { markPublished: 'published', fail: 'failed' },
      published:  {},
      failed:     { retry: 'scheduled', cancel: 'cancelled' },
      cancelled:  {},
    },
  },

  surfaces: {
    api: {
      basePath: '/api/posts',
      routes: {
        create:        { method: 'POST',   path: '/' },
        list:          { method: 'GET',    path: '/' },
        get:           { method: 'GET',    path: '/:id' },
        schedule:      { method: 'POST',   path: '/:id/schedule' },
        publish:       { method: 'POST',   path: '/:id/publish' },
        cancel:        { method: 'DELETE', path: '/:id' },
        retry:         { method: 'POST',   path: '/:id/retry' },
      },
    },
    db: {
      table: 'content_queue',
      indexes: [
        'idx_post_status_scheduled(status, scheduled_at)',
        'idx_post_tenant(tenant_id, status)',
        'idx_post_platform(platform, status)',
      ],
    },
  },

  authority: {
    create:   { requires: 'authenticated' },
    list:     { requires: 'authenticated' },
    get:      { requires: 'authenticated' },
    schedule: { requires: 'owner', ownerField: 'tenantId' },
    publish:  { requires: 'owner', ownerField: 'tenantId' },
    cancel:   { requires: 'owner', ownerField: 'tenantId' },
    retry:    { requires: 'owner', ownerField: 'tenantId' },
  },

  invariants: [
    {
      name: 'scheduled_requires_datetime',
      description: 'Scheduled posts must have a scheduledAt timestamp',
      check: (entity: unknown) => {
        const e = entity as { status: string; scheduledAt: string | null };
        if (e.status === 'scheduled' && !e.scheduledAt) {
          return 'Scheduled posts must have a scheduledAt timestamp';
        }
        return true;
      },
      appliesTo: ['schedule'],
    },
    {
      name: 'retry_within_max',
      description: 'Cannot retry beyond maxRetries',
      check: (entity: unknown) => {
        const e = entity as { retryCount: number; maxRetries: number };
        if (e.retryCount >= e.maxRetries) {
          return 'Retry count has reached the maximum';
        }
        return true;
      },
      appliesTo: ['retry'],
    },
    {
      name: 'content_pii_redacted',
      description: 'Content must pass PII redaction before publish',
      check: () => true, // Enforced at pipeline level, not schema level
      appliesTo: ['create', 'publish'],
    },
  ],
});
