/**
 * Batch Builder
 *
 * Builds AiDoctor-compatible events from processed social mentions
 * and sentiment results. Handles event ID generation for deduplication.
 */

import type { CleanMention } from "../adapters/types";
import type { SentimentResult } from "../sentiment/analyzer";

/** AiDoctor ingest event format */
export interface IngestEvent {
  eventId: string;
  tenantId: string;
  stage: string;
  metricName: string;
  value: number;
  timestamp: number;
  meta?: Record<string, unknown>;
}

/**
 * Generate deterministic event ID for AiDoctor deduplication
 * Format: ss-{platform}-{platform_id}
 *
 * This ensures the same mention processed twice will have the same eventId,
 * allowing AiDoctor's 24-hour deduplication to handle it.
 */
export function generateEventId(mention: CleanMention, suffix?: string): string {
  const base = `ss-${mention.platform}-${mention.id}`;
  return suffix ? `${base}-${suffix}` : base;
}

export class BatchBuilder {
  private events: IngestEvent[] = [];

  /**
   * Add a mention with its sentiment analysis to the batch
   */
  addMention(
    mention: CleanMention,
    sentiment: SentimentResult,
    tenantId: string,
    stage: string
  ): void {
    // 1. Sentiment score event (-1 to +1)
    this.events.push({
      eventId: generateEventId(mention),
      tenantId,
      stage,
      metricName: `${mention.platform}_sentiment`,
      value: sentiment.normalizedScore,
      timestamp: mention.timestamp,
      meta: {
        platform: mention.platform,
        sentimentLabel: sentiment.label,
        sentimentConfidence: sentiment.score,
        textLength: mention.text.length,
        hasRating: !!mention.rating,
        rating: mention.rating,
        url: mention.url,
        piiRedacted: mention.piiDetected.length > 0,
        piiTypes: mention.piiDetected,
      },
    });

    // 2. Mention count event (for volume tracking)
    this.events.push({
      eventId: generateEventId(mention, "count"),
      tenantId,
      stage,
      metricName: `${mention.platform}_mentions`,
      value: 1,
      timestamp: mention.timestamp,
      meta: {
        platform: mention.platform,
        sentimentLabel: sentiment.label,
      },
    });

    // 3. Rating event (for Google Reviews, Facebook reviews)
    if (mention.rating !== undefined) {
      this.events.push({
        eventId: generateEventId(mention, "rating"),
        tenantId,
        stage,
        metricName: `${mention.platform}_rating`,
        value: mention.rating,
        timestamp: mention.timestamp,
        meta: {
          platform: mention.platform,
        },
      });
    }
  }

  /**
   * Get all events accumulated so far
   */
  getEvents(): IngestEvent[] {
    return [...this.events];
  }

  /**
   * Split events into batches of specified size
   * @param maxSize Maximum events per batch (default 100)
   */
  getBatches(maxSize = 100): IngestEvent[][] {
    const batches: IngestEvent[][] = [];

    for (let i = 0; i < this.events.length; i += maxSize) {
      batches.push(this.events.slice(i, i + maxSize));
    }

    return batches;
  }

  /**
   * Clear all accumulated events
   */
  clear(): void {
    this.events = [];
  }

  /**
   * Get count of accumulated events
   */
  get count(): number {
    return this.events.length;
  }
}
