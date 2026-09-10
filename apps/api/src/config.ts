import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const EnvSchema = z.object({
  PRIVAI_MODE: z.enum(["demo", "live"]).default("demo"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().default(4000),
  API_URL: z.string().default("http://localhost:4000"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  WEB_URL: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),
  COOKIE_SECRET: z.string().min(16),
  BCRYPT_ROUNDS: z.coerce.number().default(12),
  EXTENSION_TOKEN_SECRET: z.string().min(16),
  AI_PROVIDER: z.enum(["demo", "openai", "anthropic", "gemini"]).default("demo"),
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  ANTHROPIC_MODEL: z.string().default("claude-3-5-sonnet-20241022"),
  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_MODEL: z.string().default("gemini-2.0-flash"),
  CONFIDENCE_THRESHOLD: z.coerce.number().default(0.75),
  MAX_AGENT_STEPS: z.coerce.number().default(40),
  RATE_LIMIT_MAX: z.coerce.number().default(120),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  STORE_SCREENSHOTS: z
    .string()
    .optional()
    .transform((v) => v === "true")
    .default("false"),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  const runtimeEnv = {
    ...process.env,
    // Render and most container hosts inject PORT. API_PORT remains available
    // for local development and explicit overrides.
    API_PORT: process.env.API_PORT || process.env.PORT,
    API_URL: process.env.API_URL || process.env.RENDER_EXTERNAL_URL,
  };
  const parsed = EnvSchema.safeParse(runtimeEnv);
  if (!parsed.success) {
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment configuration. Copy .env.example to .env");
  }
  return parsed.data;
}
