import { describe, expect, it } from "vitest";
import { redactObservation, RegexPiiDetector } from "../packages/privacy/src/index.ts";
import { validatePlan, assertNoCodeInjection } from "../packages/agent-core/src/validate.ts";
import { ActionPlanSchema } from "../packages/schemas/src/index.ts";

describe("privacy guarantees", () => {
  it("redacts email and password fields before cloud payload", () => {
    const result = redactObservation({
      url: "https://example.com",
      title: "Form",
      elements: [
        {
          id: "element_1",
          type: "input",
          inputType: "email",
          value: "ayush@example.com",
          visible: true,
          enabled: true,
          interactive: true,
          confidence: 1,
        },
        {
          id: "element_2",
          type: "input",
          inputType: "password",
          value: "hunter2",
          visible: true,
          enabled: true,
          interactive: true,
          confidence: 1,
        },
      ],
      forms: [],
      visible_text: "Contact ayush@example.com",
      timestamp: Date.now(),
      observation_id: "t1",
    });
    expect(result.observation.elements[0]?.value).toBe("[REDACTED_EMAIL]");
    expect(result.observation.elements[1]?.value).toBe("[REDACTED_PASSWORD]");
    expect(result.observation.visible_text).toContain("[REDACTED_EMAIL]");
    expect(JSON.stringify(result.observation)).not.toContain("hunter2");
  });
});

describe("action validation", () => {
  it("flags purchase actions for approval", () => {
    const plan = ActionPlanSchema.parse({
      goal: "Buy item",
      actions: [{ type: "click", element_id: "element_1", text: "Buy now", confidence: 0.9 }],
    });
    const validated = validatePlan(plan, 0.75);
    expect(validated.needsApproval).toBe(true);
  });

  it("blocks eval-like payloads", () => {
    expect(() =>
      assertNoCodeInjection({ type: "type", element_id: "e1", text: "new Function('x')" }),
    ).toThrow();
  });
});

describe("pii detector", () => {
  it("detects JWT-like tokens", () => {
    const d = new RegexPiiDetector();
    const { matches } = d.redact(
      "token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.abc",
    );
    expect(matches.some((m) => m.type === "TOKEN")).toBe(true);
  });
});
