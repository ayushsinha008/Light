import type { WebSocket } from "ws";
import { WS_EVENTS } from "@privai/shared";

type ClientKind = "dashboard" | "extension";

interface Client {
  socket: WebSocket;
  userId: string;
  kind: ClientKind;
  connectionId?: string;
}

type Pending<T> = {
  resolve: (value: T) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
};

export type TaskControlState = {
  aborted: boolean;
  paused: boolean;
  tabId?: number;
  tabClosed?: boolean;
};

export class ConnectionHub {
  private clients = new Set<Client>();
  private observations = new Map<string, Pending<Record<string, unknown>>>();
  private actionResults = new Map<string, Pending<unknown[]>>();
  private approvals = new Map<string, Pending<boolean>>();
  private openTabs = new Map<string, Pending<{ tabId: number; url: string }>>();
  private controls = new Map<string, TaskControlState>();

  add(client: Client) {
    // A reloaded MV3 service worker can reconnect before the old socket's close
    // event is observed. Keep exactly one extension transport per connection.
    if (client.kind === "extension") {
      for (const existing of this.clients) {
        if (
          existing.kind === "extension" &&
          existing.userId === client.userId &&
          existing.connectionId === client.connectionId &&
          existing.socket !== client.socket
        ) {
          this.clients.delete(existing);
          try {
            existing.socket.close(4000, "Replaced by newer extension connection");
          } catch {
            // Socket may already be closing.
          }
        }
      }
    }
    this.clients.add(client);
    this.broadcastToUser(client.userId, WS_EVENTS.CONNECTION, {
      status: "online",
      kind: client.kind,
      connectionId: client.connectionId,
    });
  }

  remove(socket: WebSocket) {
    for (const c of this.clients) {
      if (c.socket === socket) {
        this.clients.delete(c);
        this.broadcastToUser(c.userId, WS_EVENTS.CONNECTION, {
          status: "offline",
          kind: c.kind,
          connectionId: c.connectionId,
        });
      }
    }
  }

  setExtensionToken(_connectionId: string, _userId: string) {
    // reserved for future presence indexing
  }

  broadcastToUser(userId: string, event: string, payload: unknown) {
    const message = JSON.stringify({ event, payload, ts: Date.now() });
    for (const c of this.clients) {
      if (c.userId === userId && c.socket.readyState === 1) {
        c.socket.send(message);
      }
    }
  }

  sendToExtension(userId: string, event: string, payload: unknown) {
    const message = JSON.stringify({ event, payload, ts: Date.now() });
    for (const c of this.clients) {
      if (c.userId === userId && c.kind === "extension" && c.socket.readyState === 1) {
        c.socket.send(message);
      }
    }
  }

  hasExtension(userId: string): boolean {
    for (const c of this.clients) {
      if (c.userId === userId && c.kind === "extension" && c.socket.readyState === 1) {
        return true;
      }
    }
    return false;
  }

  initControl(taskId: string) {
    this.controls.set(taskId, { aborted: false, paused: false });
  }

  getControl(taskId: string): TaskControlState {
    return this.controls.get(taskId) || { aborted: false, paused: false };
  }

  setControl(taskId: string, patch: Partial<TaskControlState>) {
    const current = this.getControl(taskId);
    this.controls.set(taskId, { ...current, ...patch });
  }

  clearControl(taskId: string) {
    this.controls.delete(taskId);
  }

  /** Wait while paused; throw if aborted or tab closed. */
  async waitIfPaused(taskId: string): Promise<void> {
    for (;;) {
      const c = this.getControl(taskId);
      if (c.aborted) throw new Error("TASK_STOPPED");
      if (c.tabClosed) throw new Error("TAB_CLOSED");
      if (!c.paused) return;
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  requestOpenTab(
    userId: string,
    taskId: string,
    url: string,
    timeoutMs = 20000,
  ): Promise<{ tabId: number; url: string }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.openTabs.delete(taskId);
        reject(new Error("Timed out opening browser tab — is the extension connected?"));
      }, timeoutMs);
      // Register before sending: a fast extension response must not be lost.
      this.openTabs.set(taskId, { resolve, reject, timer });
      this.sendToExtension(userId, WS_EVENTS.OPEN_TAB_REQUEST, { taskId, url });
    });
  }

  resolveOpenTab(taskId: string, data: { tabId: number; url: string }) {
    const pending = this.openTabs.get(taskId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.openTabs.delete(taskId);
    if (!data.tabId || data.tabId < 0) {
      pending.reject(new Error(data.url || "Failed to open browser tab"));
      return;
    }
    this.setControl(taskId, { tabId: data.tabId });
    pending.resolve(data);
  }

  markTabClosed(taskId: string) {
    this.setControl(taskId, { tabClosed: true, aborted: true });
    const obs = this.observations.get(taskId);
    if (obs) {
      clearTimeout(obs.timer);
      this.observations.delete(taskId);
      obs.reject(new Error("TAB_CLOSED"));
    }
    const exec = this.actionResults.get(taskId);
    if (exec) {
      clearTimeout(exec.timer);
      this.actionResults.delete(taskId);
      exec.reject(new Error("TAB_CLOSED"));
    }
  }

  requestObservation(userId: string, taskId: string, timeoutMs = 15000): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.observations.delete(taskId);
        reject(new Error("Observation timeout — is the agent browser tab still open?"));
      }, timeoutMs);
      // Register before sending: observation/error replies can be immediate.
      this.observations.set(taskId, { resolve, reject, timer });
      this.sendToExtension(userId, WS_EVENTS.OBSERVE_REQUEST, {
        taskId,
        tabId: this.getControl(taskId).tabId,
      });
    });
  }

  resolveObservation(taskId: string, observation: Record<string, unknown>) {
    const pending = this.observations.get(taskId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.observations.delete(taskId);
    pending.resolve(observation);
  }

  rejectObservation(taskId: string, message: string) {
    const pending = this.observations.get(taskId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.observations.delete(taskId);
    pending.reject(new Error(message || "Could not read the browser page"));
  }

  requestExecute(
    userId: string,
    taskId: string,
    plan: unknown,
    timeoutMs = 30000,
  ): Promise<unknown[]> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.actionResults.delete(taskId);
        reject(new Error("Action execution timeout"));
      }, timeoutMs);
      // Register before sending for the same reason as observations.
      this.actionResults.set(taskId, { resolve, reject, timer });
      this.sendToExtension(userId, WS_EVENTS.EXECUTE_REQUEST, {
        taskId,
        tabId: this.getControl(taskId).tabId,
        plan,
      });
    });
  }

  resolveActionResults(taskId: string, results: unknown[]) {
    const pending = this.actionResults.get(taskId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.actionResults.delete(taskId);
    pending.resolve(results);
  }

  rejectActionResults(taskId: string, message: string) {
    const pending = this.actionResults.get(taskId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.actionResults.delete(taskId);
    pending.reject(new Error(message || "Browser action execution failed"));
  }

  requestApproval(userId: string, taskId: string, plan: unknown, reasons: string[]): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.approvals.delete(taskId);
        resolve(false);
      }, 120000);
      this.approvals.set(taskId, { resolve, reject, timer });
      this.broadcastToUser(userId, WS_EVENTS.APPROVAL, { taskId, plan, reasons });
    });
  }

  resolveApproval(taskId: string, approved: boolean) {
    const pending = this.approvals.get(taskId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.approvals.delete(taskId);
    pending.resolve(approved);
  }
}

export const connectionHub = new ConnectionHub();
