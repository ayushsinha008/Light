import { describe, expect, it } from "vitest";
import type { AgentContext, UIElement } from "@privai/schemas";
import { extractSearchQuery } from "@privai/shared";
import { amazonOrderPlan } from "./cloud.js";

function context(url: string, elements: UIElement[], visibleText = ""): AgentContext {
  return {
    user_goal: "1000 ke andar ka black jeans order kar de",
    observation: {
      url,
      title: "Amazon",
      elements,
      forms: [],
      visible_text: visibleText,
      timestamp: Date.now(),
      observation_id: "amazon",
    },
    history: [],
  };
}

function element(data: Partial<UIElement> & Pick<UIElement, "id" | "type">): UIElement {
  return {
    visible: true,
    enabled: true,
    interactive: true,
    confidence: 1,
    ...data,
  };
}

describe("Amazon order adapter", () => {
  it("normalizes Hinglish price-first queries", () => {
    expect(extractSearchQuery("1000 ke andar ka black jeans order kar de")).toBe(
      "black jeans under 1000",
    );
  });

  it("opens a matching normal product from search results", () => {
    const plan = amazonOrderPlan(
      context("https://www.amazon.in/s?k=black+jeans+under+1000", [
        element({
          id: "unrelated",
          type: "link",
          href: "https://www.amazon.in/dp/ONE",
          text: "Blue shirt",
        }),
        element({
          id: "match",
          type: "link",
          href: "https://www.amazon.in/dp/TWO",
          text: "Men black jeans slim fit",
        }),
      ]),
    );
    expect(plan?.actions[0]).toMatchObject({ type: "click", element_id: "match" });
  });

  it("requires approval before Buy Now", () => {
    const plan = amazonOrderPlan(
      context("https://www.amazon.in/dp/TWO", [
        element({ id: "buy", type: "button", text: "Buy Now" }),
      ]),
    );
    expect(plan?.needs_approval).toBe(true);
    expect(plan?.actions[0]).toMatchObject({
      type: "click",
      element_id: "buy",
      requires_approval: true,
      risk_level: "high",
    });
  });

  it("requires critical approval for final place order", () => {
    const plan = amazonOrderPlan(
      context("https://www.amazon.in/gp/buy/spc/handlers/display.html", [
        element({ id: "place", type: "button", text: "Place your order" }),
      ]),
    );
    expect(plan?.actions[0]).toMatchObject({
      element_id: "place",
      requires_approval: true,
      risk_level: "critical",
    });
  });
});
