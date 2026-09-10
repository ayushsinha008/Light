"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Mascot, type MascotState } from "@/components/Mascot";
import { api, ensureAuth, getToken, getUserName, setUserName, WS_URL, type AuthUser } from "@/lib/api";

type Activity = { id: string; message: string; createdAt: string; type?: string };
type ResultItem = {
  title: string;
  subtitle?: string;
  url?: string;
  meta?: Record<string, string>;
};

interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEvent {
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const SUGGESTIONS = [
  {
    icon: "ri-shopping-bag-3-line",
    title: "Find Best Deals",
    desc: "Compare wireless headphones under ₹10,000",
    prompt: "Compare the best wireless headphones under ₹10,000 on Amazon and Flipkart",
  },
  {
    icon: "ri-flight-takeoff-line",
    title: "Flight Search",
    desc: "Find cheapest flights Delhi to Mumbai",
    prompt: "Find the cheapest flights from Delhi to Mumbai for next weekend",
  },
  {
    icon: "ri-hotel-bed-line",
    title: "Hotel Booking",
    desc: "Find beach resorts in Goa under ₹5,000/night",
    prompt: "Find highly rated beach resorts in North Goa under ₹5,000 per night",
  },
  {
    icon: "ri-code-box-line",
    title: "Tech Specs Research",
    desc: "Compare latest laptop models with 16GB RAM",
    prompt: "Find laptops under ₹60,000 with 16GB RAM and fast SSD storage",
  },
];

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  IDLE: { label: "Ready", color: "bg-slate-500" },
  OBSERVING: { label: "Observing Page", color: "bg-sky-400" },
  PLANNING: { label: "Planning Next Action", color: "bg-violet-400" },
  EXECUTING: { label: "Executing in Browser", color: "bg-amber-400" },
  VERIFYING: { label: "Verifying Result", color: "bg-cyan-400" },
  COMPLETED: { label: "Completed", color: "bg-emerald-400" },
  BLOCKED: { label: "Action Blocked", color: "bg-orange-400" },
  ERROR: { label: "Error Occurred", color: "bg-rose-400" },
  AWAITING_APPROVAL: { label: "Approval Required", color: "bg-yellow-300" },
  PAUSED: { label: "Paused", color: "bg-slate-400" },
};

const ACTIVE_STATUSES = new Set(["OBSERVING", "PLANNING", "EXECUTING", "VERIFYING", "AWAITING_APPROVAL"]);

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url || "—";
  }
}

