import { WS_EVENTS } from "@privai/shared";
import { DEFAULT_API_URL } from "../config";

interface ConnectionState {
  apiUrl: string;
  connectionId?: string;
  token?: string;
  status: "disconnected" | "connecting" | "connected";
  lastError?: string;
}

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

/** taskId → Chrome tab id controlled by the agent */
const agentTabs = new Map<string, number>();
/** tabId → taskId */
const tabTasks = new Map<number, string>();
const TAB_BINDINGS_KEY = "privaiAgentTabBindings";

async function persistAgentTabBindings() {
  await chrome.storage.session.set({
    [TAB_BINDINGS_KEY]: Object.fromEntries(agentTabs),
  });
}

async function restoreAgentTabBindings() {
  const stored = await chrome.storage.session.get(TAB_BINDINGS_KEY);
  const bindings = stored[TAB_BINDINGS_KEY] as Record<string, number> | undefined;
  if (!bindings) return;
  for (const [taskId, tabId] of Object.entries(bindings)) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.id && !isProtectedDashboardUrl(tab.url)) {
        agentTabs.set(taskId, tabId);
        tabTasks.set(tabId, taskId);
      }
    } catch {
      // Closed tabs are discarded below.
    }
  }
  await persistAgentTabBindings();
}

const bindingsReady = restoreAgentTabBindings();

async function getState(): Promise<ConnectionState> {
  const data = await chrome.storage.local.get(["apiUrl", "connectionId", "token", "status"]);
  return {
    apiUrl: data.apiUrl || DEFAULT_API_URL,
    connectionId: data.connectionId,
    token: data.token,
    status: data.status || "disconnected",
  };
}

async function setState(patch: Partial<ConnectionState>) {
  await chrome.storage.local.set(patch);
  chrome.runtime.sendMessage({ type: "PRIVAI_STATE", ...patch }).catch(() => undefined);
}

async function ensureContentScript(tabId: number) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PRIVAI_PING" });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    // YouTube is an SPA; allow the injected listener to initialize.
    await new Promise((r) => setTimeout(r, 250));
    await chrome.tabs.sendMessage(tabId, { type: "PRIVAI_PING" });
  }
}

function waitForTabComplete(tabId: number, timeoutMs = 15000): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      chrome.tabs.get(tabId).then(resolve).catch(() => reject(new Error("Tab load timeout")));
    }, timeoutMs);

    function listener(id: number, info: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(tab);
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function isProtectedDashboardUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    const local =
      u.hostname === "localhost" ||
      u.hostname === "127.0.0.1" ||
      u.hostname === "[::1]";
    // Never navigate/reuse the Light web dashboard tab
    return local && (u.port === "3000" || u.port === "");
  } catch {
    return /localhost:3000|127\.0\.0\.1:3000/i.test(url);
  }
}

async function resolveAgentTab(taskId?: string, preferredTabId?: number): Promise<chrome.tabs.Tab> {
  await bindingsReady;
  if (taskId && preferredTabId) {
    try {
      const preferred = await chrome.tabs.get(preferredTabId);
      if (preferred.id && !isProtectedDashboardUrl(preferred.url)) {
        agentTabs.set(taskId, preferredTabId);
        tabTasks.set(preferredTabId, taskId);
        await persistAgentTabBindings();
        return preferred;
      }
    } catch {
      // Fall through to persisted task binding.
    }
  }
  if (taskId && agentTabs.has(taskId)) {
    const tabId = agentTabs.get(taskId)!;
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab?.id) {
        if (isProtectedDashboardUrl(tab.url)) {
          agentTabs.delete(taskId);
          tabTasks.delete(tabId);
          await persistAgentTabBindings();
          throw new Error("Agent tab pointed at dashboard — reopen a work tab.");
        }
        return tab;
      }
    } catch (err) {
      agentTabs.delete(taskId);
      tabTasks.delete(tabId);
      await persistAgentTabBindings();
      if (err instanceof Error && /dashboard/i.test(err.message)) throw err;
      throw new Error("Agent browser tab was closed.");
    }
  }
  // Never fall back to the user's active tab (often the dashboard).
  throw new Error("No agent browser tab for this task. Open a new work tab first.");
}

