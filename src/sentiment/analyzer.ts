/**
 * Sentiment Analysis Layer
 *
 * Uses Cloudflare Workers AI to analyze sentiment of social media text.
 * The distilbert-sst-2 model returns POSITIVE or NEGATIVE with confidence scores.
 */

export interface SentimentResult {
  /** Sentiment label: positive or negative */
  label: "positive" | "negative";
  /** Confidence score from the model (0.0 to 1.0) */
  score: number;
  /** Normalized score for ingestion (-1.0 to +1.0) */
  normalizedScore: number;
}

/** Workers AI text classification response */
interface AITextClassificationResult {
  label: string;
  score: number;
}

export class SentimentAnalyzer {
  private ai: Ai;
  private model = "@cf/huggingface/distilbert-sst-2-int8";

  constructor(ai: Ai) {
    this.ai = ai;
  }

  /**
   * Analyze sentiment of a single text
   * @param text Text to analyze
   * @returns Sentiment result with label and scores
   */
  async analyze(text: string): Promise<SentimentResult> {
    // Truncate very long texts (model has token limits)
    const truncated = text.length > 500 ? text.slice(0, 500) + "..." : text;

    try {
      const response = await this.ai.run(this.model as keyof AiModels, { text: truncated });

      // Workers AI returns array of results sorted by confidence
      const results = response as AITextClassificationResult[];
      const top = results[0];

      const label = top.label.toLowerCase() as "positive" | "negative";
      const score = top.score;

      // Normalize to -1 to +1 scale:
      // POSITIVE with 0.9 confidence → +0.9
      // NEGATIVE with 0.9 confidence → -0.9
      const normalizedScore = label === "positive" ? score : -score;

      return { label, score, normalizedScore };
    } catch (error) {
      console.error("Sentiment analysis failed:", error);
      // Return neutral on error
      return {
        label: "positive",
        score: 0.5,
        normalizedScore: 0,
      };
    }
  }

  /**
   * Analyze sentiment for multiple texts with concurrency control
   * @param texts Array of texts to analyze
   * @param concurrency Max concurrent requests (default 10)
   * @returns Array of sentiment results in same order as input
   */
  async analyzeBatch(texts: string[], concurrency = 10): Promise<SentimentResult[]> {
    const results: SentimentResult[] = [];

    // Process in batches to avoid overwhelming the AI service
    for (let i = 0; i < texts.length; i += concurrency) {
      const batch = texts.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map((text) => this.analyze(text)));
      results.push(...batchResults);
    }

    return results;
  }
}
