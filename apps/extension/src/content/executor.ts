import type { ActionResult, AgentAction, ActionPlan } from "@privai/schemas";
import { getElementById, waitForDomSettled } from "./dom";
import { clearHud, moveCursorTo, pulseClick } from "./hud";

function resolve(elId?: string): HTMLElement {
  if (!elId) throw new Error("Missing element_id");
  const el = getElementById(elId);
  if (!el) throw new Error(`Element ${elId} no longer in DOM — will re-observe`);
  return el as HTMLElement;
}

function setNativeInputValue(el: HTMLElement, value: string) {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(
      new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText", data: value }),
    );
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  if (el.isContentEditable) {
    el.textContent = value;
    el.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }
}

function clientPoint(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

/** LIGHT-style pointer + mouse event chain (React/Vue friendly). */
async function syntheticClick(el: HTMLElement) {
  const { x, y } = clientPoint(el);
  const opts: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
    button: 0,
  };

  el.focus({ preventScroll: true });
  el.dispatchEvent(new PointerEvent("pointerdown", { ...opts, pointerId: 1, pointerType: "mouse" }));
  el.dispatchEvent(new MouseEvent("mousedown", opts));
  await pulseClick();
  el.dispatchEvent(new PointerEvent("pointerup", { ...opts, pointerId: 1, pointerType: "mouse" }));
  el.dispatchEvent(new MouseEvent("mouseup", opts));

  // Defer the actual click until after the message response can reach the
  // service worker. Immediate link/form navigation destroys the content
  // script context and previously caused a 30s action timeout.
  window.setTimeout(() => {
    try {
      if (el instanceof HTMLVideoElement && el.paused) {
        void el.play().catch(() => el.click());
      } else {
        el.click();
      }
    } catch {
      /* ignore */
    }
  }, 100);
}

async function typeLikeHuman(el: HTMLElement, text: string) {
  el.focus({ preventScroll: true });
  setNativeInputValue(el, "");
  let built = "";
  for (const char of text) {
    built += char;
    el.dispatchEvent(
      new KeyboardEvent("keydown", { key: char, bubbles: true, cancelable: true }),
    );
    setNativeInputValue(el, built);
    el.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 18));
  }
}

function submitNearestForm(el: HTMLElement) {
  const form = (el as HTMLInputElement).form || el.closest("form");
  if (form) {
    if (typeof form.requestSubmit === "function") {
      try {
        form.requestSubmit();
        return true;
      } catch {
        /* fall through */
      }
    }
    const submitBtn = form.querySelector(
      'input[type="submit"], button[type="submit"], #nav-search-submit-button, [aria-label*="search" i]',
    ) as HTMLElement | null;
    if (submitBtn) {
      submitBtn.click();
      return true;
    }
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    return true;
  }
  const globalBtn = document.querySelector(
    '#nav-search-submit-button, button[type="submit"], input[type="submit"]',
  ) as HTMLElement | null;
  if (globalBtn) {
    globalBtn.click();
    return true;
  }
  return false;
}

async function aim(el: HTMLElement, label: string) {
  await moveCursorTo(el, label);
}

