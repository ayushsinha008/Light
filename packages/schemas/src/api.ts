import { z } from "zod";

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(120),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const SettingsUpdateSchema = z.object({
  confidenceThreshold: z.number().min(0).max(1).optional(),
  autoApproveLowRisk: z.boolean().optional(),
  redactEmails: z.boolean().optional(),
  redactPhones: z.boolean().optional(),
  demoMode: z.boolean().optional(),
  theme: z.enum(["dark", "system"]).optional(),
});

export type SettingsUpdate = z.infer<typeof SettingsUpdateSchema>;

export const ExtensionConnectSchema = z.object({
  pairingCode: z.string().min(6).max(12),
  extensionId: z.string().optional(),
  userAgent: z.string().optional(),
});

export const BrowserObservationBodySchema = z.object({
  taskId: z.string(),
  connectionId: z.string(),
  observation: z.record(z.unknown()),
});

export const ActionResultBodySchema = z.object({
  taskId: z.string(),
  connectionId: z.string(),
  results: z.array(z.record(z.unknown())),
  status: z.string().optional(),
});
