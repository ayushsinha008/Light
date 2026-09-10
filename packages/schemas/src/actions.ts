import { z } from "zod";
import { ElementIdSchema } from "./elements.js";

export const ActionTypeSchema = z.enum([
  "click",
  "double_click",
  "type",
  "clear",
  "select",
  "checkbox",
  "radio",
  "scroll",
  "hover",
  "focus",
  "press_key",
  "submit",
  "navigate",
  "back",
  "forward",
  "wait",
  "extract_text",
  "inspect_element",
  "open_tab",
  "close_tab",
  "ask_user",
  "finish",
  "fail",
]);

export type ActionType = z.infer<typeof ActionTypeSchema>;

export const AgentActionSchema = z
  .object({
    type: ActionTypeSchema,
    element_id: ElementIdSchema.optional(),
    text: z.string().optional(),
    key: z.string().optional(),
    url: z.string().optional(),
    value: z.union([z.string(), z.boolean(), z.number()]).optional(),
    direction: z.enum(["up", "down", "left", "right"]).optional(),
    amount: z.number().optional(),
    wait_ms: z.number().int().positive().optional(),
    message: z.string().optional(),
    reason: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
    requires_approval: z.boolean().optional(),
    risk_level: z.enum(["low", "medium", "high", "critical"]).optional(),
  })
  .superRefine((action, ctx) => {
    const needsElement = [
      "click",
      "double_click",
      "type",
      "clear",
      "select",
      "checkbox",
      "radio",
      "hover",
      "focus",
      "submit",
      "extract_text",
      "inspect_element",
    ];
    if (needsElement.includes(action.type) && !action.element_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Action "${action.type}" requires element_id`,
        path: ["element_id"],
      });
    }
    if (action.type === "type" && action.text === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Action "type" requires text',
        path: ["text"],
      });
    }
    if (action.type === "navigate" && !action.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Action "navigate" requires url',
        path: ["url"],
      });
    }
    if (action.type === "press_key" && !action.key) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Action "press_key" requires key',
        path: ["key"],
      });
    }
  });

export type AgentAction = z.infer<typeof AgentActionSchema>;

export const ActionPlanSchema = z.object({
  goal: z.string(),
  actions: z.array(AgentActionSchema).min(1),
  reason: z.string().optional(),
  done: z.boolean().optional(),
  needs_approval: z.boolean().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export type ActionPlan = z.infer<typeof ActionPlanSchema>;

export const ActionResultSchema = z.object({
  actionIndex: z.number().int().nonnegative(),
  type: ActionTypeSchema,
  success: z.boolean(),
  error: z.string().optional(),
  extractedText: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  pageChanged: z.boolean().optional(),
  durationMs: z.number().optional(),
});

export type ActionResult = z.infer<typeof ActionResultSchema>;
