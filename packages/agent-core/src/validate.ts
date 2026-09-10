import { AgentActionSchema, type AgentAction, type ActionPlan } from "@privai/schemas";

const HIGH_RISK_TYPES = new Set(["submit"]);
const HIGH_RISK_TEXT =
  /\b(buy|purchase|pay|payment|checkout|delete|remove account|send message|publish|transfer|confirm order|place order)\b/i;

export interface ValidationResult {
  ok: boolean;
  action?: AgentAction;
  errors: string[];
  requiresApproval: boolean;
  reason?: string;
}

export function validateAction(raw: unknown, confidenceThreshold = 0.75): ValidationResult {
  const parsed = AgentActionSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => i.message),
      requiresApproval: false,
    };
  }

  const action = parsed.data;
  const confidence = action.confidence ?? 1;
  const errors: string[] = [];

  if (confidence < confidenceThreshold) {
    return {
      ok: true,
      action,
      errors: [],
      requiresApproval: true,
      reason: `Action confidence ${confidence.toFixed(2)} is below threshold ${confidenceThreshold}`,
    };
  }

  const risky =
    action.requires_approval ||
    action.risk_level === "high" ||
    action.risk_level === "critical" ||
    HIGH_RISK_TYPES.has(action.type) ||
    HIGH_RISK_TEXT.test(`${action.text || ""} ${action.message || ""} ${action.url || ""}`);

  return {
    ok: true,
    action,
    errors,
    requiresApproval: Boolean(risky),
    reason: risky ? "High-risk action requires user approval" : undefined,
  };
}

export function validatePlan(plan: ActionPlan, confidenceThreshold = 0.75): {
  validActions: AgentAction[];
  rejected: Array<{ raw: unknown; errors: string[] }>;
  needsApproval: boolean;
  approvalReasons: string[];
} {
  const validActions: AgentAction[] = [];
  const rejected: Array<{ raw: unknown; errors: string[] }> = [];
  const approvalReasons: string[] = [];
  let needsApproval = Boolean(plan.needs_approval);

  if ((plan.confidence ?? 1) < confidenceThreshold) {
    needsApproval = true;
    approvalReasons.push(`Plan confidence below threshold`);
  }

  for (const raw of plan.actions) {
    const result = validateAction(raw, confidenceThreshold);
    if (!result.ok || !result.action) {
      rejected.push({ raw, errors: result.errors });
      continue;
    }
    if (result.requiresApproval) {
      needsApproval = true;
      if (result.reason) approvalReasons.push(result.reason);
      result.action.requires_approval = true;
    }
    validActions.push(result.action);
  }

  return { validActions, rejected, needsApproval, approvalReasons };
}

/** Reject any attempt to smuggle executable code through action payloads. */
export function assertNoCodeInjection(action: AgentAction): void {
  const blob = JSON.stringify(action);
  if (/\beval\s*\(|new\s+Function\s*\(|javascript:/i.test(blob)) {
    throw new Error("Rejected action: potential code injection");
  }
}
