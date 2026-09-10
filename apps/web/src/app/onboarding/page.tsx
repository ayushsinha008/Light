"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ensureAuth } from "@/lib/api";
import { CheckCircle2, Copy } from "lucide-react";

const STEPS = [
  "Install browser extension",
  "Grant permissions",
  "Connect extension to dashboard",
  "Privacy configuration",
  "Run first agent task",
];

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void ensureAuth();
    if (step === 3) {
      void api<{ code: string }>("/api/browser/pairing-code", { method: "POST" })
        .then((d) => setCode(d.code))
        .catch((e) => setMessage(e.message));
    }
  }, [step]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:py-16">
      <div className="text-center mb-8">
        <h1 className="text-3xl md:text-4xl font-extrabold font-heading text-white">
          Browser <span className="text-[#22d3ee]">Onboarding</span>
        </h1>
        <p className="mt-1 text-sm text-slate-400">Connect Light to your browser in under 60 seconds.</p>
      </div>

      <ol className="space-y-2.5">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`flex items-center gap-3 rounded-2xl border px-4 py-3 backdrop-blur-xl transition ${
              i + 1 === step
                ? "border-cyan-400/50 bg-cyan-500/10 text-white font-semibold"
                : i + 1 < step
                  ? "border-emerald-500/30 bg-emerald-500/5 text-slate-300"
                  : "border-white/5 bg-black/40 text-slate-500"
            }`}
          >
            <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${
              i + 1 < step ? "bg-emerald-500 text-black" : i + 1 === step ? "bg-cyan-400 text-black" : "bg-white/10"
            }`}>
              {i + 1}
            </span>
            <span className="flex-1 text-sm">{label}</span>
            {i + 1 < step && <CheckCircle2 className="text-emerald-400" size={18} />}
          </li>
        ))}
      </ol>

      <div className="mt-8 rounded-3xl border border-white/10 bg-[#141724]/90 p-6 md:p-8 shadow-[0_12px_32px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
        {step === 1 && (
          <div>
            <h2 className="text-xl font-bold font-heading text-white">Install the Chromium Extension</h2>
            <ol className="mt-4 list-decimal space-y-2.5 pl-5 text-sm text-slate-300">
              <li>Open extension directory: <code className="text-cyan-400 font-mono bg-black/40 px-2 py-0.5 rounded">apps/extension</code></li>
              <li>Open your browser at <code className="text-cyan-400 font-mono bg-black/40 px-2 py-0.5 rounded">chrome://extensions</code></li>
              <li>Turn on <strong className="text-white">Developer Mode</strong> (top right)</li>
              <li>Click <strong className="text-white">Load Unpacked</strong> and select the extension folder.</li>
            </ol>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-xl font-bold font-heading text-white">Grant Permissions</h2>
            <p className="mt-3 text-sm text-slate-300 leading-relaxed">
              When prompted by Chrome, permit tab control for sites you wish to automate. Light operates entirely with localized DOM extraction and on-device privacy redaction.
            </p>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="text-xl font-bold font-heading text-white">Pair Browser Extension</h2>
            <p className="mt-2 text-sm text-slate-300">Click the Light icon in your Chrome toolbar and paste this pairing code:</p>
            <div className="mt-5 flex items-center gap-3">
              <code className="rounded-2xl bg-black/60 border border-white/10 px-6 py-3 text-2xl font-mono tracking-[0.3em] text-[#22d3ee]">
                {code || "••••••••"}
              </code>
              <button
                className="rounded-2xl border border-white/15 bg-white/10 p-3.5 hover:bg-white/20 transition active:scale-95"
                onClick={async () => {
                  await navigator.clipboard.writeText(code);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                <Copy size={18} className="text-slate-200" />
              </button>
            </div>
            {copied && <p className="mt-2 text-xs text-emerald-400">Copied to clipboard!</p>}
            {message && <p className="mt-2 text-xs text-rose-400">{message}</p>}
          </div>
        )}

        {step === 4 && (
          <div>
            <h2 className="text-xl font-bold font-heading text-white">Privacy Guard Active</h2>
            <p className="mt-3 text-sm text-slate-300 leading-relaxed">
              Zero raw full-screen screenshots leave your device. All PII, tokens, and fields are sanitized on-device before planner coordination.
            </p>
          </div>
        )}

        {step === 5 && (
          <div>
            <h2 className="text-xl font-bold font-heading text-white">Ready to Automate</h2>
            <p className="mt-3 text-sm text-slate-300 leading-relaxed">
              Your setup is complete! You can now launch the agent console to type or speak web automation tasks.
            </p>
            <Link
              href="/dashboard/agent"
              className="mt-6 inline-block rounded-full bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#06b6d4] px-6 py-2.5 text-sm font-semibold text-white shadow-[0_0_15px_rgba(99,102,241,0.4)] transition hover:brightness-110"
            >
              Open Agent Canvas →
            </Link>
          </div>
        )}

        <div className="mt-8 flex justify-between border-t border-white/10 pt-5">
          <button
            disabled={step === 1}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            className="rounded-full border border-white/15 px-5 py-2 text-xs font-semibold text-slate-400 hover:text-white disabled:opacity-30"
          >
            Back
          </button>
          {step < 5 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="rounded-full bg-white/10 hover:bg-white/20 px-6 py-2 text-xs font-semibold text-white transition active:scale-95"
            >
              Continue →
            </button>
          ) : (
            <Link
              href="/dashboard/agent"
              className="rounded-full bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#06b6d4] px-6 py-2 text-xs font-semibold text-white transition hover:brightness-110"
            >
              Finish Setup
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
