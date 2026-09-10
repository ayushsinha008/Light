"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, setToken } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const data = await api<{ token: string }>("/api/auth/register", {
        method: "POST",
        auth: false,
        body: JSON.stringify({
          name: fd.get("name"),
          email: fd.get("email"),
          password: fd.get("password"),
        }),
      });
      setToken(data.token);
      router.push("/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <form onSubmit={onSubmit} className="glass glow-border w-full rounded-3xl p-8">
        <h1 className="text-2xl font-bold">Create account</h1>
        <p className="mt-2 text-sm text-slate-400">Step 1 of onboarding — your private control plane.</p>
        <label className="mt-6 block text-xs text-slate-400">Name</label>
        <input name="name" required className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2" />
        <label className="mt-4 block text-xs text-slate-400">Email</label>
        <input name="email" type="email" required className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2" />
        <label className="mt-4 block text-xs text-slate-400">Password</label>
        <input name="password" type="password" minLength={8} required className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2" />
        {error && <p className="mt-3 text-sm text-accent-rose">{error}</p>}
        <button disabled={loading} className="mt-6 w-full rounded-xl bg-gradient-to-r from-accent to-accent-violet py-2.5 font-semibold">
          {loading ? "Creating..." : "Create account"}
        </button>
        <p className="mt-4 text-center text-sm text-slate-400">
          Have an account? <Link className="text-accent" href="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
