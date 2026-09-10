import { isRestrictedUrl } from "@privai/shared";
import type { FormInfo, PageObservation, UIElement } from "@privai/schemas";

const PRIORITY_SELECTOR = [
  // YouTube results / player (must be observed first — nav links otherwise fill the cap)
  "ytd-video-renderer a#video-title",
  "ytd-playlist-video-renderer a#video-title",
  "ytd-rich-item-renderer a#video-title-link",
  "ytd-compact-video-renderer a.yt-simple-endpoint",
  'a[href*="/watch?v="]',
  "button.ytp-large-play-button",
  ".ytp-play-button",
  "#movie_player video",
  "video",
  "input#search",
  'input[name="search_query"]',
  // Amazon
  "#add-to-cart-button",
  "#buy-now-button",
  "#nav-search-submit-button",
  "#twotabsearchtextbox",
  "div[data-component-type='s-search-result'] h2 a",
  ".s-title-instructions-style a",
  // Travel booking controls (keep above generic navigation links)
  "[data-cy='flights']",
  "a[href*='/flights']",
  "input#fromCity",
  "input#toCity",
  "[data-cy='fromCity']",
  "[data-cy='toCity']",
  "[data-cy='submit']",
  ".listingCard",
  "#origin",
  "#destination",
  "#journeyDate",
  "#searchBtn",
  ".ui-autocomplete-input",
  ".train-heading",
  ".availablity",
  "input[name='ss']",
  "input#ss",
  "input[placeholder*='From' i]",
  "input[placeholder*='To' i]",
  "input[placeholder*='Journey Date' i]",
  "input[placeholder*='Where are you going' i]",
  "[data-testid='destination-container'] input",
  "[data-testid='searchbox-dates-container']",
  "[data-testid='searchbox-searchbutton']",
  "[data-testid='property-card']",
  "[data-testid='availability-cta']",
  "button[data-testid='date-display-field-start']",
  "button[data-testid='date-display-field-end']",
  "button[type='submit']",
  "[role='option']",
  "[aria-label*='departure' i]",
  "[aria-label*='check-in' i]",
  "[aria-label*='check-out' i]",
].join(",");

const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "[role='button']",
  "[role='link']",
  "[role='textbox']",
  "[role='searchbox']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='tab']",
  "[role='menuitem']",
  "[role='option']",
  "[role='switch']",
  "[role='combobox']",
  "[contenteditable='true']",
  "[onclick]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

let cycleCounter = 0;
const elementMap = new Map<string, WeakRef<Element>>();
const strongMap = new Map<string, Element>();

export function getElementById(id: string): Element | null {
  const strong = strongMap.get(id);
  if (strong && document.contains(strong)) return strong;
  const ref = elementMap.get(id);
  const el = ref?.deref() || null;
  if (el && document.contains(el)) return el;
  return null;
}

export function clearElementMaps() {
  elementMap.clear();
  strongMap.clear();
}

function isVisible(el: Element): boolean {
  const html = el as HTMLElement;
  if (!html.getBoundingClientRect) return false;
  const style = window.getComputedStyle(html);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }
  const rect = html.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  if (rect.bottom < 0 || rect.right < 0 || rect.top > document.documentElement.clientHeight) {
    // partially offscreen still may be interactive — keep if any intersection
    if (rect.bottom < -50 || rect.top > window.innerHeight + 50) return false;
  }
  return true;
}

function detectType(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute("role") || "";
  if (tag === "a") return "link";
  if (tag === "button" || role === "button") return "button";
  if (tag === "select" || role === "listbox" || role === "combobox") return "dropdown";
  if (tag === "textarea" || role === "textbox") return "input";
  if (tag === "input") {
    const type = (el as HTMLInputElement).type || "text";
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (type === "submit" || type === "button") return "button";
    return "input";
  }
  if (role === "tab") return "tab";
  if (role === "menuitem") return "menu";
  if (role === "dialog" || tag === "dialog") return "dialog";
  return tag;
}

function textOf(el: Element): string {
  const aria = el.getAttribute("aria-label");
  if (aria) return aria.trim().slice(0, 200);
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return (el.labels?.[0]?.innerText || el.placeholder || el.name || "").trim().slice(0, 200);
  }
  const text = (el.textContent || "").replace(/\s+/g, " ").trim();
  return text.slice(0, 200);
}

function detectCaptcha(doc: Document): boolean {
  const hay = `${doc.body?.innerText || ""} ${doc.documentElement.innerHTML.slice(0, 50000)}`.toLowerCase();
  return (
    hay.includes("captcha") ||
    hay.includes("recaptcha") ||
    hay.includes("hcaptcha") ||
    !!doc.querySelector("iframe[src*='recaptcha'], iframe[src*='hcaptcha'], .g-recaptcha")
  );
}

