import { z } from "zod";

/** Stable element ID assigned during an observation cycle */
export const ElementIdSchema = z.string().min(1);

export const BoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const UIElementSchema = z.object({
  id: ElementIdSchema,
  type: z.string(),
  role: z.string().optional(),
  tagName: z.string().optional(),
  text: z.string().optional(),
  ariaLabel: z.string().optional(),
  name: z.string().optional(),
  placeholder: z.string().optional(),
  value: z.string().optional(),
  href: z.string().optional(),
  inputType: z.string().optional(),
  autocomplete: z.string().optional(),
  bounds: BoundsSchema.optional(),
  visible: z.boolean().default(true),
  enabled: z.boolean().default(true),
  interactive: z.boolean().default(true),
  confidence: z.number().min(0).max(1).default(1),
  redacted: z.boolean().optional(),
  frameId: z.string().optional(),
});

export type UIElement = z.infer<typeof UIElementSchema>;

export const FormFieldSchema = z.object({
  elementId: ElementIdSchema,
  label: z.string().optional(),
  name: z.string().optional(),
  inputType: z.string().optional(),
  required: z.boolean().optional(),
  value: z.string().optional(),
  redacted: z.boolean().optional(),
});

export const FormSchema = z.object({
  id: ElementIdSchema,
  action: z.string().optional(),
  method: z.string().optional(),
  fields: z.array(FormFieldSchema),
});

export type FormInfo = z.infer<typeof FormSchema>;
