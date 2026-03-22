/**
 * Sanitize error messages to prevent information disclosure
 */
export function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    // Only return the message, not the stack trace
    return error.message;
  }
  return String(error);
}

/**
 * Log error without exposing sensitive details
 */
export function logError(context: string, error: unknown, metadata?: Record<string, string>): void {
  const sanitized = sanitizeError(error);
  const logData = {
    context,
    error: sanitized,
    ...metadata,
  };
  console.error(JSON.stringify(logData));
}

/**
 * Log PII detection for compliance audit trail
 */
export function logPIIDetection(tenantId: string, platform: string, mentionId: string): void {
  console.warn(
    JSON.stringify({
      event: "pii_detected",
      tenantId,
      platform,
      mentionId,
      timestamp: Date.now(),
    })
  );
}
