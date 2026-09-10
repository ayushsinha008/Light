import { DemoAIProvider } from "./demo.js";
import { AnthropicProvider, GeminiProvider, OpenAIProvider } from "./cloud.js";
import type { AIProvider, AIProviderConfig } from "./types.js";

export function createAIProvider(config: AIProviderConfig): AIProvider {
  switch (config.provider) {
    case "openai":
      if (!config.openaiApiKey) {
        console.warn("[Light] OPENAI_API_KEY missing — falling back to DEMO MODE planner");
        return new DemoAIProvider();
      }
      return new OpenAIProvider(config.openaiApiKey, config.openaiModel);
    case "anthropic":
      if (!config.anthropicApiKey) {
        console.warn("[Light] ANTHROPIC_API_KEY missing — falling back to DEMO MODE planner");
        return new DemoAIProvider();
      }
      return new AnthropicProvider(config.anthropicApiKey, config.anthropicModel);
    case "gemini":
      if (!config.geminiApiKey) {
        console.warn("[Light] GEMINI_API_KEY missing — falling back to DEMO MODE planner");
        return new DemoAIProvider();
      }
      return new GeminiProvider(config.geminiApiKey, config.geminiModel);
    case "demo":
    default:
      return new DemoAIProvider();
  }
}

export * from "./types.js";
export * from "./demo.js";
export * from "./cloud.js";
export * from "./travel.js";
