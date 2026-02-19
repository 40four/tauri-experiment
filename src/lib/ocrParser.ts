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
  // "Jan 6", "January 6", "Jan 6 2024"
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
 * Heuristic: if the text contains "week of" or a date range with an em-dash
 * between two month+day combos, treat it as a weekly summary.
 */
function detectEntryType(text: string): OcrEntryType {
  const lower = text.toLowerCase();
  if (/week\s+of/i.test(lower)) return "week";

  // e.g. "Dec 30 – Jan 5" or "Jan 6 - Jan 12"
  if (/[a-z]{3,9}\s+\d{1,2}\s*[–—-]+\s*[a-z]{3,9}\s+\d{1,2}/i.test(text)) return "week";

  // Daily pattern: weekday name at the start of a line
  if (/^(mon|tue|wed|thu|fri|sat|sun)/im.test(text)) return "day";
  if (/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/im.test(text)) return "day";

  return "unknown";
}

// ---------------------------------------------------------------------------
// Week parser
// ---------------------------------------------------------------------------

function parseWeek(text: string): ParsedWeek {
  // --- Date range ---
  // "Week of Dec 30 – Jan 5" or "Jan 6 – Jan 12"
  let date_start: string | null = null;
  let date_end: string | null = null;

  const rangeMatch = text.match(
    /([A-Za-z]+\s+\d{1,2})\s*[–—-]+\s*([A-Za-z]+\s+\d{1,2})/
  );
  if (rangeMatch) {
    date_start = parseLooseDate(rangeMatch[1]);
    date_end = parseLooseDate(rangeMatch[2]);

    // If end month < start month, the start is likely prior year (Dec→Jan wrap)
    if (date_start && date_end) {
      const startMonth = parseInt(date_start.split("-")[1]);
      const endMonth = parseInt(date_end.split("-")[1]);
      if (endMonth < startMonth) {
        // End date might be in the next year
        const endYear = parseInt(date_end.split("-")[0]) + 1;
        date_end = `${endYear}-${date_end.slice(5)}`;
      }
    }
  }

  // --- Earnings ---
  // Look for a prominent dollar amount (usually on its own line)
  const earningsMatch = text.match(/\$[\d,]+\.\d{2}/);
  const total_earnings = earningsMatch ? parseCurrency(earningsMatch[0]) : null;

  // --- Deliveries ---
  const deliveriesMatch = text.match(/(\d+)\s+(?:completed\s+)?deliveri(?:es|ed)/i)
    ?? text.match(/(?:completed\s+)?deliveries[:\s]+(\d+)/i)
    ?? text.match(/(\d+)\s+dashes?/i);
  const completed_deliveries = deliveriesMatch ? parseInt(deliveriesMatch[1]) : null;

  // --- Active time ---
  const activeMatch = text.match(/active\s+time[:\s]+([\dhmins ]+)/i)
    ?? text.match(/([\dh\s]+m(?:in)?)\s+active/i);
  const active_time = activeMatch ? parseDuration(activeMatch[1]) : null;

  // --- Total time ---
  const totalMatch = text.match(/total\s+time[:\s]+([\dhmins ]+)/i)
    ?? text.match(/([\dh\s]+m(?:in)?)\s+(?:on\s+)?(?:dash|total)/i);
  const total_time = totalMatch ? parseDuration(totalMatch[1]) : null;

  return { date_start, date_end, active_time, total_time, completed_deliveries, total_earnings };
}

// ---------------------------------------------------------------------------
// Day parser
// ---------------------------------------------------------------------------

function parseDay(text: string): ParsedDay {
  // --- Date ---
  // "Mon, Jan 6" / "Monday, January 6, 2024" / "Mon Jan 6"
  const dateMatch = text.match(
    /(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*[,\s]+([A-Za-z]+\s+\d{1,2}(?:,?\s*\d{4})?)/i
  );
  const date = dateMatch ? parseLooseDate(dateMatch[1]) : null;

  // --- Total earnings ---
  const earningsMatch = text.match(/\$[\d,]+\.\d{2}/);
  const total_earnings = earningsMatch ? parseCurrency(earningsMatch[0]) : null;

  // --- Time range "10:32 AM – 3:44 PM" or "10:32 - 15:44" ---
  let start_time: string | null = null;
  let end_time: string | null = null;
  const timeRangeMatch = text.match(
    /(\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*[–—-]+\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i
  );
  if (timeRangeMatch) {
    start_time = parseTime(timeRangeMatch[1]);
    end_time = parseTime(timeRangeMatch[2]);
  }

  // --- Active time ---
  const activeMatch = text.match(/active\s+time[:\s]+([\dh\sm]+)/i)
    ?? text.match(/([\dh\s]+m(?:in)?)\s+active/i);
  const active_time = activeMatch ? parseDuration(activeMatch[1]) : null;

  // --- Total time ---
  const totalMatch = text.match(/total\s+time[:\s]+([\dh\sm]+)/i)
    ?? text.match(/([\dh\s]+m(?:in)?)\s+(?:on\s+)?(?:dash|total)/i);
  const total_time = totalMatch ? parseDuration(totalMatch[1]) : null;

  // --- Deliveries ---
  const deliveriesMatch = text.match(/(\d+)\s+deliveri(?:es|ed)/i)
    ?? text.match(/deliveries[:\s]+(\d+)/i);
  const deliveries = deliveriesMatch ? parseInt(deliveriesMatch[1]) : null;

  // --- Offers ---
  // Each offer typically appears as "Restaurant Name  $X.XX" on its own line.
  // We look for lines that have a store-like label followed by a dollar amount.
  const offers: ParsedOffer[] = [];
  const lines = text.split(/\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip lines that are obviously headers or summary data
    if (/^(week|day|date|total|active|start|end|deliveri|dash|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)/i.test(trimmed)) continue;

    // Look for a dollar amount at the end of the line
    const offerMatch = trimmed.match(/^(.+?)\s+(\$[\d,]+\.\d{2})\s*$/);
    if (offerMatch) {
      const store = offerMatch[1].trim();
      const earnings = parseCurrency(offerMatch[2]);
      // Basic sanity: store name shouldn't be a pure number or very short
      if (store.length > 2 && !/^\d+$/.test(store)) {
        offers.push({ store, total_earnings: earnings });
      }
    }
  }

  return { date, total_earnings, start_time, end_time, active_time, total_time, deliveries, offers };
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
