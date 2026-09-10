import type { ActionPlan, ActionResult, AgentContext, AgentStatus, PageObservation } from "@privai/schemas";
import type { AIProvider } from "@privai/ai-provider";
import { redactObservation } from "@privai/privacy";
import { assertNoCodeInjection, validatePlan } from "./validate.js";

export interface AgentLoopCallbacks {
  onStatus?: (status: AgentStatus, message?: string) => void | Promise<void>;
  onActivity?: (message: string, meta?: Record<string, unknown>) => void | Promise<void>;
  onPrivacy?: (redactedFields: number, types: string[]) => void | Promise<void>;
  /** Called at the start of each loop iteration — throw or return stop/pause handling. */
  checkpoint?: () => Promise<void>;
  observe: () => Promise<PageObservation>;
  execute: (plan: ActionPlan) => Promise<ActionResult[]>;
  requestApproval?: (plan: ActionPlan, reasons: string[]) => Promise<boolean>;
}

export interface AgentLoopOptions {
  maxSteps?: number;
  confidenceThreshold?: number;
  demoMode?: boolean;
}

export class AgentLoop {
  constructor(
    private planner: AIProvider,
    private options: AgentLoopOptions = {},
  ) {}

  async run(goal: string, callbacks: AgentLoopCallbacks): Promise<{
    status: AgentStatus;
    message: string;
    steps: number;
  }> {
    const maxSteps = this.options.maxSteps ?? 40;
    const threshold = this.options.confidenceThreshold ?? 0.75;
    const history: AgentContext["history"] = [];
    let consecutiveNoProgress = 0;

    await callbacks.onStatus?.("OBSERVING", "Analyzing the current page...");
    await callbacks.onActivity?.("Observed webpage");

    for (let step = 0; step < maxSteps; step++) {
      try {
        await callbacks.checkpoint?.();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === "TASK_STOPPED") {
          await callbacks.onStatus?.("PAUSED", "Stopped by user");
          return { status: "PAUSED", message: "Stopped by user", steps: step };
        }
        if (msg === "TAB_CLOSED") {
          await callbacks.onStatus?.("BLOCKED", "Agent browser tab was closed.");
          return { status: "BLOCKED", message: "Agent browser tab was closed.", steps: step };
        }
        throw err;
      }

      await callbacks.onStatus?.("OBSERVING");
      let observation = await callbacks.observe();

      if (observation.restricted) {
        await callbacks.onStatus?.("BLOCKED", observation.restriction_reason);
        return {
          status: "BLOCKED",
          message:
            observation.restriction_reason ||
            "This page cannot be automated because the browser does not allow extension access.",
          steps: step + 1,
        };
      }

      const redacted = redactObservation(observation);
      observation = redacted.observation;
      await callbacks.onPrivacy?.(redacted.redactedFields, redacted.sensitiveTypes);
      if (redacted.redactedFields > 0) {
        await callbacks.onActivity?.(`Redacted ${redacted.redactedFields} sensitive fields`, {
          types: redacted.sensitiveTypes,
        });
      }
      await callbacks.onActivity?.(`Detected ${observation.elements.length} interactive elements`);

      if (observation.captcha_detected) {
        await callbacks.onStatus?.("BLOCKED", "Human verification required.");
        const plan: ActionPlan = {
          goal,
          actions: [
            {
              type: "ask_user",
              message: "Human verification required.",
              requires_approval: true,
            },
          ],
          needs_approval: true,
        };
        const approved = callbacks.requestApproval
          ? await callbacks.requestApproval(plan, ["CAPTCHA"])
          : false;
        if (!approved) {
          return { status: "BLOCKED", message: "Human verification required.", steps: step + 1 };
        }
        continue;
      }

      await callbacks.onStatus?.("PLANNING", "Planning next actions...");
      await callbacks.onActivity?.("Sent structured UI metadata");

      const context: AgentContext = {
        user_goal: goal,
        observation,
        history,
        settings: {
          confidence_threshold: threshold,
          demo_mode: this.options.demoMode ?? false,
        },
      };

      let plan: ActionPlan;
      try {
        plan = await this.planner.generatePlan(context);
      } catch (err) {
        await callbacks.onStatus?.("ERROR", String(err));
        return { status: "ERROR", message: String(err), steps: step + 1 };
      }

      await callbacks.onActivity?.("Received action plan", { reason: plan.reason });
      const validated = validatePlan(plan, threshold);
      plan = { ...plan, actions: validated.validActions };

      if (!plan.actions.length) {
        await callbacks.onStatus?.("ERROR", "No valid actions in plan");
        return { status: "ERROR", message: "Planner returned no valid actions", steps: step + 1 };
      }

      for (const action of plan.actions) {
        assertNoCodeInjection(action);
      }

      if (plan.actions.some((a) => a.type === "finish")) {
        const finish = plan.actions.find((a) => a.type === "finish");
        await callbacks.onStatus?.("COMPLETED", finish?.message || "Task completed");
        await callbacks.onActivity?.(finish?.message || "Task completed");
        return {
          status: "COMPLETED",
          message: finish?.message || "Task completed",
          steps: step + 1,
        };
      }

      if (plan.actions.some((a) => a.type === "fail")) {
        const fail = plan.actions.find((a) => a.type === "fail");
        await callbacks.onStatus?.("ERROR", fail?.message || "Agent failed");
        return {
          status: "ERROR",
          message: fail?.message || "Agent failed",
          steps: step + 1,
        };
      }

      if (validated.needsApproval || plan.actions.some((a) => a.requires_approval || a.type === "ask_user")) {
        await callbacks.onStatus?.("AWAITING_APPROVAL", "Approval required");
        const approved = callbacks.requestApproval
          ? await callbacks.requestApproval(plan, validated.approvalReasons)
          : false;
        if (!approved) {
          await callbacks.onStatus?.("PAUSED", "User cancelled approval");
          return { status: "PAUSED", message: "Approval declined", steps: step + 1 };
        }
        plan = {
          ...plan,
          actions: plan.actions.filter((a) => a.type !== "ask_user"),
        };
        if (!plan.actions.length) {
          continue;
        }
      }

      await callbacks.onStatus?.("EXECUTING", "Executing actions...");
      let results: ActionResult[];
      try {
        results = await callbacks.execute(plan);
      } catch (err) {
        await callbacks.onActivity?.("UI changed. Re-analyzing page...", { error: String(err) });
        continue;
      }

      for (const r of results) {
        await callbacks.onActivity?.(
          r.success ? `Executed ${r.type}` : `Failed ${r.type}: ${r.error || "unknown"}`,
          { success: r.success },
        );
      }

      history.push({ plan, results });

      await callbacks.onStatus?.("VERIFYING", "Verifying result...");
      await callbacks.onActivity?.("Verified page update");

      const allFailed = results.length > 0 && results.every((r) => !r.success);
      if (allFailed) {
        consecutiveNoProgress += 1;
        await callbacks.onActivity?.("UI changed. Re-analyzing page...");
        if (consecutiveNoProgress >= 3) {
          await callbacks.onStatus?.("BLOCKED", "Unable to make progress after retries");
          return {
            status: "BLOCKED",
            message: "Unable to make progress after retries. Try a clearer instruction.",
            steps: step + 1,
          };
        }
      } else {
        consecutiveNoProgress = 0;
      }
    }

    await callbacks.onStatus?.("ERROR", "Max steps reached");
    return { status: "ERROR", message: "Max agent steps reached without completion", steps: maxSteps };
  }
}

export * from "./validate.js";
