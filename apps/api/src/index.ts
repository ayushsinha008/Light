import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import { ZodError } from "zod";
import { loadEnv } from "./config.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerBrowserRoutes } from "./routes/browser.js";
import { registerAgentRoutes } from "./routes/agent.js";
import { registerDataRoutes } from "./routes/data.js";
import { registerWebsocket } from "./ws/index.js";
import { prisma } from "./db.js";

async function main() {
  const env = loadEnv();
  const allowedOrigins = new Set(
    env.CORS_ORIGINS.split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );
  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  await app.register(cors, {
    origin(origin, callback) {
      const normalized = origin?.replace(/\/$/, "");
      const allowed =
        !origin ||
        (normalized ? allowedOrigins.has(normalized) : false) ||
        /^chrome-extension:\/\//i.test(origin) ||
        /^moz-extension:\/\//i.test(origin);
      // Never throw here — a thrown error becomes HTTP 500 and browsers show "Failed to fetch".
      callback(null, allowed);
    },
    credentials: true,
  });

  await app.register(cookie, {
    secret: env.COOKIE_SECRET,
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    cookie: {
      cookieName: "privai_token",
      signed: false,
    },
  });

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
  });

  await app.register(websocket);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: "Validation failed",
        details: error.flatten(),
      });
    }
    app.log.error(error);
    const status = (error as { statusCode?: number }).statusCode || 500;
    return reply.code(status).send({
      error: error instanceof Error ? error.message : "Internal Server Error",
    });
  });

  app.get("/api/health", async () => {
    await prisma.$queryRaw`SELECT 1`;
    return {
      ok: true,
      service: "Light API",
      mode: env.PRIVAI_MODE,
      aiProvider: env.AI_PROVIDER,
      database: "connected",
      timestamp: Date.now(),
    };
  });

  await registerAuthRoutes(app, env);
  await registerBrowserRoutes(app, env);
  await registerAgentRoutes(app, env);
  await registerDataRoutes(app);
  await registerWebsocket(app);

  const shutdown = async () => {
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await app.listen({ host: env.API_HOST, port: env.API_PORT });
  app.log.info(`Light API listening on ${env.API_URL} (mode=${env.PRIVAI_MODE})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
