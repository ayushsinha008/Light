/** Typed message helpers between popup / background / content. */

export type PrivAIMessage =
  | { type: "PRIVAI_OBSERVE" }
  | { type: "PRIVAI_EXECUTE"; plan: unknown }
  | { type: "PRIVAI_PING" }
  | { type: "PRIVAI_PAIR"; apiUrl: string; pairingCode: string }
  | { type: "PRIVAI_GET_STATE" }
  | { type: "PRIVAI_DISCONNECT" }
  | { type: "PRIVAI_RUN_LOCAL" }
  | { type: "PRIVAI_PAGE_INFO" };

export async function sendToBackground<T = unknown>(message: PrivAIMessage): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}
