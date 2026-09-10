import type { FastifyInstance } from "fastify";
import {
  ActionPlanSchema,
  ActionResultSchema,
  CreateTaskSchema,
  PageObservationSchema,
  PlanRequestSchema,
  TaskControlSchema,
} from "@privai/schemas";
import { createAIProvider } from "@privai/ai-provider";
import { AgentLoop, validatePlan } from "@privai/agent-core";
import { WS_EVENTS, inferStartUrl } from "@privai/shared";
import { prisma } from "../db.js";
import { authenticate } from "./auth.js";
import type { Env } from "../config.js";
import { connectionHub } from "../ws/hub.js";

async function logActivity(
  userId: string,
  message: string,
  opts?: { taskId?: string; type?: string; meta?: object },
) {
  const event = await prisma.activityEvent.create({
    data: {
      userId,
      taskId: opts?.taskId,
      type: opts?.type || "info",
      message,
      meta: opts?.meta,
    },
  });
  connectionHub.broadcastToUser(userId, WS_EVENTS.ACTIVITY, event);
  return event;
}

function friendlyError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message === "TAB_CLOSED" || /tab was closed/i.test(message)) {
    return "Agent browser tab was closed.";
  }
  if (/TASK_STOPPED/i.test(message)) return "Task stopped.";
  if (/extension/i.test(message) || /timed out opening/i.test(message)) {
    return "Connect your browser first to run tasks.";
  }
  if (/Observation timeout/i.test(message)) {
    return "Could not read the page. The website may be unavailable or blocked.";
  }
  if (/Cannot access contents|host permission|permission.*denied|Missing host permission/i.test(message)) {
    return "Light needs website access. Reload the extension and allow access on all sites.";
  }
  if (/Receiving end does not exist|Could not establish connection/i.test(message)) {
    return "Light could not attach to the page. Reload the extension and retry.";
  }
  if (/Action execution timeout/i.test(message)) {
    return "The page changed or stopped responding. Try again.";
  }
  if (/timeout/i.test(message)) return "Agent timeout. Please retry.";
  return "Task couldn't be completed.";
}

