// ---------------------------------------------------------------------------
// Entry Service
// Thin data-access layer over the Tauri SQL plugin for the Week, Day, and
// Offer tables.  All DB access goes through a lazily-initialized singleton
// connection, mirroring the pattern established in authService.ts.
// ---------------------------------------------------------------------------

import Database from "@tauri-apps/plugin-sql";
import type {
  Week, WeekInsert,
  Day, DayInsert, DayWithOffers,
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
// Week operations
// ---------------------------------------------------------------------------

export const WeekService = {
  /** Insert a new week row and return its generated id. */
  async create(data: WeekInsert): Promise<number> {
    const database = await getDb();
    const result = await database.execute(
      `INSERT INTO weeks (date_start, date_end, active_time, total_time, completed_deliveries)
       VALUES ($1, $2, $3, $4, $5)`,
      [data.date_start, data.date_end, data.active_time, data.total_time, data.completed_deliveries]
    );
    return result.lastInsertId;
  },

  async getAll(): Promise<Week[]> {
    const database = await getDb();
    return database.select<Week[]>(
      "SELECT * FROM weeks ORDER BY date_start DESC"
    );
  },

  async getById(id: number): Promise<Week | null> {
    const database = await getDb();
    const rows = await database.select<Week[]>(
      "SELECT * FROM weeks WHERE id = $1",
      [id]
    );
    return rows[0] ?? null;
  },

  async update(id: number, data: Partial<WeekInsert>): Promise<void> {
    const database = await getDb();
    await database.execute(
      `UPDATE weeks SET
        date_start = COALESCE($1, date_start),
        date_end   = COALESCE($2, date_end),
        active_time = COALESCE($3, active_time),
        total_time  = COALESCE($4, total_time),
        completed_deliveries = COALESCE($5, completed_deliveries)
       WHERE id = $6`,
      [data.date_start, data.date_end, data.active_time, data.total_time, data.completed_deliveries, id]
    );
  },

  async delete(id: number): Promise<void> {
    const database = await getDb();
    await database.execute("DELETE FROM weeks WHERE id = $1", [id]);
  },
};

// ---------------------------------------------------------------------------
// Day operations
// ---------------------------------------------------------------------------

export const DayService = {
  /** Insert a new day and return its generated id. */
  async create(data: DayInsert): Promise<number> {
    const database = await getDb();
    const result = await database.execute(
      `INSERT INTO days
         (week_id, date, total_earnings, base_pay, tips,
          start_time, end_time, active_time, total_time, deliveries)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        data.week_id, data.date, data.total_earnings,
        data.base_pay, data.tips,
        data.start_time, data.end_time,
        data.active_time, data.total_time, data.deliveries,
      ]
    );
    return result.lastInsertId;
  },

  async getAll(): Promise<Day[]> {
    const database = await getDb();
    return database.select<Day[]>("SELECT * FROM days ORDER BY date DESC");
  },

  async getById(id: number): Promise<Day | null> {
    const database = await getDb();
    const rows = await database.select<Day[]>(
      "SELECT * FROM days WHERE id = $1", [id]
    );
    return rows[0] ?? null;
  },

  /** Fetch a day and all of its offers in a single enriched object. */
  async getWithOffers(id: number): Promise<DayWithOffers | null> {
    const day = await DayService.getById(id);
    if (!day) return null;
    const database = await getDb();
    const offers = await database.select<Offer[]>(
      "SELECT * FROM offers WHERE day_id = $1 ORDER BY id ASC", [id]
    );
    return { ...day, offers };
  },

  async update(id: number, data: Partial<DayInsert>): Promise<void> {
    const database = await getDb();
    await database.execute(
      `UPDATE days SET
        week_id        = COALESCE($1,  week_id),
        date           = COALESCE($2,  date),
        total_earnings = COALESCE($3,  total_earnings),
        base_pay       = COALESCE($4,  base_pay),
        tips           = COALESCE($5,  tips),
        start_time     = COALESCE($6,  start_time),
        end_time       = COALESCE($7,  end_time),
        active_time    = COALESCE($8,  active_time),
        total_time     = COALESCE($9,  total_time),
        deliveries     = COALESCE($10, deliveries)
       WHERE id = $11`,
      [
        data.week_id, data.date, data.total_earnings,
        data.base_pay, data.tips,
        data.start_time, data.end_time,
        data.active_time, data.total_time, data.deliveries,
        id,
      ]
    );
  },

  async delete(id: number): Promise<void> {
    const database = await getDb();
    // Offers are deleted via ON DELETE CASCADE in the schema
    await database.execute("DELETE FROM days WHERE id = $1", [id]);
  },
};

// ---------------------------------------------------------------------------
// Offer operations
// ---------------------------------------------------------------------------

export const OfferService = {
  async create(data: OfferInsert): Promise<number> {
    const database = await getDb();
    const result = await database.execute(
      "INSERT INTO offers (day_id, store, total_earnings) VALUES ($1, $2, $3)",
      [data.day_id, data.store, data.total_earnings]
    );
    return result.lastInsertId;
  },

  /** Bulk-insert multiple offers for a day (used when saving OCR results). */
  async bulkCreate(dayId: number, offers: Omit<OfferInsert, "day_id">[]): Promise<void> {
    const database = await getDb();
    for (const offer of offers) {
      await database.execute(
        "INSERT INTO offers (day_id, store, total_earnings) VALUES ($1, $2, $3)",
        [dayId, offer.store, offer.total_earnings]
      );
    }
  },

  async getByDayId(dayId: number): Promise<Offer[]> {
    const database = await getDb();
    return database.select<Offer[]>(
      "SELECT * FROM offers WHERE day_id = $1 ORDER BY id ASC", [dayId]
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

  /** Delete all offers for a day — used when re-saving after edits. */
  async deleteByDayId(dayId: number): Promise<void> {
    const database = await getDb();
    await database.execute("DELETE FROM offers WHERE day_id = $1", [id]);
  },
};

// ---------------------------------------------------------------------------
// Compound save — saves a parsed day + its offers atomically (sequentially)
// ---------------------------------------------------------------------------

/**
 * Saves a full day entry with nested offers.
 * Returns the new day id.
 */
export async function saveDayWithOffers(
  day: DayInsert,
  offers: Omit<OfferInsert, "day_id">[]
): Promise<number> {
  const dayId = await DayService.create(day);
  if (offers.length > 0) {
    await OfferService.bulkCreate(dayId, offers);
  }
  return dayId;
}