async function openAgentTab(taskId: string, url: string): Promise<{ tabId: number; url: string }> {
  await bindingsReady;
  // Reuse existing agent tab for this task instead of touching other tabs
  const existingId = agentTabs.get(taskId);
  if (existingId) {
    try {
      const existing = await chrome.tabs.get(existingId);
      if (existing.id && !isProtectedDashboardUrl(existing.url)) {
        await chrome.tabs.update(existing.id, { url, active: true });
        const loaded = await waitForTabComplete(existing.id);
        await new Promise((r) => setTimeout(r, 800));
        await ensureContentScript(existing.id);
        return { tabId: existing.id, url: loaded.url || url };
      }
    } catch {
      agentTabs.delete(taskId);
      tabTasks.delete(existingId);
      await persistAgentTabBindings();
    }
  }

  // Always create a dedicated work tab — never overwrite the dashboard tab
  const tab = await chrome.tabs.create({ url, active: true });
  if (!tab.id) throw new Error("Failed to open browser tab");
  agentTabs.set(taskId, tab.id);
  tabTasks.set(tab.id, taskId);
  await persistAgentTabBindings();
  const loaded = await waitForTabComplete(tab.id);
  // Give SPAs (YouTube/Amazon) time to hydrate interactive nodes
  await new Promise((r) => setTimeout(r, 1200));
  // Do not report the tab as ready until page access and messaging work.
  await ensureContentScript(tab.id);
  return { tabId: tab.id, url: loaded.url || url };
}

async function observeTab(taskId: string, preferredTabId?: number) {
  const tab = await resolveAgentTab(taskId, preferredTabId);
  if (!tab.id || !tab.url) throw new Error("No agent tab");

  if (/^(chrome|chrome-extension|edge|about|devtools):/i.test(tab.url)) {
    return {
      url: tab.url,
      title: tab.title || "",
      elements: [],
      forms: [],
      restricted: true,
      restriction_reason:
        "This page cannot be automated because the browser does not allow extension access.",
      timestamp: Date.now(),
      observation_id: `restricted_${Date.now()}`,
    };
  }

  await ensureContentScript(tab.id);
  const response = await chrome.tabs.sendMessage(tab.id, { type: "PRIVAI_OBSERVE" });
  if (!response?.ok) throw new Error(response?.error || "Observe failed");
  return response.observation;
}

