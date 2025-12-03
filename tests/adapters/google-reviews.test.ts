import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GoogleReviewsAdapter } from "../../src/adapters/google-reviews";
import type { TenantConfig } from "../../src/config";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("GoogleReviewsAdapter", () => {
  const adapter = new GoogleReviewsAdapter();

  const mockConfig: TenantConfig = {
    tenantId: "test-tenant",
    stage: "production",
    enabled: true,
    platforms: {
      googleReviews: {
        enabled: true,
        apiKey: "test-api-key",
        placeId: "ChIJ-test-place-id",
      },
    },
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return empty array when Google Reviews is disabled", async () => {
    const disabledConfig: TenantConfig = {
      ...mockConfig,
      platforms: {
        googleReviews: { ...mockConfig.platforms.googleReviews!, enabled: false },
      },
    };

    const result = await adapter.fetch(disabledConfig);
    expect(result).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should fetch and parse reviews correctly", async () => {
    const reviewTime = Math.floor(Date.now() / 1000);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          result: {
            name: "Test Business",
            reviews: [
              {
                author_name: "John Doe",
                rating: 5,
                text: "Excellent service!",
                time: reviewTime,
                relative_time_description: "a moment ago",
              },
            ],
          },
          status: "OK",
        }),
    });

    const result = await adapter.fetch(mockConfig);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      platform: "google_reviews",
      text: "Excellent service!",
      author: "John Doe",
      rating: 5,
    });
    expect(result[0].timestamp).toBe(reviewTime * 1000);
  });

  it("should generate deterministic IDs", async () => {
    const reviewTime = 1700000000;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          result: {
            reviews: [
              {
                author_name: "Jane Smith",
                rating: 4,
                text: "Good stuff",
                time: reviewTime,
              },
            ],
          },
          status: "OK",
        }),
    });

    const result1 = await adapter.fetch(mockConfig);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          result: {
            reviews: [
              {
                author_name: "Jane Smith",
                rating: 4,
                text: "Good stuff",
                time: reviewTime,
              },
            ],
          },
          status: "OK",
        }),
    });

    const result2 = await adapter.fetch(mockConfig);

    expect(result1[0].id).toBe(result2[0].id);
  });

  it("should return empty array when no reviews", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          result: {},
          status: "OK",
        }),
    });

    const result = await adapter.fetch(mockConfig);
    expect(result).toHaveLength(0);
  });

  it("should throw on API error status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          status: "INVALID_REQUEST",
          error_message: "Invalid place ID",
        }),
    });

    await expect(adapter.fetch(mockConfig)).rejects.toThrow("INVALID_REQUEST");
  });
});
