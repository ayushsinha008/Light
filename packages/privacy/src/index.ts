import type { FormInfo, PageObservation, UIElement } from "@privai/schemas";
import {
  classifyInputSensitivity,
  defaultPiiDetector,
  redactValueForCloud,
} from "./detector.js";
import type { PiiDetector, PiiDetectorOptions, PiiType } from "./types.js";

export interface RedactionResult {
  observation: PageObservation;
  redactedFields: number;
  sensitiveTypes: PiiType[];
}

export function redactObservation(
  observation: PageObservation,
  options?: PiiDetectorOptions,
  detector: PiiDetector = defaultPiiDetector,
): RedactionResult {
  const sensitiveTypes = new Set<PiiType>();
  let redactedFields = 0;

  const elements: UIElement[] = observation.elements.map((el) => {
    const sensitivity = classifyInputSensitivity({
      type: el.inputType,
      autocomplete: el.autocomplete,
      name: el.name,
      ariaLabel: el.ariaLabel,
    });

    let text = el.text;
    let value = el.value;
    let redacted = false;

    if (text) {
      const r = detector.redact(text, options);
      if (r.matches.length) {
        text = r.text;
        redacted = true;
        r.matches.forEach((m) => sensitiveTypes.add(m.type));
        redactedFields += r.matches.length;
      }
    }

    if (value !== undefined) {
      const r = redactValueForCloud(value, sensitivity, detector, options);
      value = r.value;
      if (r.redacted) {
        redacted = true;
        if (r.type) sensitiveTypes.add(r.type);
        redactedFields += 1;
      }
    } else if (sensitivity === "PASSWORD") {
      // Never send password field contents
      value = "[REDACTED_PASSWORD]";
      redacted = true;
      sensitiveTypes.add("PASSWORD");
      redactedFields += 1;
    }

    return { ...el, text, value, redacted };
  });

  const forms: FormInfo[] = (observation.forms || []).map((form) => ({
    ...form,
    fields: form.fields.map((field) => {
      const sensitivity = classifyInputSensitivity({
        type: field.inputType,
        name: field.name,
        ariaLabel: field.label,
      });
      const r = redactValueForCloud(field.value, sensitivity, detector, options);
      if (r.redacted) {
        redactedFields += 1;
        if (r.type) sensitiveTypes.add(r.type);
      }
      return { ...field, value: r.value, redacted: r.redacted };
    }),
  }));

  let visible_text = observation.visible_text;
  if (visible_text) {
    const r = detector.redact(visible_text, options);
    if (r.matches.length) {
      visible_text = r.text;
      redactedFields += r.matches.length;
      r.matches.forEach((m) => sensitiveTypes.add(m.type));
    }
  }

  const types = [...sensitiveTypes];
  return {
    observation: {
      ...observation,
      elements,
      forms,
      visible_text,
      privacy: {
        redacted_fields: redactedFields,
        sensitive_types: types,
        screenshots_uploaded: 0,
      },
    },
    redactedFields,
    sensitiveTypes: types,
  };
}

export * from "./types.js";
export * from "./detector.js";