async function executeOnTab(taskId: string, plan: unknown, preferredTabId?: number) {
  let tab = await resolveAgentTab(taskId, preferredTabId);
  if (!tab.id) throw new Error("No agent tab");
  if (isProtectedDashboardUrl(tab.url)) {
    throw new Error("Refusing to automate the Light dashboard tab.");
  }

  const actions = (plan as { actions?: Array<{ type: string; url?: string }> }).actions || [];
  for (const action of actions) {
    if (action.type === "open_tab" && action.url) {
      const opened = await openAgentTab(taskId, action.url);
      tab = await chrome.tabs.get(opened.tabId);
    }
    if (action.type === "close_tab" && tab.id) {
      const id = tab.id;
      agentTabs.delete(taskId);
      tabTasks.delete(id);
      await persistAgentTabBindings();
      await chrome.tabs.remove(id);
      return [{ actionIndex: 0, type: "close_tab", success: true }];
    }
    if (action.type === "navigate" && action.url && tab.id) {
      if (isProtectedDashboardUrl(tab.url)) {
        const opened = await openAgentTab(taskId, action.url);
        tab = await chrome.tabs.get(opened.tabId);
      } else {
        await chrome.tabs.update(tab.id, { url: action.url });
        await waitForTabComplete(tab.id);
        tab = await chrome.tabs.get(tab.id);
      }
    }
  }

  if (!tab.id) throw new Error("No agent tab");
  if (isProtectedDashboardUrl(tab.url)) {
    throw new Error("Refusing to automate the Light dashboard tab.");
  }

  // Background already handled tab open/navigate — skip those in the content script
  const pagePlan = {
    ...(plan as object),
    actions: actions.filter((a) => a.type !== "navigate" && a.type !== "open_tab" && a.type !== "close_tab"),
  };
  if (!pagePlan.actions.length) {
    return actions.map((a, actionIndex) => ({
      actionIndex,
      type: a.type,
      success: true,
    }));
  }

  await ensureContentScript(tab.id);
  const response = await chrome.tabs.sendMessage(tab.id, { type: "PRIVAI_EXECUTE", plan: pagePlan });
  if (!response?.ok) throw new Error(response?.error || "Execute failed");

  const mayNavigate = pagePlan.actions.some(
    (action) =>
      action.type === "click" ||
      action.type === "double_click" ||
      action.type === "submit" ||
      (action.type === "press_key" && (action as { key?: string }).key === "Enter"),
  );
  if (mayNavigate) {
    // The content script acknowledges before triggering navigation so its
    // message port survives. Wait here, in the stable service worker, before
    // allowing the API loop to re-observe.
    await new Promise((r) => setTimeout(r, 1200));
    const current = await chrome.tabs.get(tab.id);
    if (current.status === "loading") {
      await waitForTabComplete(tab.id);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return response.results;
}

function connectWs(state: ConnectionState) {
  if (!state.token || !state.connectionId) return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  const wsUrl =
    state.apiUrl.replace(/^http/, "ws") +
    `/ws?kind=extension&token=${encodeURIComponent(state.token)}&connectionId=${encodeURIComponent(state.connectionId)}`;
  void setState({ status: "connecting" });
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    void setState({ status: "connected", lastError: undefined });
  };

  ws.onclose = () => {
    void setState({ status: "disconnected" });
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      void getState().then(connectWs);
    }, 3000);
  };

  ws.onerror = () => {
    void setState({ lastError: "WebSocket error" });
  };

  ws.onmessage = (event) => {
    void (async () => {
      try {
        const msg = JSON.parse(String(event.data)) as {
          event: string;
          payload: {
            taskId?: string;
            tabId?: number;
            plan?: unknown;
            url?: string;
            action?: string;
          };
        };
        const st = await getState();
        const taskId = msg.payload.taskId;

        if (msg.event === WS_EVENTS.OPEN_TAB_REQUEST && taskId && msg.payload.url) {
          try {
            const opened = await openAgentTab(taskId, msg.payload.url);
            ws?.send(
              JSON.stringify({
                event: "browser:open-tab-result",
                payload: { taskId, tabId: opened.tabId, url: opened.url },
              }),
            );
          } catch (err) {
            ws?.send(
              JSON.stringify({
                event: "browser:open-tab-result",
                payload: {
                  taskId,
                  tabId: -1,
                  url: "",
                  error: err instanceof Error ? err.message : String(err),
                },
              }),
            );
          }
          return;
        }

        if (msg.event === WS_EVENTS.OBSERVE_REQUEST && taskId) {
          try {
            const observation = await observeTab(taskId, msg.payload.tabId);
            ws?.send(
              JSON.stringify({
                event: "browser:observation",
                payload: { taskId, observation },
              }),
            );
            await fetch(`${st.apiUrl}/api/browser/observation`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${st.token}`,
              },
              body: JSON.stringify({
                taskId,
                connectionId: st.connectionId,
                observation,
              }),
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            ws?.send(
              JSON.stringify({
                event: "browser:observation-error",
                payload: { taskId, error: message },
              }),
            );
            if (/closed/i.test(message) && taskId) {
              ws?.send(
                JSON.stringify({
                  event: "browser:tab_closed",
                  payload: { taskId },
                }),
              );
            }
            console.error("[Light] observe failed", err);
          }
          return;
        }

        if (msg.event === WS_EVENTS.EXECUTE_REQUEST && taskId) {
          try {
            const results = await executeOnTab(taskId, msg.payload.plan, msg.payload.tabId);
            ws?.send(
              JSON.stringify({
                event: "browser:action-result",
                payload: { taskId, results },
              }),
            );
            await fetch(`${st.apiUrl}/api/browser/action-result`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${st.token}`,
              },
              body: JSON.stringify({
                taskId,
                connectionId: st.connectionId,
                results,
              }),
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            ws?.send(
              JSON.stringify({
                event: "browser:action-error",
                payload: { taskId, error: message },
              }),
            );
            if (/closed/i.test(message) && taskId) {
              ws?.send(
                JSON.stringify({
                  event: "browser:tab_closed",
                  payload: { taskId },
                }),
              );
            }
            console.error("[Light] execute failed", err);
          }
          return;
        }

        if (msg.event === WS_EVENTS.CONTROL && taskId) {
          if (msg.payload.action === "stop") {
            const tabId = agentTabs.get(taskId);
            // Do not force-close the user's tab on stop — just unbind control.
            if (tabId) {
              agentTabs.delete(taskId);
              tabTasks.delete(tabId);
              await persistAgentTabBindings();
            }
          }
        }
      } catch (err) {
        console.error("[Light] message handling failed", err);
      }
    })();
  };
}

