import { z } from "zod";
import { FormSchema, UIElementSchema } from "./elements.js";
import { ActionPlanSchema, ActionResultSchema } from "./actions.js";

export const AgentStatusSchema = z.enum([
  "IDLE",
  "OBSERVING",
  "PLANNING",
  "EXECUTING",
  "VERIFYING",
  "COMPLETED",
  "BLOCKED",
  "ERROR",
  "AWAITING_APPROVAL",
  "PAUSED",
]);

export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const PageObservationSchema = z.object({
  url: z.string(),
  title: z.string(),
  page_description: z.string().optional(),
  elements: z.array(UIElementSchema),
  forms: z.array(FormSchema).default([]),
  visible_text: z.string().optional(),
  current_state: z.string().optional(),
  media_state: z
    .object({
      present: z.boolean(),
      playing: z.boolean(),
      paused: z.boolean(),
      current_time: z.number(),
      duration: z.number().optional(),
    })
    .optional(),
  captcha_detected: z.boolean().optional(),
  restricted: z.boolean().optional(),
  restriction_reason: z.string().optional(),
  timestamp: z.number(),
  observation_id: z.string(),
  privacy: z
    .object({
      redacted_fields: z.number().default(0),
      sensitive_types: z.array(z.string()).default([]),
      screenshots_uploaded: z.literal(0).default(0),
    })
    .optional(),
});

export type PageObservation = z.infer<typeof PageObservationSchema>;

export const AgentContextSchema = z.object({
  user_goal: z.string().min(1),
  observation: PageObservationSchema,
  history: z
    .array(
      z.object({
        plan: ActionPlanSchema.optional(),
        results: z.array(ActionResultSchema).optional(),
        note: z.string().optional(),
      }),
    )
    .default([]),
  settings: z
    .object({
      confidence_threshold: z.number().min(0).max(1).default(0.75),
      demo_mode: z.boolean().default(false),
    })
    .optional(),
});

export type AgentContext = z.infer<typeof AgentContextSchema>;

export const CreateTaskSchema = z.object({
  goal: z.string().min(1).max(2000),
  sessionId: z.string().optional(),
  /** When true, only affects the AI planner (demo vs cloud). Browser actions always require the extension. */
  demoMode: z.boolean().optional(),
  /** Agent page always requires a connected extension and a real browser tab. */
  requireBrowser: z.boolean().default(true),
});

export const TaskControlSchema = z.object({
  taskId: z.string().min(1),
  action: z.enum(["pause", "resume", "stop"]),
});

export const TaskResultItemSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  url: z.string().optional(),
  meta: z.record(z.string()).optional(),
});

export type TaskResultItem = z.infer<typeof TaskResultItemSchema>;

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

export const PlanRequestSchema = z.object({
  taskId: z.string(),
  context: AgentContextSchema,
});

export type PlanRequest = z.infer<typeof PlanRequestSchema>;

export const ActivityEventSchema = z.object({
  id: z.string(),
  taskId: z.string().optional(),
  sessionId: z.string().optional(),
  type: z.string(),
  message: z.string(),
  meta: z.record(z.unknown()).optional(),
  timestamp: z.number(),
});

export type ActivityEvent = z.infer<typeof ActivityEventSchema>;

export const PrivacyEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  description: z.string(),
  redactedCount: z.number().optional(),
  payloadKind: z.enum(["structured_metadata", "none"]).default("structured_metadata"),
  timestamp: z.number(),
});

export type PrivacyEvent = z.infer<typeof PrivacyEventSchema>;
