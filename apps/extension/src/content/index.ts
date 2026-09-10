import { redactObservation, defaultPiiDetector } from "@privai/privacy";
import type { PageObservation } from "@privai/schemas";
import { observePage } from "./dom";
import { executePlan } from "./executor";
import type { ActionPlan } from "@privai/schemas";

async function getPrivacyOptions() {
  const stored = await chrome.storage.local.get(["privacyOptions"]);
  return (
    stored.privacyOptions || {
      redactEmails: true,
      redactPhones: true,
      redactCards: true,
      redactSecrets: true,
    }
  );
}

export async function observeAndRedact(): Promise<PageObservation> {
  const raw = observePage();
  const options = await getPrivacyOptions();
  const { observation } = redactObservation(raw, options, defaultPiiDetector);
  return observation;
}

declare global {
  interface Window {
    __privaiContentListenerInstalled?: boolean;
  }
}

if (!window.__privaiContentListenerInstalled) {
  window.__privaiContentListenerInstalled = true;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void (async () => {
      try {
        if (message?.type === "PRIVAI_OBSERVE") {
          const observation = await observeAndRedact();
          sendResponse({ ok: true, observation });
          return;
        }
        if (message?.type === "PRIVAI_EXECUTE") {
          const plan = message.plan as ActionPlan;
          const results = await executePlan(plan);
          sendResponse({ ok: true, results });
          return;
        }
        if (message?.type === "PRIVAI_PING") {
          sendResponse({
            ok: true,
            url: location.href,
            title: document.title,
            restricted: observationRestricted(),
          });
          return;
        }
        sendResponse({ ok: false, error: "Unknown message" });
      } catch (err) {
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return true; // async
  });
}

function observationRestricted(): boolean {
  return /^(chrome|chrome-extension|edge|about|devtools):/i.test(location.href);
}

console.info("[Light] Content script ready — local perception active");
