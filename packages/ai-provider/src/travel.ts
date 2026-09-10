import { ActionPlanSchema, type ActionPlan, type AgentContext, type UIElement } from "@privai/schemas";

export type TravelKind = "flight" | "train" | "hotel";

export interface TravelRequest {
  kind: TravelKind;
  origin?: string;
  destination?: string;
  departureDate?: string;
  returnDate?: string;
  adults: number;
  travelClass?: string;
}

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDates(goal: string, nowMs: number): string[] {
  const dates: string[] = [];
  const now = new Date(nowMs);
  now.setHours(12, 0, 0, 0);
  const lower = goal.toLowerCase();

  if (/\bday after tomorrow\b|\bparso(?:n)?\b/i.test(lower)) {
    const date = new Date(now);
    date.setDate(date.getDate() + 2);
    dates.push(isoDate(date));
  } else if (/\btomorrow\b|\bkal\b/i.test(lower)) {
    const date = new Date(now);
    date.setDate(date.getDate() + 1);
    dates.push(isoDate(date));
  } else if (/\btoday\b|\baaj\b/i.test(lower)) {
    dates.push(isoDate(now));
  }

  const numeric = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/g;
  for (const match of goal.matchAll(numeric)) {
    let year = match[3] ? Number(match[3]) : now.getFullYear();
    if (year < 100) year += 2000;
    const date = new Date(year, Number(match[2]) - 1, Number(match[1]), 12);
    if (!match[3] && date.getTime() < now.getTime()) date.setFullYear(year + 1);
    dates.push(isoDate(date));
  }

  const named =
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{4}))?\b/gi;
  for (const match of goal.matchAll(named)) {
    const month = MONTHS[match[2]!.toLowerCase()];
    if (month === undefined) continue;
    let year = match[3] ? Number(match[3]) : now.getFullYear();
    const date = new Date(year, month, Number(match[1]), 12);
    if (!match[3] && date.getTime() < now.getTime()) date.setFullYear(year + 1);
    dates.push(isoDate(date));
  }

  return [...new Set(dates)];
}

function cleanCity(value: string): string {
  return value
    .replace(/\b(?:makemytrip|irctc|booking\.com|booking)\b/gi, " ")
    .replace(/\b(?:flight|train|rail|ticket|hotel|room)\b/gi, " ")
    .replace(/\b(?:book|booking|search|find|chahiye|kar(?:o|na|do|de)?|kardo|karde)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[,.-]+|[,.-]+$/g, "");
}

export function parseTravelRequest(goal: string, nowMs = Date.now()): TravelRequest | null {
  const kind: TravelKind | null = /\b(train|rail|irctc)\b/i.test(goal)
    ? "train"
    : /\b(hotel|room|stay|booking\.com)\b/i.test(goal)
      ? "hotel"
      : /\b(flight|plane|air ticket|makemytrip)\b/i.test(goal)
        ? "flight"
        : null;
  if (!kind) return null;

  let origin: string | undefined;
  let destination: string | undefined;
  const route =
    goal.match(
      /\bfrom\s+(.+?)\s+to\s+(.+?)(?=\s+(?:on|for|tomorrow|today|day after|return|round|one way|\d{1,2}[/-]|\d{1,2}(?:st|nd|rd|th)?\s+[a-z]{3,9})|$)/i,
    ) ||
    goal.match(
      /(?:^|\s)(.+?)\s+se\s+(.+?)(?=\s+(?:ki|ke|ka|jana|jaane|flight|train|ticket|on|for|kal|aaj|parso|\d{1,2}[/-]|\d{1,2}(?:st|nd|rd|th)?\s+[a-z]{3,9})|$)/i,
    );
  if (route) {
    origin = cleanCity(route[1]!);
    destination = cleanCity(route[2]!);
  }

  if (kind === "hotel") {
    const hotelDestination =
      goal.match(/\b(?:hotel|room|stay)\s+(?:in|at|near)\s+(.+?)(?=\s+(?:from|on|for|check|tomorrow|today|\d{1,2}[/-]|\d{1,2}(?:st|nd|rd|th)?\s+[a-z]{3,9})|$)/i) ||
      goal.match(/\b(?:in|at)\s+(.+?)\s+(?:hotel|room|stay)\b/i);
    destination = cleanCity(hotelDestination?.[1] || destination || "");
    origin = undefined;
  }

  const dates = parseDates(goal, nowMs);
  const adultsMatch = goal.match(/\b(\d+)\s*(?:adult|adults|people|persons|passengers|log)\b/i);
  const travelClass = goal.match(
    /\b(economy|premium economy|business|first class|sleeper|1a|2a|3a|cc|ec|second sitting|2s)\b/i,
  )?.[1];

  return {
    kind,
    origin: origin || undefined,
    destination: destination || undefined,
    departureDate: dates[0],
    returnDate: dates[1],
    adults: adultsMatch ? Math.max(1, Number(adultsMatch[1])) : 1,
    travelClass,
  };
}

