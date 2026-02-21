// ---------------------------------------------------------------------------
// OCR Parser
// Attempts to extract structured earnings data from raw Tesseract output.
// Designed around DoorDash weekly/daily summary screenshot formats.
//
// Both "week" and "day" parsers are best-effort — missing fields remain null
// and the user can fill them in via the review form before saving.
// ---------------------------------------------------------------------------

/** Months used for flexible date parsing */
const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  january: 0, february: 1, march: 2, april: 3, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

// ---------------------------------------------------------------------------
// Shared result types
// ---------------------------------------------------------------------------

export type OcrEntryType = "week" | "day" | "unknown";

export interface ParsedOffer {
  store: string;
  total_earnings: number | null;
}

export interface ParsedWeek {
  date_start: string | null;         // ISO "YYYY-MM-DD"
  date_end: string | null;           // ISO "YYYY-MM-DD"
  active_time: number | null;        // minutes
  total_time: number | null;         // minutes
  completed_deliveries: number | null;
  total_earnings: number | null;
}

export interface ParsedDay {
  date: string | null;               // ISO "YYYY-MM-DD"
  total_earnings: number | null;
  base_pay: number | null;           // "DoorDash pay" line — only present on expanded earnings screenshots
  tips: number | null;               // "Customer tips" line — only present on expanded earnings screenshots
  start_time: string | null;         // "HH:MM" 24h
  end_time: string | null;           // "HH:MM" 24h
  active_time: number | null;        // minutes
  total_time: number | null;         // minutes
  deliveries: number | null;
  offers: ParsedOffer[];
}

export interface OcrParseResult {
  type: OcrEntryType;
  week?: ParsedWeek;
  day?: ParsedDay;
  /** Original raw OCR text for reference */
  raw: string;
}

// ---------------------------------------------------------------------------
// Utility parsers
// ---------------------------------------------------------------------------

/**
 * Extracts the first dollar amount from a string.
 * Handles "$1,234.56", "1234.56", etc.
 */
function parseCurrency(text: string): number | null {
  const match = text.match(/\$?([\d,]+\.?\d{0,2})/);
  if (!match) return null;
  const val = parseFloat(match[1].replace(",", ""));
  return isNaN(val) ? null : val;
}

/**
 * Parses "Xh Ym" or "X hr Y min" patterns into total minutes.
 * Also handles "Xh", "Ym" alone.
 */
function parseDuration(text: string): number | null {
  // Match "12h 30m", "12 hr 30 min", "3h", "45m"
  const full = text.match(/(\d+)\s*h(?:r|rs|our|ours)?\s*(\d+)\s*m(?:in|ins)?/i);
  if (full) return parseInt(full[1]) * 60 + parseInt(full[2]);

  const hoursOnly = text.match(/(\d+)\s*h(?:r|rs|our|ours)?(?!\s*\d)/i);
  if (hoursOnly) return parseInt(hoursOnly[1]) * 60;

  const minsOnly = text.match(/(\d+)\s*m(?:in|ins)?(?!\s*\d)/i);
  if (minsOnly) return parseInt(minsOnly[1]);

  return null;
}

/**
 * Converts "10:32 AM" or "10:32" to 24h "HH:MM".
 */