chrome.tabs.onRemoved.addListener((tabId) => {
  const taskId = tabTasks.get(tabId);
  if (!taskId) return;
  tabTasks.delete(tabId);
  agentTabs.delete(taskId);
  void persistAgentTabBindings();
  ws?.send(
    JSON.stringify({
      event: "browser:tab_closed",
      payload: { taskId, tabId },
    }),
  );
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== "install") return;
  void setState({ apiUrl: DEFAULT_API_URL, status: "disconnected" });
});

chrome.runtime.onStartup.addListener(() => {
  void getState().then(connectWs);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void (async () => {
    try {
      if (message?.type === "PRIVAI_PAIR") {
        const apiUrl = message.apiUrl || DEFAULT_API_URL;
        const pairingCode = String(message.pairingCode || "").toUpperCase();
        const res = await fetch(`${apiUrl}/api/browser/connect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pairingCode,
            extensionId: chrome.runtime.id,
            userAgent: navigator.userAgent,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Pairing failed");
        await setState({
          apiUrl,
          connectionId: data.connectionId,
          token: data.token,
          status: "connected",
        });
        connectWs(await getState());
        sendResponse({ ok: true, message: data.message, connectionId: data.connectionId });
        return;
      }

      if (message?.type === "PRIVAI_GET_STATE") {
        sendResponse({ ok: true, ...(await getState()) });
        return;
      }

      if (message?.type === "PRIVAI_DISCONNECT") {
        ws?.close();
        await chrome.storage.local.remove(["connectionId", "token"]);
        await setState({ status: "disconnected", connectionId: undefined, token: undefined });
        sendResponse({ ok: true });
        return;
      }

      if (message?.type === "PRIVAI_RUN_LOCAL") {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];
        if (!tab?.id) throw new Error("No active tab");
        await ensureContentScript(tab.id);
        const response = await chrome.tabs.sendMessage(tab.id, { type: "PRIVAI_OBSERVE" });
        sendResponse(response);
        return;
      }

      if (message?.type === "PRIVAI_PAGE_INFO") {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];
        sendResponse({
          ok: true,
          url: tab?.url,
          title: tab?.title,
          restricted: tab?.url ? /^(chrome|chrome-extension|edge|about):/i.test(tab.url) : false,
        });
        return;
      }

      sendResponse({ ok: false, error: "Unknown" });
    } catch (err) {
      sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  })();
  return true;
});

void getState().then(connectWs);
