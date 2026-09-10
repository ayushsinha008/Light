"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { api, getToken, type AuthUser } from "@/lib/api";

export default function SettingsPage() {
  const router = useRouter();
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
    if (!getToken()) return void router.replace("/login");
    void api<{ user: AuthUser }>("/api/auth/me").then((d) => setUser(d.user));
    void api<{ settings: typeof settings }>("/api/settings").then((d) => setSettings(d.settings));
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const data = await api<{ settings: typeof settings }>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(settings),
    });
    setSettings(data.settings);
    setMsg("Settings saved.");
  }

  return (
    <Shell userName={user?.name}>
      <h1 className="text-2xl font-bold">Settings</h1>
      <form onSubmit={onSubmit} className="glass glow-border mt-6 max-w-xl space-y-4 rounded-3xl p-6">
        <label className="block text-sm">
          Confidence threshold ({settings.confidenceThreshold})
          <input
            type="range"
            min={0.5}
            max={0.95}
            step={0.01}
            value={settings.confidenceThreshold}
            onChange={(e) => setSettings((s) => ({ ...s, confidenceThreshold: Number(e.target.value) }))}
            className="mt-2 w-full"
          />
        </label>
        {([
          ["demoMode", "Demo planner (rule-based AI when no cloud key — still needs a connected browser for Run Task)"],
          ["autoApproveLowRisk", "Auto-approve low-risk actions"],
          ["redactEmails", "Redact emails before cloud"],
          ["redactPhones", "Redact phones before cloud"],
        ] as const).map(([key, label]) => (
          <label key={key} className="flex items-center gap-3 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={Boolean(settings[key])}
              onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.checked }))}
            />
            {label}
          </label>
        ))}
        <button className="rounded-xl bg-gradient-to-r from-accent to-accent-violet px-4 py-2 text-sm font-semibold">Save</button>
        {msg && <p className="text-sm text-accent-mint">{msg}</p>}
      </form>
    </Shell>
  );
}
