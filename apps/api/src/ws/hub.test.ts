import { describe, expect, it } from "vitest";
import type { WebSocket } from "ws";
import { ConnectionHub } from "./hub.js";

function connectedHub() {
  const hub = new ConnectionHub();
  const socket = {
    readyState: 1,
    send(raw: string) {
      const message = JSON.parse(raw) as {
        event: string;
        payload?: { taskId?: string };
      };
      const taskId = message.payload?.taskId;
      if (!taskId) return;
      if (message.event === "browser:open_tab") {
        hub.resolveOpenTab(taskId, { tabId: 42, url: "https://www.youtube.com/" });
      }
      if (message.event === "browser:observe") {
        hub.resolveObservation(taskId, {
          url: "https://www.youtube.com/",
          title: "YouTube",
        });
      }
      if (message.event === "browser:execute") {
        hub.resolveActionResults(taskId, [{ type: "click", success: true }]);
      }
    },
    close() {},
  } as unknown as WebSocket;

  hub.add({
    socket,
    userId: "user",
    kind: "extension",
    connectionId: "connection",
  });
  return hub;
}

describe("ConnectionHub request ordering", () => {
  it("does not lose an immediate open-tab response", async () => {
    const hub = connectedHub();
    await expect(
      hub.requestOpenTab("user", "task-open", "https://www.youtube.com/"),
    ).resolves.toMatchObject({ tabId: 42 });
  });

  it("does not lose an immediate observation", async () => {
    const hub = connectedHub();
    await expect(hub.requestObservation("user", "task-observe")).resolves.toMatchObject({
      title: "YouTube",
    });
  });

  it("does not lose immediate action results", async () => {
    const hub = connectedHub();
    await expect(hub.requestExecute("user", "task-execute", {})).resolves.toEqual([
      { type: "click", success: true },
    ]);
  });
});
