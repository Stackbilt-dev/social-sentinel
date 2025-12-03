import { describe, it, expect, beforeEach } from "vitest";
import { BatchBuilder, generateEventId, type IngestEvent } from "../../src/batch/builder";
import type { CleanMention } from "../../src/adapters/types";
import type { SentimentResult } from "../../src/sentiment/analyzer";

describe("generateEventId", () => {
  it("should generate deterministic event IDs", () => {
    const mention: CleanMention = {
      id: "12345",
      platform: "twitter",
      text: "Test",
      timestamp: Date.now(),
      piiDetected: [],
    };

    const id1 = generateEventId(mention);
    const id2 = generateEventId(mention);

    expect(id1).toBe(id2);
    expect(id1).toBe("ss-twitter-12345");
  });

  it("should include suffix when provided", () => {
    const mention: CleanMention = {
      id: "abc",
      platform: "google_reviews",
      text: "Test",
      timestamp: Date.now(),
      piiDetected: [],
    };

    expect(generateEventId(mention, "count")).toBe("ss-google_reviews-abc-count");
    expect(generateEventId(mention, "rating")).toBe("ss-google_reviews-abc-rating");
  });
});

describe("BatchBuilder", () => {
  let builder: BatchBuilder;
  const baseMention: CleanMention = {
    id: "test-123",
    platform: "twitter",
    text: "Great product!",
    timestamp: 1700000000000,
    url: "https://twitter.com/user/status/test-123",
    piiDetected: [],
  };

  const baseSentiment: SentimentResult = {
    label: "positive",
    score: 0.92,
    normalizedScore: 0.92,
  };

  beforeEach(() => {
    builder = new BatchBuilder();
  });

  describe("addMention", () => {
    it("should create sentiment and count events for a mention", () => {
      builder.addMention(baseMention, baseSentiment, "tenant-1", "production");

      const events = builder.getEvents();
      expect(events).toHaveLength(2);

      // Sentiment event
      const sentimentEvent = events.find((e) => e.metricName === "twitter_sentiment");
      expect(sentimentEvent).toBeDefined();
      expect(sentimentEvent!.value).toBe(0.92);
      expect(sentimentEvent!.eventId).toBe("ss-twitter-test-123");

      // Count event
      const countEvent = events.find((e) => e.metricName === "twitter_mentions");
      expect(countEvent).toBeDefined();
      expect(countEvent!.value).toBe(1);
      expect(countEvent!.eventId).toBe("ss-twitter-test-123-count");
    });

    it("should create rating event when rating is present", () => {
      const mentionWithRating: CleanMention = {
        ...baseMention,
        platform: "google_reviews",
        rating: 5,
      };

      builder.addMention(mentionWithRating, baseSentiment, "tenant-1", "production");

      const events = builder.getEvents();
      expect(events).toHaveLength(3);

      const ratingEvent = events.find((e) => e.metricName === "google_reviews_rating");
      expect(ratingEvent).toBeDefined();
      expect(ratingEvent!.value).toBe(5);
    });

    it("should include PII detection info in metadata", () => {
      const mentionWithPII: CleanMention = {
        ...baseMention,
        piiDetected: ["email", "phone"],
      };

      builder.addMention(mentionWithPII, baseSentiment, "tenant-1", "production");

      const events = builder.getEvents();
      const sentimentEvent = events[0];

      expect(sentimentEvent.meta?.piiRedacted).toBe(true);
      expect(sentimentEvent.meta?.piiTypes).toEqual(["email", "phone"]);
    });

    it("should handle negative sentiment correctly", () => {
      const negativeSentiment: SentimentResult = {
        label: "negative",
        score: 0.85,
        normalizedScore: -0.85,
      };

      builder.addMention(baseMention, negativeSentiment, "tenant-1", "production");

      const events = builder.getEvents();
      const sentimentEvent = events.find((e) => e.metricName === "twitter_sentiment");

      expect(sentimentEvent!.value).toBe(-0.85);
      expect(sentimentEvent!.meta?.sentimentLabel).toBe("negative");
    });
  });

  describe("getBatches", () => {
    it("should return empty array when no events", () => {
      const batches = builder.getBatches();
      expect(batches).toHaveLength(0);
    });

    it("should return single batch when events < maxSize", () => {
      builder.addMention(baseMention, baseSentiment, "tenant-1", "production");

      const batches = builder.getBatches(100);
      expect(batches).toHaveLength(1);
      expect(batches[0]).toHaveLength(2); // sentiment + count
    });

    it("should split into multiple batches when events > maxSize", () => {
      // Add 60 mentions = 120 events (sentiment + count each)
      for (let i = 0; i < 60; i++) {
        const mention: CleanMention = { ...baseMention, id: `id-${i}` };
        builder.addMention(mention, baseSentiment, "tenant-1", "production");
      }

      const batches = builder.getBatches(50);
      expect(batches).toHaveLength(3); // 120 events / 50 = 3 batches
      expect(batches[0]).toHaveLength(50);
      expect(batches[1]).toHaveLength(50);
      expect(batches[2]).toHaveLength(20);
    });
  });

  describe("clear", () => {
    it("should remove all events", () => {
      builder.addMention(baseMention, baseSentiment, "tenant-1", "production");
      expect(builder.count).toBe(2);

      builder.clear();
      expect(builder.count).toBe(0);
      expect(builder.getEvents()).toHaveLength(0);
    });
  });

  describe("count", () => {
    it("should return correct event count", () => {
      expect(builder.count).toBe(0);

      builder.addMention(baseMention, baseSentiment, "tenant-1", "production");
      expect(builder.count).toBe(2);

      builder.addMention(
        { ...baseMention, id: "other", rating: 4 },
        baseSentiment,
        "tenant-1",
        "production"
      );
      expect(builder.count).toBe(5); // 2 + 3 (includes rating)
    });
  });
});
