import { ActionPlanSchema, type ActionPlan, type AgentContext, type UIElement } from "@privai/schemas";
import {
  extractSearchQuery,
  isBuyGoal,
  isDirtySearchQuery,
  isPlayGoal,
} from "@privai/shared";
import type { AIProvider } from "./types.js";
import { travelBookingPlan } from "./travel.js";

function findByText(elements: UIElement[], ...needles: string[]): UIElement | undefined {
  const lower = needles.map((n) => n.toLowerCase());
  return elements.find((el) => {
    const hay = `${el.text || ""} ${el.ariaLabel || ""} ${el.placeholder || ""} ${el.name || ""}`.toLowerCase();
    return lower.some((n) => hay.includes(n));
  });
}

function findSearchInput(elements: UIElement[]): UIElement | undefined {
  return (
    findByText(elements, "search") ||
    elements.find(
      (el) =>
        el.type === "input" ||
        el.role === "searchbox" ||
        el.inputType === "search" ||
        el.placeholder?.toLowerCase().includes("search"),
    )
  );
}

function extractUrlHint(goal: string): string | null {
  const site =
    goal.match(/\b(?:open|go to|navigate to|visit)\s+([a-z0-9.-]+\.[a-z]{2,})\b/i) ||
    goal.match(/\b(amazon|flipkart|myntra|linkedin|google|youtube|github|wikipedia)\b/i);
  if (site) {
    const raw = site[1]!.toLowerCase();
    const map: Record<string, string> = {
      amazon: "https://www.amazon.in",
      flipkart: "https://www.flipkart.com",
      myntra: "https://www.myntra.com",
      linkedin: "https://www.linkedin.com",
      google: "https://www.google.com",
      youtube: "https://www.youtube.com",
      github: "https://github.com",
      wikipedia: "https://en.wikipedia.org",
    };
    if (map[raw]) return map[raw]!;
    if (raw.includes(".")) return `https://${raw}`;
  }

  if (isPlayGoal(goal) || /\byoutube\b|youtu\.be|\b(gana|gaana|song|music)\b/i.test(goal)) {
    return "https://www.youtube.com";
  }
  if (
    /\b(amazon|flipkart|myntra)\b/i.test(goal) ||
    /\b(buy|purchase|order|kharid|cart|shopping)\b/i.test(goal)
  ) {
    return "https://www.amazon.in";
  }
  return null;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function onHost(url: string, ...hosts: string[]): boolean {
  const h = hostOf(url);
  return hosts.some((x) => h.includes(x.replace(/^www\./, "")));
}

function currentSearchParam(url: string): string {
  try {
    const u = new URL(url);
    return u.searchParams.get("k") || u.searchParams.get("q") || u.searchParams.get("search_query") || "";
  } catch {
    return "";
  }
}

function findYoutubeVideo(elements: UIElement[], query = ""): UIElement | undefined {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2);

  const scored = elements
    .filter((el) => el.visible && el.interactive)
    .map((el) => {
      const hay = `${el.href || ""} ${el.text || ""} ${el.ariaLabel || ""} ${el.id || ""}`.toLowerCase();
      let score = 0;
      if (/watch\?v=/i.test(el.href || "") || /watch\?v=/i.test(hay)) score += 20;
      if (/\/shorts\/|#short/i.test(hay)) score -= 30;
      if (el.type === "link" || el.role === "link") score += 2;
      if (/\d+:\d+|hours?|minutes?|seconds?|ago\b/.test(hay)) score += 4;
      if (/thumbnail|video title|play video|ytimg|#video-title/i.test(hay)) score += 5;
      if ((el.text || "").trim().length > 12) score += 2;
      for (const t of tokens) {
        if (hay.includes(t)) score += 8;
      }
      if (
        /home|subscriptions|library|sign in|log in|filter|^search$|create|notify|youtube music/i.test(hay) &&
        score < 15
      ) {
        score -= 12;
      }
      return { el, score };
    })
    .filter((x) => x.score >= 8)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.el;
}

function findYoutubeSearchInput(elements: UIElement[]): UIElement | undefined {
  return (
    elements.find(
      (el) =>
        el.visible &&
        (el.name === "search_query" ||
          el.id?.toLowerCase() === "search" ||
          el.placeholder?.toLowerCase().includes("search") ||
          el.ariaLabel?.toLowerCase().includes("search")),
    ) || findSearchInput(elements)
  );
}

function findResultLink(elements: UIElement[], preferVideo = false, query = ""): UIElement | undefined {
  if (preferVideo) {
    const yt = findYoutubeVideo(elements, query);
    if (yt) return yt;
  }

  const links = elements.filter(
    (el) =>
      (el.type === "link" || el.role === "link") &&
      el.visible &&
      el.interactive &&
      (el.href || el.text) &&
      !/sign in|log in|account|cart|orders|prime|sell|customer service|home|shorts|subscriptions/i.test(
        `${el.text || ""} ${el.ariaLabel || ""}`,
      ),
  );

  return (
    links.find((el) => /\/dp\/|\/gp\/product\//i.test(el.href || "")) ||
    links.find((el) => (el.text || "").trim().length > 20) ||
    links.find((el) => (el.text || "").trim().length > 8) ||
    links[0]
  );
}

function findBuyButton(elements: UIElement[]): UIElement | undefined {
  return (
    findByText(elements, "add to cart", "buy now", "buy", "add to basket") ||
    elements.find((el) => {
      const hay = `${el.text || ""} ${el.ariaLabel || ""}`.toLowerCase();
      return (
        (el.type === "button" || el.role === "button") &&
        (/add to cart|buy now|buy/.test(hay) || el.id?.toLowerCase().includes("cart"))
      );
    })
  );
}

function findPlayButton(elements: UIElement[]): UIElement | undefined {
  return (
    findByText(elements, "play", "play video") ||
    elements.find((el) => {
      const hay = `${el.text || ""} ${el.ariaLabel || ""} ${el.id || ""}`.toLowerCase();
      return /^(play|play video)$/i.test((el.ariaLabel || "").trim()) || /ytp-large-play|play-button/.test(hay);
    })
  );
}

/**
 * Demo planner: rule-based structured plans for local development
 * without cloud API keys. Clearly marked as DEMO MODE.
 */
export class DemoAIProvider implements AIProvider {
  readonly name = "demo";

  async generatePlan(input: AgentContext): Promise<ActionPlan> {
    const goal = input.user_goal;
    const elements = input.observation.elements.filter((e) => e.visible && e.interactive);
    const url = input.observation.url || "";
    const lowerGoal = goal.toLowerCase();
    const query = extractSearchQuery(goal);
    const buy = isBuyGoal(goal);
    const play = isPlayGoal(goal);

    if (input.observation.restricted) {
      return ActionPlanSchema.parse({
        goal,
        actions: [
          {
            type: "fail",
            message:
              input.observation.restriction_reason ||
              "This page cannot be automated because the browser does not allow extension access.",
            confidence: 1,
          },
        ],
        reason: "Restricted page",
        done: true,
        confidence: 1,
      });
    }

    if (input.observation.captcha_detected) {
      return ActionPlanSchema.parse({
        goal,
        actions: [
          {
            type: "ask_user",
            message: "Human verification required. Complete the CAPTCHA, then continue.",
            requires_approval: true,
            risk_level: "medium",
            confidence: 1,
          },
        ],
        reason: "CAPTCHA detected",
        needs_approval: true,
        confidence: 1,
      });
    }

    const travel = travelBookingPlan(input);
    if (travel) return travel;

    if (lowerGoal.includes("done") || lowerGoal.includes("stop")) {
      return ActionPlanSchema.parse({
        goal,
        actions: [{ type: "finish", message: "Stopped by user.", confidence: 1 }],
        done: true,
        confidence: 1,
      });
    }

    const clickedResult = input.history.some((h) =>
      h.results?.some((r) => r.success && r.type === "click"),
    );
    const typedSearch = input.history.some((h) =>
      h.results?.some((r) => r.success && (r.type === "type" || r.type === "press_key")),
    );

    // YouTube: after opening a watch page, click Play if needed then finish
    if (play && onHost(url, "youtube.com") && /watch\?v=|\/shorts\//i.test(url)) {
      const playBtn = findPlayButton(elements);
      if (playBtn && !clickedResult) {
        return ActionPlanSchema.parse({
          goal,
          actions: [
            { type: "click", element_id: playBtn.id, confidence: 0.93 },
            { type: "wait", wait_ms: 800, confidence: 1 },
          ],
          reason: "DEMO MODE: pressing YouTube Play",
          confidence: 0.93,
        });
      }
      return ActionPlanSchema.parse({
        goal,
        actions: [
          {
            type: "finish",
            message: "DEMO MODE: YouTube video opened and play triggered.",
            confidence: 0.92,
          },
        ],
        reason: "DEMO MODE: YouTube watch page reached",
        done: true,
        confidence: 0.92,
      });
    }

    // Fix dirty Amazon/YouTube search URLs left from bad Hinglish parsing
    const pageQuery = currentSearchParam(url);
    if (
      pageQuery &&
      isDirtySearchQuery(pageQuery) &&
      query &&
      !isDirtySearchQuery(query) &&
      (onHost(url, "amazon.", "flipkart.", "youtube.com") || /google\.com\/search/i.test(url))
    ) {
      let target = url;
      if (onHost(url, "amazon.")) target = `https://www.amazon.in/s?k=${encodeURIComponent(query)}`;
      else if (onHost(url, "flipkart.")) target = `https://www.flipkart.com/search?q=${encodeURIComponent(query)}`;
      else if (onHost(url, "youtube.com"))
        target = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      else target = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      return ActionPlanSchema.parse({
        goal,
        actions: [
          {
            type: "navigate",
            url: target,
            confidence: 0.95,
            reason: `Clean search query → “${query}”`,
          },
        ],
        reason: "DEMO MODE: rewriting dirty search URL",
        confidence: 0.95,
      });
    }

    // Amazon buy: after Add to Cart / Buy Now click
    if (
      buy &&
      onHost(url, "amazon.") &&
      clickedResult &&
      input.history.some((h) =>
        h.results?.some((r) => r.success && r.type === "click" && /cart|buy/i.test(String(r.extractedText || r.type))),
      )
    ) {
      return ActionPlanSchema.parse({
        goal,
        actions: [
          {
            type: "finish",
            message: "DEMO MODE: Buy action sent (Add to Cart / Buy Now). Complete payment yourself if needed.",
            confidence: 0.9,
          },
        ],
        reason: "DEMO MODE: purchase click completed",
        done: true,
        confidence: 0.9,
      });
    }

    // Finish simple search-only goals after results are on page
    if (
      typedSearch &&
      !buy &&
      !play &&
      /search|find|look for|headphones|laptop|product/i.test(goal) &&
      (onHost(url, "amazon.", "flipkart.", "google.", "youtube.") || /[?&](k|q|search_query)=/i.test(url))
    ) {
      return ActionPlanSchema.parse({
        goal,
        actions: [
          {
            type: "finish",
            message: `DEMO MODE: Showing search results for “${query}”. Ask to buy / play to continue.`,
            confidence: 0.9,
          },
        ],
        reason: "DEMO MODE: search results ready",
        done: true,
        confidence: 0.9,
      });
    }

    // Also finish if we landed directly on a search-results URL (inferStartUrl) and no buy/play
    if (
      !buy &&
      !play &&
      !clickedResult &&
      /amazon\.|flipkart\.|youtube\.com\/results|google\.com\/search/i.test(url) &&
      /[?&](k|q|search_query)=/i.test(url) &&
      input.history.length >= 1
    ) {
      return ActionPlanSchema.parse({
        goal,
        actions: [
          {
            type: "finish",
            message: `DEMO MODE: Results loaded for “${query}”. Say “buy the first one” or “play it” to continue.`,
            confidence: 0.88,
          },
        ],
        reason: "DEMO MODE: deep-linked search results",
        done: true,
        confidence: 0.88,
      });
    }

    const urlHint = extractUrlHint(goal);
    const onTarget =
      urlHint &&
      (() => {
        try {
          return hostOf(url).includes(hostOf(urlHint));
        } catch {
          return false;
        }
      })();

    if (urlHint && !onTarget) {
      // Prefer site search URLs when we already know the query
      let target = urlHint;
      if (hostOf(urlHint).includes("amazon")) {
        target = `https://www.amazon.in/s?k=${encodeURIComponent(query)}`;
      } else if (hostOf(urlHint).includes("youtube")) {
        // Home first so the agent can type with a visible cursor, then click play
        target = play ? "https://www.youtube.com/" : `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      } else if (hostOf(urlHint).includes("flipkart")) {
        target = `https://www.flipkart.com/search?q=${encodeURIComponent(query)}`;
      }
      return ActionPlanSchema.parse({
        goal,
        actions: [
          {
            type: "navigate",
            url: target,
            confidence: 0.92,
            reason: "Navigate to the site/search page for this goal (DEMO MODE)",
          },
        ],
        reason: "DEMO MODE: navigate to target site",
        confidence: 0.92,
      });
    }

    // YouTube: always click a result when the goal is to play — never stop on /results
    if (play && onHost(url, "youtube.com")) {
      const onResults = /\/results|search_query=/i.test(url);
      const scrollTries = input.history.filter((h) =>
        h.plan?.actions?.some((a) => a.type === "scroll"),
      ).length;
      const alreadyTyped = typedSearch || input.history.some((h) =>
        h.plan?.actions?.some((a) => a.type === "type"),
      );

      // 1) Results page → click best matching video (cursor moves + click)
      if (onResults || alreadyTyped) {
        const video = findYoutubeVideo(elements, query);
        if (video) {
          return ActionPlanSchema.parse({
            goal,
            actions: [
              { type: "click", element_id: video.id, confidence: 0.95 },
              { type: "wait", wait_ms: 1800, confidence: 1 },
            ],
            reason: `DEMO MODE: click video “${(video.text || video.ariaLabel || "result").slice(0, 80)}"`,
            confidence: 0.95,
          });
        }
        if (scrollTries < 3) {
          return ActionPlanSchema.parse({
            goal,
            actions: [
              { type: "wait", wait_ms: 900, confidence: 1 },
              { type: "scroll", direction: "down", amount: 500, confidence: 0.85 },
              { type: "wait", wait_ms: 700, confidence: 1 },
            ],
            reason: "DEMO MODE: waiting for YouTube video links to appear",
            confidence: 0.85,
          });
        }
        // Last resort: jump to results URL then retry click next loop
        return ActionPlanSchema.parse({
          goal,
          actions: [
            {
              type: "navigate",
              url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
              confidence: 0.9,
            },
            { type: "wait", wait_ms: 1500, confidence: 1 },
          ],
          reason: "DEMO MODE: reload YouTube results to find a playable video",
          confidence: 0.9,
        });
      }

      // 2) YouTube home / other page → cursor to search, type song, Enter
      const search = findYoutubeSearchInput(elements);
      if (search) {
        return ActionPlanSchema.parse({
          goal,
          actions: [
            { type: "click", element_id: search.id, confidence: 0.95 },
            { type: "clear", element_id: search.id, confidence: 0.94 },
            { type: "type", element_id: search.id, text: query, confidence: 0.95 },
            { type: "press_key", key: "Enter", element_id: search.id, confidence: 0.93 },
            { type: "wait", wait_ms: 1800, confidence: 1 },
          ],
          reason: `DEMO MODE: type “${query}” in YouTube search (visible cursor)`,
          confidence: 0.95,
        });
      }

      // Search box not ready yet
      return ActionPlanSchema.parse({
        goal,
        actions: [
          { type: "wait", wait_ms: 1000, confidence: 1 },
          {
            type: "navigate",
            url: "https://www.youtube.com/",
            confidence: 0.88,
          },
        ],
        reason: "DEMO MODE: waiting for YouTube search box",
        confidence: 0.88,
      });
    }

    // Amazon/Flipkart: open a product, then buy with approval
    if (onHost(url, "amazon.", "flipkart.")) {
      const buyBtn = findBuyButton(elements);
      if (buy && buyBtn) {
        return ActionPlanSchema.parse({
          goal,
          actions: [
            {
              type: "click",
              element_id: buyBtn.id,
              confidence: 0.9,
              requires_approval: true,
              risk_level: "high",
              reason: "Purchase action needs your approval",
            },
            { type: "wait", wait_ms: 1200, confidence: 1 },
          ],
          reason: `DEMO MODE: ${buyBtn.text || buyBtn.ariaLabel || "Buy"} requires approval`,
          needs_approval: true,
          confidence: 0.9,
        });
      }

      // On search results, open a promising product for buy / "best result"
      if ((buy || /best|first|top|result/i.test(goal) || clickedResult === false) && /[?&](k|q)=/i.test(url)) {
        const product = findResultLink(elements, false);
        if (product && (buy || /best|first|open|dekho|see/i.test(goal))) {
          return ActionPlanSchema.parse({
            goal,
            actions: [
              { type: "click", element_id: product.id, confidence: 0.88 },
              { type: "wait", wait_ms: 1400, confidence: 1 },
            ],
            reason: `DEMO MODE: opening product “${(product.text || "result").slice(0, 80)}"`,
            confidence: 0.88,
          });
        }
      }

      if (!typedSearch && /search|find|look for|laptop|headphones|product|buy|kharid/i.test(goal)) {
        const search = findSearchInput(elements);
        if (search) {
          return ActionPlanSchema.parse({
            goal,
            actions: [
              { type: "click", element_id: search.id, confidence: 0.92 },
              { type: "clear", element_id: search.id, confidence: 0.9 },
              { type: "type", element_id: search.id, text: query, confidence: 0.9 },
              { type: "press_key", key: "Enter", confidence: 0.88 },
              { type: "wait", wait_ms: 1400, confidence: 1 },
            ],
            reason: "DEMO MODE: store search",
            confidence: 0.9,
          });
        }
      }

      // Buy goal on product page but button not found yet — scroll
      if (buy && !buyBtn) {
        return ActionPlanSchema.parse({
          goal,
          actions: [
            { type: "scroll", direction: "down", amount: 500, confidence: 0.75 },
            { type: "wait", wait_ms: 600, confidence: 1 },
          ],
          reason: "DEMO MODE: looking for Buy / Add to Cart",
          confidence: 0.75,
        });
      }
    }

    // Generic search
    if (/search|find|look for|headphones|laptop|product|gana|song/i.test(goal)) {
      const search = findSearchInput(elements);
      if (search) {
        return ActionPlanSchema.parse({
          goal,
          actions: [
            { type: "click", element_id: search.id, confidence: 0.92 },
            { type: "clear", element_id: search.id, confidence: 0.9 },
            { type: "type", element_id: search.id, text: query, confidence: 0.9 },
            { type: "press_key", key: "Enter", confidence: 0.88 },
            { type: "wait", wait_ms: 1200, confidence: 1 },
          ],
          reason: "DEMO MODE: search field identified from labels/placeholder",
          confidence: 0.9,
        });
      }
    }

    const keywords = goal
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3 && !["open", "find", "click", "page", "with", "from", "that", "this"].includes(w));

    const clickable = elements.find((el) => {
      const hay = `${el.text || ""} ${el.ariaLabel || ""}`.toLowerCase();
      return (
        keywords.some((k) => hay.includes(k)) &&
        (el.type === "button" || el.type === "link" || el.role === "button" || el.role === "link")
      );
    });

    if (clickable) {
      const risky = /buy|purchase|pay|delete|send|submit|publish|password|security/i.test(
        `${clickable.text} ${clickable.ariaLabel} ${goal}`,
      );
      return ActionPlanSchema.parse({
        goal,
        actions: [
          {
            type: "click",
            element_id: clickable.id,
            confidence: 0.85,
            requires_approval: risky,
            risk_level: risky ? "high" : "low",
          },
          { type: "wait", wait_ms: 800, confidence: 1 },
        ],
        reason: `DEMO MODE: matched interactive element "${clickable.text || clickable.ariaLabel}"`,
        needs_approval: risky,
        confidence: 0.85,
      });
    }

    if (/fill|registration|form/i.test(goal)) {
      const inputs = elements.filter(
        (el) =>
          el.type === "input" &&
          el.inputType !== "password" &&
          el.inputType !== "hidden" &&
          !String(el.value || "").startsWith("[REDACTED"),
      );
      if (inputs.length) {
        const actions = inputs.slice(0, 5).flatMap((el) => {
          const sample =
            el.inputType === "email" || el.name?.includes("email")
              ? "demo@example.com"
              : el.inputType === "tel"
                ? "9999999999"
                : "Demo User";
          return [
            { type: "click" as const, element_id: el.id, confidence: 0.8 },
            { type: "type" as const, element_id: el.id, text: sample, confidence: 0.8 },
          ];
        });
        return ActionPlanSchema.parse({
          goal,
          actions: [
            ...actions,
            {
              type: "ask_user",
              message: "Form fields filled (demo). Review before submit.",
              requires_approval: true,
              risk_level: "high",
              confidence: 0.8,
            },
          ],
          reason: "DEMO MODE: fill non-password fields with demo data",
          needs_approval: true,
          confidence: 0.8,
        });
      }
    }

    if (elements.length < 5) {
      return ActionPlanSchema.parse({
        goal,
        actions: [
          { type: "scroll", direction: "down", amount: 600, confidence: 0.7 },
          { type: "wait", wait_ms: 500, confidence: 1 },
        ],
        reason: "DEMO MODE: few interactive elements — scrolling to reveal more",
        confidence: 0.7,
      });
    }

    return ActionPlanSchema.parse({
      goal,
      actions: [
        {
          type: "ask_user",
          message:
            "DEMO MODE: Could not confidently map the goal to a UI action. Try: “Amazon pe laptop search kar” or “YouTube pe ye gana play kar”.",
          requires_approval: true,
          confidence: 0.4,
        },
      ],
      reason: "Ambiguous goal or no matching elements",
      needs_approval: true,
      confidence: 0.4,
    });
  }
}
