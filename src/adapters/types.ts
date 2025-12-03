import type { TenantConfig } from "../config";

/**
 * Represents a social media mention from any platform
 */
export interface SocialMention {
  /** Platform-specific unique ID (used for deduplication) */
  id: string;

  /** Source platform */
  platform: "twitter" | "google_reviews" | "facebook";

  /** Raw text content of the mention/review */
  text: string;

  /** Author name (will be redacted before sending to AiDoctor) */
  author?: string;

  /** Unix timestamp in milliseconds */
  timestamp: number;

  /** URL to the original post/review */
  url?: string;

  /** Star rating (1-5) for reviews */
  rating?: number;

  /** Additional platform-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Mention after PII redaction, ready for processing
 */
export interface CleanMention {
  id: string;
  platform: SocialMention["platform"];
  text: string;
  timestamp: number;
  url?: string;
  rating?: number;
  /** Types of PII that were detected and redacted */
  piiDetected: string[];
}

/**
 * Interface that all platform adapters must implement
 */
export interface PlatformAdapter {
  /** Human-readable name of the adapter */
  name: string;

  /** Platform identifier */
  platform: SocialMention["platform"];

  /**
   * Fetch recent mentions from the platform
   * @param config Tenant configuration with API credentials
   * @returns Array of social mentions
   */
  fetch(config: TenantConfig): Promise<SocialMention[]>;
}
