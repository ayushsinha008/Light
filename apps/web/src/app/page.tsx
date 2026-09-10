"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mascot } from "@/components/Mascot";

export default function LandingPage() {
  const router = useRouter();

  useEffect(() => {
    // Automatically route to agent canvas
    router.replace("/dashboard/agent");
  }, [router]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--bg-dark)] text-[var(--text-primary)] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Mascot state="idle" />
        <p className="text-sm text-[var(--text-muted)] animate-pulse">Launching Light Agent...</p>
        <Link
          href="/dashboard/agent"
          className="rounded-xl bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#06b6d4] px-5 py-2.5 text-xs font-semibold text-white shadow-md"
        >
          Open Canvas →
        </Link>
      </div>
    </div>
  );
}
