"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { api, getToken, type AuthUser } from "@/lib/api";

export default function PrivacyPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [events, setEvents] = useState<Array<{ id: string; description: string; createdAt: string; redactedCount: number }>>([]);

  useEffect(() => {
    if (!getToken()) return void router.replace("/login");
    void api<{ user: AuthUser }>("/api/auth/me").then((d) => setUser(d.user));
    void api<{ summary: Record<string, unknown>; events: typeof events }>("/api/privacy/events").then((d) => {
      setSummary(d.summary);
      setEvents(d.events);
    });
  }, [router]);

  const privacyCards: Array<[string, unknown]> = [
    ["Local Vision", summary?.localVision || "ON"],
    ["Local OCR", summary?.localOcr || "ON"],
    ["PII Redaction", summary?.piiRedaction || "ON"],
    ["Raw Screenshots Uploaded", summary?.rawScreenshotsUploaded ?? 0],
    ["Sensitive Fields Protected", summary?.sensitiveFieldsProtected ?? 0],
    ["Cloud Payload", summary?.cloudPayload || "Structured Metadata Only"],
  ];

  return (
    <Shell userName={user?.name}>
      <h1 className="text-2xl font-bold">Privacy Center</h1>
      <p className="mt-2 text-slate-400">Your screen stays on your device.</p>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {privacyCards.map(([label, value]) => (
          <div key={String(label)} className="glass glow-border rounded-3xl p-5">
            <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-2 text-2xl font-bold text-accent-mint">{String(value)}</div>
          </div>
        ))}
      </div>

      <div className="glass glow-border mt-6 rounded-3xl p-6">
        <h2 className="font-semibold">What leaves the device</h2>
        <pre className="mt-4 overflow-x-auto rounded-2xl bg-black/40 p-4 text-sm leading-7 text-slate-300">{`Browser
   ↓
Local Vision / DOM / Accessibility
   ↓
PII Redaction
   ↓
Safe JSON (structured metadata)
   ↓
Cloud Planner
   ↓
Validated Action JSON
   ↓
Local Action Executor`}</pre>
        <p className="mt-4 text-sm text-slate-400">
          Privacy-first architecture: sensitive visual processing happens locally whenever supported.
          Only minimized structured context is sent to the cloud. We do not claim “100% private.”
        </p>
      </div>

      <div className="mt-6 space-y-2">
        <h2 className="font-semibold">Privacy events</h2>
        {events.length === 0 && <p className="text-sm text-slate-500">No privacy events yet.</p>}
        {events.map((e) => (
          <div key={e.id} className="glass rounded-2xl px-4 py-3 text-sm">
            <div className="text-xs text-slate-500">{new Date(e.createdAt).toLocaleString()}</div>
            {e.description} {e.redactedCount ? `(${e.redactedCount})` : ""}
          </div>
        ))}
      </div>
    </Shell>
  );
}
