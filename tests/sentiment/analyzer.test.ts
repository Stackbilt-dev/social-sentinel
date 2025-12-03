import { describe, it, expect, vi, beforeEach } from "vitest";
import { SentimentAnalyzer } from "../../src/sentiment/analyzer";

// Mock Ai interface
const createMockAi = (responses: Array<Array<{ label: string; score: number }>>) => {
  let callCount = 0;
  return {
    run: vi.fn().mockImplementation(() => {
      const response = responses[callCount] || responses[0];
      callCount++;
      return Promise.resolve(response);
    }),
  } as unknown as Ai;
};

describe("SentimentAnalyzer", () => {
  describe("analyze", () => {
    it("should return positive sentiment with correct normalized score", async () => {
      const mockAi = createMockAi([[{ label: "POSITIVE", score: 0.95 }]]);
      const analyzer = new SentimentAnalyzer(mockAi);

      const result = await analyzer.analyze("This product is amazing!");

      expect(result.label).toBe("positive");
      expect(result.score).toBe(0.95);
      expect(result.normalizedScore).toBe(0.95);
    });

    it("should return negative sentiment with correct normalized score", async () => {
      const mockAi = createMockAi([[{ label: "NEGATIVE", score: 0.87 }]]);
      const analyzer = new SentimentAnalyzer(mockAi);

      const result = await analyzer.analyze("Terrible experience, never again.");

      expect(result.label).toBe("negative");
      expect(result.score).toBe(0.87);
      expect(result.normalizedScore).toBe(-0.87);
    });

    it("should truncate very long texts", async () => {
      const mockAi = createMockAi([[{ label: "POSITIVE", score: 0.8 }]]);
      const analyzer = new SentimentAnalyzer(mockAi);

      const longText = "a".repeat(1000);
      await analyzer.analyze(longText);

      expect(mockAi.run).toHaveBeenCalledWith(
        "@cf/huggingface/distilbert-sst-2-int8",
        { text: expect.stringContaining("...") }
      );
    });

    it("should return neutral on AI error", async () => {
      const mockAi = {
        run: vi.fn().mockRejectedValue(new Error("AI service unavailable")),
      } as unknown as Ai;
      const analyzer = new SentimentAnalyzer(mockAi);

      const result = await analyzer.analyze("Some text");

      expect(result.normalizedScore).toBe(0);
      expect(result.score).toBe(0.5);
    });
  });

  describe("analyzeBatch", () => {
    it("should analyze multiple texts", async () => {
      const mockAi = createMockAi([
        [{ label: "POSITIVE", score: 0.9 }],
        [{ label: "NEGATIVE", score: 0.8 }],
        [{ label: "POSITIVE", score: 0.7 }],
      ]);
      const analyzer = new SentimentAnalyzer(mockAi);

      const results = await analyzer.analyzeBatch([
        "Great!",
        "Terrible!",
        "Good",
      ]);

      expect(results).toHaveLength(3);
      expect(results[0].normalizedScore).toBe(0.9);
      expect(results[1].normalizedScore).toBe(-0.8);
      expect(results[2].normalizedScore).toBe(0.7);
    });

    it("should respect concurrency limit", async () => {
      const mockAi = createMockAi([[{ label: "POSITIVE", score: 0.9 }]]);
      const analyzer = new SentimentAnalyzer(mockAi);

      const texts = Array(25).fill("Test text");
      await analyzer.analyzeBatch(texts, 10);

      // Should have been called 25 times
      expect(mockAi.run).toHaveBeenCalledTimes(25);
    });

    it("should handle empty array", async () => {
      const mockAi = createMockAi([[{ label: "POSITIVE", score: 0.9 }]]);
      const analyzer = new SentimentAnalyzer(mockAi);

      const results = await analyzer.analyzeBatch([]);

      expect(results).toHaveLength(0);
      expect(mockAi.run).not.toHaveBeenCalled();
    });
  });
});
