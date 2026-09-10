"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mic, MicOff } from "lucide-react";
import { Shell } from "@/components/Shell";
import { api, getToken, WS_URL, type AuthUser } from "@/lib/api";

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
  "Find a laptop under ₹60,000 with 16GB RAM",
  "Find the cheapest flight from Delhi to Mumbai",
  "Compare the best headphones under ₹10,000",
  "Find hotels in Goa under ₹5,000/night",
];

const STATUS_COLOR: Record<string, string> = {
  IDLE: "bg-slate-500",
  OBSERVING: "bg-sky-400",
  PLANNING: "bg-violet-400",
  EXECUTING: "bg-amber-400",
  VERIFYING: "bg-cyan-400",
  COMPLETED: "bg-emerald-400",
  BLOCKED: "bg-orange-400",
  ERROR: "bg-rose-400",
  AWAITING_APPROVAL: "bg-yellow-300",
  PAUSED: "bg-slate-400",
};

const ACTIVE = new Set(["OBSERVING", "PLANNING", "EXECUTING", "VERIFYING", "AWAITING_APPROVAL"]);

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
  const wsRef = useRef<WebSocket | null>(null);
  const speechRef = useRef<BrowserSpeechRecognition | null>(null);
  const voiceTranscriptRef = useRef("");
  const voiceShouldRunRef = useRef(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    void api<{ user: AuthUser }>("/api/auth/me")
      .then((d) => setUser(d.user))
      .catch(() => router.replace("/login"));
    void api<{ connected: boolean }>("/api/browser/status")
      .then((d) => {
        setExtensionOnline(Boolean(d.connected));
        setConnectionChecked(true);
      })
      .catch(() => setConnectionChecked(true));
  }, [router]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const ws = new WebSocket(`${WS_URL}/ws?kind=dashboard&token=${encodeURIComponent(token)}`);
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as { event: string; payload: Record<string, unknown> };
        if (msg.event === "agent:status") {
          const next = String(msg.payload.status || "IDLE");
          setStatus(next);
          if (msg.payload.message) setStatusMessage(String(msg.payload.message));
          if (["COMPLETED", "ERROR", "BLOCKED", "PAUSED"].includes(next)) setRunning(false);
          if (ACTIVE.has(next)) setRunning(true);
        }
        if (msg.event === "agent:activity") {
          const item = msg.payload as Activity;
          setActivity((a) => [item, ...a].slice(0, 80));
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
        // ignore malformed
      }
    };
    return () => ws.close();
  }, []);

  const run = useCallback(async (goalOverride?: string) => {
    const requestedGoal = (goalOverride ?? goal).trim();
    if (!requestedGoal) return;
    setGateError("");
    setResults(null);

    if (!extensionOnline) {
      setGateError("Connect your browser first to run tasks.");
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
  }, [goal, extensionOnline]);

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
        setVoiceMessage(hasFinal ? "Got it — starting task…" : `Listening: ${transcript}`);
      }
    };

    recognition.onerror = (event) => {
      voiceShouldRunRef.current = false;
      setVoiceState("idle");
      const message =
        event.error === "not-allowed"
          ? "Microphone permission denied. Allow microphone access and retry."
          : event.error === "no-speech"
            ? "No speech detected. Tap the mic and try again."
            : `Voice input failed: ${event.error}`;
      setVoiceMessage(message);
    };

    recognition.onend = () => {
      speechRef.current = null;
      const transcript = voiceTranscriptRef.current.trim();
      const shouldRun = voiceShouldRunRef.current && Boolean(transcript);
      setVoiceState(shouldRun ? "processing" : "idle");
      if (shouldRun) {
        setVoiceMessage("Starting voice task…");
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
      setVoiceMessage("Could not start microphone. Please try again.");
    }
  }, [extensionOnline, run, voiceState]);

  useEffect(() => {
    return () => speechRef.current?.abort();
  }, []);

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

  const statusDot = useMemo(() => STATUS_COLOR[status] || "bg-slate-500", [status]);
  const isActive = running || ACTIVE.has(status);
  const showComposer = !isActive && status !== "COMPLETED" && !results;

  return (
    <Shell userName={user?.name}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Your browser, on autopilot.</h1>
          <p className="mt-2 text-slate-400">Give me a task and I&apos;ll handle it in a new browser tab.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              extensionOnline
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-white/5 text-slate-400"
            }`}
          >
            {connectionChecked
              ? extensionOnline
                ? "● Browser Connected"
                : "○ Browser Offline"
              : "Checking browser…"}
          </span>
          {!extensionOnline && (
            <Link
              href="/onboarding"
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold hover:bg-white/10"
            >
              Connect Browser
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="glass glow-border flex min-h-[560px] flex-col rounded-3xl p-5 md:p-6">
          {showComposer && (
            <div className="flex flex-1 flex-col justify-center">
              <label className="text-sm font-medium text-slate-300">What would you like me to do?</label>
              <div className="relative mt-3">
                <textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void run();
                    }
                  }}
                  rows={4}
                  placeholder="Type a task or tap the mic and speak…"
                  className="w-full resize-none rounded-2xl border border-white/10 bg-black/35 px-4 py-3 pr-16 text-base leading-relaxed outline-none focus:border-accent/50"
                />
                <button
                  type="button"
                  onClick={toggleVoice}
                  disabled={voiceState === "processing" || running}
                  aria-label={voiceState === "listening" ? "Stop listening" : "Speak a task"}
                  title={voiceState === "listening" ? "Stop listening" : "Speak a task"}
                  className={`absolute bottom-3 right-3 grid h-11 w-11 place-items-center rounded-full border transition ${
                    voiceState === "listening"
                      ? "animate-pulse border-rose-300/60 bg-rose-500 text-white shadow-[0_0_24px_rgba(244,63,94,0.5)]"
                      : "border-white/15 bg-white/10 text-accent hover:border-accent/50 hover:bg-white/15"
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {voiceState === "listening" ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
              </div>
              {voiceMessage && (
                <p
                  className={`mt-2 text-sm ${
                    voiceState === "listening" ? "text-accent-mint" : "text-slate-400"
                  }`}
                >
                  {voiceMessage}
                </p>
              )}
              {gateError && (
                <p className="mt-3 text-sm text-accent-rose">{gateError}</p>
              )}
              <button
                onClick={() => void run()}
                disabled={!goal.trim()}
                className="mt-4 rounded-2xl bg-gradient-to-r from-accent to-accent-violet px-5 py-3 text-sm font-semibold shadow-glow disabled:cursor-not-allowed disabled:opacity-40"
              >
                Run Task
              </button>

              <div className="mt-8">
                <p className="text-xs uppercase tracking-wide text-slate-500">Suggested tasks</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setGoal(s)}
                      className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-left text-xs text-slate-300 transition hover:border-accent/40 hover:bg-white/[0.06]"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {isActive && (
            <div className="flex flex-1 flex-col">
              <p className="text-xs uppercase tracking-wide text-slate-500">Active task</p>
              <h2 className="mt-2 text-xl font-semibold leading-snug">{activeGoal}</h2>
              <div className="mt-4 flex items-center gap-2 text-sm text-slate-300">
                <span className={`h-2.5 w-2.5 rounded-full ${statusDot} animate-pulse`} />
                Agent is working
              </div>
              <p className="mt-1 text-sm text-slate-400">{statusMessage}</p>

              <div className="mt-6 flex-1 space-y-2 overflow-y-auto">
                {[...activity].reverse().map((a, i, arr) => {
                  const done = i < arr.length - 1;
                  return (
                    <div key={a.id} className="flex gap-3 text-sm">
                      <span className={done ? "text-accent-mint" : "text-accent"}>{done ? "✓" : "●"}</span>
                      <div>
                        <div className="text-slate-200">{a.message}</div>
                        <div className="text-[10px] text-slate-500">
                          {new Date(a.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {activity.length === 0 && (
                  <p className="text-sm text-slate-500">Starting agent…</p>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {status === "PAUSED" ? (
                  <button
                    onClick={() => void control("resume")}
                    className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold"
                  >
                    Resume
                  </button>
                ) : (
                  <button
                    onClick={() => void control("pause")}
                    className="rounded-xl border border-white/15 px-4 py-2 text-sm"
                  >
                    Pause
                  </button>
                )}
                <button
                  onClick={() => void control("stop")}
                  className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200"
                >
                  Stop
                </button>
              </div>
            </div>
          )}

          {!isActive && (status === "COMPLETED" || results) && (
            <div className="flex flex-1 flex-col">
              <div className="flex items-center gap-2 text-accent-mint">
                <span>✓</span>
                <span className="text-sm font-semibold">COMPLETED</span>
              </div>
              <h2 className="mt-3 text-xl font-semibold">{activeGoal}</h2>
              <p className="mt-2 text-slate-300">{results?.summary || statusMessage}</p>

              {results && results.items.length > 0 && (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {results.items.map((item, i) => (
                    <div key={`${item.title}-${i}`} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                      <div className="font-medium">{item.title}</div>
                      {item.subtitle && <div className="mt-1 text-xs text-slate-400">{item.subtitle}</div>}
                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-block text-xs font-semibold text-accent hover:underline"
                        >
                          Open
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {(status === "ERROR" || status === "BLOCKED") && !results && (
                <div className="mt-6 rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4">
                  <p className="font-medium text-rose-100">Task couldn&apos;t be completed.</p>
                  <p className="mt-1 text-sm text-rose-100/80">{statusMessage}</p>
                </div>
              )}

              {status === "BLOCKED" && statusMessage.includes("tab was closed") && (
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => void run()}
                    className="rounded-xl bg-gradient-to-r from-accent to-accent-violet px-4 py-2 text-sm font-semibold"
                  >
                    Reopen & Continue
                  </button>
                  <button
                    onClick={() => {
                      setStatus("IDLE");
                      setActiveGoal(null);
                      setResults(null);
                    }}
                    className="rounded-xl border border-white/15 px-4 py-2 text-sm"
                  >
                    End Task
                  </button>
                </div>
              )}

              <div className="mt-8 flex gap-2">
                {(status === "ERROR" || status === "BLOCKED") && (
                  <button
                    onClick={() => void run()}
                    className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold"
                  >
                    Retry
                  </button>
                )}
                <button
                  onClick={() => {
                    setStatus("IDLE");
                    setStatusMessage("Ready when you are");
                    setActiveGoal(null);
                    setResults(null);
                    setActivity([]);
                    setTaskId(null);
                    setGoal("");
                  }}
                  className="rounded-xl border border-white/15 px-4 py-2 text-sm"
                >
                  New task
                </button>
              </div>
            </div>
          )}

          {!isActive && (status === "ERROR" || status === "BLOCKED") && !results && !showComposer && (
            <div className="flex flex-1 flex-col justify-center">
              <p className="text-lg font-semibold">Task couldn&apos;t be completed.</p>
              <p className="mt-2 text-sm text-slate-400">{statusMessage}</p>
              <div className="mt-6 flex gap-2">
                <button
                  onClick={() => void run()}
                  className="rounded-xl bg-gradient-to-r from-accent to-accent-violet px-4 py-2 text-sm font-semibold"
                >
                  Retry
                </button>
                <button
                  onClick={() => {
                    setStatus("IDLE");
                    setActiveGoal(null);
                    setGateError("");
                  }}
                  className="rounded-xl border border-white/15 px-4 py-2 text-sm"
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="glass glow-border rounded-3xl p-5">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${statusDot} ${isActive ? "animate-pulse" : ""}`} />
              <span className="text-sm font-semibold tracking-wide">{status}</span>
            </div>
            <p className="mt-2 text-sm text-slate-400">{statusMessage}</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Current website</dt>
                <dd className="truncate text-right">{hostnameOf(pageUrl)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Current task</dt>
                <dd className="max-w-[60%] truncate text-right">{activeGoal || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Current action</dt>
                <dd className="truncate text-right">{currentAction}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Detected / processed</dt>
                <dd>{elements}</dd>
              </div>
              {tabId != null && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Agent tab</dt>
                  <dd>#{tabId}</dd>
                </div>
              )}
            </dl>
          </div>

          {approval && (
            <div className="rounded-3xl border border-yellow-400/30 bg-yellow-400/10 p-5">
              <h3 className="font-semibold text-yellow-100">Approval required</h3>
              <ul className="mt-2 list-disc pl-5 text-sm text-yellow-50/90">
                {approval.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => void approve(true)}
                  className="rounded-xl bg-emerald-500/90 px-4 py-2 text-sm font-semibold text-ink-950"
                >
                  Approve
                </button>
                <button
                  onClick={() => void approve(false)}
                  className="rounded-xl border border-white/20 px-4 py-2 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="glass glow-border rounded-3xl p-5">
            <h3 className="text-sm font-semibold">Live activity</h3>
            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto text-xs text-slate-400">
              {activity.length === 0 && <p>Waiting for agent events…</p>}
              {activity.map((a) => (
                <div key={a.id} className="border-b border-white/5 pb-2">
                  <div className="text-[10px] text-slate-500">
                    {new Date(a.createdAt).toLocaleTimeString()}
                  </div>
                  <div className="text-slate-300">{a.message}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs text-slate-400">
            Screen stays local. Cloud receives structured metadata only — never raw screenshots by default.
          </div>
        </section>
      </div>
    </Shell>
  );
}

function humanAction(type: string): string {
  const map: Record<string, string> = {
    click: "Clicking",
    type: "Typing",
    navigate: "Navigating",
    open_tab: "Opening tab",
    press_key: "Pressing key",
    scroll: "Scrolling",
    wait: "Waiting",
    extract_text: "Reading page",
    submit: "Submitting",
    clear: "Clearing field",
    finish: "Finishing",
  };
  return map[type] || type;
}
