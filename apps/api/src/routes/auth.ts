import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { LoginSchema, RegisterSchema } from "@privai/schemas";
import { prisma } from "../db.js";
import type { Env } from "../config.js";

export type JwtUser = { sub: string; email: string };

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtUser;
    user: JwtUser;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
}

export async function registerAuthRoutes(app: FastifyInstance, env: Env) {
  app.post("/api/auth/register", async (request, reply) => {
    const body = RegisterSchema.parse(request.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (existing) {
      return reply.code(409).send({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(body.password, env.BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        passwordHash,
        name: body.name,
        settings: { create: {} },
      },
    });

    const token = await reply.jwtSign({ sub: user.id, email: user.email });
    reply.setCookie("privai_token", token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7,
    });

    return {
      user: { id: user.id, email: user.email, name: user.name },
      token,
    };
  });

  app.post("/api/auth/login", async (request, reply) => {
    const body = LoginSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (!user) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }
    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    const token = await reply.jwtSign({ sub: user.id, email: user.email });
    reply.setCookie("privai_token", token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7,
    });

    return {
      user: { id: user.id, email: user.email, name: user.name },
      token,
    };
  });

  app.post("/api/auth/guest", async (request, reply) => {
    const body = (request.body as { name?: string }) || {};
    const guestName = (body.name || "Explorer").trim().slice(0, 50);
    const guestEmail = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@light.local`;
    const passwordHash = await bcrypt.hash(Math.random().toString(36), 8);

    const user = await prisma.user.create({
      data: {
        email: guestEmail,
        passwordHash,
        name: guestName,
        settings: { create: {} },
      },
    });

    const token = await reply.jwtSign({ sub: user.id, email: user.email });
    reply.setCookie("privai_token", token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30,
    });

    return {
      user: { id: user.id, email: user.email, name: user.name },
      token,
    };
  });

  app.post("/api/auth/logout", async (_request, reply) => {
    reply.clearCookie("privai_token", { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", { preHandler: authenticate }, async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.sub },
      select: { id: true, email: true, name: true, createdAt: true },
    });
    return { user };
  });
}
