"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Shield, Sparkles, EyeOff } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="relative overflow-hidden">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-violet font-bold">
              L
            </div>
            <span className="font-semibold">Light</span>
          </div>
          <div className="flex gap-3">
            <Link href="/login" className="rounded-xl px-4 py-2 text-sm text-slate-300 hover:bg-white/5">
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-xl bg-gradient-to-r from-accent to-accent-violet px-4 py-2 text-sm font-semibold text-white shadow-glow"
            >
              Get started
            </Link>
          </div>
        </header>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-24 max-w-3xl"
        >
          <p className="mb-4 text-sm uppercase tracking-[0.2em] text-accent">Privacy-first architecture</p>
          <h1 className="text-4xl font-extrabold leading-tight md:text-6xl">
            Private AI that can operate the web.
          </h1>
          <p className="mt-5 text-lg text-slate-300 md:text-xl">
            Automate browser tasks with local visual intelligence and privacy-first AI — without
            sending your screen to the cloud.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-accent to-accent-violet px-5 py-3 font-semibold shadow-glow"
            >
              Launch Agent <ArrowRight size={16} />
            </Link>
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 font-semibold text-slate-200"
            >
              Install Extension
            </Link>
          </div>
        </motion.section>

        <section className="mt-20 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: EyeOff,
              title: "Local perception",
              body: "DOM, accessibility, and on-device vision/OCR stay in your browser whenever supported.",
            },
            {
              icon: Shield,
              title: "PII redaction",
              body: "Passwords, cards, tokens, and secrets are redacted before any cloud planner call.",
            },
            {
              icon: Sparkles,
              title: "Structured planning",
              body: "The cloud LLM receives safe UI metadata and returns validated JSON actions only.",
            },
          ].map((card) => (
            <div key={card.title} className="glass glow-border rounded-3xl p-5">
              <card.icon className="mb-3 text-accent" size={22} />
              <h3 className="font-semibold">{card.title}</h3>
              <p className="mt-2 text-sm text-slate-400">{card.body}</p>
            </div>
          ))}
        </section>

        <footer className="mt-auto pt-16 text-xs text-slate-500">
          Light uses precise privacy messaging: we do not claim “100% private.” Sensitive visual
          processing happens locally whenever supported. Only minimized structured context is sent
          to the cloud.
        </footer>
      </div>
    </div>
  );
}
