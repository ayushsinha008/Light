import type { ActionPlan, AgentContext } from "@privai/schemas";

export interface AIProvider {
  readonly name: string;
  generatePlan(input: AgentContext): Promise<ActionPlan>;
}

export interface AIProviderConfig {
  provider: "demo" | "openai" | "anthropic" | "gemini";
  openaiApiKey?: string;
  openaiModel?: string;
  anthropicApiKey?: string;
  anthropicModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
}
