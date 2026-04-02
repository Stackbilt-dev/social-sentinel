/**
 * Engagement Contract — tracks interactions and closes the analytics feedback loop.
 *
 * Two sides:
 *   1. Outbound engagement (likes, reposts, replies, follows we initiate)
 *   2. Inbound metrics (engagement data polled from platform APIs after publishing)
 *
 * Consumed by: social-hub (engagement automation, analytics dashboard).
 * References: PostContract (what was engaged with), PlatformContract (where).
 */

import { z } from 'zod';
import { defineContract, ref } from './define';
import { PostContract } from './post.contract';
import { PlatformContract } from './platform.contract';

// ── Enums ────────────────────────────────────────────────────────────────

export const EngagementAction = z.enum([
  'like',
  'repost',
  'reply',
  'follow',
  'quote',
]);
export type EngagementAction = z.infer<typeof EngagementAction>;

export const MetricSnapshotInterval = z.enum([
  '1h',
  '6h',
  '24h',
  '7d',
]);
export type MetricSnapshotInterval = z.infer<typeof MetricSnapshotInterval>;

// ── Contract: Outbound Engagement ────────────────────────────────────────

export const EngagementContract = defineContract({
  name: 'Engagement',
  version: '1.0.0',
  description: 'An outbound engagement action (like, repost, reply, follow)',

  schema: z.object({
    id: z.string().uuid(),
    tenantId: z.string(),
    platformId: ref(PlatformContract, 'id'),
    action: EngagementAction,
    /** Platform-specific target post/user URI */
    targetId: z.string(),
    /** Platform-specific result URI (returned by API) */
    resultId: z.string().nullable(),
    /** Reply text — required when action is 'reply' */
    replyText: z.string().max(10_000).nullable(),
    createdAt: z.string().datetime(),
  }),

  operations: {
    record: {
      input: z.object({
        tenantId: z.string(),
        platformId: z.string().uuid(),
        action: EngagementAction,
        targetId: z.string(),
        replyText: z.string().max(10_000).optional(),
      }),
      output: 'self' as const,
      emits: ['engagement.recorded'],
    },

    bulkRecord: {
      input: z.object({
        engagements: z.array(z.object({
          tenantId: z.string(),
          platformId: z.string().uuid(),
          action: EngagementAction,
          targetId: z.string(),
        })),
      }),
      output: z.object({ recorded: z.number().int() }),
      emits: ['engagement.bulk_recorded'],
    },
  },

  surfaces: {
    api: {
      basePath: '/api/engagements',
      routes: {
        record: { method: 'POST', path: '/' },
        list:   { method: 'GET',  path: '/' },
        stats:  { method: 'GET',  path: '/stats' },
      },
    },
    db: {
      table: 'engagement_log',
      indexes: [
        'idx_eng_tenant(tenant_id, created_at)',
        'idx_eng_platform(platform_id, action)',
      ],
    },
  },

  authority: {
    record: { requires: 'authenticated' },
    list:   { requires: 'authenticated' },
    stats:  { requires: 'authenticated' },
  },

  invariants: [
    {
      name: 'reply_requires_text',
      description: 'Reply engagements must include replyText',
      check: (entity: unknown) => {
        const e = entity as { action: string; replyText: string | null };
        if (e.action === 'reply' && !e.replyText) {
          return 'Reply engagements must include reply text';
        }
        return true;
      },
      appliesTo: ['record'],
    },
  ],
});

// ── Contract: Post Metrics (analytics feedback loop) ─────────────────────

export const PostMetricsContract = defineContract({
  name: 'PostMetrics',
  version: '1.0.0',
  description: 'Engagement metrics snapshot for a published post, polled at intervals',

  schema: z.object({
    id: z.string().uuid(),
    postId: ref(PostContract, 'id'),
    platformId: ref(PlatformContract, 'id'),
    tenantId: z.string(),
    interval: MetricSnapshotInterval,
    likes: z.number().int().nonnegative(),
    reposts: z.number().int().nonnegative(),
    replies: z.number().int().nonnegative(),
    impressions: z.number().int().nonnegative().nullable(),
    linkClicks: z.number().int().nonnegative().nullable(),
    snapshotAt: z.string().datetime(),
    createdAt: z.string().datetime(),
  }),

  operations: {
    snapshot: {
      input: z.object({
        postId: z.string().uuid(),
        interval: MetricSnapshotInterval,
      }),
      output: 'self' as const,
      emits: ['metrics.snapshot'],
    },

    aggregate: {
      input: z.object({
        tenantId: z.string(),
        platformId: z.string().uuid().optional(),
        since: z.string().datetime(),
      }),
      output: z.object({
        totalLikes: z.number().int(),
        totalReposts: z.number().int(),
        totalReplies: z.number().int(),
        totalImpressions: z.number().int().nullable(),
        postCount: z.number().int(),
        optimalHours: z.array(z.number().int().min(0).max(23)),
        optimalDays: z.array(z.number().int().min(0).max(6)),
      }),
      emits: ['metrics.aggregated'],
    },
  },

  surfaces: {
    api: {
      basePath: '/api/metrics',
      routes: {
        perPost:      { method: 'GET', path: '/posts/:postId' },
        perPlatform:  { method: 'GET', path: '/platforms/:platformId' },
        topPosts:     { method: 'GET', path: '/top' },
        optimalTimes: { method: 'GET', path: '/optimal-times' },
      },
    },
    db: {
      table: 'post_metrics',
      indexes: [
        'idx_pm_post(post_id, interval)',
        'idx_pm_tenant(tenant_id, snapshot_at)',
      ],
    },
  },

  authority: {
    perPost:      { requires: 'authenticated' },
    perPlatform:  { requires: 'authenticated' },
    topPosts:     { requires: 'authenticated' },
    optimalTimes: { requires: 'authenticated' },
  },
});
