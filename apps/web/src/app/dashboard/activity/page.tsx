"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { api, ensureAuth, type AuthUser } from "@/lib/api";

export default function ActivityPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [events, setEvents] = useState<Array<{ id: string; message: string; createdAt: string; type: string }>>([]);

  useEffect(() => {
    void ensureAuth().then(() => {
      void api<{ user: AuthUser }>("/api/auth/me").then((d) => setUser(d.user)).catch(() => undefined);
      void api<{ events: typeof events }>("/api/activity").then((d) => setEvents(d.events)).catch(() => undefined);
    });
  }, []);

  return (
    <Shell userName={user?.name}>
      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
        <div>
          <h1 className="text-3xl font-extrabold font-heading text-white">
            Activity <span className="text-[#22d3ee]">Log</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">Live feed of every visual observation, action execution, and security event.</p>
        </div>

        <div className="space-y-2.5">
          {events.length === 0 && (
            <div className="rounded-3xl border border-white/10 bg-[#141724]/80 p-12 text-center shadow-lg backdrop-blur-xl">
              <i className="ri-pulse-line text-4xl text-slate-600 mb-2 block" />
              <p className="text-sm text-slate-400">No activity logged yet. Launch an agent task to see live actions here.</p>
            </div>
          )}

          {events.map((e) => (
            <div key={e.id} className="rounded-2xl border border-white/10 bg-[#141724]/80 p-4 shadow-sm backdrop-blur-xl transition hover:border-cyan-400/30">
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono mb-1">
                <span className="text-cyan-400 font-semibold uppercase tracking-wider">{e.type}</span>
                <span>{new Date(e.createdAt).toLocaleTimeString()}</span>
              </div>
              <div className="text-sm text-slate-200">{e.message}</div>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
