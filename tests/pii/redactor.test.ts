import { describe, it, expect } from "vitest";
import { PIIRedactor } from "../../src/pii/redactor";

describe("PIIRedactor", () => {
  const redactor = new PIIRedactor();

  describe("email redaction", () => {
    it("should redact simple email addresses", () => {
      const result = redactor.redact("Contact me at john@example.com");
      expect(result.redacted).toBe("Contact me at [EMAIL]");
      expect(result.piiDetected).toContain("email");
    });

    it("should redact multiple email addresses", () => {
      const result = redactor.redact("Email john@example.com or jane@test.org");
      expect(result.redacted).toBe("Email [EMAIL] or [EMAIL]");
      expect(result.piiDetected).toContain("email");
    });

    it("should handle emails with dots and plus signs", () => {
      const result = redactor.redact("user.name+tag@example.co.uk");
      expect(result.redacted).toBe("[EMAIL]");
    });
  });

  describe("phone number redaction", () => {
    it("should redact standard US phone format", () => {
      const result = redactor.redact("Call me at 555-123-4567");
      expect(result.redacted).toBe("Call me at [PHONE]");
      expect(result.piiDetected).toContain("phone");
    });

    it("should redact phone with parentheses", () => {
      const result = redactor.redact("My number is (555) 123-4567");
      expect(result.redacted).toBe("My number is [PHONE]");
    });

    it("should redact phone with +1 prefix", () => {
      const result = redactor.redact("International: +1-555-123-4567");
      expect(result.redacted).toBe("International: [PHONE]");
    });

    it("should redact phone with dots", () => {
      const result = redactor.redact("Call 555.123.4567 now");
      expect(result.redacted).toBe("Call [PHONE] now");
    });
  });

  describe("SSN redaction", () => {
    it("should redact SSN with dashes", () => {
      const result = redactor.redact("SSN: 123-45-6789");
      expect(result.redacted).toBe("SSN: [SSN]");
      expect(result.piiDetected).toContain("ssn");
    });

    it("should redact SSN with spaces", () => {
      const result = redactor.redact("My SSN is 123 45 6789");
      expect(result.redacted).toBe("My SSN is [SSN]");
    });
  });

  describe("credit card redaction", () => {
    it("should redact credit card with dashes", () => {
      const result = redactor.redact("Card: 1234-5678-9012-3456");
      expect(result.redacted).toBe("Card: [CREDIT_CARD]");
      expect(result.piiDetected).toContain("credit_card");
    });

    it("should redact credit card with spaces", () => {
      const result = redactor.redact("Pay with 1234 5678 9012 3456");
      expect(result.redacted).toBe("Pay with [CREDIT_CARD]");
    });
  });

  describe("address redaction", () => {
    it("should redact street addresses", () => {
      const result = redactor.redact("I live at 123 Main Street");
      expect(result.redacted).toBe("I live at [ADDRESS]");
      expect(result.piiDetected).toContain("address");
    });

    it("should redact various street types", () => {
      const addresses = [
        "456 Oak Avenue",
        "789 Broadway Blvd",
        "101 Park Drive",
        "202 Sunset Lane",
      ];

      for (const addr of addresses) {
        const result = redactor.redact(`Located at ${addr}`);
        expect(result.redacted).toBe("Located at [ADDRESS]");
      }
    });

    it("should be case insensitive", () => {
      const result = redactor.redact("Visit us at 100 MAIN ST");
      expect(result.redacted).toBe("Visit us at [ADDRESS]");
    });
  });

  describe("IP address redaction", () => {
    it("should redact IPv4 addresses", () => {
      const result = redactor.redact("Server IP: 192.168.1.100");
      expect(result.redacted).toBe("Server IP: [IP]");
      expect(result.piiDetected).toContain("ip_address");
    });

    it("should not redact invalid IPs", () => {
      const result = redactor.redact("Version 1.2.3");
      expect(result.redacted).toBe("Version 1.2.3");
      expect(result.piiDetected).not.toContain("ip_address");
    });
  });

  describe("@mention redaction", () => {
    it("should redact Twitter-style mentions", () => {
      const result = redactor.redact("Thanks @johndoe for the help!");
      expect(result.redacted).toBe("Thanks @[USER] for the help!");
      expect(result.piiDetected).toContain("mention");
    });

    it("should redact multiple mentions", () => {
      const result = redactor.redact("cc @alice @bob @charlie");
      expect(result.redacted).toBe("cc @[USER] @[USER] @[USER]");
    });
  });

  describe("URL PII redaction", () => {
    it("should redact URLs with email parameters", () => {
      const result = redactor.redact("Link: https://example.com/page?email=test@test.com");
      expect(result.redacted).toBe("Link: [URL_REDACTED]");
      expect(result.piiDetected).toContain("url_pii");
    });

    it("should redact URLs with user ID parameters", () => {
      const result = redactor.redact("Profile: https://site.com/u?user=12345");
      expect(result.redacted).toBe("Profile: [URL_REDACTED]");
    });
  });

  describe("multiple PII types", () => {
    it("should redact multiple PII types in one text", () => {
      const result = redactor.redact(
        "Contact john@example.com or call 555-123-4567, mention @support"
      );
      expect(result.redacted).toBe(
        "Contact [EMAIL] or call [PHONE], mention @[USER]"
      );
      expect(result.piiDetected).toContain("email");
      expect(result.piiDetected).toContain("phone");
      expect(result.piiDetected).toContain("mention");
    });
  });

  describe("no PII", () => {
    it("should return original text when no PII found", () => {
      const text = "Great service! Really happy with the product.";
      const result = redactor.redact(text);
      expect(result.redacted).toBe(text);
      expect(result.piiDetected).toHaveLength(0);
    });
  });

  describe("detect method", () => {
    it("should detect PII without modifying text", () => {
      const text = "Email: test@test.com, Phone: 555-555-5555";
      const detected = redactor.detect(text);
      expect(detected).toContain("email");
      expect(detected).toContain("phone");
    });
  });
});
