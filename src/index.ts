import type { Env } from "./env";
import { loadTenantConfigs, loadPublisherCredentials, type TenantConfig } from "./config";
import { PIIRedactor } from "./pii/redactor";
import { SentimentAnalyzer } from "./sentiment/analyzer";
import { BatchBuilder } from "./batch/builder";
import { TwitterAdapter } from "./adapters/twitter";
import { GoogleReviewsAdapter } from "./adapters/google-reviews";
import { FacebookAdapter } from "./adapters/facebook";
import type { PlatformAdapter, SocialMention, CleanMention } from "./adapters/types";
import { logError, logPIIDetection } from "./utils/logging";
import { handlePublishRoutes } from "./routes";
import { BlueskyPublisher } from "./publishers/bluesky";
import type { Platform } from "./publishers/types";
import { renderDashboard } from "./dashboard";

// ─── Monitoring Pipeline (existing) ──────────────────────────

/**
 * Get enabled adapters for a tenant based on their configuration
 */
function getEnabledAdapters(config: TenantConfig): PlatformAdapter[] {
  const adapters: PlatformAdapter[] = [];

  if (config.platforms.twitter?.enabled) {
    adapters.push(new TwitterAdapter());
  }
  if (config.platforms.googleReviews?.enabled) {
    adapters.push(new GoogleReviewsAdapter());
  }
  if (config.platforms.facebook?.enabled) {
    adapters.push(new FacebookAdapter());
  }

  return adapters;
}

/**
 * Prepare a mention for the ingestion endpoint by redacting PII
 */
function prepareForIngest(
  mention: SocialMention,
  redactor: PIIRedactor,
  tenantId: string
): CleanMention {
  const { redacted, piiDetected } = redactor.redact(mention.text);

  // Log PII detection for compliance audit trail
  if (piiDetected) {
    logPIIDetection(tenantId, mention.platform, mention.id);
  }

  return {
    id: mention.id,
    platform: mention.platform,
    text: redacted,
    timestamp: mention.timestamp,
    url: mention.url,
    rating: mention.rating,
    piiDetected,
  };
}

/**
 * Send a batch of events to the downstream ingestion endpoint
 */
async function sendBatch(
  events: Array<{
    eventId: string;
    tenantId: string;
    stage: string;
    metricName: string;
    value: number;
    timestamp: number;
    meta?: Record<string, unknown>;
  }>,
  ingestUrl: string
): Promise<void> {
  const response = await fetch(`${ingestUrl}/ingest/batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ events }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Batch ingest failed: ${response.status} ${error}`);
  }

  const result = await response.json() as { queued: number; failed: number };
  console.log(`Sent batch to ingestion endpoint: ${result.queued} queued, ${result.failed} failed`);
}

/**
 * Process a single tenant's social media monitoring
 */
async function processTenant(tenant: TenantConfig, env: Env): Promise<void> {
  console.log(`Processing tenant: ${tenant.tenantId}`);

  const adapters = getEnabledAdapters(tenant);
  if (adapters.length === 0) {
    console.log(`No enabled adapters for tenant ${tenant.tenantId}`);
    return;
  }

  const redactor = new PIIRedactor();
  const analyzer = new SentimentAnalyzer(env.AI);
  const builder = new BatchBuilder();

  // 1. Fetch mentions from all enabled platforms
  const allMentions: SocialMention[] = [];
  for (const adapter of adapters) {
    try {
      console.log(`Fetching from ${adapter.name} for ${tenant.tenantId}`);
      const mentions = await adapter.fetch(tenant);
      console.log(`Got ${mentions.length} mentions from ${adapter.name}`);
      allMentions.push(...mentions);
    } catch (error) {
      logError("adapter_fetch_failed", error, {
        adapter: adapter.name,
        tenantId: tenant.tenantId,
      });
    }
  }

  if (allMentions.length === 0) {
    console.log(`No mentions found for tenant ${tenant.tenantId}`);
    return;
  }

  // 2. Redact PII from all mentions
  const cleanMentions = allMentions.map((m) => prepareForIngest(m, redactor, tenant.tenantId));
  console.log(`Redacted PII from ${cleanMentions.length} mentions`);

  // 3. Analyze sentiment for all mentions
  const sentiments = await analyzer.analyzeBatch(cleanMentions.map((m) => m.text));
  console.log(`Analyzed sentiment for ${sentiments.length} mentions`);

  // 4. Build ingest events
  for (let i = 0; i < cleanMentions.length; i++) {
    builder.addMention(cleanMentions[i], sentiments[i], tenant.tenantId, tenant.stage);
  }

  // 5. Send batches to ingestion endpoint
  const batches = builder.getBatches(100);
  console.log(`Sending ${batches.length} batches to ingestion endpoint`);

  for (const batch of batches) {
    await sendBatch(batch, env.INGEST_ENDPOINT_URL);
  }

  console.log(`Completed processing for tenant ${tenant.tenantId}`);
}

// ─── Publishing Pipeline (new) ───────────────────────────────

const publishers: Record<string, BlueskyPublisher> = {
  bluesky: new BlueskyPublisher(),
};

/**
 * Process scheduled posts that are due for publishing.
 * Runs on every cron cycle — checks content_queue for due items.
 */
