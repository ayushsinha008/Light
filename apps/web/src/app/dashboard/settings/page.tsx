"use client";

import { FormEvent, useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { api, ensureAuth, type AuthUser } from "@/lib/api";

export default function SettingsPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [settings, setSettings] = useState({
    confidenceThreshold: 0.75,
    autoApproveLowRisk: false,
    redactEmails: true,
    redactPhones: true,
    demoMode: true,
  });
  const [msg, setMsg] = useState("");

  useEffect(() => {
    void ensureAuth().then(() => {
      void api<{ user: AuthUser }>("/api/auth/me").then((d) => setUser(d.user)).catch(() => undefined);
      void api<{ settings: typeof settings }>("/api/settings").then((d) => setSettings(d.settings)).catch(() => undefined);
    });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const data = await api<{ settings: typeof settings }>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(settings),
    });
    setSettings(data.settings);
    setMsg("Settings saved successfully.");
    setTimeout(() => setMsg(""), 3000);
  }

  return (
    <Shell userName={user?.name}>
      <div className="max-w-4xl mx-auto p-4 md:p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-extrabold font-heading text-white">
            System <span className="text-[#22d3ee]">Settings</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">Configure visual reasoning thresholds, safety guards & demo automation rules.</p>
        </div>

        <form onSubmit={onSubmit} className="rounded-3xl border border-white/10 bg-[#141724]/80 p-6 md:p-8 shadow-[0_12px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-semibold text-white">
                Confidence Threshold
              </label>
              <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-full border border-cyan-500/20">
                {(settings.confidenceThreshold * 100).toFixed(0)}%
              </span>
            </div>
            <input
              type="range"
              min={0.5}
              max={0.95}
              step={0.01}
              value={settings.confidenceThreshold}
              onChange={(e) => setSettings((s) => ({ ...s, confidenceThreshold: Number(e.target.value) }))}
              className="w-full accent-cyan-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
            />
            <p className="text-xs text-slate-500">Minimum action validation score before the agent proceeds automatically.</p>
          </div>

          <div className="space-y-3 border-t border-white/10 pt-5">
            {([
              ["demoMode", "Demo Planner", "Rule-based mock AI when no cloud API key is configured."],
              ["autoApproveLowRisk", "Auto-Approve Low-Risk Actions", "Execute clicks and page navigations without interrupting with approval dialogs."],
              ["redactEmails", "Redact Emails Locally", "Sanitize all email addresses on-device before sending DOM elements to LLM."],
              ["redactPhones", "Redact Phone Numbers Locally", "Mask all phone and contact numbers before transmission."],
            ] as const).map(([key, label, desc]) => (
              <label key={key} className="flex items-start gap-3.5 p-3 rounded-2xl bg-white/5 border border-white/5 hover:border-white/15 cursor-pointer transition">
                <input
                  type="checkbox"
                  checked={Boolean(settings[key])}
                  onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.checked }))}
                  className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-cyan-400 focus:ring-cyan-400 accent-cyan-400"
                />
                <div>
                  <div className="text-sm font-semibold text-white">{label}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{desc}</div>
                </div>
              </label>
            ))}
          </div>

          <div className="flex items-center gap-4 pt-4 border-t border-white/10">
            <button
              type="submit"
              className="rounded-full bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#06b6d4] px-6 py-2.5 text-sm font-semibold text-white shadow-[0_0_15px_rgba(99,102,241,0.4)] transition hover:brightness-110 active:scale-95"
            >
              Save Changes
            </button>
            {msg && <p className="text-xs font-semibold text-emerald-400 animate-fadeIn">{msg}</p>}
          </div>
        </form>
      </div>
    </Shell>
  );
}