export async function registerAgentRoutes(app: FastifyInstance, env: Env) {
  const provider = createAIProvider({
    provider: env.AI_PROVIDER,
    openaiApiKey: env.OPENAI_API_KEY,
    openaiModel: env.OPENAI_MODEL,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    anthropicModel: env.ANTHROPIC_MODEL,
    geminiApiKey: env.GEMINI_API_KEY,
    geminiModel: env.GEMINI_MODEL,
  });

  app.post("/api/agent/plan", { preHandler: authenticate }, async (request) => {
    const body = PlanRequestSchema.parse(request.body);
    const plan = await provider.generatePlan(body.context);
    const validated = validatePlan(plan, env.CONFIDENCE_THRESHOLD);
    return {
      plan: { ...plan, actions: validated.validActions },
      needsApproval: validated.needsApproval,
      approvalReasons: validated.approvalReasons,
      provider: provider.name,
      mode: provider.name === "demo" ? "DEMO" : "LIVE",
    };
  });

  app.post("/api/agent/task", { preHandler: authenticate }, async (request, reply) => {
    const body = CreateTaskSchema.parse(request.body);
    const userId = request.user.sub;
    const settings = await prisma.settings.findUnique({ where: { userId } });
    const requireBrowser = body.requireBrowser !== false;
    const useDemoPlanner =
      body.demoMode ??
      (provider.name === "demo"
        ? true
        : settings?.demoMode === true && env.PRIVAI_MODE === "demo"
          ? true
          : false);

    if (requireBrowser && !connectionHub.hasExtension(userId)) {
      return reply.code(409).send({
        error: "Connect your browser first to run tasks.",
        code: "BROWSER_OFFLINE",
      });
    }

    let sessionId = body.sessionId;
    if (!sessionId) {
      const session = await prisma.session.create({
        data: { userId, label: body.goal.slice(0, 80) },
      });
      sessionId = session.id;
    }

    const task = await prisma.task.create({
      data: {
        userId,
        sessionId,
        goal: body.goal,
        status: "OBSERVING",
        demoMode: useDemoPlanner,
        message: "Starting agent...",
      },
    });

    connectionHub.initControl(task.id);

    await logActivity(userId, `Task received: ${body.goal}`, {
      taskId: task.id,
      type: "task_created",
    });

    void runTask(env, provider, userId, task.id, body.goal, {
      useDemoPlanner,
      requireBrowser,
    });

    return {
      task: {
        id: task.id,
        goal: task.goal,
        status: "OBSERVING",
        demoMode: useDemoPlanner,
        sessionId,
      },
      mode: useDemoPlanner ? "DEMO" : "LIVE",
      provider: provider.name,
      startUrl: inferStartUrl(body.goal),
    };
  });

  app.post("/api/agent/approve", { preHandler: authenticate }, async (request) => {
    const body = request.body as { taskId: string; approved: boolean };
    connectionHub.resolveApproval(body.taskId, Boolean(body.approved));
    return { ok: true };
  });

  app.post("/api/agent/control", { preHandler: authenticate }, async (request, reply) => {
    const body = TaskControlSchema.parse(request.body);
    const task = await prisma.task.findFirst({
      where: { id: body.taskId, userId: request.user.sub },
    });
    if (!task) return reply.code(404).send({ error: "Task not found" });

    if (body.action === "pause") {
      connectionHub.setControl(body.taskId, { paused: true });
      await prisma.task.update({
        where: { id: body.taskId },
        data: { status: "PAUSED", message: "Paused by user" },
      });
      connectionHub.broadcastToUser(request.user.sub, WS_EVENTS.STATUS, {
        taskId: body.taskId,
        status: "PAUSED",
        message: "Paused by user",
      });
      connectionHub.sendToExtension(request.user.sub, WS_EVENTS.CONTROL, {
        taskId: body.taskId,
        action: "pause",
      });
      return { ok: true, status: "PAUSED" };
    }

    if (body.action === "resume") {
      connectionHub.setControl(body.taskId, { paused: false, aborted: false });
      await prisma.task.update({
        where: { id: body.taskId },
        data: { status: "OBSERVING", message: "Resuming..." },
      });
      connectionHub.broadcastToUser(request.user.sub, WS_EVENTS.STATUS, {
        taskId: body.taskId,
        status: "OBSERVING",
        message: "Resuming...",
      });
      connectionHub.sendToExtension(request.user.sub, WS_EVENTS.CONTROL, {
        taskId: body.taskId,
        action: "resume",
      });
      return { ok: true, status: "OBSERVING" };
    }

    // stop
    connectionHub.setControl(body.taskId, { aborted: true, paused: false });
    await prisma.task.update({
      where: { id: body.taskId },
      data: { status: "PAUSED", message: "Stopped by user", completedAt: new Date() },
    });
    connectionHub.broadcastToUser(request.user.sub, WS_EVENTS.STATUS, {
      taskId: body.taskId,
      status: "PAUSED",
      message: "Stopped by user",
    });
    connectionHub.sendToExtension(request.user.sub, WS_EVENTS.CONTROL, {
      taskId: body.taskId,
      action: "stop",
    });
    await logActivity(request.user.sub, "Task stopped by user", {
      taskId: body.taskId,
      type: "agent",
    });
    return { ok: true, status: "PAUSED" };
  });

  /** @deprecated prefer /api/agent/control — kept for compatibility */
  app.post("/api/agent/stop", { preHandler: authenticate }, async (request) => {
    const body = request.body as { taskId: string };
    connectionHub.setControl(body.taskId, { aborted: true, paused: false });
    await prisma.task.update({
      where: { id: body.taskId },
      data: { status: "PAUSED", message: "Stopped by user", completedAt: new Date() },
    });
    connectionHub.broadcastToUser(request.user.sub, WS_EVENTS.STATUS, {
      taskId: body.taskId,
      status: "PAUSED",
      message: "Stopped by user",
    });
    connectionHub.sendToExtension(request.user.sub, WS_EVENTS.CONTROL, {
      taskId: body.taskId,
      action: "stop",
    });
    return { ok: true };
  });
}