function hay(element: UIElement): string {
  return [
    element.text,
    element.ariaLabel,
    element.name,
    element.placeholder,
    element.value,
    element.href,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function find(
  elements: UIElement[],
  pattern: RegExp,
  predicate: (element: UIElement) => boolean = () => true,
): UIElement | undefined {
  return elements.find((element) => element.enabled && pattern.test(hay(element)) && predicate(element));
}

function dateLabels(iso: string): RegExp[] {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year!, month! - 1, day!, 12);
  const monthLong = date.toLocaleString("en-US", { month: "long" });
  const monthShort = date.toLocaleString("en-US", { month: "short" });
  const weekday = date.toLocaleString("en-US", { weekday: "long" });
  return [
    new RegExp(`\\b${day}\\s+${monthLong}\\s+${year}\\b`, "i"),
    new RegExp(`\\b${monthLong}\\s+${day}(?:st|nd|rd|th)?[,]?\\s+${year}\\b`, "i"),
    new RegExp(`\\b${weekday}[,]?\\s+${monthShort}\\s+${day}\\b`, "i"),
    new RegExp(`\\b${iso}\\b`, "i"),
  ];
}

function finish(goal: string, message: string, reason: string): ActionPlan {
  return ActionPlanSchema.parse({
    goal,
    actions: [{ type: "finish", message, confidence: 0.98 }],
    reason,
    done: true,
    confidence: 0.98,
  });
}

function pauseForUser(goal: string, message: string, reason: string): ActionPlan {
  return ActionPlanSchema.parse({
    goal,
    actions: [
      {
        type: "ask_user",
        message,
        confidence: 0.99,
        requires_approval: true,
        risk_level: "medium",
      },
    ],
    reason,
    needs_approval: true,
    confidence: 0.99,
  });
}

function clickPlan(
  goal: string,
  element: UIElement,
  reason: string,
  message?: string,
  approval: "high" | "critical" | null = null,
): ActionPlan {
  return ActionPlanSchema.parse({
    goal,
    actions: [
      {
        type: "click",
        element_id: element.id,
        message,
        confidence: 0.94,
        requires_approval: approval ? true : undefined,
        risk_level: approval || undefined,
      },
      ...(approval ? [] : [{ type: "wait" as const, wait_ms: 900, confidence: 1 }]),
    ],
    reason,
    needs_approval: approval ? true : undefined,
    confidence: 0.94,
  });
}

function fieldFor(elements: UIElement[], pattern: RegExp): UIElement | undefined {
  return find(
    elements,
    pattern,
    (element) =>
      element.type === "input" ||
      element.type === "dropdown" ||
      element.role === "combobox" ||
      element.role === "textbox" ||
      element.tagName === "input",
  );
}

function typedOrSelected(historyText: string, step: string): boolean {
  return new RegExp(`Travel: (?:type|choose|set) ${step}`, "i").test(historyText);
}

function fillLocation(
  input: AgentContext,
  elements: UIElement[],
  historyText: string,
  label: "origin" | "destination",
  city: string,
  fieldPattern: RegExp,
): ActionPlan | null {
  const typed = new RegExp(`Travel: type ${label}`, "i").test(historyText);
  const chosen = new RegExp(`Travel: choose ${label}`, "i").test(historyText);
  const cityPattern = new RegExp(city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

  if (typed && !chosen) {
    const suggestion = find(
      elements,
      cityPattern,
      (element) =>
        element.type !== "input" &&
        element.tagName !== "input" &&
        (element.role === "option" ||
          element.type === "button" ||
          element.type === "link" ||
          /airport|railway|station|city/i.test(hay(element))),
    );
    if (suggestion) return clickPlan(input.user_goal, suggestion, `Travel: choose ${label}`);
    return ActionPlanSchema.parse({
      goal: input.user_goal,
      actions: [{ type: "wait", wait_ms: 800, confidence: 1 }],
      reason: `Travel: wait for ${label} suggestions`,
      confidence: 0.9,
    });
  }

  if (!typedOrSelected(historyText, label)) {
    const field = fieldFor(elements, fieldPattern);
    if (!field) return null;
    return ActionPlanSchema.parse({
      goal: input.user_goal,
      actions: [
        { type: "click", element_id: field.id, confidence: 0.94 },
        { type: "clear", element_id: field.id, confidence: 0.94 },
        { type: "type", element_id: field.id, text: city, confidence: 0.96 },
        { type: "wait", wait_ms: 700, confidence: 1 },
      ],
      reason: `Travel: type ${label}`,
      confidence: 0.95,
    });
  }
  return null;
}

function setDate(
  input: AgentContext,
  elements: UIElement[],
  historyText: string,
  iso: string,
  label: "departure" | "return" | "check-in" | "check-out",
): ActionPlan | null {
  if (typedOrSelected(historyText, label)) return null;

  const exactDate = dateLabels(iso)
    .map((pattern) => find(elements, pattern, (element) => element.type !== "input"))
    .find(Boolean);
  if (exactDate) return clickPlan(input.user_goal, exactDate, `Travel: set ${label}`);

  const fieldPattern =
    label === "departure"
      ? /departure|depart|journey date|travel date/i
      : label === "return"
        ? /return/i
        : label === "check-in"
          ? /check.?in/i
          : /check.?out/i;
  const dateField = fieldFor(elements, fieldPattern);
  if (dateField) {
    const [year, month, day] = iso.split("-");
    const value = dateField.inputType === "date" ? iso : `${day}/${month}/${year}`;
    return ActionPlanSchema.parse({
      goal: input.user_goal,
      actions: [
        { type: "click", element_id: dateField.id, confidence: 0.94 },
        { type: "clear", element_id: dateField.id, confidence: 0.94 },
        { type: "type", element_id: dateField.id, text: value, confidence: 0.94 },
      ],
      reason: `Travel: set ${label}`,
      confidence: 0.94,
    });
  }

  const dateTrigger = find(elements, fieldPattern);
  if (dateTrigger) return clickPlan(input.user_goal, dateTrigger, `Travel: open ${label} calendar`);

  if (new RegExp(`Travel: open ${label} calendar`, "i").test(historyText)) {
    const nextMonth = find(elements, /next month|next calendar|next/i, (element) => element.type === "button");
    if (nextMonth) return clickPlan(input.user_goal, nextMonth, `Travel: advance ${label} calendar`);
  }
  return null;
}

function handleResults(
  input: AgentContext,
  elements: UIElement[],
  visibleText: string,
): ActionPlan | null {
  const goal = input.user_goal;
  if (
    /booking (?:is )?confirmed|payment successful|ticket (?:has been )?booked|reservation confirmed|your booking is confirmed/i.test(
      visibleText,
    )
  ) {
    return finish(goal, "Travel booking was confirmed successfully.", "Travel: booking confirmed");
  }
  const signedOut = /sign in|log in|login to continue|enter your mobile|user id/i.test(visibleText);
  const captcha = input.observation.captcha_detected || /captcha|verify you are human/i.test(visibleText);
  if (captcha) {
    return pauseForUser(
      goal,
      "Complete the CAPTCHA manually, then click Approve to continue this booking.",
      "Travel: CAPTCHA requires user",
    );
  }

  const finalPayment = find(
    elements,
    /pay now|make payment|complete booking|confirm(?: and)? pay|place booking|book and pay/i,
  );
  if (finalPayment) {
    return clickPlan(
      goal,
      finalPayment,
      "Travel: final payment requires explicit approval",
      "Confirm booking and payment",
      "critical",
    );
  }

  if (/traveller details|passenger details|contact details|guest details/i.test(visibleText)) {
    const continueButton = find(elements, /continue|proceed|review booking/i, (element) =>
      /button|submit/i.test(`${element.type} ${element.inputType || ""}`),
    );
    if (continueButton && !signedOut) {
      return clickPlan(goal, continueButton, "Travel: continue after saved traveller details");
    }
    return pauseForUser(
      goal,
      "Fill or verify traveller and contact details manually, then click Approve to continue.",
      "Travel: traveller details require user",
    );
  }

  if (signedOut && /book|checkout|review|payment|passenger|traveller/i.test(visibleText)) {
    return pauseForUser(
      goal,
      "Sign in manually, then click Approve to continue the booking.",
      "Travel: sign-in required",
    );
  }

  const reserve = find(
    elements,
    /book now|book ticket|reserve|i'll reserve/i,
    (element) => !/sponsored|advertisement/i.test(hay(element)),
  );
  if (reserve) {
    return clickPlan(
      goal,
      reserve,
      "Travel: booking selection requires approval",
      "Continue with this booking option",
      "high",
    );
  }

  const selectFare = find(
    elements,
    /view prices|select fare|choose room|see availability/i,
    (element) => !/sponsored|advertisement/i.test(hay(element)),
  );
  if (selectFare) return clickPlan(goal, selectFare, "Travel: select best available result");

  const continueButton = find(
    elements,
    /continue|proceed|review booking|continue booking/i,
    (element) => element.type === "button" || element.inputType === "submit",
  );
  if (continueButton) {
    return clickPlan(
      goal,
      continueButton,
      "Travel: continue to booking review",
      "Continue to booking review",
      "high",
    );
  }
  return null;
}

/** Deterministic booking state machine for MakeMyTrip, IRCTC, and Booking.com. */
export function travelBookingPlan(input: AgentContext): ActionPlan | null {
  const request = parseTravelRequest(input.user_goal, input.observation.timestamp);
  if (!request) return null;

  let url: URL;
  try {
    url = new URL(input.observation.url);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const supported =
    host.includes("makemytrip.") || host.includes("irctc.co.in") || host.includes("booking.com");
  if (!supported) return null;

  const goal = input.user_goal;
  if (!request.destination || (request.kind !== "hotel" && !request.origin)) {
    return finish(
      goal,
      request.kind === "hotel"
        ? "Please include the hotel destination, check-in date, and check-out date."
        : `Please include origin, destination, and travel date, for example: “Book a ${request.kind} from Delhi to Mumbai on 15 September.”`,
      "Travel: missing route details",
    );
  }
  if (!request.departureDate || (request.kind === "hotel" && !request.returnDate)) {
    return finish(
      goal,
      request.kind === "hotel"
        ? "Please include both check-in and check-out dates."
        : "Please include the travel date.",
      "Travel: missing date details",
    );
  }

  const elements = input.observation.elements.filter(
    (element) => element.visible && element.interactive && element.enabled,
  );
  const visibleText = input.observation.visible_text || "";
  const historyText = input.history.map((entry) => entry.plan?.reason || "").join(" ");

  const resultPlan = handleResults(input, elements, visibleText);
  if (
    resultPlan &&
    (/search results|available flights|available trains|properties found|traveller details|passenger details|payment|review booking|view prices|choose room|captcha|booking (?:is )?confirmed|ticket (?:has been )?booked/i.test(
      visibleText,
    ) ||
      /flight\/review|flight\/traveller|flight\/payment|train-list|booking|checkout|searchresults|confirmation/i.test(
        `${url.pathname}${url.search}`,
      ))
  ) {
    return resultPlan;
  }

  const dismiss = find(elements, /maybe later|not now|close|skip/i, (element) =>
    /button|link/.test(element.type),
  );
  if (dismiss && !/Travel: dismiss popup/i.test(historyText)) {
    return clickPlan(goal, dismiss, "Travel: dismiss popup");
  }

  if (request.kind === "flight" && host.includes("makemytrip.")) {
    const flightsTab = find(elements, /^flights?$/i);
    if (flightsTab && !/Travel: choose flights/i.test(historyText)) {
      return clickPlan(goal, flightsTab, "Travel: choose flights");
    }
  }

  const originPlan =
    request.origin &&
    fillLocation(
      input,
      elements,
      historyText,
      "origin",
      request.origin,
      /from|origin|source|from city|from station/i,
    );
  if (originPlan) return originPlan;

  const destinationPlan = fillLocation(
    input,
    elements,
    historyText,
    "destination",
    request.destination,
    request.kind === "hotel"
      ? /destination|where are you going|city|property/i
      : /to|destination|to city|to station/i,
  );
  if (destinationPlan) return destinationPlan;

  const departurePlan = setDate(
    input,
    elements,
    historyText,
    request.departureDate,
    request.kind === "hotel" ? "check-in" : "departure",
  );
  if (departurePlan) return departurePlan;

  if (request.kind === "hotel" && request.returnDate) {
    const checkoutPlan = setDate(
      input,
      elements,
      historyText,
      request.returnDate,
      "check-out",
    );
    if (checkoutPlan) return checkoutPlan;
  }

  const search = find(
    elements,
    request.kind === "flight"
      ? /search flights|search$/i
      : request.kind === "train"
        ? /search trains|search$/i
        : /search hotels|search$/i,
    (element) => element.type === "button" || element.inputType === "submit",
  );
  if (search) return clickPlan(goal, search, "Travel: submit booking search");

  return ActionPlanSchema.parse({
    goal,
    actions: [
      { type: "scroll", direction: "down", amount: 450, confidence: 0.85 },
      { type: "wait", wait_ms: 700, confidence: 1 },
    ],
    reason: "Travel: locate the next booking control",
    confidence: 0.86,
  });
}
