import { describe, expect, it } from "vitest";
import { ActionPlanSchema } from "@privai/schemas";
import { validatePlan, assertNoCodeInjection } from "@privai/agent-core";
import { DemoAIProvider } from "@privai/ai-provider";

describe("action schema validation", () => {
  it("accepts a valid click plan", () => {
    const plan = ActionPlanSchema.parse({
      goal: "Click search",
      actions: [{ type: "click", element_id: "element_1", confidence: 0.9 }],
      reason: "test",
    });
    const result = validatePlan(plan, 0.75);
    expect(result.validActions).toHaveLength(1);
    expect(result.needsApproval).toBe(false);
  });

  it("requires approval for low confidence", () => {
    const plan = ActionPlanSchema.parse({
      goal: "Click",
      actions: [{ type: "click", element_id: "element_1", confidence: 0.2 }],
    });
    const result = validatePlan(plan, 0.75);
    expect(result.needsApproval).toBe(true);
  });

  it("rejects code injection patterns", () => {
    expect(() =>
      assertNoCodeInjection({
        type: "type",
        element_id: "element_1",
        text: "eval(alert(1))",
      }),
    ).toThrow(/injection/i);
  });
});

describe("demo planner", () => {
  it("plans a search action", async () => {
    const provider = new DemoAIProvider();
    const plan = await provider.generatePlan({
      user_goal: "Search for wireless headphones",
      observation: {
        url: "https://demo.example/store",
        title: "Store",
        elements: [
          {
            id: "element_12",
            type: "input",
            role: "searchbox",
            placeholder: "Search",
            visible: true,
            enabled: true,
            interactive: true,
            confidence: 1,
          },
        ],
        forms: [],
        timestamp: Date.now(),
        observation_id: "o1",
      },
      history: [],
    });
    expect(plan.actions.some((a) => a.type === "type")).toBe(true);
  });
});
