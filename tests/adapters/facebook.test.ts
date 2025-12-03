import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FacebookAdapter } from "../../src/adapters/facebook";
import type { TenantConfig } from "../../src/config";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("FacebookAdapter", () => {
  const adapter = new FacebookAdapter();

  const mockConfig: TenantConfig = {
    tenantId: "test-tenant",
    stage: "production",
    enabled: true,
    platforms: {
      facebook: {
        enabled: true,
        pageAccessToken: "test-page-token",
        pageId: "123456789",
      },
    },
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return empty array when Facebook is disabled", async () => {
    const disabledConfig: TenantConfig = {
      ...mockConfig,
      platforms: {
        facebook: { ...mockConfig.platforms.facebook!, enabled: false },
      },
    };

    const result = await adapter.fetch(disabledConfig);
    expect(result).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should fetch reviews and feed posts", async () => {
    const now = new Date().toISOString();

    // Mock ratings endpoint
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            {
              reviewer: { id: "user-1", name: "Test Reviewer" },
              rating: 5,
              review_text: "Great business!",
              created_time: now,
            },
          ],
        }),
    });

    // Mock feed endpoint
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            {
              id: "post-123",
              message: "Loved visiting this place!",
              from: { id: "user-2", name: "Feed User" },
              created_time: now,
              permalink_url: "https://facebook.com/post/123",
            },
          ],
        }),
    });

    const result = await adapter.fetch(mockConfig);

    // Should have 1 review + 1 feed post
    expect(result).toHaveLength(2);

    const review = result.find((m) => m.text === "Great business!");
    expect(review).toBeDefined();
    expect(review?.rating).toBe(5);
    expect(review?.author).toBe("Test Reviewer");

    const feedPost = result.find((m) => m.text === "Loved visiting this place!");
    expect(feedPost).toBeDefined();
    expect(feedPost?.url).toBe("https://facebook.com/post/123");
  });

  it("should handle empty responses", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });

    const result = await adapter.fetch(mockConfig);
    expect(result).toHaveLength(0);
  });

  it("should continue if feed endpoint fails", async () => {
    const now = new Date().toISOString();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            {
              reviewer: { id: "user-1", name: "Reviewer" },
              rating: 4,
              review_text: "Nice!",
              created_time: now,
            },
          ],
        }),
    });

    // Feed endpoint fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: () => Promise.resolve("Permission denied"),
    });

    const result = await adapter.fetch(mockConfig);

    // Should still return the review
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Nice!");
  });

  it("should throw on ratings API error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          error: {
            code: 190,
            message: "Invalid access token",
          },
        }),
    });

    await expect(adapter.fetch(mockConfig)).rejects.toThrow("Invalid access token");
  });
});
