import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TwitterAdapter } from "../../src/adapters/twitter";
import type { TenantConfig } from "../../src/config";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("TwitterAdapter", () => {
  const adapter = new TwitterAdapter();

  const mockConfig: TenantConfig = {
    tenantId: "test-tenant",
    stage: "production",
    enabled: true,
    platforms: {
      twitter: {
        enabled: true,
        bearerToken: "test-bearer-token",
        searchQuery: "@TestBrand OR \"Test Brand\"",
      },
    },
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return empty array when Twitter is disabled", async () => {
    const disabledConfig: TenantConfig = {
      ...mockConfig,
      platforms: {
        twitter: { ...mockConfig.platforms.twitter!, enabled: false },
      },
    };

    const result = await adapter.fetch(disabledConfig);
    expect(result).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should fetch and parse tweets correctly", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            {
              id: "123456",
              text: "Love @TestBrand products!",
              created_at: "2024-01-15T10:30:00.000Z",
              author_id: "user-1",
            },
          ],
          includes: {
            users: [{ id: "user-1", username: "testuser", name: "Test User" }],
          },
          meta: { result_count: 1 },
        }),
    });

    const result = await adapter.fetch(mockConfig);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "123456",
      platform: "twitter",
      text: "Love @TestBrand products!",
      author: "Test User",
    });
    expect(result[0].url).toContain("123456");
  });

  it("should return empty array when no tweets found", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          meta: { result_count: 0 },
        }),
    });

    const result = await adapter.fetch(mockConfig);
    expect(result).toHaveLength(0);
  });

  it("should throw on API error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });

    await expect(adapter.fetch(mockConfig)).rejects.toThrow("Twitter API error: 401");
  });

  it("should include correct authorization header", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ meta: { result_count: 0 } }),
    });

    await adapter.fetch(mockConfig);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { Authorization: "Bearer test-bearer-token" },
      })
    );
  });
});
