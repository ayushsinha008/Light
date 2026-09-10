import { ActionPlanSchema, type ActionPlan, type AgentContext } from "@privai/schemas";
import { extractSearchQuery, isBuyGoal, isPlayGoal } from "@privai/shared";
import type { AIProvider } from "./types.js";
import { travelBookingPlan } from "./travel.js";

const SYSTEM_PROMPT = `You are Light's cloud planner. You receive ONLY privacy-redacted structured UI metadata — never raw screenshots.

Return STRICT JSON matching:
{
  "goal": string,
  "actions": [{ "type": string, "element_id"?: string, "text"?: string, "key"?: string, "url"?: string, "wait_ms"?: number, "message"?: string, "confidence"?: number, "requires_approval"?: boolean, "risk_level"?: "low"|"medium"|"high"|"critical" }],
  "reason": string,
  "done"?: boolean,
  "needs_approval"?: boolean,
  "confidence"?: number
}

Allowed action types:
click, double_click, type, clear, select, checkbox, radio, scroll, hover, focus, press_key, submit, navigate, back, forward, wait, extract_text, inspect_element, open_tab, close_tab, ask_user, finish, fail

Rules:
- Use element_id values from the observation only.
- Never invent element IDs.
- Never return JavaScript or selectors for eval.
- Require approval for payments, deletes, messages, publishing, security changes.
- If captcha_detected, return ask_user.
- If restricted, return fail with a clear message.
- Prefer 1-5 actions per plan; the agent will re-observe.
- Values marked [REDACTED_*] must not be treated as real data.`;

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1]!.trim() : trimmed;
  return JSON.parse(raw);
}

/**
 * Deterministic site adapter for a common browser task. This keeps basic
 * search/play mechanics reliable instead of asking the LLM to rediscover
 * YouTube's controls on every step.
 */
