/**
 * ui-components-coverage.test.ts
 *
 * Covers exported pure functions from UI components that are NOT already
 * exercised by their dedicated test files.  This supplements (does not
 * duplicate) the existing coverage in:
 *   - tests/ui/provider-wizard.test.ts
 *   - tests/ui/tool-call-card.test.ts
 *   - tests/command-info.test.ts / command-info-extended.test.ts
 *
 * NOT covered here (internal / not exported):
 *   - CommandOverlay.tsx → normalizeContent, availabilityColor (module-private)
 *   - ThreadsView.tsx    → formatProvider (module-private)
 */
import { describe, expect, it } from "vitest";
import {
  formatScannedModels,
  maskApiKey,
  stepIndex,
  stepTitle,
  validateBaseUrl,
  validateProviderName,
} from "../../src/ui/components/ProviderWizard.js";
import type { ModelInfo } from "../../src/providers/scanner.js";

// ---------------------------------------------------------------------------
// validateProviderName — edge cases beyond provider-wizard.test.ts
// ---------------------------------------------------------------------------
describe("validateProviderName (coverage edge cases)", () => {
  it("rejects a whitespace-only name (trims to empty)", () => {
    const result = validateProviderName("   ");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("cannot be empty");
  });

  it("trims leading/trailing whitespace before validating", () => {
    expect(validateProviderName("  groq  ").ok).toBe(true);
  });

  it("accepts names containing spaces (valid in config)", () => {
    expect(validateProviderName("my provider").ok).toBe(true);
  });

  it("accepts names with special characters (valid in config)", () => {
    expect(validateProviderName("provider@1").ok).toBe(true);
  });

  it("accepts a single character name", () => {
    expect(validateProviderName("a").ok).toBe(true);
  });

  it("accepts a single digit name", () => {
    expect(validateProviderName("1").ok).toBe(true);
  });

  it("defaults existingNames to empty array", () => {
    expect(validateProviderName("groq").ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateBaseUrl — edge cases beyond provider-wizard.test.ts
// ---------------------------------------------------------------------------
describe("validateBaseUrl (coverage edge cases)", () => {
  it("rejects a whitespace-only url (trims to empty)", () => {
    const result = validateBaseUrl("   ");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("cannot be empty");
  });
  it("accepts a url with path, query, and fragment", () => {
    expect(
      validateBaseUrl("https://api.example.com/v1/chat?q=1#section").ok,
    ).toBe(true);
  });

  it("accepts a url with a port", () => {
    expect(validateBaseUrl("http://localhost:8080/v1").ok).toBe(true);
  });

  it("rejects ftp protocol", () => {
    expect(validateBaseUrl("ftp://files.example.com").ok).toBe(false);
  });

  it("rejects a bare hostname without protocol", () => {
    expect(validateBaseUrl("api.example.com").ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// maskApiKey — edge cases beyond provider-wizard.test.ts
// ---------------------------------------------------------------------------
describe("maskApiKey (coverage edge cases)", () => {
  it("masks a 3-char key (boundary between short and long)", () => {
    const masked = maskApiKey("abc");
    // length > 2, so: min(3-2, 24)=1 bullet + last 2 chars
    expect(masked).toBe("•bc");
  });

  it("masks a 26-char key (at the cap boundary)", () => {
    const key = "a".repeat(26);
    const masked = maskApiKey(key);
    // length-2 = 24 bullets + last 2 chars = 26 total
    expect(masked.length).toBe(26);
    expect(masked.endsWith("aa")).toBe(true);
  });

  it("handles a key that is exactly 2 characters", () => {
    expect(maskApiKey("sk")).toBe("••");
  });
});

// ---------------------------------------------------------------------------
// formatScannedModels — edge cases beyond provider-wizard.test.ts
// ---------------------------------------------------------------------------
describe("formatScannedModels (coverage edge cases)", () => {
  it("uses default max of 6 when not specified", () => {
    const models: ModelInfo[] = Array.from({ length: 8 }, (_, i) => ({
      id: `model-${i}`,
    }));
    const lines = formatScannedModels(models);
    // 6 shown + 1 overflow line
    expect(lines).toHaveLength(7);
    expect(lines[6]).toBe("  … and 2 more");
  });

  it("does not show overflow line when models fit within default max", () => {
    const models: ModelInfo[] = Array.from({ length: 5 }, (_, i) => ({
      id: `model-${i}`,
    }));
    const lines = formatScannedModels(models);
    expect(lines).toHaveLength(5);
  });

  it("omits owner bracket when owned_by is empty string", () => {
    const lines = formatScannedModels([{ id: "m1", owned_by: "" }]);
    expect(lines[0]).toBe("  • m1");
  });

  it("omits owner bracket when owned_by is undefined", () => {
    const lines = formatScannedModels([{ id: "m1" }]);
    expect(lines[0]).toBe("  • m1");
  });

  it("returns exactly one placeholder line for empty array", () => {
    const lines = formatScannedModels([]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("no models");
  });
});

// ---------------------------------------------------------------------------
// stepIndex — cover all steps
// ---------------------------------------------------------------------------
describe("stepIndex (coverage — all steps)", () => {
  it("returns 1-based index for every wizard step", () => {
    // All steps: mode(1) templates(2) key-detect(3) name(4) url(5) protocol(6) key(7) models(8) test(9) confirm(10)
    expect(stepIndex("mode")).toBe(1);
    expect(stepIndex("templates")).toBe(2);
    expect(stepIndex("key-detect")).toBe(3);
    expect(stepIndex("name")).toBe(4);
    expect(stepIndex("url")).toBe(5);
    expect(stepIndex("protocol")).toBe(6);
    expect(stepIndex("key")).toBe(7);
    expect(stepIndex("models")).toBe(8);
    expect(stepIndex("test")).toBe(9);
    expect(stepIndex("confirm")).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// stepTitle — cover all steps
// ---------------------------------------------------------------------------
describe("stepTitle (coverage — all steps)", () => {
  it("returns a human-readable title for every wizard step", () => {
    expect(stepTitle("mode")).toBe("Select Mode");
    expect(stepTitle("templates")).toBe("Select Provider");
    expect(stepTitle("key-detect")).toBe("API Key");
    expect(stepTitle("name")).toBe("Provider Name");
    expect(stepTitle("url")).toBe("Base URL");
    expect(stepTitle("protocol")).toBe("Protocol");
    expect(stepTitle("key")).toBe("API Key");
    expect(stepTitle("models")).toBe("Models");
    expect(stepTitle("test")).toBe("Test & Scan");
    expect(stepTitle("confirm")).toBe("Confirm");
  });
});
