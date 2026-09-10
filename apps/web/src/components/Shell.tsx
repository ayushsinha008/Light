"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, cn, getToken, setToken } from "@/lib/api";

interface HistoryItem {
  id: string;
  title: string;
  date: "today" | "past";
  createdAt?: string;
}

const DEFAULT_MODELS = ["Gemini 2.0 Flash", "GPT-4o Mini", "Claude 3.5 Sonnet", "Demo Simulator"];

export function Shell({
  children,
  userName,
  onNewTask,
  historyItems = [],
  onSelectHistory,
  activeHistoryId,
}: {
  children: React.ReactNode;
  userName?: string;
  onNewTask?: () => void;
  historyItems?: HistoryItem[];
  onSelectHistory?: (id: string) => void;
  activeHistoryId?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [currentModel, setCurrentModel] = useState("Gemini 2.0 Flash");
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [browserOnline, setBrowserOnline] = useState<boolean | null>(null);

  // Check browser extension connection
  useEffect(() => {
    void api<{ connected: boolean }>("/api/browser/status")
      .then((d) => setBrowserOnline(Boolean(d.connected)))
      .catch(() => setBrowserOnline(false));
  }, []);

  // Model switch
  const cycleModel = () => {
    const idx = DEFAULT_MODELS.indexOf(currentModel);
    const nextModel = DEFAULT_MODELS[(idx + 1) % DEFAULT_MODELS.length] || DEFAULT_MODELS[0] || "Gemini 2.0 Flash";
    setCurrentModel(nextModel);
  };

  const filteredHistory = historyItems.filter((h) =>
    h.title.toLowerCase().includes(searchFilter.toLowerCase()),
  );

  const todayList = filteredHistory.filter((h) => h.date === "today");
  const pastList = filteredHistory.filter((h) => h.date === "past");

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-transparent text-[var(--text-primary)]">
      {/* ========================================== */}
      {/* LEFT SIDEBAR - CHAT & AGENT WORKSPACE      */}
      {/* ========================================== */}
      <aside
        className={cn(
          "flex flex-col h-full bg-[var(--bg-sidebar)]/85 backdrop-blur-xl border-r border-[var(--border-color)] transition-all duration-300 z-40 shrink-0",
          sidebarCollapsed ? "-translate-x-full w-0 overflow-hidden" : "w-[260px]",
        )}
      >
        {/* Sidebar Header: New Task Button */}
        <div className="p-4 border-b border-[var(--border-color)]">
          <button
            onClick={() => {
              if (onNewTask) onNewTask();
              else router.push("/dashboard/agent");
            }}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#06b6d4] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(99,102,241,0.3)] transition hover:brightness-110 active:scale-[0.98]"
          >
            <i className="ri-add-line text-lg" />
            <span>New Task</span>
          </button>
        </div>

        {/* Sidebar Search History */}
        <div className="px-3.5 pt-3 pb-1">
          <div className="relative">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)]" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search history..."
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[#6366f1]"
            />
          </div>
        </div>

        {/* Nav Links */}
        <div className="px-3 py-2 border-b border-[var(--border-color)]">
          <div className="flex flex-col gap-0.5 text-xs">
            <Link
              href="/dashboard/agent"
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition font-medium",
                pathname === "/dashboard/agent"
                  ? "bg-[var(--bg-surface-hover)] text-[#6366f1]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]",
              )}
            >
              <i className="ri-sparkling-2-fill text-sm text-[#06b6d4]" />
              <span>AI Agent Canvas</span>
            </Link>
            <Link
              href="/dashboard/tasks"
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition font-medium",
                pathname === "/dashboard/tasks"
                  ? "bg-[var(--bg-surface-hover)] text-[#6366f1]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]",
              )}
            >
              <i className="ri-task-line text-sm" />
              <span>Task Log</span>
            </Link>
            <Link
              href="/dashboard/privacy"
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition font-medium",
                pathname === "/dashboard/privacy"
                  ? "bg-[var(--bg-surface-hover)] text-[#6366f1]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]",
              )}
            >
              <i className="ri-shield-check-line text-sm" />
              <span>Privacy Shield</span>
            </Link>
          </div>
        </div>

        {/* History Grouped List */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {todayList.length > 0 && (
            <>
              <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Today
              </div>
              {todayList.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onSelectHistory && onSelectHistory(item.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition group",
                    activeHistoryId === item.id
                      ? "bg-[var(--bg-surface-hover)] text-[var(--text-primary)] font-medium"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]",
                  )}
                >
                  <i className="ri-chat-3-line shrink-0 text-sm text-[var(--text-muted)] group-hover:text-[#6366f1]" />
                  <span className="truncate flex-1">{item.title}</span>
                </button>
              ))}
            </>
          )}

          {pastList.length > 0 && (
            <>
              <div className="mt-3 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Previous Days
              </div>
              {pastList.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onSelectHistory && onSelectHistory(item.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition group",
                    activeHistoryId === item.id
                      ? "bg-[var(--bg-surface-hover)] text-[var(--text-primary)] font-medium"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]",
                  )}
                >
                  <i className="ri-chat-3-line shrink-0 text-sm text-[var(--text-muted)] group-hover:text-[#6366f1]" />
                  <span className="truncate flex-1">{item.title}</span>
                </button>
              ))}
            </>
          )}

          {filteredHistory.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-[var(--text-muted)]">
              No previous tasks yet
            </div>
          )}
        </div>

        {/* Browser Extension Status Ribbon */}
        <div className="mx-3 my-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-2.5 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-muted)]">Browser status:</span>
            <span
              className={cn(
                "inline-flex items-center gap-1 font-semibold",
                browserOnline ? "text-emerald-400" : "text-amber-400",
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", browserOnline ? "bg-emerald-400 animate-pulse" : "bg-amber-400")} />
              {browserOnline ? "Connected" : "Offline"}
            </span>
          </div>
          {!browserOnline && (
            <Link
              href="/onboarding"
              className="mt-1.5 block text-center rounded-lg bg-white/5 py-1 text-[10px] font-semibold text-[#06b6d4] hover:bg-white/10"
            >
              Pair Extension →
            </Link>
          )}
        </div>

        {/* Sidebar Footer User Profile */}
        <div className="relative border-t border-[var(--border-color)] p-3 bg-[var(--bg-sidebar)]">
          {/* Profile Dropdown */}
          {profileDropdownOpen && (
            <div className="absolute bottom-[calc(100%+8px)] left-3 right-3 rounded-2xl border border-[var(--border-color)] bg-[#141724] p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.5)] z-50 animate-fadeIn">
              <Link
                href="/dashboard/settings"
                onClick={() => setProfileDropdownOpen(false)}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-white transition"
              >
                <i className="ri-settings-4-line text-sm" />
                <span>Settings & API Keys</span>
              </Link>
              <button
                onClick={() => {
                  const newName = window.prompt("Enter your name:", userName || "Explorer");
                  if (newName && newName.trim()) {
                    localStorage.setItem("light_user_name", newName.trim());
                    window.location.reload();
                  }
                  setProfileDropdownOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-white transition"
              >
                <i className="ri-user-edit-line text-sm text-[#06b6d4]" />
                <span>Change Name</span>
              </button>
            </div>
          )}

          <button
            onClick={() => setProfileDropdownOpen((o) => !o)}
            className="flex w-full items-center gap-3 rounded-xl p-1.5 text-left transition hover:bg-[var(--bg-surface-hover)]"
          >
            <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#6366f1] via-[#8b5cf6] to-[#06b6d4] text-xs font-bold text-white shadow-sm">
              {userName ? userName.charAt(0).toUpperCase() : "L"}
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="truncate text-xs font-semibold text-[var(--text-primary)]">
                {userName || "Explorer"}
              </div>
              <div className="truncate text-[10px] text-[var(--text-muted)]">
                Private Mode Active
              </div>
            </div>
            <i className="ri-more-2-fill text-xs text-[var(--text-muted)]" />
          </button>
        </div>
      </aside>

      {/* ========================================== */}
      {/* MAIN VIEW AREA                             */}
      {/* ========================================== */}
      <div className="flex flex-1 flex-col h-full overflow-hidden">
        {/* Top Navbar */}
        <header className="flex h-12 items-center justify-between bg-transparent px-4 pt-3 z-20 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarCollapsed((c) => !c)}
              title="Toggle Sidebar"
              className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:border-white/20 hover:text-white transition backdrop-blur-md"
            >
              <i className={sidebarCollapsed ? "ri-sidebar-unfold-line text-sm" : "ri-sidebar-fold-line text-sm"} />
              <span>{sidebarCollapsed ? "Show Sidebar" : "Hide Sidebar"}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Onboarding / Pair Link */}
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:border-white/20 transition backdrop-blur-md"
            >
              <i className="ri-puzzle-line text-xs text-[#06b6d4]" />
              <span>Pair Extension</span>
            </Link>
          </div>
        </header>

        {/* Canvas Body */}
        <main className="flex-1 overflow-y-auto relative">{children}</main>
      </div>
    </div>
  );
}
