import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SpyInstance } from "vitest";
import { sanitizeError, logError, logPIIDetection } from "../../src/utils/logging";

describe("logging utilities", () => {
  let consoleErrorSpy: SpyInstance;
  let consoleWarnSpy: SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe("sanitizeError", () => {
    it("should extract message from Error object", () => {
      const error = new Error("Test error message");
      const result = sanitizeError(error);
      expect(result).toBe("Test error message");
    });

    it("should not include stack trace", () => {
      const error = new Error("Test error");
      const result = sanitizeError(error);
      expect(result).not.toContain("at");
      expect(result).not.toContain("Error:");
    });

    it("should handle non-Error objects", () => {
      const result = sanitizeError("simple string error");
      expect(result).toBe("simple string error");
    });

    it("should handle null and undefined", () => {
      expect(sanitizeError(null)).toBe("null");
      expect(sanitizeError(undefined)).toBe("undefined");
    });
  });

  describe("logError", () => {
    it("should log structured error without stack trace", () => {
      const error = new Error("Database connection failed");
      logError("db_connection", error);

      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);

      expect(loggedData).toEqual({
        context: "db_connection",
        error: "Database connection failed",
      });
    });

    it("should include metadata when provided", () => {
      const error = new Error("Fetch failed");
      logError("adapter_error", error, {
        adapter: "twitter",
        tenantId: "tenant-123",
      });

      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);

      expect(loggedData).toEqual({
        context: "adapter_error",
        error: "Fetch failed",
        adapter: "twitter",
        tenantId: "tenant-123",
      });
    });

    it("should sanitize error before logging", () => {
      const error = new Error("Secret: abc123");
      error.stack = "Error: Secret: abc123\n  at file.ts:10:5\n  at otherFile.ts:20:10";

      logError("test_context", error);

      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);
      expect(loggedData.error).toBe("Secret: abc123");
      expect(loggedData.error).not.toContain("at file.ts");
    });
  });

  describe("logPIIDetection", () => {
    it("should log PII detection event with all required fields", () => {
      const tenantId = "tenant-456";
      const platform = "twitter";
      const mentionId = "tweet-789";

      logPIIDetection(tenantId, platform, mentionId);

      expect(consoleWarnSpy).toHaveBeenCalledOnce();
      const loggedData = JSON.parse(consoleWarnSpy.mock.calls[0][0] as string);

      expect(loggedData).toMatchObject({
        event: "pii_detected",
        tenantId: "tenant-456",
        platform: "twitter",
        mentionId: "tweet-789",
      });
      expect(loggedData.timestamp).toBeTypeOf("number");
    });

    it("should use console.warn for PII detection", () => {
      logPIIDetection("tenant-1", "facebook", "post-1");
      expect(consoleWarnSpy).toHaveBeenCalledOnce();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });
});
