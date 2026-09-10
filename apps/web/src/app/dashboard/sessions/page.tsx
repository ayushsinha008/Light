"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { api, ensureAuth, type AuthUser } from "@/lib/api";

export default function SessionsPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessions, setSessions] = useState<Array<{ id: string; label: string | null; status: string; createdAt: string; _count: { tasks: number } }>>([]);

  useEffect(() => {
    void ensureAuth().then(() => {
      void api<{ user: AuthUser }>("/api/auth/me").then((d) => setUser(d.user)).catch(() => undefined);
      void api<{ sessions: typeof sessions }>("/api/sessions").then((d) => setSessions(d.sessions)).catch(() => undefined);
    });
  }, []);

  return (
    <Shell userName={user?.name}>
      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
        <div>
          <h1 className="text-3xl font-extrabold font-heading text-white">
            Browser <span className="text-[#22d3ee]">Sessions</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">Manage active and past sandboxed tab sessions.</p>
        </div>

        <div className="space-y-3">
          {sessions.length === 0 && (
            <div className="rounded-3xl border border-white/10 bg-[#141724]/80 p-12 text-center shadow-lg backdrop-blur-xl">
              <i className="ri-window-line text-4xl text-slate-600 mb-2 block" />
              <p className="text-sm text-slate-400">No active browser sessions found.</p>
            </div>
          )}

          {sessions.map((s) => (
            <div key={s.id} className="rounded-2xl border border-white/10 bg-[#141724]/80 p-4 shadow-sm backdrop-blur-xl transition hover:border-cyan-400/30">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-white text-sm">{s.label || s.id}</div>
                <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {s.status}
                </span>
              </div>
              <div className="mt-2 text-xs text-slate-500 font-mono">
                {s._count.tasks} automated actions · {new Date(s.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