function parseTime(raw: string): string | null {
  const match = raw.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return null;
  let hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Attempts to parse a loose date string like "Jan 6" or "January 6, 2024"
 * into an ISO "YYYY-MM-DD". Uses the current year as fallback.
 */
function parseLooseDate(raw: string, year?: number): string | null {
  const y = year ?? new Date().getFullYear();
  // "Jan 6", "January 6", "Jan 6 2024", "Jan 6, 2024"
  const match = raw.match(/([A-Za-z]+)\s+(\d{1,2})(?:,?\s*(\d{4}))?/);
  if (!match) return null;
  const month = MONTH_MAP[match[1].toLowerCase()];
  if (month === undefined) return null;
  const day = parseInt(match[2]);
  const fullYear = match[3] ? parseInt(match[3]) : y;
  return `${fullYear}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Entry-type detection
// ---------------------------------------------------------------------------

/**
 * Detects whether a block of OCR text represents a weekly or daily summary.
 *
 * Detection priority (highest → lowest confidence signals):
 *
 * WEEK signals:
 *  1. Explicit "Dashes" section header (DoorDash week summaries list individual
 *     dashes below a "Dashes" label — a uniquely week-level construct).
 *  2. "Week of" keyword.
 *  3. Compact same-month range header "Feb 9-15" (one month, two day numbers).
 *  4. Full cross-month range header "Jan 6 – Jan 12".
 *
 * DAY signals (checked AFTER all week signals to avoid false positives — week
 * summaries contain inline weekday labels like "Tuesday, Feb 10 $19.95 >" which
 * would otherwise trigger the old weekday-at-line-start heuristic):
 *  5. "Start Time" / "End Time" labels (day-specific detail).
 *  6. Date with explicit year and no range: "Feb 8, 2026".
 *  7. Weekday-prefixed date AND start/end time (belt-and-suspenders for older
 *     screenshot formats).
 */
function detectEntryType(text: string): OcrEntryType {
  // -- Week signals (checked first) --

  // "Dashes" as a standalone section label is a strong week indicator.
  // DoorDash week summaries show a "Dashes" header above the list of individual dashes.
  if (/^\s*dashes\s*$/im.test(text)) return "week";

  if (/week\s+of/i.test(text)) return "week";

  // Compact same-month range: "Feb 9-15", "Feb 9 – 15"
  // Pattern: Month + start_day + dash/en-dash/em-dash + end_day (no second month name)
  if (/[a-z]{3,9}\s+\d{1,2}\s*[–—-]+\s*\d{1,2}(?!\s*[a-z])/i.test(text)) return "week";

  // Full cross-month range: "Dec 30 – Jan 5" or "Jan 6 - Jan 12"
  if (/[a-z]{3,9}\s+\d{1,2}\s*[–—-]+\s*[a-z]{3,9}\s+\d{1,2}/i.test(text)) return "week";

  // -- Day signals (checked after all week signals) --

  // "Start Time" / "End Time" labelled fields are exclusive to day summaries.
  if (/start\s+time/i.test(text) || /end\s+time/i.test(text)) return "day";

  // Date with explicit year: "Feb 8, 2026" (no range, no second date)
  if (/[a-z]{3,9}\s+\d{1,2},\s*\d{4}/i.test(text)) return "day";

  // Weekday prefix + start/end time (older screenshot format, belt-and-suspenders)
  const hasWeekdayLine =
    /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*/im.test(text) ||
    /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/im.test(text);
  if (hasWeekdayLine && /start\s+time|end\s+time/i.test(text)) return "day";

  return "unknown";
}

// ---------------------------------------------------------------------------
// Week parser
// ---------------------------------------------------------------------------

function parseWeek(text: string): ParsedWeek {
  // --- Date range ---
  let date_start: string | null = null;
  let date_end: string | null = null;

  // Try full cross-month range first: "Jan 6 – Jan 12"
  const fullRangeMatch = text.match(
    /([A-Za-z]+\s+\d{1,2})\s*[–—-]+\s*([A-Za-z]+\s+\d{1,2})/
  );
  if (fullRangeMatch) {
    date_start = parseLooseDate(fullRangeMatch[1]);
    date_end   = parseLooseDate(fullRangeMatch[2]);

    // Handle Dec→Jan year wrap: if end month < start month, end is next year
    if (date_start && date_end) {
      const startMonth = parseInt(date_start.split("-")[1]);
      const endMonth   = parseInt(date_end.split("-")[1]);
      if (endMonth < startMonth) {
        const endYear = parseInt(date_end.split("-")[0]) + 1;
        date_end = `${endYear}-${date_end.slice(5)}`;
      }
    }
  }

  // Fallback: compact same-month range "Feb 9-15"
  if (!date_start) {
    const compactMatch = text.match(
      /([A-Za-z]+)\s+(\d{1,2})\s*[–—-]+\s*(\d{1,2})(?!\s*[a-z])/i
    );
    if (compactMatch) {
      date_start = parseLooseDate(`${compactMatch[1]} ${compactMatch[2]}`);
      date_end   = parseLooseDate(`${compactMatch[1]} ${compactMatch[3]}`);
    }
  }

  // --- Earnings ---
  // Look for a prominent dollar amount (usually on its own line)
  const earningsMatch = text.match(/\$[\d,]+\.\d{2}/);
  const total_earnings = earningsMatch ? parseCurrency(earningsMatch[0]) : null;

  // --- Deliveries ---
  // "Completed deliveries 7" or "7 deliveries"
  const deliveriesMatch =
    text.match(/completed\s+deliveries[:\s]+(\d+)/i) ??
    text.match(/(\d+)\s+completed\s+deliveri(?:es|ed)/i) ??
    text.match(/(\d+)\s+deliveri(?:es|ed)/i) ??
    text.match(/deliveries[:\s]+(\d+)/i);
  const completed_deliveries = deliveriesMatch
    ? parseInt(deliveriesMatch[1])
    : null;

  // --- Active time ---
  // Matches "Active time 2h 54m" with any amount of whitespace/newlines
  const activeMatch =
    text.match(/active\s+time[:\s]+([\d]+\s*h(?:r|rs)?\s*[\d]+\s*m(?:in)?)/i) ??
    text.match(/active\s+time[:\s]+([\d]+\s*h(?:r|rs)?)/i) ??
    text.match(/active\s+time[:\s]+([\d]+\s*m(?:in)?)/i);
  const active_time = activeMatch ? parseDuration(activeMatch[1]) : null;

  // --- Total (Dash) time ---
  // DoorDash labels this "Dash time" on week summaries, not "Total time"
  const totalMatch =
    text.match(/dash\s+time[:\s]+([\d]+\s*h(?:r|rs)?\s*[\d]+\s*m(?:in)?)/i) ??
    text.match(/dash\s+time[:\s]+([\d]+\s*h(?:r|rs)?)/i) ??
    text.match(/dash\s+time[:\s]+([\d]+\s*m(?:in)?)/i) ??
    text.match(/total\s+time[:\s]+([\d]+\s*h(?:r|rs)?\s*[\d]+\s*m(?:in)?)/i) ??
    text.match(/total\s+time[:\s]+([\d]+\s*h(?:r|rs)?)/i);
  const total_time = totalMatch ? parseDuration(totalMatch[1]) : null;

  return { date_start, date_end, active_time, total_time, completed_deliveries, total_earnings };
}

// ---------------------------------------------------------------------------
// Day parser
// ---------------------------------------------------------------------------

function parseDay(text: string): ParsedDay {
  // --- Date ---
  // Priority 1: weekday-prefixed "Mon, Jan 6" / "Monday, Jan 6, 2024"
  const weekdayDateMatch = text.match(
    /(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*[,\s]+([A-Za-z]+\s+\d{1,2}(?:,?\s*\d{4})?)/i
  );
  // Priority 2: standalone date with year "Feb 8, 2026" or "Feb 8,2026"
  const standaloneYearMatch = text.match(
    /\b([A-Za-z]+\s+\d{1,2},\s*\d{4})\b/
  );

  const dateRaw = weekdayDateMatch?.[1] ?? standaloneYearMatch?.[1] ?? null;
  const date = dateRaw ? parseLooseDate(dateRaw) : null;

  // --- Total earnings ---
  // First dollar amount found — typically the largest/most prominent one
  const earningsMatch = text.match(/\$[\d,]+\.\d{2}/);
  const total_earnings = earningsMatch ? parseCurrency(earningsMatch[0]) : null;

  // --- Time range ---
  // Strategy 1: labelled fields on separate lines (most common in day screenshots)
  //   "Start Time 10:27 AM" / "End Time 12:12 PM"
  let start_time: string | null = null;
  let end_time: string | null = null;

  const startLabelMatch = text.match(/start\s+time[:\s]+(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
  const endLabelMatch   = text.match(/end\s+time[:\s]+(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
  if (startLabelMatch) start_time = parseTime(startLabelMatch[1]);
  if (endLabelMatch)   end_time   = parseTime(endLabelMatch[1]);

  // Strategy 2: inline time range "10:32 AM – 3:44 PM" (fallback for older format)
  if (!start_time || !end_time) {
    const timeRangeMatch = text.match(
      /(\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*[–—-]+\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i
    );
    if (timeRangeMatch) {
      if (!start_time) start_time = parseTime(timeRangeMatch[1]);
      if (!end_time)   end_time   = parseTime(timeRangeMatch[2]);
    }
  }

  // --- Active time ---
  const activeMatch =
    text.match(/active\s+time[:\s]+([\d]+\s*h(?:r|rs)?\s*[\d]+\s*m(?:in)?)/i) ??
    text.match(/active\s+time[:\s]+([\d]+\s*h(?:r|rs)?)/i) ??
    text.match(/active\s+time[:\s]+([\d]+\s*m(?:in)?)/i);
  const active_time = activeMatch ? parseDuration(activeMatch[1]) : null;

  // --- Total (Dash) time ---
  // DoorDash labels this "Dash time" on day summaries as well
  const totalMatch =
    text.match(/dash\s+time[:\s]+([\d]+\s*h(?:r|rs)?\s*[\d]+\s*m(?:in)?)/i) ??
    text.match(/dash\s+time[:\s]+([\d]+\s*h(?:r|rs)?)/i) ??
    text.match(/dash\s+time[:\s]+([\d]+\s*m(?:in)?)/i) ??
    text.match(/total\s+time[:\s]+([\d]+\s*h(?:r|rs)?\s*[\d]+\s*m(?:in)?)/i) ??
    text.match(/total\s+time[:\s]+([\d]+\s*h(?:r|rs)?)/i);
  const total_time = totalMatch ? parseDuration(totalMatch[1]) : null;

  // --- Deliveries ---
  const deliveriesMatch =
    text.match(/deliveries[:\s]+(\d+)/i) ??
    text.match(/(\d+)\s+deliveri(?:es|ed)/i);
  const deliveries = deliveriesMatch ? parseInt(deliveriesMatch[1]) : null;

  // --- Base pay & tips (expanded earnings view) ---
  // When the user taps the earnings total in the DoorDash app it expands to show:
  //   "DoorDash pay  $12.95"
  //   "Customer tips $21.25"
  // These are NOT offers — they must be captured separately and excluded from
  // the offer-parsing pass below.
  const basePayMatch = text.match(/doordash\s+pay[:\s]+\$?([\d,]+\.?\d{0,2})/i);
  const base_pay = basePayMatch ? parseCurrency(basePayMatch[1]) : null;

  const tipsMatch = text.match(/customer\s+tips?[:\s]+\$?([\d,]+\.?\d{0,2})/i);
  const tips = tipsMatch ? parseCurrency(tipsMatch[1]) : null;
  // DoorDash day summaries list each accepted offer as:
  //   "Store Name  v $X.XX"   — where "v" is Tesseract's misread of the ✓ checkmark
  //   "Store Name  $X.XX"     — or without the artifact
  //
  // Store names commonly wrap across two OCR lines, e.g.:
  //   Line A: "Taco Bell - 031435, Taco Bell"   (no dollar amount)
  //   Line B: "- 031435 v $14.40"               (has the amount; fragment = "- 031435")
  //
  // We can't rely on fragment length to detect continuations — "- 031435" and
  // "(2558)" are both long enough to fool a length threshold. Instead we use a
  // *lookahead pre-join pass*: any non-dollar, non-skippable line immediately
  // before a line that carries the offer amount pattern gets merged into it.
  // This produces fully-joined offer lines before we run the extraction regex.

  /** Lines that are never part of an offer name or amount */
  const OFFER_SKIP = /^(week|day|date|total|active|start|end|deliveri|dash|offers?\s*$|dashes?\s*$|\d+\s+doordash\s+offer|doordash\s+pay|customer\s+tips?)/i;

  /** An offer amount line: contains "v $X.XX" or just "$X.XX" near the end */
  const OFFER_AMOUNT_LINE = /v?\s*\$[\d,]+\.\d{2}\s*[>]?\s*$/i;

  const rawLines = text.split(/\n/);

  // Pre-join pass: walk forward; when line[i] has no $ and line[i+1] has the
  // offer amount pattern, merge them and skip line[i+1] on the next iteration.
  const joinedLines: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const cur  = rawLines[i].trim();
    const next = rawLines[i + 1]?.trim() ?? "";

    if (
      cur &&
      !OFFER_SKIP.test(cur) &&
      !/\$/.test(cur) &&            // current line has no dollar sign
      OFFER_AMOUNT_LINE.test(next)  // next line carries the amount
    ) {
      // Merge: current line is the name prefix, next line has the amount (and possibly a short suffix)
      joinedLines.push(`${cur} ${next}`);
      i++; // consume the next line — it's been merged
    } else {
      joinedLines.push(cur);
    }
  }

  // Extraction pass: scan the (now pre-joined) lines for offer patterns
  const offers: ParsedOffer[] = [];

  for (const line of joinedLines) {
    const trimmed = line.trim();
    if (!trimmed || OFFER_SKIP.test(trimmed)) continue;

    // Match "Store text  v $X.XX  >" — the "v" checkmark artifact is optional
    const offerMatch = trimmed.match(/^(.+?)\s+v?\s*(\$[\d,]+\.\d{2})\s*[>]?\s*$/i);
    if (!offerMatch) continue;

    const store    = offerMatch[1].trim();
    const earnings = parseCurrency(offerMatch[2]);

    // Sanity: skip pure-digit or very short store names
    if (store.length > 2 && !/^\d+$/.test(store)) {
      offers.push({ store, total_earnings: earnings });
    }
  }

  return { date, total_earnings, base_pay, tips, start_time, end_time, active_time, total_time, deliveries, offers };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parses raw OCR text into a structured `OcrParseResult`.
 * Detects whether the screenshot is a weekly or daily summary,
 * then applies the appropriate extractor.
 *
 * All fields are best-effort — unknown values are null.
 */
export function parseOcrText(rawText: string): OcrParseResult {
  const type = detectEntryType(rawText);

  if (type === "week") {
    return { type: "week", week: parseWeek(rawText), raw: rawText };
  }

  if (type === "day") {
    return { type: "day", day: parseDay(rawText), raw: rawText };
  }

  // Unknown — still attempt a day parse as it's the most granular
  return { type: "unknown", day: parseDay(rawText), raw: rawText };
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** Formats stored minutes as "Xh Ym" for display */
export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Parses a "Xh Ym" string back to minutes (used in form fields) */
export { parseDuration as parseDurationString };