async function executeOne(action: AgentAction, index: number): Promise<ActionResult> {
  const start = performance.now();
  try {
    switch (action.type) {
      case "click": {
        const el = resolve(action.element_id);
        await aim(el, "CLICK");
        await syntheticClick(el);
        clearHud();
        break;
      }
      case "double_click": {
        const el = resolve(action.element_id);
        await aim(el, "DOUBLE CLICK");
        window.setTimeout(() => {
          el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
        }, 100);
        clearHud();
        break;
      }
      case "type": {
        const el = resolve(action.element_id);
        await aim(el, "TYPE");
        await typeLikeHuman(el, action.text || "");
        clearHud();
        break;
      }
      case "clear": {
        const el = resolve(action.element_id);
        await aim(el, "CLEAR");
        el.focus();
        setNativeInputValue(el, "");
        clearHud();
        break;
      }
      case "select": {
        const el = resolve(action.element_id) as HTMLSelectElement;
        await aim(el, "SELECT");
        if (action.value !== undefined) {
          el.value = String(action.value);
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
        clearHud();
        break;
      }
      case "checkbox":
      case "radio": {
        const el = resolve(action.element_id) as HTMLInputElement;
        await aim(el, action.type.toUpperCase());
        const desired = action.value === undefined ? true : Boolean(action.value);
        if (el.checked !== desired) await syntheticClick(el);
        clearHud();
        break;
      }
      case "scroll": {
        const amount = action.amount ?? 400;
        const dir = action.direction || "down";
        const dx = dir === "left" ? -amount : dir === "right" ? amount : 0;
        const dy = dir === "up" ? -amount : dir === "down" ? amount : 0;
        window.scrollBy({ left: dx, top: dy, behavior: "smooth" });
        break;
      }
      case "hover": {
        const el = resolve(action.element_id);
        await aim(el, "HOVER");
        const { x, y } = clientPoint(el);
        el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: x, clientY: y }));
        el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true, clientX: x, clientY: y }));
        clearHud();
        break;
      }
      case "focus": {
        const el = resolve(action.element_id);
        await aim(el, "FOCUS");
        el.focus();
        clearHud();
        break;
      }
      case "press_key": {
        const key = action.key || "Enter";
        const target = action.element_id
          ? resolve(action.element_id)
          : (document.activeElement as HTMLElement) || document.body;
        if (action.element_id) await aim(target, `KEY ${key}`);
        window.setTimeout(() => {
          target.focus({ preventScroll: true });
          target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
          target.dispatchEvent(new KeyboardEvent("keypress", { key, bubbles: true, cancelable: true }));
          target.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true }));
          if (key === "Enter") submitNearestForm(target);
        }, 100);
        clearHud();
        break;
      }
      case "submit": {
        const el = resolve(action.element_id);
        await aim(el, "SUBMIT");
        const form = el instanceof HTMLFormElement ? el : el.closest("form");
        if (!form) throw new Error("No form to submit");
        window.setTimeout(() => {
          if (form.requestSubmit) form.requestSubmit();
          else form.submit();
        }, 100);
        clearHud();
        break;
      }
      case "navigate": {
        if (!action.url) throw new Error("navigate requires url");
        if (action.url !== location.href) {
          location.assign(action.url);
        }
        break;
      }
      case "back":
        history.back();
        break;
      case "forward":
        history.forward();
        break;
      case "wait":
        await new Promise((r) => setTimeout(r, action.wait_ms || 500));
        break;
      case "extract_text": {
        const el = resolve(action.element_id);
        await aim(el, "EXTRACT");
        clearHud();
        return {
          actionIndex: index,
          type: action.type,
          success: true,
          extractedText: (el.innerText || el.textContent || "").trim().slice(0, 2000),
          durationMs: performance.now() - start,
        };
      }
      case "inspect_element": {
        const el = resolve(action.element_id);
        return {
          actionIndex: index,
          type: action.type,
          success: true,
          extractedText: JSON.stringify({
            tag: el.tagName,
            text: (el.textContent || "").trim().slice(0, 200),
          }),
          durationMs: performance.now() - start,
        };
      }
      case "open_tab":
      case "close_tab":
        return {
          actionIndex: index,
          type: action.type,
          success: true,
          durationMs: performance.now() - start,
        };
      case "ask_user":
      case "finish":
      case "fail":
        return {
          actionIndex: index,
          type: action.type,
          success: true,
          durationMs: performance.now() - start,
        };
      default:
        throw new Error(`Unsupported action type: ${(action as AgentAction).type}`);
    }

    const mayNavigate =
      action.type === "click" ||
      action.type === "double_click" ||
      action.type === "submit" ||
      (action.type === "press_key" && (action.key || "Enter") === "Enter");
    if (!mayNavigate) {
      await waitForDomSettled(800);
    }

    return {
      actionIndex: index,
      type: action.type,
      success: true,
      pageChanged: ["click", "navigate", "submit", "press_key", "back", "forward"].includes(action.type),
      durationMs: performance.now() - start,
      confidence: action.confidence,
    };
  } catch (err) {
    clearHud(200);
    return {
      actionIndex: index,
      type: action.type,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: performance.now() - start,
    };
  }
}

export async function executePlan(plan: ActionPlan): Promise<ActionResult[]> {
  const results: ActionResult[] = [];
  for (let i = 0; i < plan.actions.length; i++) {
    const action = plan.actions[i]!;
    const blob = JSON.stringify(action);
    if (/\beval\s*\(|new\s+Function\s*\(|javascript:/i.test(blob)) {
      results.push({
        actionIndex: i,
        type: action.type,
        success: false,
        error: "Rejected: potential code injection",
      });
      break;
    }
    const result = await executeOne(action, i);
    results.push(result);
    if (!result.success && action.type !== "wait") {
      break;
    }
    // Navigation destroys the content-script message channel. Return the
    // result immediately and let the agent re-observe the new page.
    if (
      action.type === "click" ||
      action.type === "double_click" ||
      action.type === "submit" ||
      (action.type === "press_key" && (action.key || "Enter") === "Enter")
    ) {
      break;
    }
  }
  return results;
}
