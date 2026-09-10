"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { api, ensureAuth, type AuthUser } from "@/lib/api";

export default function PrivacyPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [events, setEvents] = useState<Array<{ id: string; description: string; createdAt: string; redactedCount: number }>>([]);

  useEffect(() => {
    void ensureAuth().then(() => {
      void api<{ user: AuthUser }>("/api/auth/me").then((d) => setUser(d.user)).catch(() => undefined);
      void api<{ summary: Record<string, unknown>; events: typeof events }>("/api/privacy/events")
        .then((d) => {
          setSummary(d.summary);
          setEvents(d.events);
        })
        .catch(() => undefined);
    });
  }, []);

  const privacyCards: Array<[string, unknown, string]> = [
    ["Local Vision Engine", summary?.localVision || "ACTIVE (ON-DEVICE)", "ri-eye-line"],
    ["Local OCR Processing", summary?.localOcr || "ACTIVE (ON-DEVICE)", "ri-scan-line"],
    ["PII Sanitizer", summary?.piiRedaction || "ENABLED", "ri-shield-keyhole-line"],
    ["Raw Screenshots Uploaded", summary?.rawScreenshotsUploaded ?? 0, "ri-camera-off-line"],
    ["Sensitive Fields Protected", summary?.sensitiveFieldsProtected ?? 0, "ri-lock-password-line"],
    ["Cloud Payload Standard", summary?.cloudPayload || "Structured Safe Metadata", "ri-cloud-line"],
  ];

  return (
    <Shell userName={user?.name}>
      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
        <div>
          <h1 className="text-3xl font-extrabold font-heading text-white">
            Privacy <span className="text-[#22d3ee]">Shield</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">Your screen, cookies, and sensitive credentials never leave your machine.</p>
        </div>

        {/* Status Metrics */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {privacyCards.map(([label, value, icon]) => (
            <div key={String(label)} className="rounded-3xl border border-white/10 bg-[#141724]/80 p-5 shadow-[0_10px_25px_rgba(0,0,0,0.4)] backdrop-blur-xl transition hover:border-cyan-400/40">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
                <i className={`${icon} text-lg text-[#06b6d4]`} />
              </div>
              <div className="text-2xl font-extrabold font-heading text-emerald-400">{String(value)}</div>
            </div>
          ))}
        </div>

        {/* Pipeline Architecture Diagram */}
        <div className="rounded-3xl border border-white/10 bg-[#141724]/80 p-6 md:p-8 shadow-[0_12px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl">
          <h2 className="text-lg font-bold font-heading text-white mb-2">How Light Protects You</h2>
          <p className="text-xs text-slate-400 mb-4">Every browser event is sanitized locally before reaching the AI planner:</p>
          <pre className="overflow-x-auto rounded-2xl bg-black/50 p-4 font-mono text-xs leading-relaxed text-slate-300 border border-white/5">{`[Live Browser Tab]
   ↓
(Local Vision & Accessibility Tree Extraction)
   ↓
(On-Device PII Masking: Passwords, Emails, Tokens Removed)
   ↓
[Sanitized Metadata JSON]  ───→  (Cloud Planner LLM)
                                       ↓
[Local Browser Executor]   ←───  (Safe Action Sequence: Click / Type / Scroll)`}</pre>
        </div>

        {/* Privacy Events List */}
        <div className="rounded-3xl border border-white/10 bg-[#141724]/80 p-6 shadow-[0_12px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl">
          <h2 className="text-base font-bold text-white mb-3">Recent Privacy Logs</h2>
          {events.length === 0 && <p className="text-xs text-slate-500">No privacy events recorded yet.</p>}
          <div className="space-y-2">
            {events.map((e) => (
              <div key={e.id} className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5 text-xs text-slate-300">
                <span>{e.description} {e.redactedCount ? `(${e.redactedCount} items masked)` : ""}</span>
                <span className="text-[10px] text-slate-500 font-mono">{new Date(e.createdAt).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}
