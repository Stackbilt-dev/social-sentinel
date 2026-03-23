/**
 * PII Redaction Layer
 *
 * Scrubs personally identifiable information from social media text
 * before sending to the downstream ingestion endpoint. Uses regex patterns
 * to detect and replace common PII types.
 */

interface PIIPattern {
  name: string;
  regex: RegExp;
  replacement: string;
}

export interface RedactionResult {
  /** Text with PII replaced by placeholders */
  redacted: string;
  /** Types of PII that were detected */
  piiDetected: string[];
}

export class PIIRedactor {
  private patterns: PIIPattern[] = [
    // Email addresses
    {
      name: "email",
      regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      replacement: "[EMAIL]",
    },

    // Phone numbers (various formats)
    // Matches: +1-555-123-4567, (555) 123-4567, 555.123.4567, 5551234567
    {
      name: "phone",
      regex: /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
      replacement: "[PHONE]",
    },

    // Social Security Numbers
    // Matches: 123-45-6789, 123 45 6789, 123456789
    {
      name: "ssn",
      regex: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
      replacement: "[SSN]",
    },

    // Credit card numbers (basic pattern)
    // Matches: 1234-5678-9012-3456, 1234 5678 9012 3456
    {
      name: "credit_card",
      regex: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
      replacement: "[CREDIT_CARD]",
    },

    // Street addresses (US format)
    // Matches: 123 Main Street, 456 Oak Ave, 789 Broadway Blvd
    {
      name: "address",
      regex: /\b\d+\s+[\w\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|circle|cir|place|pl)\.?\b/gi,
      replacement: "[ADDRESS]",
    },

    // IP addresses
    {
      name: "ip_address",
      regex: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
      replacement: "[IP]",
    },

    // @mentions (social media handles)
    // Preserves that a mention occurred but redacts the username
    {
      name: "mention",
      regex: /@[\w]{1,50}/g,
      replacement: "@[USER]",
    },

    // URLs with potential tracking/personal info
    // Keep domain but redact path/query that might contain PII
    {
      name: "url_pii",
      regex: /https?:\/\/[^\s]+[?&](?:email|user|name|id|token)=[^\s&]+/gi,
      replacement: "[URL_REDACTED]",
    },
  ];

  /**
   * Redact PII from text
   * @param text Raw text that may contain PII
   * @returns Object with redacted text and list of PII types found
   */
  redact(text: string): RedactionResult {
    let redacted = text;
    const piiDetected: string[] = [];

    for (const pattern of this.patterns) {
      // Reset regex lastIndex for global patterns
      pattern.regex.lastIndex = 0;

      if (pattern.regex.test(redacted)) {
        piiDetected.push(pattern.name);
        // Reset again before replace
        pattern.regex.lastIndex = 0;
        redacted = redacted.replace(pattern.regex, pattern.replacement);
      }
    }

    return { redacted, piiDetected };
  }

  /**
   * Check if text contains any PII without modifying it
   * @param text Text to check
   * @returns Array of PII types found
   */
  detect(text: string): string[] {
    const detected: string[] = [];

    for (const pattern of this.patterns) {
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(text)) {
        detected.push(pattern.name);
      }
    }

    return detected;
  }
}
