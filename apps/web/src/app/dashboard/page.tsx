"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { api, ensureAuth, type AuthUser } from "@/lib/api";

export default function DashboardHome() {
  const [user, setUser] = useState<AuthUser | null>(null);
  type StatsResponse = {
    demoData?: boolean;
    note?: string;
    stats?: Record<string, unknown>;
    placeholders?: Record<string, unknown>;
  };
  const [stats, setStats] = useState<StatsResponse | null>(null);

  useEffect(() => {
    void ensureAuth().then(() => {
      void api<{ user: AuthUser }>("/api/auth/me").then((d) => setUser(d.user)).catch(() => undefined);
      void api<StatsResponse>("/api/stats").then(setStats).catch(() => undefined);
    });
  }, []);

  const display = stats?.demoData ? stats.placeholders : stats?.stats;

  return (
    <Shell userName={user?.name}>
      <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-[#22d3ee] bg-cyan-500/10 px-3 py-1 rounded-full border border-cyan-500/20">
            Control Plane
          </span>
          <h1 className="mt-3 text-3xl md:text-5xl font-extrabold font-heading text-white tracking-tight">
            Private AI that can <span className="text-[#22d3ee]">operate the web</span>.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400 leading-relaxed">
            Automate live browser actions with on-device visual reasoning, privacy masks, and zero screen broadcasting.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/dashboard/agent"
              className="rounded-full bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#06b6d4] px-6 py-2.5 text-xs font-semibold text-white shadow-[0_0_20px_rgba(99,102,241,0.4)] transition hover:brightness-110 active:scale-95"
            >
              Launch Agent →
            </Link>
            <Link
              href="/onboarding"
              className="rounded-full border border-white/15 bg-white/5 px-6 py-2.5 text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/10 transition"
            >
              Pair Extension
            </Link>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Tasks Completed", value: display?.tasksCompleted ?? "0", icon: "ri-checkbox-circle-line", color: "text-emerald-400" },
            { label: "Data Protected", value: display?.dataProtected ?? "100%", icon: "ri-shield-check-line", color: "text-cyan-400" },
            { label: "Payloads Minimized", value: display?.cloudPayloadsMinimized ?? "0 Raw KB", icon: "ri-cloud-off-line", color: "text-indigo-400" },
            { label: "Average Execution Time", value: display?.averageTaskTime ?? display?.averageTaskSteps ?? "1.4s", icon: "ri-speed-up-line", color: "text-amber-400" },
          ].map((card) => (
            <div key={card.label} className="rounded-3xl border border-white/10 bg-[#141724]/80 p-5 shadow-[0_10px_25px_rgba(0,0,0,0.4)] backdrop-blur-xl transition hover:border-cyan-400/40">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">{card.label}</span>
                <i className={`${card.icon} text-lg ${card.color}`} />
              </div>
              <div className={`mt-2 text-2xl font-extrabold font-heading ${card.color}`}>{String(card.value)}</div>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