async function runTask(
  env: Env,
  provider: ReturnType<typeof createAIProvider>,
  userId: string,
  taskId: string,
  goal: string,
  opts: { useDemoPlanner: boolean; requireBrowser: boolean },
) {
  const setStatus = async (status: string, message?: string) => {
    const control = connectionHub.getControl(taskId);
    if (control.aborted && status !== "PAUSED" && status !== "BLOCKED" && status !== "ERROR") {
      return;
    }
    await prisma.task.update({
      where: { id: taskId },
      data: { status, message },
    });
    connectionHub.broadcastToUser(userId, WS_EVENTS.STATUS, { taskId, status, message });
    connectionHub.broadcastToUser(userId, WS_EVENTS.TASK_UPDATE, { taskId, status, message });
  };

  const loop = new AgentLoop(provider, {
    maxSteps: env.MAX_AGENT_STEPS,
    confidenceThreshold: env.CONFIDENCE_THRESHOLD,
    demoMode: opts.useDemoPlanner,
  });

  const collected: Array<{ title: string; subtitle?: string; url?: string; meta?: Record<string, string> }> = [];

  try {
    if (!connectionHub.hasExtension(userId)) {
      await setStatus("BLOCKED", "Connect your browser first to run tasks.");
      return;
    }

    await setStatus("OBSERVING", "Starting agent...");
    const startUrl = inferStartUrl(goal);
    await logActivity(userId, "Opening new browser tab...", { taskId, type: "agent" });

    let tabInfo: { tabId: number; url: string };
    try {
      tabInfo = await connectionHub.requestOpenTab(userId, taskId, startUrl);
    } catch (err) {
      await logActivity(userId, "Failed to prepare browser tab", {
        taskId,
        type: "error",
        meta: { rawError: err instanceof Error ? err.message : String(err) },
      });
      await setStatus("BLOCKED", friendlyError(err));
      return;
    }

    await logActivity(userId, "Browser tab opened", {
      taskId,
      type: "agent",
      meta: { tabId: tabInfo.tabId, url: tabInfo.url },
    });
    connectionHub.broadcastToUser(userId, WS_EVENTS.BROWSER_STATE, {
      taskId,
      tabId: tabInfo.tabId,
      url: tabInfo.url,
      hostname: safeHost(tabInfo.url),
    });

    const result = await loop.run(goal, {
      checkpoint: async () => {
        await connectionHub.waitIfPaused(taskId);
      },
      onStatus: async (status, message) => {
        await setStatus(status, message);
      },
      onActivity: async (message, meta) => {
        await logActivity(userId, message, { taskId, meta, type: "agent" });
        await prisma.taskStep.create({
          data: {
            taskId,
            index: Date.now() % 100000,
            type: "activity",
            message,
            meta: meta as object | undefined,
          },
        });
      },
      onPrivacy: async (redactedFields, types) => {
        await prisma.privacyEvent.create({
          data: {
            userId,
            type: "redaction",
            description: `Redacted ${redactedFields} sensitive field(s)`,
            redactedCount: redactedFields,
            payloadKind: "structured_metadata",
          },
        });
        connectionHub.broadcastToUser(userId, WS_EVENTS.PRIVACY, {
          taskId,
          redactedFields,
          types,
          screenshotsUploaded: 0,
        });
      },
      observe: async () => {
        await connectionHub.waitIfPaused(taskId);
        if (!connectionHub.hasExtension(userId)) {
          throw new Error("Connect your browser first to run tasks.");
        }
        const raw = await connectionHub.requestObservation(userId, taskId);
        const observation = PageObservationSchema.parse(raw);
        connectionHub.broadcastToUser(userId, WS_EVENTS.BROWSER_STATE, {
          taskId,
          tabId: connectionHub.getControl(taskId).tabId,
          url: observation.url,
          hostname: safeHost(observation.url),
          title: observation.title,
          elementCount: observation.elements.length,
        });
        return observation;
      },
      execute: async (plan) => {
        await connectionHub.waitIfPaused(taskId);
        const parsed = ActionPlanSchema.parse(plan);
        connectionHub.broadcastToUser(userId, WS_EVENTS.PLAN, { taskId, plan: parsed });

        if (!connectionHub.hasExtension(userId)) {
          throw new Error("Connect your browser first to run tasks.");
        }

        const raw = await connectionHub.requestExecute(userId, taskId, parsed);
        const results = raw.map((r) => ActionResultSchema.parse(r));

        for (const r of results) {
          if (r.extractedText) {
            collected.push({
              title: r.extractedText.slice(0, 120),
              subtitle: `Extracted via ${r.type}`,
            });
          }
        }
        return results;
      },
      requestApproval: async (plan, reasons) => {
        await setStatus("AWAITING_APPROVAL", reasons.join("; ") || "Approval required");
        return connectionHub.requestApproval(userId, taskId, plan, reasons);
      },
    });

    const finalMessage =
      result.status === "COMPLETED"
        ? result.message
        : result.status === "BLOCKED" || result.status === "PAUSED"
          ? result.message
          : friendlyError(result.message);

    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: result.status,
        message: finalMessage,
        stepCount: result.steps,
        completedAt: ["COMPLETED", "ERROR", "BLOCKED", "PAUSED"].includes(result.status)
          ? new Date()
          : null,
      },
    });

    const resultPayload = {
      status: result.status,
      summary: finalMessage,
      items: collected,
      steps: result.steps,
    };

    await prisma.agentRun.create({
      data: {
        taskId,
        status: result.status,
        resultJson: resultPayload,
      },
    });

    connectionHub.broadcastToUser(userId, WS_EVENTS.STATUS, {
      taskId,
      status: result.status,
      message: finalMessage,
    });
    connectionHub.broadcastToUser(userId, WS_EVENTS.RESULT, {
      taskId,
      ...resultPayload,
    });
  } catch (err) {
    const message = friendlyError(err);
    await setStatus(message.includes("tab was closed") ? "BLOCKED" : "ERROR", message);
    await logActivity(userId, message, {
      taskId,
      type: "error",
      meta: { rawError: err instanceof Error ? err.message : String(err) },
    });
    connectionHub.broadcastToUser(userId, WS_EVENTS.RESULT, {
      taskId,
      status: "ERROR",
      summary: message,
      items: [],
    });
  } finally {
    connectionHub.clearControl(taskId);
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url || "—";
  }
}