async function processScheduledPublishing(env: Env): Promise<void> {
  const due = await env.DB.prepare(`
    SELECT id, tenant_id, platform, content, media_url, media_alt, link_url, retry_count, max_retries
    FROM content_queue
    WHERE status = 'scheduled' AND scheduled_at <= datetime('now')
    ORDER BY scheduled_at ASC
    LIMIT 10
  `).all<{
    id: string; tenant_id: string; platform: string; content: string;
    media_url: string | null; media_alt: string | null; link_url: string | null;
    retry_count: number; max_retries: number;
  }>();

  if (due.results.length === 0) return;

  console.log(`[publisher] ${due.results.length} scheduled post(s) due`);

  for (const post of due.results) {
    const publisher = publishers[post.platform];
    if (!publisher) {
      console.error(`[publisher] Unknown platform: ${post.platform}`);
      await env.DB.prepare(`
        UPDATE content_queue SET status = 'failed', error = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(`Unsupported platform: ${post.platform}`, post.id).run();
      continue;
    }

    // Mark as publishing to prevent double-processing
    await env.DB.prepare(
      `UPDATE content_queue SET status = 'publishing', updated_at = datetime('now') WHERE id = ?`
    ).bind(post.id).run();

    const start = Date.now();

    try {
      const credentials = await loadPublisherCredentials(
        env.TENANT_CONFIG, post.tenant_id, post.platform as Platform,
      );

      const result = await publisher.publish({
        text: post.content,
        imageUrl: post.media_url ?? undefined,
        imageAlt: post.media_alt ?? undefined,
        linkUrl: post.link_url ?? undefined,
      }, credentials);

      const durationMs = Date.now() - start;

      await env.DB.batch([
        env.DB.prepare(`
          UPDATE content_queue SET status = 'published', published_at = datetime('now'),
            post_url = ?, post_id = ?, updated_at = datetime('now')
          WHERE id = ?
        `).bind(result.url, result.id, post.id),

        env.DB.prepare(`
          INSERT INTO publish_history (id, queue_id, tenant_id, platform, content, post_url, post_id, action, status, duration_ms)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'publish', 'success', ?)
        `).bind(crypto.randomUUID(), post.id, post.tenant_id, post.platform, post.content, result.url, result.id, durationMs),
      ]);

      console.log(`[publisher] Published ${post.platform}: ${result.url}`);
    } catch (err) {
      const durationMs = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      const newRetryCount = post.retry_count + 1;
      const finalStatus = newRetryCount >= post.max_retries ? 'failed' : 'scheduled';

      await env.DB.batch([
        env.DB.prepare(`
          UPDATE content_queue SET status = ?, error = ?, retry_count = ?, updated_at = datetime('now')
          WHERE id = ?
        `).bind(finalStatus, msg, newRetryCount, post.id),

        env.DB.prepare(`
          INSERT INTO publish_history (id, queue_id, tenant_id, platform, content, action, status, error, duration_ms)
          VALUES (?, ?, ?, ?, ?, 'publish', 'failed', ?, ?)
        `).bind(crypto.randomUUID(), post.id, post.tenant_id, post.platform, post.content, msg, durationMs),
      ]);

      console.error(`[publisher] Failed ${post.id} (attempt ${newRetryCount}/${post.max_retries}): ${msg}`);
    }
  }
}

// ─── Worker Entry Point ──────────────────────────────────────

export default {
  /**
   * Cron trigger handler — runs every 15 minutes
   * Handles both monitoring (mentions) and publishing (scheduled posts)
   */
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    console.log(`Social Sentinel cron triggered at ${new Date(event.scheduledTime).toISOString()}`);

    // 1. Monitoring pipeline — process mentions from all tenants
    try {
      const tenants = await loadTenantConfigs(env.TENANT_CONFIG);
      console.log(`Loaded ${tenants.length} tenant configurations`);

      for (const tenant of tenants) {
        ctx.waitUntil(
          processTenant(tenant, env).catch((error) => {
            logError("tenant_processing_failed", error, {
              tenantId: tenant.tenantId,
            });
          })
        );
      }
    } catch (error) {
      logError("cron_monitoring_failed", error);
    }

    // 2. Publishing pipeline — publish scheduled posts
    ctx.waitUntil(
      processScheduledPublishing(env).catch((error) => {
        logError("cron_publishing_failed", error);
      })
    );
  },

  /**
   * HTTP handler for API endpoints, health checks, and manual triggers
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Dashboard — serves the control center UI
    if (url.pathname === "/dashboard") {
      return new Response(renderDashboard(), {
        headers: { "Content-Type": "text/html;charset=utf-8" },
      });
    }

    // Health check — public endpoint
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({
        status: "ok",
        version: "2.0.0",
        capabilities: ["monitoring", "publishing"],
        timestamp: Date.now(),
      }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Publishing routes — /publish, /schedule, /drafts, /history, /engage, /feed
    const publishResponse = await handlePublishRoutes(request, env, url);
    if (publishResponse) return publishResponse;

    // Manual trigger — requires authentication (monitoring)
    if (url.pathname === "/trigger" && request.method === "POST") {
      if (!env.TRIGGER_API_KEY) {
        return new Response(
          JSON.stringify({ error: "Manual trigger is disabled" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }

      const authHeader = request.headers.get("Authorization");
      if (authHeader !== `Bearer ${env.TRIGGER_API_KEY}`) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }

      try {
        const tenants = await loadTenantConfigs(env.TENANT_CONFIG);
        for (const tenant of tenants) {
          ctx.waitUntil(processTenant(tenant, env));
        }

        return new Response(
          JSON.stringify({ message: `Triggered processing for ${tenants.length} tenants` }),
          { headers: { "Content-Type": "application/json" } }
        );
      } catch (error) {
        logError("manual_trigger_failed", error);
        return new Response(
          JSON.stringify({ error: "Failed to trigger processing" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};
