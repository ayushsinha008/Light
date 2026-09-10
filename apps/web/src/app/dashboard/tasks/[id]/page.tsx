"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { api, getToken, type AuthUser } from "@/lib/api";

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [task, setTask] = useState<{
    goal: string;
    status: string;
    message?: string;
    steps: Array<{ id: string; message: string; createdAt: string }>;
  } | null>(null);

  useEffect(() => {
    if (!getToken()) return void router.replace("/login");
    void api<{ user: AuthUser }>("/api/auth/me").then((d) => setUser(d.user));
    void api<{ task: NonNullable<typeof task> }>(`/api/tasks/${id}`).then((d) => setTask(d.task));
  }, [id, router]);

  return (
    <Shell userName={user?.name}>
      {!task ? (
        <p className="text-slate-400">Loading…</p>
      ) : (
        <>
          <h1 className="text-2xl font-bold">{task.goal}</h1>
          <p className="mt-2 text-sm text-slate-400">
            {task.status} {task.message ? `· ${task.message}` : ""}
          </p>
          <div className="mt-6 space-y-2">
            {task.steps.map((s) => (
              <div key={s.id} className="glass rounded-2xl px-4 py-3 text-sm">
                <div className="text-xs text-slate-500">{new Date(s.createdAt).toLocaleTimeString()}</div>
                {s.message}
              </div>
            ))}
          </div>
        </>
      )}
    </Shell>
  );
}
