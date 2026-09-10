export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4000";

export type AuthUser = { id: string; email: string; name: string };

export function getUserName(): string {
  if (typeof window === "undefined") return "Explorer";
  return localStorage.getItem("light_user_name") || "Explorer";
}

export function setUserName(name: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("light_user_name", name);
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("privai_token");
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem("privai_token", token);
  else localStorage.removeItem("privai_token");
}

export async function ensureAuth(customName?: string): Promise<string> {
  const existingToken = getToken();
  if (existingToken) return existingToken;

  const name = customName || getUserName();
  try {
    const res = await api<{ token: string; user?: AuthUser }>("/api/auth/guest", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ name }),
    });
    setToken(res.token);
    if (res.user?.name) setUserName(res.user.name);
    return res.token;
  } catch {
    return "";
  }
}

export async function api<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(options.headers || {});
  const method = (options.method || "GET").toUpperCase();
  const needsJsonBody = ["POST", "PUT", "PATCH"].includes(method);
  let body = options.body;
  if (needsJsonBody && (body === undefined || body === null)) {
    body = "{}";
  }
  if (body !== undefined && body !== null) {
    headers.set("Content-Type", "application/json");
  }
  if (options.auth !== false) {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  const res = await fetch(`${API_URL}${path}`, { ...options, headers, body, credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}
