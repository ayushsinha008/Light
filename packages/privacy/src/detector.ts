import {
  PiiDetector,
  PiiDetectorOptions,
  PiiMatch,
  PiiType,
  REDACTION_TOKENS,
} from "./types.js";

const PATTERNS: Array<{ type: PiiType; regex: RegExp; confidence: number }> = [
  {
    type: "EMAIL",
    regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    confidence: 0.95,
  },
  {
    type: "PHONE",
    regex: /(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3,4}[\s-]?\d{3,4}\b/g,
    confidence: 0.7,
  },
  {
    type: "CARD",
    regex: /\b(?:\d[ -]*?){13,19}\b/g,
    confidence: 0.8,
  },
  {
    type: "CVV",
    regex: /\b(?:cvv|cvc|security code)[:\s]*\d{3,4}\b/gi,
    confidence: 0.9,
  },
  {
    type: "UPI",
    regex: /\b[\w.-]+@[\w]+(?:upi|ybl|okhdfcbank|oksbi|paytm)\b/gi,
    confidence: 0.92,
  },
  {
    type: "AADHAAR",
    regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    confidence: 0.75,
  },
  {
    type: "PAN",
    regex: /\b[A-Z]{5}\d{4}[A-Z]\b/g,
    confidence: 0.9,
  },
  {
    type: "API_KEY",
    regex:
      /\b(?:sk-|pk_|api[_-]?key|Bearer\s+)[A-Za-z0-9_\-]{16,}\b/gi,
    confidence: 0.93,
  },
  {
    type: "TOKEN",
    regex: /\b(?:eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g,
    confidence: 0.95,
  },
  {
    type: "BANK",
    regex: /\b(?:IFSC|Account(?:\s*No)?|A\/C)[:\s]*[A-Z0-9]{6,}\b/gi,
    confidence: 0.85,
  },
];

const SENSITIVE_INPUT_TYPES = new Set([
  "password",
  "tel",
  "email",
  "credit-card",
  "cc-number",
  "cc-csc",
]);

const SENSITIVE_AUTOCOMPLETE = new Set([
  "cc-number",
  "cc-csc",
  "cc-exp",
  "current-password",
  "new-password",
  "one-time-code",
  "tel",
  "email",
  "street-address",
]);

function luhnCheck(num: string): boolean {
  const digits = num.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function shouldInclude(type: PiiType, options?: PiiDetectorOptions): boolean {
  if (type === "EMAIL" && options?.redactEmails === false) return false;
  if (type === "PHONE" && options?.redactPhones === false) return false;
  if ((type === "CARD" || type === "CVV") && options?.redactCards === false) return false;
  if (
    (type === "SECRET" || type === "TOKEN" || type === "API_KEY" || type === "PASSWORD") &&
    options?.redactSecrets === false
  ) {
    return false;
  }
  return true;
}

export class RegexPiiDetector implements PiiDetector {
  detect(text: string, options?: PiiDetectorOptions): PiiMatch[] {
    const matches: PiiMatch[] = [];
    for (const pattern of PATTERNS) {
      if (!shouldInclude(pattern.type, options)) continue;
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      let m: RegExpExecArray | null;
      while ((m = regex.exec(text)) !== null) {
        if (pattern.type === "CARD") {
          const digits = m[0].replace(/\D/g, "");
          if (!luhnCheck(digits)) continue;
        }
        if (pattern.type === "PHONE") {
          const digits = m[0].replace(/\D/g, "");
          if (digits.length < 10 || digits.length > 15) continue;
        }
        matches.push({
          type: pattern.type,
          start: m.index,
          end: m.index + m[0].length,
          replacement: REDACTION_TOKENS[pattern.type],
          confidence: pattern.confidence,
        });
      }
    }
    return matches.sort((a, b) => a.start - b.start);
  }

  redact(text: string, options?: PiiDetectorOptions): { text: string; matches: PiiMatch[] } {
    const matches = this.detect(text, options);
    if (!matches.length) return { text, matches };

    // Apply from end to preserve indices
    let result = text;
    const merged = dedupeOverlaps(matches);
    for (let i = merged.length - 1; i >= 0; i--) {
      const match = merged[i]!;
      result =
        result.slice(0, match.start) + match.replacement + result.slice(match.end);
    }
    return { text: result, matches: merged };
  }
}

function dedupeOverlaps(matches: PiiMatch[]): PiiMatch[] {
  const sorted = [...matches].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: PiiMatch[] = [];
  let lastEnd = -1;
  for (const m of sorted) {
    if (m.start < lastEnd) continue;
    out.push(m);
    lastEnd = m.end;
  }
  return out;
}

export function classifyInputSensitivity(input: {
  type?: string;
  autocomplete?: string;
  name?: string;
  ariaLabel?: string;
}): PiiType | null {
  const type = (input.type || "").toLowerCase();
  const autocomplete = (input.autocomplete || "").toLowerCase();
  const name = `${input.name || ""} ${input.ariaLabel || ""}`.toLowerCase();

  if (type === "password" || SENSITIVE_AUTOCOMPLETE.has(autocomplete) && autocomplete.includes("password")) {
    return "PASSWORD";
  }
  if (type === "email" || autocomplete === "email" || name.includes("email")) return "EMAIL";
  if (type === "tel" || autocomplete === "tel" || name.includes("phone")) return "PHONE";
  if (autocomplete.includes("cc-number") || name.includes("card")) return "CARD";
  if (autocomplete.includes("cc-csc") || name.includes("cvv") || name.includes("cvc")) return "CVV";
  if (SENSITIVE_INPUT_TYPES.has(type) || SENSITIVE_AUTOCOMPLETE.has(autocomplete)) return "SECRET";
  if (name.includes("password") || name.includes("secret") || name.includes("otp")) return "PASSWORD";
  if (name.includes("upi")) return "UPI";
  if (name.includes("aadhaar") || name.includes("aadhar")) return "AADHAAR";
  if (name.includes("pan")) return "PAN";
  return null;
}

export function redactValueForCloud(
  value: string | undefined,
  sensitivity: PiiType | null,
  detector: PiiDetector,
  options?: PiiDetectorOptions,
): { value: string | undefined; redacted: boolean; type?: PiiType } {
  if (value === undefined || value === "") {
    return { value, redacted: false };
  }
  if (sensitivity) {
    return {
      value: REDACTION_TOKENS[sensitivity],
      redacted: true,
      type: sensitivity,
    };
  }
  const { text, matches } = detector.redact(value, options);
  if (matches.length) {
    return { value: text, redacted: true, type: matches[0]?.type };
  }
  return { value, redacted: false };
}

export const defaultPiiDetector = new RegexPiiDetector();
