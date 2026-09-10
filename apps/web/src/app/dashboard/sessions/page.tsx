"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { api, getToken, type AuthUser } from "@/lib/api";

export default function SessionsPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessions, setSessions] = useState<Array<{ id: string; label: string | null; status: string; createdAt: string; _count: { tasks: number } }>>([]);

  useEffect(() => {
    if (!getToken()) return void router.replace("/login");
    void api<{ user: AuthUser }>("/api/auth/me").then((d) => setUser(d.user));
    void api<{ sessions: typeof sessions }>("/api/sessions").then((d) => setSessions(d.sessions));
  }, [router]);

  return (
    <Shell userName={user?.name}>
      <h1 className="text-2xl font-bold">Sessions</h1>
      <div className="mt-6 space-y-2">
        {sessions.length === 0 && <p className="text-sm text-slate-500">No sessions yet.</p>}
        {sessions.map((s) => (
          <div key={s.id} className="glass glow-border rounded-2xl px-4 py-3">
            <div className="font-medium">{s.label || s.id}</div>
            <div className="text-xs text-slate-500">
              {s.status} · {s._count.tasks} tasks · {new Date(s.createdAt).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
