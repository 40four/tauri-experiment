// ---------------------------------------------------------------------------
// Entry Review Form Types
// These types represent the *editable* in-memory state of the review form,
// which is pre-populated from the OCR parser and submitted to the DB service.
//
// Strings are used for duration/time fields so the user can type freely;
// we convert to numbers/ISO strings only on save.
// ---------------------------------------------------------------------------

export interface OfferFormRow {
  /** Locally unique key for list rendering */
  key: string;
  store: string;
  total_earnings: string; // e.g. "8.50" — user-editable
}

export interface DayFormState {
  date: string;            // "YYYY-MM-DD"
  total_earnings: string;  // e.g. "45.23"
  start_time: string;      // "HH:MM"
  end_time: string;        // "HH:MM"
  active_time: string;     // "Xh Ym" human-readable
  total_time: string;      // "Xh Ym"
  deliveries: string;      // integer string
  offers: OfferFormRow[];
}

export interface WeekFormState {
  date_start: string;          // "YYYY-MM-DD"
  date_end: string;            // "YYYY-MM-DD"
  active_time: string;         // "Xh Ym"
  total_time: string;          // "Xh Ym"
  completed_deliveries: string; // integer string
  total_earnings: string;       // for display context, not saved to week table
}
