"use client";

import React, { FormEvent, useState } from "react";
import { api, setToken } from "@/lib/api";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: "signIn" | "signUp";
  onSuccess?: (user: { email: string; name: string }) => void;
}

export function AuthModal({
  isOpen,
  onClose,
  defaultTab = "signIn",
  onSuccess,
}: AuthModalProps) {
  const [activeTab, setActiveTab] = useState<"signIn" | "signUp">(defaultTab);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (activeTab === "signIn") {
        const data = await api<{ token: string; user?: { id: string; email: string; name: string } }>("/api/auth/login", {
          method: "POST",
          auth: false,
          body: JSON.stringify({ email, password }),
        });
        const defaultName = email.split("@")[0] || "User";
        if (onSuccess) onSuccess({ email, name: data.user?.name || defaultName });
      } else {
        const defaultName = name || email.split("@")[0] || "User";
        const data = await api<{ token: string; user?: { id: string; email: string; name: string } }>("/api/auth/register", {
          method: "POST",
          auth: false,
          body: JSON.stringify({ name: defaultName, email, password }),
        });
        setToken(data.token);
        if (onSuccess) onSuccess({ email, name: data.user?.name || defaultName });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md rounded-3xl border border-[rgba(255,255,255,0.1)] bg-[#141724] p-8 shadow-[0_12px_40px_rgba(0,0,0,0.6)]">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white"
        >
          <i className="ri-close-line text-lg" />
        </button>

        {/* Header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6366f1] via-[#8b5cf6] to-[#06b6d4] text-xl font-extrabold text-white shadow-[0_0_20px_rgba(99,102,241,0.4)]">
            L
          </div>
          <h2 className="text-2xl font-bold font-heading text-white">Light</h2>
          <p className="mt-1 text-xs text-slate-400">
            {activeTab === "signIn"
              ? "Welcome back! Sign in to access your browser agent."
              : "Create an account to store tasks & session history securely."}
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-6 grid grid-cols-2 rounded-xl bg-[#0e1017] p-1 border border-white/5">
          <button
            type="button"
            onClick={() => {
              setActiveTab("signIn");
              setError("");
            }}
            className={`rounded-lg py-2 text-xs font-semibold transition ${
              activeTab === "signIn"
                ? "bg-[#1e2235] text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("signUp");
              setError("");
            }}
            className={`rounded-lg py-2 text-xs font-semibold transition ${
              activeTab === "signUp"
                ? "bg-[#1e2235] text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {activeTab === "signUp" && (
            <div>
              <label className="block text-xs font-medium text-slate-300">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Diwakar"
                className="mt-1 w-full rounded-xl border border-white/10 bg-[#0e1017] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-[#6366f1] transition"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="mt-1 w-full rounded-xl border border-white/10 bg-[#0e1017] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-[#6366f1] transition"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300">Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1 w-full rounded-xl border border-white/10 bg-[#0e1017] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-[#6366f1] transition"
            />
          </div>

          {error && <p className="text-xs text-rose-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#06b6d4] py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(99,102,241,0.35)] transition hover:brightness-110 disabled:opacity-50"
          >
            {loading
              ? "Authenticating..."
              : activeTab === "signIn"
                ? "Sign In"
                : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}
