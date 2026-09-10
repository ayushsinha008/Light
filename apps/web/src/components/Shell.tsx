"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Bot,
  Home,
  ListTodo,
  Lock,
  Settings,
  Shield,
  Sparkles,
} from "lucide-react";
import { cn, setToken } from "@/lib/api";

const NAV = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/agent", label: "Agent", icon: Bot },
  { href: "/dashboard/tasks", label: "Tasks", icon: ListTodo },
  { href: "/dashboard/sessions", label: "Sessions", icon: Sparkles },
  { href: "/dashboard/privacy", label: "Privacy Center", icon: Shield },
  { href: "/dashboard/activity", label: "Activity", icon: Activity },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Shell({ children, userName }: { children: React.ReactNode; userName?: string }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-white/10 bg-ink-900/80 p-4 lg:border-b-0 lg:border-r">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-violet font-bold shadow-glow">
            P
          </div>
          <div>
            <div className="text-sm font-semibold">Light</div>
            <div className="text-xs text-slate-400">Privacy-first</div>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto lg:flex-col">
          {NAV.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition",
                  active
                    ? "bg-white/10 text-white"
                    : "text-slate-400 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-8 hidden rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-400 lg:block">
          <div className="mb-2 flex items-center gap-2 text-accent-mint">
            <Lock size={14} /> Screen stays local
          </div>
          Cloud receives structured metadata only — never raw screenshots by default.
        </div>
        <button
          className="mt-4 text-xs text-slate-500 hover:text-slate-300"
          onClick={() => {
            setToken(null);
            router.push("/login");
          }}
        >
          Sign out {userName ? `(${userName})` : ""}
        </button>
      </aside>
      <main className="min-w-0 p-4 md:p-8">{children}</main>
    </div>
  );
}
