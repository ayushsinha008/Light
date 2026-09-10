"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { CheckCircle2, Copy } from "lucide-react";

const STEPS = [
  "Create account",
  "Install browser extension",
  "Grant required permissions",
  "Connect extension to dashboard",
  "Privacy configuration",
  "Run first demo task",
];

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (step === 3) {
      void api<{ code: string }>("/api/browser/pairing-code", { method: "POST" })
        .then((d) => setCode(d.code))
        .catch((e) => setMessage(e.message));
    }
  }, [step]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold">Onboarding</h1>
      <p className="mt-2 text-slate-400">Get Light connected in a few minutes.</p>

      <ol className="mt-8 space-y-3">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`glass flex items-center gap-3 rounded-2xl px-4 py-3 ${i === step ? "border-accent/40" : ""}`}
          >
            <span className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-xs">{i + 1}</span>
            <span className="flex-1">{label}</span>
            {i < step && <CheckCircle2 className="text-accent-mint" size={18} />}
          </li>
        ))}
      </ol>

      <div className="glass mt-8 rounded-3xl p-6">
        {step === 1 && (
          <>
            <h2 className="text-xl font-semibold">Install the Chromium extension</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-300">
              <li>Build the extension: <code className="text-accent">npm run build:extension</code></li>
              <li>Open <code className="text-accent">chrome://extensions</code></li>
              <li>Enable Developer mode → Load unpacked → select <code className="text-accent">apps/extension/dist</code></li>
            </ol>
          </>
        )}
        {step === 2 && (
          <>
            <h2 className="text-xl font-semibold">Grant permissions</h2>
            <p className="mt-2 text-sm text-slate-300">
              When prompted, allow the extension to access websites you want to automate. Light never
              bypasses browser security, chrome:// pages, or cross-origin sandboxed frames.
            </p>
          </>
        )}
        {step === 3 && (
          <>
            <h2 className="text-xl font-semibold">Connect extension</h2>
            <p className="mt-2 text-sm text-slate-300">Enter this pairing code in the extension popup:</p>
            <div className="mt-4 flex items-center gap-3">
              <code className="rounded-xl bg-black/40 px-4 py-3 text-2xl tracking-[0.3em] text-accent">{code || "········"}</code>
              <button
                className="rounded-xl border border-white/10 p-3"
                onClick={async () => {
                  await navigator.clipboard.writeText(code);
                  setCopied(true);
                }}
              >
                <Copy size={16} />
              </button>
            </div>
            {copied && <p className="mt-2 text-xs text-accent-mint">Copied.</p>}
            {message && <p className="mt-2 text-xs text-accent-rose">{message}</p>}
            <p className="mt-4 text-sm text-accent-mint">Your browser is connected. — after successful pairing.</p>
          </>
        )}
        {step === 4 && (
          <>
            <h2 className="text-xl font-semibold">Privacy configuration</h2>
            <p className="mt-2 text-sm text-slate-300">
              Local vision, OCR, and PII redaction are ON by default. Raw screenshots uploaded: 0.
              Open Privacy Center anytime to review what leaves the device.
            </p>
          </>
        )}
        {step === 5 && (
          <>
            <h2 className="text-xl font-semibold">Run your first demo task</h2>
            <p className="mt-2 text-sm text-slate-300">
              Demo Mode works without a cloud API key using mocked planner responses. Live Mode requires a configured provider and never fakes successful automation.
            </p>
            <Link href="/dashboard/agent" className="mt-4 inline-block rounded-xl bg-gradient-to-r from-accent to-accent-violet px-4 py-2 text-sm font-semibold">
              Open Agent Console
            </Link>
          </>
        )}

        <div className="mt-6 flex justify-between">
          <button
            disabled={step === 1}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm disabled:opacity-40"
          >
            Back
          </button>
          {step < 5 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold"
            >
              Continue
            </button>
          ) : (
            <Link href="/dashboard" className="rounded-xl bg-gradient-to-r from-accent to-accent-violet px-4 py-2 text-sm font-semibold">
              Go to dashboard
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
