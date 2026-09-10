"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { api, ensureAuth, type AuthUser } from "@/lib/api";

export default function TasksPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tasks, setTasks] = useState<Array<{ id: string; goal: string; status: string; demoMode: boolean; createdAt: string }>>([]);

  useEffect(() => {
    void ensureAuth().then(() => {
      void api<{ user: AuthUser }>("/api/auth/me").then((d) => setUser(d.user)).catch(() => undefined);
      void api<{ tasks: typeof tasks }>("/api/tasks").then((d) => setTasks(d.tasks)).catch(() => undefined);
    });
  }, []);

  return (
    <Shell userName={user?.name}>
      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold font-heading text-white">
              Task <span className="text-[#22d3ee]">History</span>
            </h1>
            <p className="mt-1 text-sm text-slate-400">All previous browser automation runs and execution sessions.</p>
          </div>
          <Link
            href="/dashboard/agent"
            className="rounded-full bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#06b6d4] px-5 py-2 text-xs font-semibold text-white shadow-[0_0_15px_rgba(99,102,241,0.4)] transition hover:brightness-110 active:scale-95"
          >
            + New Task
          </Link>
        </div>

        <div className="space-y-3">
          {tasks.length === 0 && (
            <div className="rounded-3xl border border-white/10 bg-[#141724]/80 p-12 text-center shadow-lg backdrop-blur-xl">
              <i className="ri-task-line text-4xl text-slate-600 mb-2 block" />
              <p className="text-sm text-slate-400">No automation tasks recorded yet.</p>
              <Link
                href="/dashboard/agent"
                className="mt-4 inline-block text-xs font-semibold text-[#06b6d4] hover:underline"
              >
                Launch your first agent task →
              </Link>
            </div>
          )}

          {tasks.map((t) => (
            <Link
              key={t.id}
              href={`/dashboard/tasks/${t.id}`}
              className="group block rounded-2xl border border-white/10 bg-[#141724]/80 p-4 shadow-sm backdrop-blur-xl transition hover:border-[#6366f1] hover:bg-white/5"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold text-white text-sm group-hover:text-cyan-300 transition truncate">
                  {t.goal}
                </div>
                <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  {t.status}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500 font-mono">
                <span>{new Date(t.createdAt).toLocaleString()}</span>
                <span>•</span>
                <span>{t.demoMode ? "DEMO MODE" : "LIVE BROWSER"}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </Shell>
  );
}
