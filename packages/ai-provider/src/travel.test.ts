import { describe, expect, it } from "vitest";
import type { AgentContext, UIElement } from "@privai/schemas";
import { parseTravelRequest, travelBookingPlan } from "./travel.js";

const NOW = new Date(2026, 8, 10, 12).getTime();

function element(data: Partial<UIElement> & Pick<UIElement, "id" | "type">): UIElement {
  return {
    visible: true,
    enabled: true,
    interactive: true,
    confidence: 1,
    ...data,
  };
}

function context(
  goal: string,
  url: string,
  elements: UIElement[],
  visibleText = "",
  captcha = false,
): AgentContext {
  return {
    user_goal: goal,
    observation: {
      url,
      title: "Travel",
      elements,
      forms: [],
      visible_text: visibleText,
      captcha_detected: captcha,
      timestamp: NOW,
      observation_id: "travel",
    },
    history: [],
  };
}

describe("travel request parser", () => {
  it("parses an English flight route and date", () => {
    expect(parseTravelRequest("Book a flight from Delhi to Mumbai on 15 September", NOW)).toMatchObject({
      kind: "flight",
      origin: "Delhi",
      destination: "Mumbai",
      departureDate: "2026-09-15",
      adults: 1,
    });
  });

  it("parses a Hinglish train route", () => {
    expect(parseTravelRequest("Delhi se Mumbai ki train 16 September book kar do", NOW)).toMatchObject({
      kind: "train",
      origin: "Delhi",
      destination: "Mumbai",
      departureDate: "2026-09-16",
    });
  });

  it("parses hotel destination and both dates", () => {
    expect(
      parseTravelRequest("Book hotel in Jaipur from 20 September to 22 September for 2 adults", NOW),
    ).toMatchObject({
      kind: "hotel",
      destination: "Jaipur",
      departureDate: "2026-09-20",
      returnDate: "2026-09-22",
      adults: 2,
    });
  });
});

describe("travel booking adapter", () => {
  it("asks for a missing travel date instead of only searching", () => {
    const plan = travelBookingPlan(
      context(
        "Book a flight from Delhi to Mumbai",
        "https://www.makemytrip.com/flights/",
        [],
      ),
    );
    expect(plan?.done).toBe(true);
    expect(plan?.actions[0]).toMatchObject({ type: "finish" });
    expect(plan?.actions[0]?.message).toMatch(/travel date/i);
  });

  it("types the MakeMyTrip origin", () => {
    const plan = travelBookingPlan(
      context(
        "Book a flight from Delhi to Mumbai on 15 September",
        "https://www.makemytrip.com/flights/",
        [
          element({
            id: "from",
            type: "input",
            name: "fromCity",
            placeholder: "From",
          }),
        ],
      ),
    );
    expect(plan?.reason).toBe("Travel: type origin");
    expect(plan?.actions).toContainEqual(
      expect.objectContaining({ type: "type", element_id: "from", text: "Delhi" }),
    );
  });

  it("pauses for IRCTC CAPTCHA", () => {
    const plan = travelBookingPlan(
      context(
        "Book train from Delhi to Mumbai on 15 September",
        "https://www.irctc.co.in/nget/booking/train-list",
        [],
        "Verify CAPTCHA",
        true,
      ),
    );
    expect(plan?.needs_approval).toBe(true);
    expect(plan?.actions[0]).toMatchObject({ type: "ask_user", requires_approval: true });
  });

  it("requires critical approval before final payment", () => {
    const plan = travelBookingPlan(
      context(
        "Book hotel in Jaipur from 20 September to 22 September",
        "https://secure.booking.com/checkout",
        [element({ id: "pay", type: "button", text: "Confirm and pay" })],
        "Review booking Payment",
      ),
    );
    expect(plan?.needs_approval).toBe(true);
    expect(plan?.actions[0]).toMatchObject({
      type: "click",
      element_id: "pay",
      requires_approval: true,
      risk_level: "critical",
    });
  });

  it("requires approval before reserving a room", () => {
    const plan = travelBookingPlan(
      context(
        "Book hotel in Jaipur from 20 September to 22 September",
        "https://www.booking.com/searchresults.html?ss=Jaipur",
        [element({ id: "reserve", type: "button", text: "I'll reserve" })],
        "Properties found",
      ),
    );
    expect(plan?.actions[0]).toMatchObject({
      element_id: "reserve",
      requires_approval: true,
      risk_level: "high",
    });
  });

  it("finishes after booking confirmation", () => {
    const plan = travelBookingPlan(
      context(
        "Book hotel in Jaipur from 20 September to 22 September",
        "https://secure.booking.com/confirmation",
        [],
        "Your booking is confirmed",
      ),
    );
    expect(plan?.done).toBe(true);
    expect(plan?.actions[0]).toMatchObject({ type: "finish" });
  });
});
