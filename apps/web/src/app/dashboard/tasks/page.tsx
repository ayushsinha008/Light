"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { api, getToken, type AuthUser } from "@/lib/api";

export default function TasksPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tasks, setTasks] = useState<Array<{ id: string; goal: string; status: string; demoMode: boolean; createdAt: string }>>([]);

  useEffect(() => {
    if (!getToken()) return void router.replace("/login");
    void api<{ user: AuthUser }>("/api/auth/me").then((d) => setUser(d.user));
    void api<{ tasks: typeof tasks }>("/api/tasks").then((d) => setTasks(d.tasks));
  }, [router]);

  return (
    <Shell userName={user?.name}>
      <h1 className="text-2xl font-bold">Tasks</h1>
      <div className="mt-6 space-y-2">
        {tasks.length === 0 && <p className="text-sm text-slate-500">No tasks yet.</p>}
        {tasks.map((t) => (
          <Link key={t.id} href={`/dashboard/tasks/${t.id}`} className="glass glow-border block rounded-2xl px-4 py-3 hover:bg-white/5">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium">{t.goal}</div>
              <span className="text-xs text-slate-400">{t.status}</span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {new Date(t.createdAt).toLocaleString()} {t.demoMode ? "· DEMO" : "· LIVE"}
            </div>
          </Link>
        ))}
      </div>
    </Shell>
  );
}
