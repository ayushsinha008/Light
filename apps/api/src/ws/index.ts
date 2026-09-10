import type { FastifyInstance } from "fastify";
import { connectionHub } from "./hub.js";

export async function registerWebsocket(app: FastifyInstance) {
  app.get("/ws", { websocket: true }, (socket, request) => {
    const url = new URL(request.url, "http://localhost");
    const token = url.searchParams.get("token");
    const kind = (url.searchParams.get("kind") || "dashboard") as "dashboard" | "extension";
    const connectionId = url.searchParams.get("connectionId") || undefined;

    void (async () => {
      try {
        if (!token) {
          socket.close(4401, "Missing token");
          return;
        }

        let userId: string | undefined;

        if (kind === "extension") {
          const conn = await app.verifyExtensionToken(token);
          if (!conn || conn.status !== "connected") {
            socket.close(4401, "Invalid extension token");
            return;
          }
          userId = conn.userId;
          connectionHub.add({
            socket,
            userId,
            kind: "extension",
            connectionId: connectionId || conn.id,
          });
        } else {
          const decoded = app.jwt.verify<{ sub: string }>(token);
          userId = decoded.sub;
          connectionHub.add({ socket, userId, kind: "dashboard" });
        }

        socket.on("message", (raw) => {
          try {
            const msg = JSON.parse(String(raw)) as {
              event?: string;
              payload?: Record<string, unknown>;
            };
            if (msg.event === "browser:ping") {
              try {
                socket.send(JSON.stringify({ event: "browser:pong", payload: { ts: Date.now() }, ts: Date.now() }));
              } catch {
                // ignore send failures on closing sockets
              }
            }
            if (msg.event === "browser:observation" && msg.payload?.taskId) {
              connectionHub.resolveObservation(
                String(msg.payload.taskId),
                (msg.payload.observation as Record<string, unknown>) || {},
              );
            }
            if (msg.event === "browser:observation-error" && msg.payload?.taskId) {
              connectionHub.rejectObservation(
                String(msg.payload.taskId),
                String(msg.payload.error || "Could not read the browser page"),
              );
            }
            if (msg.event === "browser:action-result" && msg.payload?.taskId) {
              connectionHub.resolveActionResults(
                String(msg.payload.taskId),
                (msg.payload.results as unknown[]) || [],
              );
            }
            if (msg.event === "browser:action-error" && msg.payload?.taskId) {
              connectionHub.rejectActionResults(
                String(msg.payload.taskId),
                String(msg.payload.error || "Browser action execution failed"),
              );
            }
            if (msg.event === "browser:open-tab-result" && msg.payload?.taskId) {
              const tabId = Number(msg.payload.tabId);
              if (!tabId || tabId < 0 || msg.payload.error) {
                // Reject pending open via mark — reuse timeout path by resolving rejection
                connectionHub.resolveOpenTab(String(msg.payload.taskId), {
                  tabId: -1,
                  url: String(msg.payload.error || "Failed to open browser tab"),
                });
              } else {
                connectionHub.resolveOpenTab(String(msg.payload.taskId), {
                  tabId,
                  url: String(msg.payload.url || ""),
                });
              }
            }
            if (msg.event === "browser:tab_closed" && msg.payload?.taskId) {
              connectionHub.markTabClosed(String(msg.payload.taskId));
              if (userId) {
                connectionHub.broadcastToUser(userId, "browser:tab_closed", msg.payload);
              }
            }
            if (msg.event === "agent:approval-response" && msg.payload?.taskId !== undefined) {
              connectionHub.resolveApproval(
                String(msg.payload.taskId),
                Boolean(msg.payload.approved),
              );
            }
          } catch {
            // ignore malformed messages
          }
        });

        socket.on("close", () => connectionHub.remove(socket));
      } catch {
        socket.close(4401, "Unauthorized");
      }
    })();
  });
}
