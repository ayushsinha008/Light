import { expect, test, chromium, type BrowserContext } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const runLive = process.env.LIVE_YOUTUBE_EXTENSION === "1";
const extensionPath = resolve(__dirname, "../../apps/extension/dist");

test.describe("live YouTube extension smoke test", () => {
  test.skip(!runLive, "Set LIVE_YOUTUBE_EXTENSION=1 to run against youtube.com");
  test.setTimeout(120_000);

  let context: BrowserContext;
  let profile: string;

  test.beforeEach(async () => {
    profile = mkdtempSync(resolve(tmpdir(), "privai-youtube-"));
    context = await chromium.launchPersistentContext(profile, {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--no-first-run",
      ],
    });
  });

  test.afterEach(async () => {
    await context?.close();
    rmSync(profile, { recursive: true, force: true });
  });

  test("types, submits, and opens a video result", async () => {
    const page = context.pages()[0] || (await context.newPage());
    await page.goto("https://www.youtube.com/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("input#search, input[name='search_query']", { timeout: 30_000 });

    const worker =
      context.serviceWorkers().find((candidate) => candidate.url().startsWith("chrome-extension://")) ||
      (await context.waitForEvent("serviceworker", {
        timeout: 15_000,
        predicate: (candidate) => candidate.url().startsWith("chrome-extension://"),
      }));

    const sendToActiveTab = async (message: unknown) =>
      worker.evaluate(async (payload) => {
        const api = (globalThis as unknown as {
          chrome: {
            tabs: {
              query: (query: object) => Promise<Array<{ id?: number }>>;
              sendMessage: (id: number, message: unknown) => Promise<unknown>;
            };
          };
        }).chrome;
        const [tab] = await api.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) throw new Error("No active tab");
        return api.tabs.sendMessage(tab.id, payload);
      }, message);

    const first = (await sendToActiveTab({ type: "PRIVAI_OBSERVE" })) as {
      ok: boolean;
      observation: {
        elements: Array<{
          id: string;
          name?: string;
          role?: string;
          placeholder?: string;
        }>;
      };
    };
    expect(first.ok).toBe(true);
    const search = first.observation.elements.find(
      (element) =>
        element.name === "search_query" ||
        element.role === "searchbox" ||
        element.placeholder?.toLowerCase().includes("search"),
    );
    expect(search?.id).toBeTruthy();

    await sendToActiveTab({
      type: "PRIVAI_EXECUTE",
      plan: {
        goal: "play tune chhuva song on youtube",
        actions: [
          { type: "clear", element_id: search!.id, confidence: 1 },
          { type: "type", element_id: search!.id, text: "tune chhuva song", confidence: 1 },
        ],
      },
    });
    await expect(page.locator("input#search, input[name='search_query']").first()).toHaveValue(
      "tune chhuva song",
    );

    const second = (await sendToActiveTab({ type: "PRIVAI_OBSERVE" })) as typeof first;
    const currentSearch = second.observation.elements.find(
      (element) => element.name === "search_query" || element.role === "searchbox",
    );
    await sendToActiveTab({
      type: "PRIVAI_EXECUTE",
      plan: {
        goal: "play tune chhuva song on youtube",
        actions: [
          { type: "press_key", element_id: currentSearch!.id, key: "Enter", confidence: 1 },
        ],
      },
    });

    await page.waitForURL(/\/results\?search_query=/, { timeout: 30_000 });
    await page.waitForSelector('a[href*="/watch?v="]', { timeout: 30_000 });

    const results = (await sendToActiveTab({ type: "PRIVAI_OBSERVE" })) as {
      ok: boolean;
      observation: {
        elements: Array<{ id: string; href?: string }>;
      };
    };
    const video = results.observation.elements.find((element) =>
      /\/watch\?v=/.test(element.href || ""),
    );
    expect(video?.id).toBeTruthy();

    await sendToActiveTab({
      type: "PRIVAI_EXECUTE",
      plan: {
        goal: "play tune chhuva song on youtube",
        actions: [{ type: "click", element_id: video!.id, confidence: 1 }],
      },
    });
    await page.waitForURL(/\/watch\?v=/, { timeout: 30_000 });
  });
});
