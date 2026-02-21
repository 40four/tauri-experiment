// ---------------------------------------------------------------------------
// DB Entity Types
// Mirror the SQLite schema defined in lib.rs migrations.
// All duration fields are stored as INTEGER (minutes).
// All earnings fields are stored as REAL (dollars).
// ---------------------------------------------------------------------------

export interface Session {
  id: number;
  date: string;                  // ISO "YYYY-MM-DD"
  total_earnings: number | null;
  base_pay: number | null;       // "DoorDash pay" — only on expanded earnings screenshots
  tips: number | null;           // "Customer tips" — only on expanded earnings screenshots
  start_time: string | null;     // "HH:MM" 24h
  end_time: string | null;       // "HH:MM" 24h
  active_time: number | null;    // minutes
  total_time: number | null;     // minutes
  offers_count: number | null;   // raw "Offers N" value from OCR header
  deliveries: number | null;
  created_at: string;
}

export interface Offer {
  id: number;
  session_id: number;            // FK → sessions.id
  store: string | null;
  total_earnings: number | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Insert / Update shapes (omit auto-generated fields)
// ---------------------------------------------------------------------------

export type SessionInsert = Omit<Session, "id" | "created_at">;
export type OfferInsert = Omit<Offer, "id" | "created_at">;

// ---------------------------------------------------------------------------
// Enriched read model — Session with its offers pre-joined
// ---------------------------------------------------------------------------

export interface SessionWithOffers extends Session {
  offers: Offer[];
}
