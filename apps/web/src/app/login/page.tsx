"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, setToken } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const data = await api<{ token: string }>("/api/auth/login", {
        method: "POST",
        auth: false,
        body: JSON.stringify({
          email: fd.get("email"),
          password: fd.get("password"),
        }),
      });
      setToken(data.token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <form onSubmit={onSubmit} className="glass glow-border w-full rounded-3xl p-8">
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="mt-2 text-sm text-slate-400">Sign in to your Light dashboard.</p>
        <label className="mt-6 block text-xs text-slate-400">Email</label>
        <input name="email" type="email" required className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2" />
        <label className="mt-4 block text-xs text-slate-400">Password</label>
        <input name="password" type="password" required className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2" />
        {error && <p className="mt-3 text-sm text-accent-rose">{error}</p>}
        <button disabled={loading} className="mt-6 w-full rounded-xl bg-gradient-to-r from-accent to-accent-violet py-2.5 font-semibold disabled:opacity-60">
          {loading ? "Signing in..." : "Sign in"}
        </button>
        <p className="mt-4 text-center text-sm text-slate-400">
          No account? <Link className="text-accent" href="/register">Create one</Link>
        </p>
      </form>
    </div>
  );
}