export function youtubePlayPlan(input: AgentContext): ActionPlan | null {
  if (!isPlayGoal(input.user_goal)) return null;

  let url: URL;
  try {
    url = new URL(input.observation.url);
  } catch {
    return null;
  }
  if (!url.hostname.includes("youtube.com")) return null;

  const goal = input.user_goal;
  const query = extractSearchQuery(goal);
  const elements = input.observation.elements.filter((el) => el.visible && el.interactive);
  const priorReasons = input.history
    .map((item) => item.plan?.reason || "")
    .join(" ");
  const typedSearch = input.history.some((item) =>
    item.plan?.actions?.some((action) => action.type === "type"),
  );

  if (/\/watch|\/shorts\//i.test(url.pathname)) {
    if (input.observation.media_state?.playing) {
      return ActionPlanSchema.parse({
        goal,
        actions: [{ type: "finish", message: `Playing “${query}” on YouTube.`, confidence: 0.98 }],
        reason: "YouTube playback verified from local video state",
        done: true,
        confidence: 0.98,
      });
    }
    const play = elements.find((el) => {
      const hay = `${el.text || ""} ${el.ariaLabel || ""} ${el.name || ""}`.trim();
      return (
        el.tagName === "video" ||
        el.type === "video" ||
        /^(play|play video)$/i.test(hay) ||
        /play button/i.test(hay)
      );
    });
    if (play) {
      return ActionPlanSchema.parse({
        goal,
        actions: [
          { type: "click", element_id: play.id, confidence: 0.98 },
          { type: "wait", wait_ms: 700, confidence: 1 },
        ],
        reason: "YouTube: press Play",
        confidence: 0.98,
      });
    }
    if (/YouTube: press Play/i.test(priorReasons)) {
      return ActionPlanSchema.parse({
        goal,
        actions: [{ type: "wait", wait_ms: 900, confidence: 1 }],
        reason: "YouTube: wait for playback state",
        confidence: 1,
      });
    }
    return ActionPlanSchema.parse({
      goal,
      actions: [{ type: "wait", wait_ms: 900, confidence: 1 }],
      reason: "YouTube: wait for player controls",
      confidence: 1,
    });
  }

  if (url.pathname === "/results" || url.searchParams.has("search_query")) {
    const queryTokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter((token) => token.length > 2 && token !== "song");
    const video = elements
      .filter((el) => /\/watch\?v=/i.test(el.href || "") && !/\/shorts\//i.test(el.href || ""))
      .map((el) => {
        const hay = `${el.text || ""} ${el.ariaLabel || ""} ${el.href || ""}`.toLowerCase();
        let score = 10;
        for (const token of queryTokens) {
          if (hay.includes(token)) score += 8;
        }
        if (/official|full song|music video|audio|lyrics/i.test(hay)) score += 3;
        if (/shorts|#short|sponsored|advertisement/i.test(hay)) score -= 20;
        return { el, score };
      })
      .sort((a, b) => b.score - a.score)[0]?.el;
    if (video) {
      return ActionPlanSchema.parse({
        goal,
        actions: [
          { type: "click", element_id: video.id, confidence: 0.98 },
          { type: "wait", wait_ms: 1600, confidence: 1 },
        ],
        reason: "YouTube: click first video result",
        confidence: 0.98,
      });
    }
    return ActionPlanSchema.parse({
      goal,
      actions: [
        { type: "wait", wait_ms: 900, confidence: 1 },
        { type: "scroll", direction: "down", amount: 450, confidence: 0.9 },
      ],
      reason: "YouTube: wait for video results",
      confidence: 0.9,
    });
  }

  const search = elements.find((el) => {
    const hay = `${el.name || ""} ${el.placeholder || ""} ${el.ariaLabel || ""}`.toLowerCase();
    return el.name === "search_query" || el.role === "searchbox" || hay.includes("search");
  });
  if (search) {
    if (typedSearch) {
      return ActionPlanSchema.parse({
        goal,
        actions: [
          {
            type: "navigate",
            url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
            confidence: 0.99,
          },
        ],
        reason: "YouTube: submit search via reliable results URL",
        confidence: 0.99,
      });
    }
    return ActionPlanSchema.parse({
      goal,
      actions: [
        { type: "clear", element_id: search.id, confidence: 0.98 },
        { type: "type", element_id: search.id, text: query, confidence: 0.98 },
      ],
      reason: "YouTube: type song in search",
      confidence: 0.98,
    });
  }

  return ActionPlanSchema.parse({
    goal,
    actions: [{ type: "wait", wait_ms: 900, confidence: 1 }],
    reason: "YouTube: wait for search controls",
    confidence: 1,
  });
}

/** Reliable local Amazon purchase flow; final financial actions stay approval-gated. */
export function amazonOrderPlan(input: AgentContext): ActionPlan | null {
  if (!isBuyGoal(input.user_goal)) return null;

  let url: URL;
  try {
    url = new URL(input.observation.url);
  } catch {
    return null;
  }
  if (!/amazon\./i.test(url.hostname)) return null;

  const goal = input.user_goal;
  const query = extractSearchQuery(goal);
  const elements = input.observation.elements.filter((el) => el.visible && el.interactive);
  const visibleText = input.observation.visible_text || "";
  const queryTokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 2 && !/^(under|below|\d+)$/.test(token));

  if (/thank you|order placed|order confirmed/i.test(visibleText)) {
    return ActionPlanSchema.parse({
      goal,
      actions: [{ type: "finish", message: "Amazon order was placed successfully.", confidence: 0.98 }],
      reason: "Amazon order confirmation detected",
      done: true,
      confidence: 0.98,
    });
  }

  if (url.pathname === "/s" || url.searchParams.has("k")) {
    const product = elements
      .filter((el) => /\/(?:dp|gp\/product)\//i.test(el.href || ""))
      .map((el) => {
        const hay = `${el.text || ""} ${el.ariaLabel || ""}`.toLowerCase();
        let score = 10;
        for (const token of queryTokens) {
          if (hay.includes(token)) score += 7;
        }
        if (/sponsored/i.test(hay)) score -= 4;
        return { el, score };
      })
      .sort((a, b) => b.score - a.score)[0]?.el;

    if (product) {
      return ActionPlanSchema.parse({
        goal,
        actions: [
          { type: "click", element_id: product.id, confidence: 0.96 },
          { type: "wait", wait_ms: 1400, confidence: 1 },
        ],
        reason: `Amazon: open best matching product for “${query}”`,
        confidence: 0.96,
      });
    }

    return ActionPlanSchema.parse({
      goal,
      actions: [
        { type: "scroll", direction: "down", amount: 650, confidence: 0.9 },
        { type: "wait", wait_ms: 700, confidence: 1 },
      ],
      reason: "Amazon: reveal product results",
      confidence: 0.9,
    });
  }

  if (/\/(?:dp|gp\/product)\//i.test(url.pathname)) {
    const buyNow = elements.find((el) =>
      /buy\s*now|proceed\s*to\s*buy/i.test(
        `${el.text || ""} ${el.ariaLabel || ""} ${el.name || ""}`,
      ),
    );
    const addToCart = elements.find((el) =>
      /add\s*to\s*(?:cart|basket)/i.test(
        `${el.text || ""} ${el.ariaLabel || ""} ${el.name || ""}`,
      ),
    );
    const purchase = buyNow || addToCart;
    if (purchase) {
      return ActionPlanSchema.parse({
        goal,
        actions: [
          {
            type: "click",
            element_id: purchase.id,
            message: buyNow ? "Buy Now" : "Add to Cart",
            confidence: 0.96,
            requires_approval: true,
            risk_level: "high",
          },
        ],
        reason: `${buyNow ? "Buy Now" : "Add to Cart"} requires your approval`,
        needs_approval: true,
        confidence: 0.96,
      });
    }
    return ActionPlanSchema.parse({
      goal,
      actions: [
        { type: "scroll", direction: "down", amount: 450, confidence: 0.86 },
        { type: "wait", wait_ms: 600, confidence: 1 },
      ],
      reason: "Amazon: locate purchase controls",
      confidence: 0.86,
    });
  }

  if (/signin|ap\/signin/i.test(url.pathname)) {
    return ActionPlanSchema.parse({
      goal,
      actions: [
        {
          type: "finish",
          message: "Amazon sign-in is required. Sign in manually, then run the order task again.",
          confidence: 0.98,
        },
      ],
      reason: "Amazon authentication required",
      done: true,
      confidence: 0.98,
    });
  }

  if (/cart|checkout|buy\/spc|buy\/addressselect/i.test(`${url.pathname}${url.search}`)) {
    const placeOrder = elements.find((el) =>
      /place\s*(?:your\s*)?order|confirm\s*order/i.test(
        `${el.text || ""} ${el.ariaLabel || ""} ${el.name || ""}`,
      ),
    );
    if (placeOrder) {
      return ActionPlanSchema.parse({
        goal,
        actions: [
          {
            type: "click",
            element_id: placeOrder.id,
            message: "Place order",
            confidence: 0.95,
            requires_approval: true,
            risk_level: "critical",
          },
        ],
        reason: "Final order placement requires explicit approval",
        needs_approval: true,
        confidence: 0.95,
      });
    }
    return ActionPlanSchema.parse({
      goal,
      actions: [
        {
          type: "finish",
          message: "Reached Amazon checkout. Review address and payment details before placing the order.",
          confidence: 0.94,
        },
      ],
      reason: "Checkout requires user review",
      done: true,
      confidence: 0.94,
    });
  }

  return ActionPlanSchema.parse({
    goal,
    actions: [
      {
        type: "navigate",
        url: `https://www.amazon.in/s?k=${encodeURIComponent(query)}`,
        confidence: 0.96,
      },
    ],
    reason: "Amazon: return to product search",
    confidence: 0.96,
  });
}

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  constructor(
    private apiKey: string,
    private model = "gpt-4o-mini",
  ) {}

  async generatePlan(input: AgentContext): Promise<ActionPlan> {
    const deterministic = youtubePlayPlan(input);
    if (deterministic) return deterministic;
    const amazon = amazonOrderPlan(input);
    if (amazon) return amazon;
    const travel = travelBookingPlan(input);
    if (travel) return travel;

    const body = {
      model: this.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            user_goal: input.user_goal,
            url: input.observation.url,
            title: input.observation.title,
            page_description: input.observation.page_description,
            elements: input.observation.elements.slice(0, 80),
            forms: input.observation.forms,
            visible_text: (input.observation.visible_text || "").slice(0, 4000),
            current_state: input.observation.current_state,
            captcha_detected: input.observation.captcha_detected,
            restricted: input.observation.restricted,
            history: input.history.slice(-5),
          }),
        },
      ],
    };

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI planner failed: ${res.status} ${err}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI returned empty plan");
    return ActionPlanSchema.parse(extractJson(content));
  }
}

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  constructor(
    private apiKey: string,
    private model = "claude-3-5-sonnet-20241022",
  ) {}

  async generatePlan(input: AgentContext): Promise<ActionPlan> {
    const deterministic = youtubePlayPlan(input);
    if (deterministic) return deterministic;
    const amazon = amazonOrderPlan(input);
    if (amazon) return amazon;
    const travel = travelBookingPlan(input);
    if (travel) return travel;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2048,
        temperature: 0.2,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              user_goal: input.user_goal,
              observation: {
                url: input.observation.url,
                title: input.observation.title,
                elements: input.observation.elements.slice(0, 80),
                forms: input.observation.forms,
                visible_text: (input.observation.visible_text || "").slice(0, 4000),
                captcha_detected: input.observation.captcha_detected,
                restricted: input.observation.restricted,
              },
              history: input.history.slice(-5),
            }),
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic planner failed: ${res.status} ${err}`);
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const content = data.content?.find((c) => c.type === "text")?.text;
    if (!content) throw new Error("Anthropic returned empty plan");
    return ActionPlanSchema.parse(extractJson(content));
  }
}

/** Google Gemini planner via Generative Language API */
export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  constructor(
    private apiKey: string,
    private model = "gemini-2.0-flash",
  ) {}

  async generatePlan(input: AgentContext): Promise<ActionPlan> {
    const deterministic = youtubePlayPlan(input);
    if (deterministic) return deterministic;
    const amazon = amazonOrderPlan(input);
    if (amazon) return amazon;
    const travel = travelBookingPlan(input);
    if (travel) return travel;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const userPayload = {
      user_goal: input.user_goal,
      url: input.observation.url,
      title: input.observation.title,
      page_description: input.observation.page_description,
      elements: input.observation.elements.slice(0, 80),
      forms: input.observation.forms,
      visible_text: (input.observation.visible_text || "").slice(0, 4000),
      current_state: input.observation.current_state,
      captcha_detected: input.observation.captcha_detected,
      restricted: input.observation.restricted,
      history: input.history.slice(-5),
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          {
            role: "user",
            parts: [{ text: JSON.stringify(userPayload) }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini planner failed: ${res.status} ${err}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const content = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    if (!content) throw new Error("Gemini returned empty plan");
    return ActionPlanSchema.parse(extractJson(content));
  }
}