function extractForms(doc: Document, idFor: (el: Element) => string): FormInfo[] {
  return [...doc.querySelectorAll("form")].slice(0, 20).map((form) => {
    const fields = [...form.querySelectorAll("input, select, textarea")]
      .slice(0, 40)
      .map((field) => {
        const input = field as HTMLInputElement;
        return {
          elementId: idFor(field),
          label: input.labels?.[0]?.innerText?.trim() || input.getAttribute("aria-label") || undefined,
          name: input.name || undefined,
          inputType: input.type || field.tagName.toLowerCase(),
          required: input.required || undefined,
          value: input.type === "password" ? undefined : input.value || undefined,
        };
      });
    return {
      id: idFor(form),
      action: form.getAttribute("action") || undefined,
      method: form.method || undefined,
      fields,
    };
  });
}

export function observePage(): PageObservation {
  cycleCounter += 1;
  clearElementMaps();

  const url = location.href;
  if (isRestrictedUrl(url)) {
    return {
      url,
      title: document.title,
      elements: [],
      forms: [],
      restricted: true,
      restriction_reason:
        "This page cannot be automated because the browser does not allow extension access.",
      timestamp: Date.now(),
      observation_id: `obs_${cycleCounter}_${Date.now()}`,
    };
  }

  let seq = 0;
  const assignId = (el: Element): string => {
    const existing = [...strongMap.entries()].find(([, v]) => v === el)?.[0];
    if (existing) return existing;
    seq += 1;
    const id = `element_${cycleCounter}_${seq}`;
    strongMap.set(id, el);
    elementMap.set(id, new WeakRef(el));
    (el as HTMLElement).dataset.privaiId = id;
    return id;
  };

  const priorityNodes = [...document.querySelectorAll(PRIORITY_SELECTOR)];
  const otherNodes = [...document.querySelectorAll(INTERACTIVE_SELECTOR)];
  const nodes = [...priorityNodes, ...otherNodes];
  // Also walk open shadow roots shallowly
  const withShadow: Element[] = [];
  for (const el of nodes) {
    withShadow.push(el);
  }
  document.querySelectorAll("*").forEach((el) => {
    const root = (el as HTMLElement).shadowRoot;
    if (root) {
      root.querySelectorAll(PRIORITY_SELECTOR).forEach((child) => withShadow.push(child));
      root.querySelectorAll(INTERACTIVE_SELECTOR).forEach((child) => withShadow.push(child));
    }
  });

  const elements: UIElement[] = [];
  const seen = new Set<Element>();

  for (const el of withShadow) {
    if (seen.has(el)) continue;
    seen.add(el);
    if (!(el instanceof HTMLElement)) continue;
    const visible = isVisible(el);
    if (!visible && elements.length > 5) continue;

    const rect = el.getBoundingClientRect();
    const input = el as HTMLInputElement;
    const id = assignId(el);

    elements.push({
      id,
      type: detectType(el),
      role: el.getAttribute("role") || undefined,
      tagName: el.tagName.toLowerCase(),
      text: textOf(el),
      ariaLabel: el.getAttribute("aria-label") || undefined,
      name: input.name || undefined,
      placeholder: input.placeholder || undefined,
      value:
        input.type === "password"
          ? undefined
          : input.value !== undefined && "value" in input
            ? String(input.value).slice(0, 200)
            : undefined,
      href: el instanceof HTMLAnchorElement ? el.href : undefined,
      inputType: input.type || undefined,
      autocomplete: input.autocomplete || undefined,
      bounds: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      visible,
      enabled: !input.disabled && el.getAttribute("aria-disabled") !== "true",
      interactive: true,
      confidence: visible ? 0.92 : 0.55,
    });

    if (elements.length >= 200) break;
  }

  const visible_text = (document.body?.innerText || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 6000);

  const forms = extractForms(document, assignId);
  const media = document.querySelector("video") as HTMLVideoElement | null;

  return {
    url,
    title: document.title,
    page_description: document.querySelector('meta[name="description"]')?.getAttribute("content") || undefined,
    elements,
    forms,
    visible_text,
    current_state: document.readyState,
    media_state: media
      ? {
          present: true,
          playing: !media.paused && !media.ended,
          paused: media.paused,
          current_time: Number.isFinite(media.currentTime) ? media.currentTime : 0,
          duration: Number.isFinite(media.duration) ? media.duration : undefined,
        }
      : undefined,
    captcha_detected: detectCaptcha(document),
    restricted: false,
    timestamp: Date.now(),
    observation_id: `obs_${cycleCounter}_${Date.now()}`,
  };
}

/** Wait for DOM mutations to settle (SPA / dynamic content). */
export function waitForDomSettled(timeoutMs = 1500): Promise<void> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout>;
    const done = () => {
      observer.disconnect();
      resolve();
    };
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(done, 250);
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    timer = setTimeout(done, timeoutMs);
  });
}