export default function AgentPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [goal, setGoal] = useState("");
  const [status, setStatus] = useState("IDLE");
  const [statusMessage, setStatusMessage] = useState("Ready when you are");
  const [activity, setActivity] = useState<Activity[]>([]);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [activeGoal, setActiveGoal] = useState<string | null>(null);
  const [pageUrl, setPageUrl] = useState("—");
  const [tabId, setTabId] = useState<number | null>(null);
  const [elements, setElements] = useState(0);
  const [currentAction, setCurrentAction] = useState("—");
  const [approval, setApproval] = useState<{ taskId: string; reasons: string[] } | null>(null);
  const [extensionOnline, setExtensionOnline] = useState(false);
  const [connectionChecked, setConnectionChecked] = useState(false);
  const [gateError, setGateError] = useState("");
  const [results, setResults] = useState<{ summary: string; items: ResultItem[] } | null>(null);
  const [running, setRunning] = useState(false);
  const [voiceState, setVoiceState] = useState<"idle" | "listening" | "processing">("idle");
  const [voiceMessage, setVoiceMessage] = useState("");
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [thinkingMode, setThinkingMode] = useState(false);

  // Chat/Task history list for sidebar
  const [historyItems, setHistoryItems] = useState<
    Array<{ id: string; title: string; date: "today" | "past" }>
  >([]);

  const wsRef = useRef<WebSocket | null>(null);
  const speechRef = useRef<BrowserSpeechRecognition | null>(null);
  const voiceTranscriptRef = useRef("");
  const voiceShouldRunRef = useRef(false);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);

  // Initial Auth & Status check
  useEffect(() => {
    void ensureAuth().then(() => {
      void api<{ user: AuthUser }>("/api/auth/me")
        .then((d) => setUser(d.user))
        .catch(() => undefined);
    });

    const refreshBrowserStatus = () => {
      void api<{ connected: boolean }>("/api/browser/status")
        .then((d) => {
          setExtensionOnline(Boolean(d.connected));
          setConnectionChecked(true);
        })
        .catch(() => setConnectionChecked(true));
    };
    refreshBrowserStatus();
    const statusPoll = window.setInterval(refreshBrowserStatus, 5000);

    // Load recent tasks for history
    void api<{ tasks?: Array<{ id: string; goal: string; createdAt: string }> }>("/api/agent/tasks")
      .then((d) => {
        if (d.tasks && Array.isArray(d.tasks)) {
          setHistoryItems(
            d.tasks.map((t) => ({
              id: t.id,
              title: t.goal,
              date: "today",
            })),
          );
        }
      })
      .catch(() => undefined);

    return () => window.clearInterval(statusPoll);
  }, []);

  // WebSocket Connection
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let closed = false;
    let retryTimer: number | undefined;
    let attempt = 0;

    const connectDashboardWs = () => {
      if (closed) return;
      const ws = new WebSocket(`${WS_URL}/ws?kind=dashboard&token=${encodeURIComponent(token)}`);
      wsRef.current = ws;
      ws.onopen = () => {
        attempt = 0;
      };
      ws.onclose = () => {
        if (closed) return;
        const delay = Math.min(1000 * 2 ** attempt, 15000);
        attempt += 1;
        retryTimer = window.setTimeout(connectDashboardWs, delay);
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as { event: string; payload: Record<string, unknown> };
          if (msg.event === "agent:status") {
            const next = String(msg.payload.status || "IDLE");
            setStatus(next);
            if (msg.payload.message) setStatusMessage(String(msg.payload.message));
            if (["COMPLETED", "ERROR", "BLOCKED", "PAUSED"].includes(next)) setRunning(false);
            if (ACTIVE_STATUSES.has(next)) setRunning(true);
          }
          if (msg.event === "agent:activity") {
            const item = msg.payload as Activity;
            setActivity((a) => [item, ...a].slice(0, 100));
          }
          if (msg.event === "agent:plan") {
            const plan = msg.payload.plan as { actions?: Array<{ type: string }> };
            const action = plan?.actions?.[0]?.type;
            setCurrentAction(action ? humanAction(action) : "—");
          }
          if (msg.event === "agent:approval") {
            setApproval({
              taskId: String(msg.payload.taskId),
              reasons: (msg.payload.reasons as string[]) || ["Approval required"],
            });
            setStatus("AWAITING_APPROVAL");
          }
          if (msg.event === "agent:privacy") {
            setElements(Number(msg.payload.redactedFields || 0));
          }
          if (msg.event === "agent:browser_state") {
            if (msg.payload.url) setPageUrl(String(msg.payload.url));
            if (msg.payload.tabId) setTabId(Number(msg.payload.tabId));
            if (msg.payload.elementCount != null) setElements(Number(msg.payload.elementCount));
          }
          if (msg.event === "agent:result") {
            setResults({
              summary: String(msg.payload.summary || ""),
              items: (msg.payload.items as ResultItem[]) || [],
            });
            setRunning(false);
          }
          if (msg.event === "browser:tab_closed") {
            setStatus("BLOCKED");
            setStatusMessage("Agent browser tab was closed.");
            setRunning(false);
          }
          if (msg.event === "browser:connection") {
            if (msg.payload.kind === "extension") {
              setExtensionOnline(msg.payload.status === "online");
              setConnectionChecked(true);
            }
          }
        } catch {
          // ignore
        }
      };
    };

    connectDashboardWs();
    return () => {
      closed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      wsRef.current?.close();
    };
  }, []);

  // Run Task
  const run = useCallback(
    async (goalOverride?: string) => {
      const requestedGoal = (goalOverride ?? goal).trim();
      if (!requestedGoal) return;
      setGateError("");
      setResults(null);

      if (!extensionOnline) {
        setGateError("Connect your browser extension first to run live tasks.");
        return;
      }

      setRunning(true);
      setGoal(requestedGoal);
      setActiveGoal(requestedGoal);
      setStatus("OBSERVING");
      setStatusMessage("Starting agent...");
      setActivity([]);
      setCurrentAction("Opening browser tab");
      setPageUrl("—");
      setTabId(null);

      // Add to local history list
      setHistoryItems((prev) => [
        { id: `local-${Date.now()}`, title: requestedGoal, date: "today" },
        ...prev,
      ]);

      try {
        const data = await api<{
          task: { id: string; goal: string };
          startUrl?: string;
        }>("/api/agent/task", {
          method: "POST",
          body: JSON.stringify({ goal: requestedGoal, requireBrowser: true }),
        });
        setTaskId(data.task.id);
        if (data.startUrl) setPageUrl(data.startUrl);
      } catch (err) {
        setRunning(false);
        setStatus("ERROR");
        const message = err instanceof Error ? err.message : "Failed";
        setStatusMessage(message);
        setGateError(message);
      }
    },
    [goal, extensionOnline],
  );

  // Voice recognition
  const toggleVoice = useCallback(() => {
    if (voiceState === "listening") {
      voiceShouldRunRef.current = true;
      speechRef.current?.stop();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceMessage("Voice input is not supported in this browser. Use Chrome or Edge.");
      return;
    }
    if (!extensionOnline) {
      setGateError("Connect your browser first to run voice tasks.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    speechRef.current = recognition;
    voiceTranscriptRef.current = "";
    voiceShouldRunRef.current = true;
    setVoiceMessage("Listening… speak your task");
    setVoiceState("listening");

    recognition.onresult = (event) => {
      let transcript = "";
      let hasFinal = false;
      for (let i = 0; i < event.results.length; i++) {
        transcript += `${event.results[i]?.[0]?.transcript || ""} `;
        if (event.results[i]?.isFinal) hasFinal = true;
      }
      transcript = transcript.trim();
      if (transcript) {
        voiceTranscriptRef.current = transcript;
        setGoal(transcript);
        setVoiceMessage(hasFinal ? "Got it — launching..." : `Listening: ${transcript}`);
      }
    };

    recognition.onerror = (event) => {
      voiceShouldRunRef.current = false;
      setVoiceState("idle");
      setVoiceMessage(`Voice input failed: ${event.error}`);
    };

    recognition.onend = () => {
      speechRef.current = null;
      const transcript = voiceTranscriptRef.current.trim();
      const shouldRun = voiceShouldRunRef.current && Boolean(transcript);
      setVoiceState(shouldRun ? "processing" : "idle");
      if (shouldRun) {
        setVoiceMessage("Executing voice task…");
        void run(transcript).finally(() => {
          setVoiceState("idle");
          setVoiceMessage("");
        });
      }
    };

    try {
      recognition.start();
    } catch {
      speechRef.current = null;
      setVoiceState("idle");
      setVoiceMessage("Could not start microphone.");
    }
  }, [extensionOnline, run, voiceState]);

  const control = async (action: "pause" | "resume" | "stop") => {
    if (!taskId) return;
    await api("/api/agent/control", {
      method: "POST",
      body: JSON.stringify({ taskId, action }),
    });
    if (action === "stop") setRunning(false);
  };

  const approve = async (approved: boolean) => {
    if (!approval) return;
    await api("/api/agent/approve", {
      method: "POST",
      body: JSON.stringify({ taskId: approval.taskId, approved }),
    });
    setApproval(null);
  };

  const resetNewTask = () => {
    setStatus("IDLE");
    setStatusMessage("Ready when you are");
    setActiveGoal(null);
    setResults(null);
    setActivity([]);
    setTaskId(null);
    setGoal("");
    setGateError("");
  };

  const isActive = running || ACTIVE_STATUSES.has(status);
  const showHero = !isActive && status !== "COMPLETED" && !results;

  // Mascot dynamic state calculation
  const mascotVisualState: MascotState = useMemo(() => {
    if (status === "ERROR" || status === "BLOCKED") return "error";
    if (status === "COMPLETED") return "completed";
    if (["PLANNING", "OBSERVING", "VERIFYING"].includes(status)) return "thinking";
    if (status === "EXECUTING" || running) return "excited";
    if (goal.trim().length > 0) return "typing";
    return "idle";
  }, [status, running, goal]);

  return (
    <Shell
      userName={user?.name}
      onNewTask={resetNewTask}
      historyItems={historyItems}
      activeHistoryId={taskId}
    >
      <div className="flex h-full flex-col p-4 md:p-6 max-w-6xl mx-auto">
        {/* ========================================== */}
        {/* 1. HERO VIEW (CENTERED LANDING SEARCH)     */}
        {/* ========================================== */}
        {showHero && (
          <div className="flex flex-1 flex-col items-center justify-center my-auto">
            {/* Mascot Centerpiece */}
            <Mascot state={mascotVisualState} className="mb-2" />

            {/* Greeting Header */}
            <div className="text-center mb-4">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold font-heading tracking-tight">
                <span className="text-white drop-shadow-sm">What can I automate </span>
                <span className="text-[#22d3ee] drop-shadow-[0_0_20px_rgba(34,211,238,0.35)]">for you today?</span>
              </h1>
              <p className="mt-1.5 text-sm text-[#94a3b8]">
                AI browser assistant with on-device privacy protection & live tab control
              </p>
            </div>

            {/* Pill Capsule Typing Area */}
            <div className="w-full max-w-2xl">
              <div className="relative rounded-full border border-white/10 bg-[#16171b]/95 px-5 py-2.5 shadow-[0_10px_35px_rgba(0,0,0,0.55)] backdrop-blur-2xl transition-all focus-within:border-cyan-400/50 focus-within:shadow-[0_0_25px_rgba(34,211,238,0.2)] flex items-center gap-3">
                {/* Main Single-line Input */}
                <input
                  type="text"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void run();
                    }
                  }}
                  placeholder="Describe a task"
                  className="flex-1 bg-transparent text-sm sm:text-base text-white placeholder-slate-400 outline-none border-none py-1"
                />

                {/* Right Controls Inside Capsule */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Microphone Icon Button */}
                  <button
                    type="button"
                    onClick={toggleVoice}
                    aria-label="Voice input"
                    title={voiceState === "listening" ? "Stop listening" : "Dictate prompt"}
                    className={`grid h-9 w-9 place-items-center rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition ${
                      voiceState === "listening" ? "animate-pulse text-rose-400 bg-rose-500/15" : ""
                    }`}
                  >
                    <i className="ri-mic-line text-lg" />
                  </button>

                  {/* Send Button (Visible when typing or always available) */}
                  {goal.trim().length > 0 && (
                    <button
                      type="button"
                      onClick={() => void run()}
                      title="Send command"
                      className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#06b6d4] text-white shadow-[0_0_12px_rgba(99,102,241,0.5)] transition hover:scale-105 active:scale-95 shrink-0"
                    >
                      <i className="ri-arrow-up-line text-base font-bold" />
                    </button>
                  )}
                </div>
              </div>

              {/* Error / Voice Message */}
              {voiceMessage && (
                <p className="mt-2 text-center text-xs text-cyan-300 animate-fadeIn">{voiceMessage}</p>
              )}
              {gateError && (
                <div className="mt-2.5 flex items-center justify-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/20 p-2 text-xs text-rose-300">
                  <i className="ri-error-warning-line text-sm" />
                  <span>{gateError}</span>
                  {!extensionOnline && (
                    <Link href="/onboarding" className="font-semibold underline ml-1 text-rose-200">
                      Pair Extension
                    </Link>
                  )}
                </div>
              )}

              {/* Quick Prompt Suggestion Cards (Tightened Spacing) */}
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.title}
                    type="button"
                    onClick={() => {
                      setGoal(s.prompt);
                      void run(s.prompt);
                    }}
                    className="flex items-start gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-3.5 text-left transition hover:border-[#6366f1] hover:bg-[var(--bg-surface-hover)] hover:-translate-y-0.5 shadow-sm group"
                  >
                    <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-[#6366f1]/20 to-[#06b6d4]/20 text-[#6366f1] group-hover:text-[#06b6d4] transition shrink-0">
                      <i className={`${s.icon} text-base`} />
                    </div>
                    <div className="overflow-hidden">
                      <div className="font-semibold text-xs text-[var(--text-primary)]">{s.title}</div>
                      <div className="text-[11px] text-[var(--text-muted)] truncate">{s.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* 2. ACTIVE EXECUTION & RESULTS CANVAS       */}
        {/* ========================================== */}
        {!showHero && (
          <div className="flex flex-1 flex-col gap-4">
            {/* Header Ribbon */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-4">
              <div className="flex items-center gap-3">
                <span
                  className={`h-3 w-3 rounded-full ${STATUS_BADGES[status]?.color || "bg-slate-400"} ${
                    isActive ? "animate-pulse" : ""
                  }`}
                />
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    {STATUS_BADGES[status]?.label || status}
                  </div>
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">{activeGoal}</h2>
                </div>
              </div>

              {/* Action Controls */}
              <div className="flex items-center gap-2">
                {isActive && (
                  <>
                    {status === "PAUSED" ? (
                      <button
                        onClick={() => void control("resume")}
                        className="rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"
                      >
                        Resume
                      </button>
                    ) : (
                      <button
                        onClick={() => void control("pause")}
                        className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-medium hover:bg-white/10"
                      >
                        Pause
                      </button>
                    )}
                    <button
                      onClick={() => void control("stop")}
                      className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20"
                    >
                      Stop
                    </button>
                  </>
                )}
                {!isActive && (
                  <button
                    onClick={resetNewTask}
                    className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#06b6d4] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm"
                  >
                    <i className="ri-add-line" />
                    <span>New Task</span>
                  </button>
                )}
              </div>
            </div>

            {/* Approval Banner */}
            {approval && (
              <div className="rounded-2xl border border-yellow-400/40 bg-yellow-400/10 p-4">
                <div className="flex items-center gap-2 text-yellow-300 font-semibold text-xs uppercase tracking-wide">
                  <i className="ri-alert-line" />
                  <span>Human Approval Required</span>
                </div>
                <ul className="mt-2 list-disc pl-5 text-xs text-yellow-100/90">
                  {approval.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => void approve(true)}
                    className="rounded-xl bg-emerald-500 px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition"
                  >
                    Approve & Continue
                  </button>
                  <button
                    onClick={() => void approve(false)}
                    className="rounded-xl border border-white/20 bg-white/5 px-4 py-1.5 text-xs font-semibold hover:bg-white/10"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Main Canvas Split Grid */}
            <div className="grid flex-1 gap-4 xl:grid-cols-[1.3fr_0.7fr] overflow-hidden">
              {/* Left Column: Streaming Thought & Results */}
              <div className="flex flex-col rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-5 overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]">
                    <i className="ri-sparkling-2-fill text-[#6366f1]" />
                    <span>Agent Stream</span>
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">{statusMessage}</div>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto py-4 pr-1 text-xs">
                  {activity.map((a) => (
                    <div key={a.id} className="flex gap-2.5 rounded-xl bg-black/20 p-3 border border-white/5">
                      <span className="text-[#06b6d4] font-bold">●</span>
                      <div className="flex-1">
                        <div className="text-[var(--text-primary)] leading-relaxed">{a.message}</div>
                        <div className="mt-1 text-[10px] text-[var(--text-muted)]">
                          {new Date(a.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  ))}

                  {activity.length === 0 && (
                    <div className="py-12 text-center text-xs text-[var(--text-muted)]">
                      Connecting with browser tab...
                    </div>
                  )}
                </div>

                {/* Results Card if complete */}
                {results && (
                  <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                    <div className="flex items-center gap-2 text-emerald-300 font-semibold text-xs">
                      <i className="ri-checkbox-circle-fill" />
                      <span>Task Completed Successfully</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-200 leading-relaxed">{results.summary}</p>
                    {results.items.length > 0 && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {results.items.map((item, idx) => (
                          <div
                            key={`${item.title}-${idx}`}
                            className="rounded-lg border border-white/10 bg-black/30 p-2.5 text-xs"
                          >
                            <div className="font-semibold text-white">{item.title}</div>
                            {item.subtitle && <div className="text-[11px] text-slate-400 mt-0.5">{item.subtitle}</div>}
                            {item.url && (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1.5 inline-block text-[10px] font-bold text-[#06b6d4] hover:underline"
                              >
                                View Link ↗
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right Column: Live Context & Privacy Metrics */}
              <div className="flex flex-col gap-4">
                {/* Active Tab & Page Info */}
                <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-4 text-xs">
                  <div className="text-xs font-semibold text-[var(--text-secondary)] mb-3">Live Browser Telemetry</div>
                  <dl className="space-y-2.5">
                    <div className="flex justify-between">
                      <dt className="text-[var(--text-muted)]">Active Website</dt>
                      <dd className="font-medium text-white truncate max-w-[150px]">{hostnameOf(pageUrl)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-[var(--text-muted)]">Current Action</dt>
                      <dd className="font-medium text-[#06b6d4]">{currentAction}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-[var(--text-muted)]">Redacted Sensitive Data</dt>
                      <dd className="font-medium text-emerald-400">{elements} tokens</dd>
                    </div>
                    {tabId != null && (
                      <div className="flex justify-between">
                        <dt className="text-[var(--text-muted)]">Browser Tab ID</dt>
                        <dd className="font-mono text-slate-300">#{tabId}</dd>
                      </div>
                    )}
                  </dl>
                </div>

                {/* Privacy Badge */}
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs text-slate-300">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold mb-1">
                    <i className="ri-shield-check-fill" />
                    <span>On-Device Privacy Engine</span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                    Zero raw screenshots are streamed to the cloud. Elements & PII are sanitized locally before reaching the LLM planner.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}

function humanAction(type: string): string {
  const map: Record<string, string> = {
    click: "Clicking Element",
    type: "Typing Text",
    navigate: "Navigating Page",
    open_tab: "Opening New Tab",
    press_key: "Pressing Key",
    scroll: "Scrolling Page",
    wait: "Waiting for DOM",
    extract_text: "Extracting Content",
    submit: "Submitting Form",
    clear: "Clearing Field",
    finish: "Completed",
  };
  return map[type] || type;
}
