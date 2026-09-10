export function generateId(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function generatePairingCode(length = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export const RESTRICTED_URL_PATTERNS = [
  /^chrome:\/\//i,
  /^chrome-extension:\/\//i,
  /^edge:\/\//i,
  /^about:/i,
  /^devtools:\/\//i,
  /^view-source:/i,
  /^chrome-search:\/\//i,
  /^brave:\/\//i,
];

export function isRestrictedUrl(url: string): boolean {
  return RESTRICTED_URL_PATTERNS.some((re) => re.test(url));
}

export function truncate(text: string, max = 500): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export const WS_EVENTS = {
  STATUS: "agent:status",
  ACTIVITY: "agent:activity",
  PRIVACY: "agent:privacy",
  PLAN: "agent:plan",
  APPROVAL: "agent:approval",
  RESULT: "agent:result",
  BROWSER_STATE: "agent:browser_state",
  OBSERVE_REQUEST: "browser:observe",
  EXECUTE_REQUEST: "browser:execute",
  OPEN_TAB_REQUEST: "browser:open_tab",
  TAB_CLOSED: "browser:tab_closed",
  CONNECTION: "browser:connection",
  TASK_UPDATE: "task:update",
  CONTROL: "agent:control",
} as const;

const SITE_HOME: Record<string, string> = {
  amazon: "https://www.amazon.in",
  flipkart: "https://www.flipkart.com",
  myntra: "https://www.myntra.com",
  linkedin: "https://www.linkedin.com",
  google: "https://www.google.com",
  youtube: "https://www.youtube.com",
  github: "https://github.com",
  wikipedia: "https://en.wikipedia.org",
  makemytrip: "https://www.makemytrip.com",
  booking: "https://www.booking.com",
  irctc: "https://www.irctc.co.in/nget/train-search",
  expedia: "https://www.expedia.co.in",
};

const COMMAND_FILLER =
  /\b(?:amazon(?:\.in)?|flipkart|myntra|youtube|youtu\.be|google|linkedin|github|wikipedia|makemytrip|booking|irctc|expedia|open|go\s*to|navigate\s*to|visit|search(?:\s*for)?|find|look\s*for|play|buy|purchase|order|book|kharid|laga(?:\s*de)?|chala(?:\s*de)?|please|pls|jaruri|zaruri)\b/gi;

const HINGLISH_FILLER =
  /\b(?:jaa?\s*ke|jak(?:e|ar)?|jaao|jakar|me(?:in)?|mein|pe|par|se|ko|ke|ki|ka|andar|kiya|kar(?:o|na|do|de)?|kardo|karde|koi|kuch|yeh?|yah(?:a|an)?|woh|vo|bhi|toh|to|do|de|and|the|a|an|from|on|in|for|with|some|any)\b/gi;

const TYPOS: Array<[RegExp, string]> = [
  [/\bjeanse\b/gi, "jeans"],
  [/\bjense\b/gi, "jeans"],
  [/\blaptap\b/gi, "laptop"],
  [/\bheadphonee?s?\b/gi, "headphones"],
  [/\bmoblie\b/gi, "mobile"],
  [/\byoutub\b/gi, "youtube"],
  [/\btrian\b/gi, "train"],
];

function applyTypos(text: string): string {
  let out = text;
  for (const [re, to] of TYPOS) out = out.replace(re, to);
  return out;
}

function tidySpaces(text: string): string {
  return text.replace(/[.!?]+$/g, "").replace(/\s+/g, " ").trim();
}

/** Strip site/command filler words so search boxes get a clean query. */
export function extractSearchQuery(goal: string): string {
  const raw = applyTypos(goal.trim());

  const quoted = raw.match(/["“']([^"”']+)["”']/);
  if (quoted?.[1]) return tidySpaces(applyTypos(quoted[1]));

  // Hinglish price-first: "1000 ke andar ka black jeans order kar de"
  const hindiPriceFirst = raw.match(
    /₹?\s*(\d[\d,]*)\s*(?:ke\s*)?(?:andar|under|se\s*kam)\s*(?:ka|ki|ke)?\s*(.+)$/i,
  );
  if (hindiPriceFirst) {
    const product = tidySpaces(
      applyTypos(
        hindiPriceFirst[2]!.replace(COMMAND_FILLER, " ").replace(HINGLISH_FILLER, " "),
      ),
    );
    if (product.length >= 3) {
      return `${product} under ${hindiPriceFirst[1]!.replace(/,/g, "")}`;
    }
  }

  // "black jeans under 1000" / "laptop below 60000"
  const productUnderPrice = raw.match(
    /([A-Za-z][A-Za-z0-9+.\- ]{1,50}?)\s+(?:under|below|upto|up\s*to|se\s*kam|<)\s*₹?\s*(\d[\d,]*)/i,
  );
  if (productUnderPrice) {
    const product = tidySpaces(
      applyTypos(productUnderPrice[1]!.replace(COMMAND_FILLER, " ").replace(HINGLISH_FILLER, " ")),
    );
    if (product.length >= 3) return `${product} under ${productUnderPrice[2]!.replace(/,/g, "")}`;
  }

  // "under 1000 black jeans" / "1000 under black jeans"
  const priceThenProduct = raw.match(
    /(?:under|below|upto|up\s*to)?\s*₹?\s*(\d[\d,]*)\s*(?:under|below|rs\.?|rupees?)?\s*(.+)$/i,
  );
  if (priceThenProduct) {
    let product = priceThenProduct[2]!;
    product = product.replace(COMMAND_FILLER, " ").replace(HINGLISH_FILLER, " ");
    product = tidySpaces(applyTypos(product));
    if (product.length >= 3) return `${product} under ${priceThenProduct[1]!.replace(/,/g, "")}`;
  }

  // Song-style: keep title-ish remainder after removing commands
  let q = raw;
  q = q.replace(COMMAND_FILLER, " ");
  q = q.replace(HINGLISH_FILLER, " ");
  q = tidySpaces(applyTypos(q));

  // "1000 under black jeans" after cleanup
  const reorder = q.match(/^(\d[\d,]*)\s+under\s+(.+)$/i);
  if (reorder) return `${tidySpaces(reorder[2]!)} under ${reorder[1]!.replace(/,/g, "")}`;

  const reorder2 = q.match(/^under\s+(\d[\d,]*)\s+(.+)$/i);
  if (reorder2) return `${tidySpaces(reorder2[2]!)} under ${reorder2[1]!.replace(/,/g, "")}`;

  return q || tidySpaces(raw);
}

/** True if a URL search param still contains command gibberish. */
export function isDirtySearchQuery(query: string): boolean {
  return /\b(jake|jaake|jakar|koi|kar|karo|karna|me|mein|pe|youtube|amazon)\b/i.test(query);
}

export function isMusicGoal(goal: string): boolean {
  return (
    /\byoutube\b|youtu\.be/i.test(goal) ||
    /\b(gana|gaana|song|music|video)\b/i.test(goal) ||
    /\b(play|laga\s*de|chala\s*de)\b/i.test(goal)
  );
}

export function isShoppingGoal(goal: string): boolean {
  return (
    /\b(amazon|flipkart|myntra)\b/i.test(goal) ||
    /\b(buy|purchase|order|kharid|cart|checkout|shopping|jeans|shirt|shoes)\b/i.test(goal) ||
    /\b(laptop|headphones|phone|mobile|earbud|shoes|watch|tablet)\b/i.test(goal)
  );
}

export function isBuyGoal(goal: string): boolean {
  return /\b(buy|purchase|order|kharid|add to cart|checkout)\b/i.test(goal);
}

export function isPlayGoal(goal: string): boolean {
  return /\b(play|laga\s*de|chala\s*de|gana|gaana|song|music|video|suna|chalao|bajao)\b/i.test(goal);
}

export function isTravelGoal(goal: string): boolean {
  return /\b(flight|plane|air ticket|train|rail|irctc|hotel|room|stay|makemytrip|booking\.com)\b/i.test(
    applyTypos(goal),
  );
}

/** Infer a real start URL for a natural-language goal (opens in a new Chrome tab). */
export function inferStartUrl(goal: string): string {
  const normalizedGoal = applyTypos(goal);
  const query = extractSearchQuery(normalizedGoal);

  const site =
    normalizedGoal.match(/\b(?:open|go to|navigate to|visit)\s+([a-z0-9.-]+\.[a-z]{2,})\b/i) ||
    normalizedGoal.match(
      /\b(amazon|flipkart|myntra|linkedin|google|youtube|github|wikipedia|makemytrip|booking|irctc|expedia)\b/i,
    );

  if (site) {
    const raw = site[1]!.toLowerCase();
    // YouTube: open HOME so the agent can visibly move cursor → type → click play
    if (raw === "youtube" || raw.includes("youtu")) {
      return "https://www.youtube.com/";
    }
    if (raw === "amazon") {
      return `https://www.amazon.in/s?k=${encodeURIComponent(query)}`;
    }
    if (raw === "flipkart") {
      return `https://www.flipkart.com/search?q=${encodeURIComponent(query)}`;
    }
    if (raw === "makemytrip") return "https://www.makemytrip.com/flights/";
    if (raw === "irctc") return SITE_HOME.irctc!;
    if (raw === "booking") return SITE_HOME.booking!;
    if (SITE_HOME[raw]) return SITE_HOME[raw]!;
    if (raw.includes(".")) return `https://${raw}`;
  }

  if (isMusicGoal(normalizedGoal)) {
    return "https://www.youtube.com/";
  }
  if (isShoppingGoal(normalizedGoal)) {
    return `https://www.amazon.in/s?k=${encodeURIComponent(query)}`;
  }
  if (/\b(train|rail|irctc)\b/i.test(normalizedGoal)) {
    return SITE_HOME.irctc!;
  }
  if (/\b(hotel|room|stay|booking\.com)\b/i.test(normalizedGoal)) {
    return SITE_HOME.booking!;
  }
  if (/\b(flight|plane|air ticket)\b/i.test(normalizedGoal)) {
    return "https://www.makemytrip.com/flights/";
  }

  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export type WsEvent = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];
