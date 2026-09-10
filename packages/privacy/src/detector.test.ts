import { describe, expect, it } from "vitest";
import { RegexPiiDetector, classifyInputSensitivity, redactObservation } from "./index.js";
import type { PageObservation } from "@privai/schemas";

describe("RegexPiiDetector", () => {
  const detector = new RegexPiiDetector();

  it("redacts emails", () => {
    const { text, matches } = detector.redact("Contact ayush@example.com now");
    expect(text).toContain("[REDACTED_EMAIL]");
    expect(matches[0]?.type).toBe("EMAIL");
  });

  it("redacts valid card numbers via Luhn", () => {
    const { text, matches } = detector.redact("Card 4111111111111111");
    expect(matches.some((m) => m.type === "CARD")).toBe(true);
    expect(text).toContain("[REDACTED_CARD]");
  });

  it("does not redact invalid card-like numbers", () => {
    const { matches } = detector.redact("Order 1234567890123");
    expect(matches.filter((m) => m.type === "CARD")).toHaveLength(0);
  });

  it("classifies password inputs", () => {
    expect(classifyInputSensitivity({ type: "password" })).toBe("PASSWORD");
  });
});

describe("redactObservation", () => {
  it("never sends password values", () => {
    const observation: PageObservation = {
      url: "https://example.com",
      title: "Login",
      elements: [
        {
          id: "element_1",
          type: "input",
          inputType: "password",
          value: "super-secret",
          visible: true,
          enabled: true,
          interactive: true,
          confidence: 1,
        },
      ],
      forms: [],
      timestamp: Date.now(),
      observation_id: "obs_1",
    };
    const result = redactObservation(observation);
    expect(result.observation.elements[0]?.value).toBe("[REDACTED_PASSWORD]");
    expect(result.redactedFields).toBeGreaterThan(0);
  });
});
