/**
 * LIGHT-style on-page HUD: animated cursor + target highlight.
 * Shows the agent physically moving to elements before acting.
 */

const ROOT_ID = "privai-hud-root";
const CURSOR_ID = "privai-agent-cursor";
const BOX_ID = "privai-action-box";
const LABEL_ID = "privai-action-label";

let cursorPos = { x: 24, y: 24 };

function ensureStyles() {
  if (document.getElementById("privai-hud-styles")) return;
  const style = document.createElement("style");
  style.id = "privai-hud-styles";
  style.textContent = `
    #${ROOT_ID} {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 2147483646;
      overflow: hidden;
    }
    #${CURSOR_ID} {
      position: fixed;
      width: 28px;
      height: 28px;
      margin-left: -2px;
      margin-top: -2px;
      z-index: 2147483647;
      pointer-events: none;
      transition: left 0.45s cubic-bezier(0.22, 1, 0.36, 1), top 0.45s cubic-bezier(0.22, 1, 0.36, 1);
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.45));
    }
    #${CURSOR_ID}.privai-clicking {
      transform: scale(0.85);
      transition: left 0.45s cubic-bezier(0.22, 1, 0.36, 1), top 0.45s cubic-bezier(0.22, 1, 0.36, 1), transform 0.12s ease;
    }
    #${BOX_ID} {
      position: absolute;
      border: 2px solid #22d3ee;
      border-radius: 10px;
      background: rgba(34, 211, 238, 0.12);
      box-shadow: 0 0 0 9999px rgba(2, 8, 23, 0.28), 0 0 24px rgba(34, 211, 238, 0.45);
      transition: opacity 0.35s ease;
      pointer-events: none;
    }
    #${BOX_ID}.privai-fade-out { opacity: 0; }
    #${LABEL_ID} {
      position: absolute;
      left: 0;
      top: -30px;
      white-space: nowrap;
      font: 600 12px/1.2 ui-sans-serif, system-ui, sans-serif;
      color: #ecfeff;
      background: linear-gradient(135deg, #0891b2, #6366f1);
      padding: 5px 10px;
      border-radius: 999px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.35);
    }
  `;
  document.documentElement.appendChild(style);
}

function ensureRoot(): HTMLElement {
  ensureStyles();
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = ROOT_ID;
    document.documentElement.appendChild(root);
  }
  return root;
}

function ensureCursor(): HTMLElement {
  const root = ensureRoot();
  let cursor = document.getElementById(CURSOR_ID);
  if (!cursor) {
    cursor = document.createElement("div");
    cursor.id = CURSOR_ID;
    cursor.innerHTML = `
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5.5 3.5L19 12.2L12.4 13.7L9.8 20.5L5.5 3.5Z" fill="#22d3ee" stroke="#0e7490" stroke-width="1.2" stroke-linejoin="round"/>
      </svg>
    `;
    cursor.style.left = `${cursorPos.x}px`;
    cursor.style.top = `${cursorPos.y}px`;
    root.appendChild(cursor);
  }
  return cursor;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function moveCursorTo(el: HTMLElement, label: string): Promise<{ x: number; y: number }> {
  el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  await sleep(280);

  const root = ensureRoot();
  const cursor = ensureCursor();
  const rect = el.getBoundingClientRect();
  const x = rect.left + Math.min(Math.max(rect.width / 2, 8), rect.width - 8);
  const y = rect.top + Math.min(Math.max(rect.height / 2, 8), rect.height - 8);

  // Highlight box
  let box = document.getElementById(BOX_ID);
  if (box) box.remove();
  box = document.createElement("div");
  box.id = BOX_ID;
  box.style.left = `${rect.left + window.scrollX - 4}px`;
  box.style.top = `${rect.top + window.scrollY - 4}px`;
  box.style.width = `${Math.max(rect.width + 8, 24)}px`;
  box.style.height = `${Math.max(rect.height + 8, 24)}px`;

  const tag = document.createElement("div");
  tag.id = LABEL_ID;
  tag.textContent = `Light · ${label}`;
  box.appendChild(tag);
  root.appendChild(box);

  // Animate cursor
  cursor.style.left = `${x}px`;
  cursor.style.top = `${y}px`;
  cursorPos = { x, y };
  await sleep(480);

  return { x, y };
}

export async function pulseClick() {
  const cursor = ensureCursor();
  cursor.classList.add("privai-clicking");
  await sleep(120);
  cursor.classList.remove("privai-clicking");
}

export function clearHud(delayMs = 700) {
  const box = document.getElementById(BOX_ID);
  if (!box) return;
  box.classList.add("privai-fade-out");
  setTimeout(() => box.remove(), delayMs);
}

export function hideCursor() {
  document.getElementById(CURSOR_ID)?.remove();
  document.getElementById(BOX_ID)?.remove();
}
