export type PiiType =
  | "EMAIL"
  | "PHONE"
  | "CARD"
  | "CVV"
  | "PASSWORD"
  | "SECRET"
  | "SSN"
  | "AADHAAR"
  | "PAN"
  | "UPI"
  | "BANK"
  | "ADDRESS"
  | "TOKEN"
  | "API_KEY";

export interface PiiMatch {
  type: PiiType;
  start: number;
  end: number;
  replacement: string;
  confidence: number;
}

export interface PiiDetectorOptions {
  redactEmails?: boolean;
  redactPhones?: boolean;
  redactCards?: boolean;
  redactSecrets?: boolean;
}

export interface PiiDetector {
  detect(text: string, options?: PiiDetectorOptions): PiiMatch[];
  redact(text: string, options?: PiiDetectorOptions): { text: string; matches: PiiMatch[] };
}

export const REDACTION_TOKENS: Record<PiiType, string> = {
  EMAIL: "[REDACTED_EMAIL]",
  PHONE: "[REDACTED_PHONE]",
  CARD: "[REDACTED_CARD]",
  CVV: "[REDACTED_CVV]",
  PASSWORD: "[REDACTED_PASSWORD]",
  SECRET: "[REDACTED_SECRET]",
  SSN: "[REDACTED_SSN]",
  AADHAAR: "[REDACTED_AADHAAR]",
  PAN: "[REDACTED_PAN]",
  UPI: "[REDACTED_UPI]",
  BANK: "[REDACTED_BANK]",
  ADDRESS: "[REDACTED_ADDRESS]",
  TOKEN: "[REDACTED_TOKEN]",
  API_KEY: "[REDACTED_API_KEY]",
};
