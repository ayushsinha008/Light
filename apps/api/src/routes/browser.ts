import type { FastifyInstance } from "fastify";
import { createHash, randomBytes } from "node:crypto";
import { ExtensionConnectSchema } from "@privai/schemas";
import { generatePairingCode } from "@privai/shared";
import { prisma } from "../db.js";
import { authenticate } from "./auth.js";
import type { Env } from "../config.js";
import { connectionHub } from "../ws/hub.js";

function hashToken(token: string, secret: string): string {
  return createHash("sha256").update(`${secret}:${token}`).digest("hex");
}

export async function registerBrowserRoutes(app: FastifyInstance, env: Env) {
  app.post("/api/browser/pairing-code", { preHandler: authenticate }, async (request) => {
    const code = generatePairingCode(8);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await prisma.pairingCode.create({
      data: {
        userId: request.user.sub,
        code,
        expiresAt,
      },
    });
    return { code, expiresAt };
  });

  app.post("/api/browser/connect", async (request, reply) => {
    const body = ExtensionConnectSchema.parse(request.body);
    const pairing = await prisma.pairingCode.findUnique({ where: { code: body.pairingCode.toUpperCase() } });
    if (!pairing || pairing.used || pairing.expiresAt < new Date()) {
      return reply.code(400).send({ error: "Invalid or expired pairing code" });
    }

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken, env.EXTENSION_TOKEN_SECRET);

    const connection = await prisma.browserConnection.create({
      data: {
        userId: pairing.userId,
        extensionId: body.extensionId,
        token: tokenHash,
        userAgent: body.userAgent,
        status: "connected",
      },
    });

    await prisma.pairingCode.update({
      where: { id: pairing.id },
      data: { used: true },
    });

    connectionHub.setExtensionToken(connection.id, pairing.userId);

    return {
      connectionId: connection.id,
      token: rawToken,
      status: "connected",
      message: "Your browser is connected.",
    };
  });

  app.get("/api/browser/connections", { preHandler: authenticate }, async (request) => {
    const connections = await prisma.browserConnection.findMany({
      where: { userId: request.user.sub },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        extensionId: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });
    return { connections };
  });

  app.get("/api/browser/status", { preHandler: authenticate }, async (request) => {
    const online = connectionHub.hasExtension(request.user.sub);
    const latest = await prisma.browserConnection.findFirst({
      where: { userId: request.user.sub },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true, status: true, lastSeenAt: true },
    });
    return {
      connected: online,
      connectionId: latest?.id,
      lastSeenAt: latest?.lastSeenAt,
    };
  });

  app.post("/api/browser/observation", async (request, reply) => {
    const auth = request.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "Missing extension token" });
    }
    const raw = auth.slice(7);
    const tokenHash = hashToken(raw, env.EXTENSION_TOKEN_SECRET);
    const connection = await prisma.browserConnection.findUnique({ where: { token: tokenHash } });
    if (!connection || connection.status !== "connected") {
      return reply.code(401).send({ error: "Invalid extension connection" });
    }

    await prisma.browserConnection.update({
      where: { id: connection.id },
      data: { lastSeenAt: new Date() },
    });

    const body = request.body as {
      taskId?: string;
      observation?: Record<string, unknown>;
    };

    if (body.taskId && body.observation) {
      connectionHub.resolveObservation(body.taskId, body.observation);
    }

    return { ok: true };
  });

  app.post("/api/browser/action-result", async (request, reply) => {
    const auth = request.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "Missing extension token" });
    }
    const raw = auth.slice(7);
    const tokenHash = hashToken(raw, env.EXTENSION_TOKEN_SECRET);
    const connection = await prisma.browserConnection.findUnique({ where: { token: tokenHash } });
    if (!connection) {
      return reply.code(401).send({ error: "Invalid extension connection" });
    }

    const body = request.body as {
      taskId?: string;
      results?: unknown[];
    };

    if (body.taskId && body.results) {
      connectionHub.resolveActionResults(body.taskId, body.results);
    }

    return { ok: true };
  });

  /** Authenticate extension token helper for WS */
  app.decorate("verifyExtensionToken", async (rawToken: string) => {
    const tokenHash = hashToken(rawToken, env.EXTENSION_TOKEN_SECRET);
    return prisma.browserConnection.findUnique({ where: { token: tokenHash } });
  });
}

declare module "fastify" {
  interface FastifyInstance {
    verifyExtensionToken: (rawToken: string) => Promise<{
      id: string;
      userId: string;
      status: string;
    } | null>;
  }
}
