import { DEFAULT_API_URL } from "../config";

async function load() {
  const data = await chrome.storage.local.get(["privacyOptions", "apiUrl"]);
  const opts = data.privacyOptions || {
    redactEmails: true,
    redactPhones: true,
    redactCards: true,
    redactSecrets: true,
  };
  (document.getElementById("redactEmails") as HTMLInputElement).checked = opts.redactEmails !== false;
  (document.getElementById("redactPhones") as HTMLInputElement).checked = opts.redactPhones !== false;
  (document.getElementById("redactCards") as HTMLInputElement).checked = opts.redactCards !== false;
  (document.getElementById("redactSecrets") as HTMLInputElement).checked = opts.redactSecrets !== false;
  (document.getElementById("apiUrl") as HTMLInputElement).value = data.apiUrl || DEFAULT_API_URL;
}

document.getElementById("save")!.addEventListener("click", async () => {
  const privacyOptions = {
    redactEmails: (document.getElementById("redactEmails") as HTMLInputElement).checked,
    redactPhones: (document.getElementById("redactPhones") as HTMLInputElement).checked,
    redactCards: (document.getElementById("redactCards") as HTMLInputElement).checked,
    redactSecrets: (document.getElementById("redactSecrets") as HTMLInputElement).checked,
  };
  const apiUrl = (document.getElementById("apiUrl") as HTMLInputElement).value.trim();
  await chrome.storage.local.set({ privacyOptions, apiUrl });
  document.getElementById("msg")!.textContent = "Saved. Local redaction rules updated.";
});

void load();
