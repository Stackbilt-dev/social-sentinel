import { describe, it, expect, vi } from "vitest";

// Mock the entire index module
const mockProcessTenant = vi.fn();
const mockLoadTenantConfigs = vi.fn();

vi.mock("../../src/config", () => ({
  loadTenantConfigs: mockLoadTenantConfigs,
}));

describe("HTTP endpoint authentication", () => {
  const createMockEnv = (triggerApiKey?: string) => ({
    TENANT_CONFIG: {} as KVNamespace,
    AI: {} as Ai,
    AIDOCTOR_URL: "https://test.example.com",
    TRIGGER_API_KEY: triggerApiKey,
  });

  const createMockContext = (): ExecutionContext => ({
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    props: {},
  });

  describe("/health endpoint", () => {
    it("should be publicly accessible without authentication", async () => {
      const { default: worker } = await import("../../src/index");
      const request = new Request("https://example.com/health");
      const env = createMockEnv();
      const ctx = createMockContext();

      const response = await worker.fetch(request, env, ctx);
      const data = await response.json() as { status: string; timestamp: number };

      expect(response.status).toBe(200);
      expect(data.status).toBe("ok");
      expect(data.timestamp).toBeTypeOf("number");
    });
  });

  describe("/trigger endpoint", () => {
    it("should return 403 when TRIGGER_API_KEY is not configured", async () => {
      const { default: worker } = await import("../../src/index");
      const request = new Request("https://example.com/trigger", {
        method: "POST",
      });
      const env = createMockEnv(); // No API key
      const ctx = createMockContext();

      const response = await worker.fetch(request, env, ctx);
      const data = await response.json() as { error: string };

      expect(response.status).toBe(403);
      expect(data.error).toBe("Manual trigger is disabled");
    });

    it("should return 401 when Authorization header is missing", async () => {
      const { default: worker } = await import("../../src/index");
      const request = new Request("https://example.com/trigger", {
        method: "POST",
      });
      const env = createMockEnv("secret-key-123");
      const ctx = createMockContext();

      const response = await worker.fetch(request, env, ctx);
      const data = await response.json() as { error: string };

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("should return 401 when Authorization header is incorrect", async () => {
      const { default: worker } = await import("../../src/index");
      const request = new Request("https://example.com/trigger", {
        method: "POST",
        headers: {
          Authorization: "Bearer wrong-key",
        },
      });
      const env = createMockEnv("secret-key-123");
      const ctx = createMockContext();

      const response = await worker.fetch(request, env, ctx);
      const data = await response.json() as { error: string };

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("should accept valid Bearer token and trigger processing", async () => {
      mockLoadTenantConfigs.mockResolvedValue([
        {
          tenantId: "tenant-1",
          stage: "production",
          enabled: true,
          platforms: {},
        },
        {
          tenantId: "tenant-2",
          stage: "staging",
          enabled: true,
          platforms: {},
        },
      ]);

      const { default: worker } = await import("../../src/index");
      const request = new Request("https://example.com/trigger", {
        method: "POST",
        headers: {
          Authorization: "Bearer secret-key-123",
        },
      });
      const env = createMockEnv("secret-key-123");
      const ctx = createMockContext();

      const response = await worker.fetch(request, env, ctx);
      const data = await response.json() as { message: string };

      expect(response.status).toBe(200);
      expect(data.message).toBe("Triggered processing for 2 tenants");
      expect(mockLoadTenantConfigs).toHaveBeenCalledWith(env.TENANT_CONFIG);
    });

    it("should only accept POST method", async () => {
      const { default: worker } = await import("../../src/index");
      const request = new Request("https://example.com/trigger", {
        method: "GET",
        headers: {
          Authorization: "Bearer secret-key-123",
        },
      });
      const env = createMockEnv("secret-key-123");
      const ctx = createMockContext();

      const response = await worker.fetch(request, env, ctx);

      expect(response.status).toBe(404);
    });
  });

  describe("unknown endpoints", () => {
    it("should return 404 for unknown paths", async () => {
      const { default: worker } = await import("../../src/index");
      const request = new Request("https://example.com/unknown");
      const env = createMockEnv();
      const ctx = createMockContext();

      const response = await worker.fetch(request, env, ctx);

      expect(response.status).toBe(404);
    });
  });
});
