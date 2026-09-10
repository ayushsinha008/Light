import { describe, expect, it } from "vitest";
import type { AgentContext, UIElement } from "@privai/schemas";
import { youtubePlayPlan } from "./cloud.js";

const search: UIElement = {
  id: "search",
  type: "input",
  role: "searchbox",
  name: "search_query",
  visible: true,
  enabled: true,
  interactive: true,
  confidence: 1,
};

function context(
  url: string,
  elements: UIElement[],
  history: AgentContext["history"] = [],
): AgentContext {
  return {
    user_goal: "play tune chhuva song on youtube",
    observation: {
      url,
      title: "YouTube",
      elements,
      forms: [],
      timestamp: Date.now(),
      observation_id: "obs",
    },
    history,
  };
}

describe("YouTube play adapter", () => {
  it("types the song on YouTube home without submitting in the same batch", () => {
    const plan = youtubePlayPlan(context("https://www.youtube.com/", [search]));
    expect(plan?.actions.map((action) => action.type)).toEqual(["clear", "type"]);
    expect(plan?.actions[1]?.text).toBe("tune chhuva song");
  });

  it("submits search on the next observation", () => {
    const plan = youtubePlayPlan(
      context("https://www.youtube.com/", [search], [
        {
          plan: {
            goal: "play tune chhuva song on youtube",
            actions: [{ type: "type", element_id: "old-search", text: "tune chhuva song" }],
          },
          results: [{ actionIndex: 0, type: "type", success: true }],
        },
      ]),
    );
    expect(plan?.actions.map((action) => action.type)).toEqual(["navigate"]);
    expect(plan?.actions[0]?.url).toContain("/results?search_query=");
  });

  it("clicks a video result", () => {
    const short: UIElement = {
      id: "short",
      type: "link",
      href: "https://www.youtube.com/shorts/wrong",
      text: "Random short",
      visible: true,
      enabled: true,
      interactive: true,
      confidence: 1,
    };
    const video: UIElement = {
      id: "video",
      type: "link",
      href: "https://www.youtube.com/watch?v=abc123",
      text: "Tune Chhuva official song",
      visible: true,
      enabled: true,
      interactive: true,
      confidence: 1,
    };
    const plan = youtubePlayPlan(
      context("https://www.youtube.com/results?search_query=tune+chhuva", [short, video]),
    );
    expect(plan?.actions[0]).toMatchObject({ type: "click", element_id: "video" });
  });

  it("finishes after reaching a watch page", () => {
    const ctx = context("https://www.youtube.com/watch?v=abc123", []);
    ctx.observation.media_state = {
      present: true,
      playing: true,
      paused: false,
      current_time: 1,
    };
    const plan = youtubePlayPlan(ctx);
    expect(plan?.actions[0]?.type).toBe("finish");
    expect(plan?.done).toBe(true);
  });
});
