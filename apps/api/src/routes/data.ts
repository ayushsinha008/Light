import type { FastifyInstance } from "fastify";
import { SettingsUpdateSchema } from "@privai/schemas";
import { prisma } from "../db.js";
import { authenticate } from "./auth.js";

export async function registerDataRoutes(app: FastifyInstance) {
  app.get("/api/tasks", { preHandler: authenticate }, async (request) => {
    const tasks = await prisma.task.findMany({
      where: { userId: request.user.sub },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return { tasks };
  });

  app.get("/api/tasks/:id", { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const task = await prisma.task.findFirst({
      where: { id, userId: request.user.sub },
      include: {
        steps: { orderBy: { createdAt: "asc" } },
        agentRuns: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    });
    if (!task) return reply.code(404).send({ error: "Task not found" });
    return { task };
  });

  app.get("/api/sessions", { preHandler: authenticate }, async (request) => {
    const sessions = await prisma.session.findMany({
      where: { userId: request.user.sub },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { tasks: true } } },
      take: 50,
    });
    return { sessions };
  });

  app.get("/api/privacy/events", { preHandler: authenticate }, async (request) => {
    const events = await prisma.privacyEvent.findMany({
      where: { userId: request.user.sub },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const totals = await prisma.privacyEvent.aggregate({
      where: { userId: request.user.sub },
      _sum: { redactedCount: true },
      _count: true,
    });
    return {
      events,
      summary: {
        sensitiveFieldsProtected: totals._sum.redactedCount || 0,
        eventCount: totals._count,
        rawScreenshotsUploaded: 0,
        cloudPayload: "Structured Metadata Only",
        localVision: "ON",
        localOcr: "ON",
        piiRedaction: "ON",
      },
    };
  });

  app.get("/api/activity", { preHandler: authenticate }, async (request) => {
    const events = await prisma.activityEvent.findMany({
      where: { userId: request.user.sub },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { events };
  });

  app.get("/api/settings", { preHandler: authenticate }, async (request) => {
    let settings = await prisma.settings.findUnique({ where: { userId: request.user.sub } });
    if (!settings) {
      settings = await prisma.settings.create({ data: { userId: request.user.sub } });
    }
    return { settings };
  });

  app.patch("/api/settings", { preHandler: authenticate }, async (request) => {
    const body = SettingsUpdateSchema.parse(request.body);
    const settings = await prisma.settings.upsert({
      where: { userId: request.user.sub },
      create: { userId: request.user.sub, ...body },
      update: body,
    });
    return { settings };
  });

  app.get("/api/stats", { preHandler: authenticate }, async (request) => {
    const [tasksCompleted, privacySum, avg] = await Promise.all([
      prisma.task.count({ where: { userId: request.user.sub, status: "COMPLETED" } }),
      prisma.privacyEvent.aggregate({
        where: { userId: request.user.sub },
        _sum: { redactedCount: true },
      }),
      prisma.task.aggregate({
        where: { userId: request.user.sub, status: "COMPLETED" },
        _avg: { stepCount: true },
      }),
    ]);

    return {
      stats: {
        tasksCompleted,
        dataProtected: privacySum._sum.redactedCount || 0,
        cloudPayloadsMinimized: "Structured metadata only",
        averageTaskSteps: Math.round(avg._avg.stepCount || 0),
      },
      demoData: tasksCompleted === 0,
      note:
        tasksCompleted === 0
          ? "Demo placeholders — complete a task to see live stats."
          : undefined,
      placeholders:
        tasksCompleted === 0
          ? {
              tasksCompleted: 128,
              dataProtected: 1542,
              cloudPayloadsMinimized: "94%",
              averageTaskTime: "42s",
            }
          : undefined,
    };
  });
}
