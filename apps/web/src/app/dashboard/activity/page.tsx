"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { api, getToken, type AuthUser } from "@/lib/api";

export default function ActivityPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [events, setEvents] = useState<Array<{ id: string; message: string; createdAt: string; type: string }>>([]);

  useEffect(() => {
    if (!getToken()) return void router.replace("/login");
    void api<{ user: AuthUser }>("/api/auth/me").then((d) => setUser(d.user));
    void api<{ events: typeof events }>("/api/activity").then((d) => setEvents(d.events));
  }, [router]);

  return (
    <Shell userName={user?.name}>
      <h1 className="text-2xl font-bold">Activity Log</h1>
      <p className="mt-2 text-slate-400">Inspect every observation, redaction, plan, and action.</p>
      <div className="mt-6 space-y-2">
        {events.length === 0 && <p className="text-sm text-slate-500">No activity yet. Run an agent task to populate this log.</p>}
        {events.map((e) => (
          <div key={e.id} className="glass glow-border rounded-2xl px-4 py-3">
            <div className="text-xs text-slate-500">
              {new Date(e.createdAt).toLocaleTimeString()} · {e.type}
            </div>
            <div className="text-sm">{e.message}</div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
