declare const __LIGHT_API_URL__: string;

export const DEFAULT_API_URL =
  typeof __LIGHT_API_URL__ === "string" && __LIGHT_API_URL__
    ? __LIGHT_API_URL__.replace(/\/$/, "")
    : "http://localhost:4000";
