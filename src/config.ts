import { z } from "zod";
import type { Platform, PublisherCredentials } from "./publishers/types";

/**
 * Twitter/X platform configuration
 */
export const TwitterConfigSchema = z.object({
  enabled: z.boolean(),
  bearerToken: z.string().min(1),
  searchQuery: z.string().min(1),
});

export type TwitterConfig = z.infer<typeof TwitterConfigSchema>;

/**
 * Google Reviews platform configuration
 */
export const GoogleReviewsConfigSchema = z.object({
  enabled: z.boolean(),
  apiKey: z.string().min(1),
  placeId: z.string().min(1),
});

export type GoogleReviewsConfig = z.infer<typeof GoogleReviewsConfigSchema>;

/**
 * Facebook platform configuration
 */
export const FacebookConfigSchema = z.object({
  enabled: z.boolean(),
  pageAccessToken: z.string().min(1),
  pageId: z.string().min(1),
});

export type FacebookConfig = z.infer<typeof FacebookConfigSchema>;

/**
 * Complete tenant configuration
 */
export const TenantConfigSchema = z.object({
  tenantId: z.string().min(1),
  stage: z.string().default("production"),
  enabled: z.boolean().default(true),
  platforms: z.object({
    twitter: TwitterConfigSchema.optional(),
    googleReviews: GoogleReviewsConfigSchema.optional(),
    facebook: FacebookConfigSchema.optional(),
  }),
});

export type TenantConfig = z.infer<typeof TenantConfigSchema>;

/**
 * Load all tenant configurations from KV
 */
export async function loadTenantConfigs(kv: KVNamespace): Promise<TenantConfig[]> {
  const configs: TenantConfig[] = [];

  // List all keys in the KV namespace
  const list = await kv.list();

  for (const key of list.keys) {
    try {
      const value = await kv.get(key.name);
      if (!value) continue;

      const parsed = TenantConfigSchema.safeParse(JSON.parse(value));
      if (parsed.success && parsed.data.enabled) {
        configs.push(parsed.data);
      } else if (!parsed.success) {
        console.error(`Invalid config for ${key.name}:`, parsed.error);
      }
    } catch (error) {
      console.error(`Failed to load config for ${key.name}:`, error);
    }
  }

  return configs;
}

// ─── Publisher Credentials ───────────────────────────────────

/**
 * Publisher credential schema — stored per-tenant in KV
 * Key format: `{tenantId}:publishers`
 */
export const PublisherCredentialsSchema = z.object({
  bluesky: z.object({
    handle: z.string().min(1),
    appPassword: z.string().min(1),
  }).optional(),
  twitter: z.object({
    apiKey: z.string().min(1),
    apiSecret: z.string().min(1),
    accessToken: z.string().min(1),
    accessTokenSecret: z.string().min(1),
  }).optional(),
  facebook: z.object({
    pageAccessToken: z.string().min(1),
    pageId: z.string().min(1),
  }).optional(),
});

export type PublisherCredentialsConfig = z.infer<typeof PublisherCredentialsSchema>;

/**
 * Load publisher credentials for a specific tenant and platform from KV.
 * Credentials are stored under key `{tenantId}:publishers`.
 */
export async function loadPublisherCredentials(
  kv: KVNamespace,
  tenantId: string,
  platform: Platform,
): Promise<PublisherCredentials> {
  const raw = await kv.get(`${tenantId}:publishers`);
  if (!raw) {
    throw new Error(`No publisher credentials found for tenant ${tenantId}`);
  }

  const parsed = PublisherCredentialsSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(`Invalid publisher credentials for tenant ${tenantId}: ${parsed.error.message}`);
  }

  const platformCreds = parsed.data[platform];
  if (!platformCreds) {
    throw new Error(`No ${platform} credentials configured for tenant ${tenantId}`);
  }

  // Flatten to PublisherCredentials (Record<string, string>)
  return platformCreds as unknown as PublisherCredentials;
}
