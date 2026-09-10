"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { api, getToken, type AuthUser } from "@/lib/api";
import { motion } from "framer-motion";

export default function DashboardHome() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  type StatsResponse = {
    demoData?: boolean;
    note?: string;
    stats?: Record<string, unknown>;
    placeholders?: Record<string, unknown>;
  };
  const [stats, setStats] = useState<StatsResponse | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    void api<{ user: AuthUser }>("/api/auth/me").then((d) => setUser(d.user)).catch(() => router.replace("/login"));
    void api<StatsResponse>("/api/stats").then(setStats).catch(() => undefined);
  }, [router]);

  const display = stats?.demoData ? stats.placeholders : stats?.stats;

  return (
    <Shell userName={user?.name}>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-sm uppercase tracking-[0.2em] text-accent">Control plane</p>
        <h1 className="mt-2 text-3xl font-bold md:text-4xl">Private AI that can operate the web.</h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          Automate browser tasks with local visual intelligence and privacy-first AI.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/dashboard/agent" className="rounded-2xl bg-gradient-to-r from-accent to-accent-violet px-5 py-3 text-sm font-semibold shadow-glow">
            Launch Agent
          </Link>
          <Link href="/onboarding" className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold">
            Install Extension
          </Link>
        </div>

        {stats?.demoData && (
          <p className="mt-6 text-xs text-amber-300/90">Demo data — placeholders until you complete real tasks.</p>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Tasks completed", value: display?.tasksCompleted ?? "—" },
            { label: "Data protected", value: display?.dataProtected ?? "—" },
            { label: "Cloud payloads minimized", value: display?.cloudPayloadsMinimized ?? "—" },
            { label: "Average task time / steps", value: display?.averageTaskTime ?? display?.averageTaskSteps ?? "—" },
          ].map((card) => (
            <div key={card.label} className="glass glow-border rounded-3xl p-5">
              <div className="text-xs uppercase tracking-wide text-slate-500">{card.label}</div>
              <div className="mt-3 text-3xl font-bold">{String(card.value)}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </Shell>
  );
}
