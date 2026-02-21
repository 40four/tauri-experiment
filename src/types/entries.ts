// ---------------------------------------------------------------------------
// DB Entity Types
// Mirror the SQLite schema defined in lib.rs migrations.
// All duration fields are stored as INTEGER (minutes).
// All earnings fields are stored as REAL (dollars).
// ---------------------------------------------------------------------------

export interface Week {
  id: number;
  date_start: string;        // ISO "YYYY-MM-DD"
  date_end: string;          // ISO "YYYY-MM-DD"
  active_time: number | null; // minutes
  total_time: number | null;  // minutes
  completed_deliveries: number | null;
  created_at: string;
}

export interface Day {
  id: number;
  week_id: number | null;    // FK → weeks.id
  date: string;              // ISO "YYYY-MM-DD"
  total_earnings: number | null;
  base_pay: number | null;   // "DoorDash pay" — only present on expanded earnings screenshots
  tips: number | null;       // "Customer tips" — only present on expanded earnings screenshots
  start_time: string | null; // "HH:MM" 24h
  end_time: string | null;   // "HH:MM" 24h
  active_time: number | null; // minutes
  total_time: number | null;  // minutes
  deliveries: number | null;
  created_at: string;
}

export interface Offer {
  id: number;
  day_id: number;            // FK → days.id
  store: string | null;
  total_earnings: number | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Insert / Update shapes (omit auto-generated fields)
// ---------------------------------------------------------------------------

export type WeekInsert = Omit<Week, "id" | "created_at">;
export type DayInsert = Omit<Day, "id" | "created_at">;
export type OfferInsert = Omit<Offer, "id" | "created_at">;

// ---------------------------------------------------------------------------
// Enriched read model — Day with its offers pre-joined
// ---------------------------------------------------------------------------

export interface DayWithOffers extends Day {
  offers: Offer[];
}
