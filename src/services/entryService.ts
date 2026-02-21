// ---------------------------------------------------------------------------
// Entry Service
// Thin data-access layer over the Tauri SQL plugin for the Session and
// Offer tables. All DB access goes through a lazily-initialized singleton
// connection, mirroring the pattern established in authService.ts.
// ---------------------------------------------------------------------------

import Database from "@tauri-apps/plugin-sql";
import type {
  Session, SessionInsert, SessionWithOffers,
  Offer, OfferInsert,
} from "@/types/entries";

let db: Database | null = null;

async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:dashlens.db");
  }
  return db;
}

// ---------------------------------------------------------------------------
// Session operations
// ---------------------------------------------------------------------------

export const SessionService = {
  /** Insert a new session row and return its generated id. */
  async create(data: SessionInsert): Promise<number> {
    const database = await getDb();
    const result = await database.execute(
      `INSERT INTO sessions
         (date, total_earnings, base_pay, tips,
          start_time, end_time, active_time, total_time,
          offers_count, deliveries)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        data.date, data.total_earnings, data.base_pay, data.tips,
        data.start_time, data.end_time, data.active_time, data.total_time,
        data.offers_count, data.deliveries,
      ]
    );
    return result.lastInsertId;
  },

  async getAll(): Promise<Session[]> {
    const database = await getDb();
    return database.select<Session[]>(
      "SELECT * FROM sessions ORDER BY date DESC, start_time DESC"
    );
  },

  async getById(id: number): Promise<Session | null> {
    const database = await getDb();
    const rows = await database.select<Session[]>(
      "SELECT * FROM sessions WHERE id = $1", [id]
    );
    return rows[0] ?? null;
  },

  /** Fetch a session and all of its offers in a single enriched object. */
  async getWithOffers(id: number): Promise<SessionWithOffers | null> {
    const session = await SessionService.getById(id);
    if (!session) return null;
    const database = await getDb();
    const offers = await database.select<Offer[]>(
      "SELECT * FROM offers WHERE session_id = $1 ORDER BY id ASC", [id]
    );
    return { ...session, offers };
  },

  async update(id: number, data: Partial<SessionInsert>): Promise<void> {
    const database = await getDb();
    await database.execute(
      `UPDATE sessions SET
        date           = COALESCE($1,  date),
        total_earnings = COALESCE($2,  total_earnings),
        base_pay       = COALESCE($3,  base_pay),
        tips           = COALESCE($4,  tips),
        start_time     = COALESCE($5,  start_time),
        end_time       = COALESCE($6,  end_time),
        active_time    = COALESCE($7,  active_time),
        total_time     = COALESCE($8,  total_time),
        offers_count   = COALESCE($9,  offers_count),
        deliveries     = COALESCE($10, deliveries)
       WHERE id = $11`,
      [
        data.date, data.total_earnings, data.base_pay, data.tips,
        data.start_time, data.end_time, data.active_time, data.total_time,
        data.offers_count, data.deliveries,
        id,
      ]
    );
  },

  async delete(id: number): Promise<void> {
    const database = await getDb();
    // Offers are deleted via ON DELETE CASCADE in the schema
    await database.execute("DELETE FROM sessions WHERE id = $1", [id]);
  },
};

// ---------------------------------------------------------------------------
// Offer operations
// ---------------------------------------------------------------------------

export const OfferService = {
  async create(data: OfferInsert): Promise<number> {
    const database = await getDb();
    const result = await database.execute(
      "INSERT INTO offers (session_id, store, total_earnings) VALUES ($1, $2, $3)",
      [data.session_id, data.store, data.total_earnings]
    );
    return result.lastInsertId;
  },

  /** Bulk-insert multiple offers for a session (used when saving OCR results). */
  async bulkCreate(sessionId: number, offers: Omit<OfferInsert, "session_id">[]): Promise<void> {
    const database = await getDb();
    for (const offer of offers) {
      await database.execute(
        "INSERT INTO offers (session_id, store, total_earnings) VALUES ($1, $2, $3)",
        [sessionId, offer.store, offer.total_earnings]
      );
    }
  },

  async getBySessionId(sessionId: number): Promise<Offer[]> {
    const database = await getDb();
    return database.select<Offer[]>(
      "SELECT * FROM offers WHERE session_id = $1 ORDER BY id ASC", [sessionId]
    );
  },

  async update(id: number, data: Partial<OfferInsert>): Promise<void> {
    const database = await getDb();
    await database.execute(
      `UPDATE offers SET
        store          = COALESCE($1, store),
        total_earnings = COALESCE($2, total_earnings)
       WHERE id = $3`,
      [data.store, data.total_earnings, id]
    );
  },

  async delete(id: number): Promise<void> {
    const database = await getDb();
    await database.execute("DELETE FROM offers WHERE id = $1", [id]);
  },

  /** Delete all offers for a session — used when re-saving after edits. */
  async deleteBySessionId(sessionId: number): Promise<void> {
    const database = await getDb();
    await database.execute("DELETE FROM offers WHERE session_id = $1", [sessionId]);
  },
};

// ---------------------------------------------------------------------------
// Compound save — saves a parsed session + its offers atomically (sequentially)
// ---------------------------------------------------------------------------

/**
 * Saves a full session entry with nested offers.
 * Returns the new session id.
 */
export async function saveSessionWithOffers(
  session: SessionInsert,
  offers: Omit<OfferInsert, "session_id">[]
): Promise<number> {
  const sessionId = await SessionService.create(session);
  if (offers.length > 0) {
    await OfferService.bulkCreate(sessionId, offers);
  }
  return sessionId;
}
