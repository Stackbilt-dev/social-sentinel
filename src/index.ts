import type { Env } from "./env";
import { loadTenantConfigs, type TenantConfig } from "./config";
import { PIIRedactor } from "./pii/redactor";
import { SentimentAnalyzer } from "./sentiment/analyzer";
import { BatchBuilder } from "./batch/builder";
import { TwitterAdapter } from "./adapters/twitter";
import { GoogleReviewsAdapter } from "./adapters/google-reviews";
import { FacebookAdapter } from "./adapters/facebook";
import type { PlatformAdapter, SocialMention, CleanMention } from "./adapters/types";

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
 * Prepare a mention for ingestion by redacting PII
 */
function prepareForIngest(mention: SocialMention, redactor: PIIRedactor): CleanMention {
  const { redacted, piiDetected } = redactor.redact(mention.text);

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
 * Send a batch of events to AiDoctor
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
  aidoctorUrl: string
): Promise<void> {
  const response = await fetch(`${aidoctorUrl}/ingest/batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ events }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AiDoctor batch ingest failed: ${response.status} ${error}`);
  }

  const result = await response.json() as { queued: number; failed: number };
  console.log(`Sent batch to AiDoctor: ${result.queued} queued, ${result.failed} failed`);
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
      console.error(`Adapter ${adapter.name} failed for ${tenant.tenantId}:`, error);
      // Continue with other adapters
    }
  }

  if (allMentions.length === 0) {
    console.log(`No mentions found for tenant ${tenant.tenantId}`);
    return;
  }

  // 2. Redact PII from all mentions
  const cleanMentions = allMentions.map((m) => prepareForIngest(m, redactor));
  console.log(`Redacted PII from ${cleanMentions.length} mentions`);

  // 3. Analyze sentiment for all mentions
  const sentiments = await analyzer.analyzeBatch(cleanMentions.map((m) => m.text));
  console.log(`Analyzed sentiment for ${sentiments.length} mentions`);

  // 4. Build AiDoctor events
  for (let i = 0; i < cleanMentions.length; i++) {
    builder.addMention(cleanMentions[i], sentiments[i], tenant.tenantId, tenant.stage);
  }

  // 5. Send batches to AiDoctor
  const batches = builder.getBatches(100);
  console.log(`Sending ${batches.length} batches to AiDoctor`);

  for (const batch of batches) {
    await sendBatch(batch, env.AIDOCTOR_URL);
  }

  console.log(`Completed processing for tenant ${tenant.tenantId}`);
}

export default {
  /**
   * Cron trigger handler - runs every 15 minutes
   */
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    console.log(`Social Sentinel cron triggered at ${new Date(event.scheduledTime).toISOString()}`);

    try {
      const tenants = await loadTenantConfigs(env.TENANT_CONFIG);
      console.log(`Loaded ${tenants.length} tenant configurations`);

      // Process each tenant concurrently using waitUntil
      for (const tenant of tenants) {
        ctx.waitUntil(
          processTenant(tenant, env).catch((error) => {
            console.error(`Failed to process tenant ${tenant.tenantId}:`, error);
          })
        );
      }
    } catch (error) {
      console.error("Social Sentinel cron failed:", error);
      throw error;
    }
  },

  /**
   * HTTP handler for manual triggers and health checks
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", timestamp: Date.now() }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Manual trigger (for testing)
    if (url.pathname === "/trigger" && request.method === "POST") {
      const tenants = await loadTenantConfigs(env.TENANT_CONFIG);

      for (const tenant of tenants) {
        ctx.waitUntil(processTenant(tenant, env));
      }

      return new Response(
        JSON.stringify({ message: `Triggered processing for ${tenants.length} tenants` }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response("Not Found", { status: 404 });
  },
};
