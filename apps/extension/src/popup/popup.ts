async function refresh() {
  const state = await chrome.runtime.sendMessage({ type: "PRIVAI_GET_STATE" });
  const page = await chrome.runtime.sendMessage({ type: "PRIVAI_PAGE_INFO" });
  const pill = document.getElementById("status-pill")!;
  const connected = state?.status === "connected";
  pill.textContent = connected ? "● Connected" : "● Disconnected";
  pill.className = `pill ${connected ? "connected" : "disconnected"}`;

  const host = document.getElementById("page-host")!;
  try {
    host.textContent = page?.url ? new URL(page.url).hostname : "—";
  } catch {
    host.textContent = page?.url || "—";
  }

  const ready = document.getElementById("agent-ready")!;
  ready.textContent = page?.restricted
    ? "Blocked on this page"
    : connected
      ? "Ready"
      : "Pair with dashboard";

  const apiUrl = document.getElementById("api-url") as HTMLInputElement;
  if (state?.apiUrl) apiUrl.value = state.apiUrl;

  document.getElementById("pair-section")!.style.display = connected ? "none" : "grid";
}

document.getElementById("pair-btn")!.addEventListener("click", async () => {
  const apiUrl = (document.getElementById("api-url") as HTMLInputElement).value.trim();
  const pairingCode = (document.getElementById("pair-code") as HTMLInputElement).value.trim();
  const msg = document.getElementById("pair-msg")!;
  msg.textContent = "Connecting...";
  const res = await chrome.runtime.sendMessage({ type: "PRIVAI_PAIR", apiUrl, pairingCode });
  msg.textContent = res?.ok ? res.message || "Your browser is connected." : res?.error || "Failed";
  await refresh();
});

document.getElementById("run-btn")!.addEventListener("click", async () => {
  const goal = (document.getElementById("command") as HTMLTextAreaElement).value.trim();
  const msg = document.getElementById("run-msg")!;
  if (!goal) {
    msg.textContent = "Enter a command first.";
    return;
  }
  const state = await chrome.runtime.sendMessage({ type: "PRIVAI_GET_STATE" });
  if (!state?.token) {
    msg.textContent = "Connect to the dashboard first.";
    return;
  }
  msg.textContent = "Starting task via dashboard API...";
  try {
    // Extension triggers task creation using a short-lived flow:
    // user should run from dashboard for full JWT auth. Here we observe locally as feedback.
    const obs = await chrome.runtime.sendMessage({ type: "PRIVAI_RUN_LOCAL" });
    if (!obs?.ok) throw new Error(obs?.error || "Observe failed");
    const count = obs.observation?.elements?.length ?? 0;
    const redacted = obs.observation?.privacy?.redacted_fields ?? 0;
    msg.textContent = `Observed ${count} elements locally (${redacted} redacted). Run the full agent from the dashboard Agent console.`;
  } catch (err) {
    msg.textContent = err instanceof Error ? err.message : String(err);
  }
});

document.getElementById("privacy-btn")!.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("settings-btn")!.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("stop-btn")!.addEventListener("click", () => {
  document.getElementById("run-msg")!.textContent = "Stop requested — manage running tasks from the dashboard.";
});

document.getElementById("pause-btn")!.addEventListener("click", () => {
  document.getElementById("run-msg")!.textContent = "Pause requested — manage running tasks from the dashboard.";
});

void refresh();
