mod auth;

use auth::{
    AuthState, 
    hash_password, 
    verify_password, 
    set_session,
    clear_session,
    get_current_user, 
    check_auth_status
};
use tauri_plugin_sql::{Builder, Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            Builder::default()
                .add_migrations(
                    "sqlite:dashlens.db",
                    vec![
                        // -------------------------------------------------------
                        // v1 — users table (original)
                        // -------------------------------------------------------
                        Migration {
                            version: 1,
                            description: "create_users_table",
                            sql: "CREATE TABLE IF NOT EXISTS users (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                username TEXT NOT NULL UNIQUE,
                                password_hash TEXT NOT NULL,
                                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                            )",
                            kind: MigrationKind::Up,
                        },
                        // -------------------------------------------------------
                        // v2 — earnings tables: weeks, days, offers
                        //
                        // Duration fields (active_time, total_time) are stored as
                        // INTEGER minutes for easy arithmetic in queries.
                        // Earnings fields are stored as REAL (dollars).
                        // Time-of-day fields use TEXT "HH:MM" (24h).
                        // -------------------------------------------------------
                        Migration {
                            version: 2,
                            description: "create_earnings_tables",
                            sql: "
                                CREATE TABLE IF NOT EXISTS weeks (
                                    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                                    date_start           TEXT    NOT NULL,
                                    date_end             TEXT    NOT NULL,
                                    active_time          INTEGER,          -- minutes
                                    total_time           INTEGER,          -- minutes
                                    completed_deliveries INTEGER,
                                    created_at           DATETIME DEFAULT CURRENT_TIMESTAMP
                                );

                                CREATE TABLE IF NOT EXISTS days (
                                    id             INTEGER PRIMARY KEY AUTOINCREMENT,
                                    week_id        INTEGER REFERENCES weeks(id) ON DELETE SET NULL,
                                    date           TEXT    NOT NULL,
                                    total_earnings REAL,
                                    start_time     TEXT,                   -- HH:MM 24h
                                    end_time       TEXT,                   -- HH:MM 24h
                                    active_time    INTEGER,                -- minutes
                                    total_time     INTEGER,                -- minutes
                                    deliveries     INTEGER,
                                    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
                                );

                                CREATE TABLE IF NOT EXISTS offers (
                                    id             INTEGER PRIMARY KEY AUTOINCREMENT,
                                    day_id         INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
                                    store          TEXT,
                                    total_earnings REAL,
                                    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
                                );

                                -- Index for fast date-range queries on days
                                CREATE INDEX IF NOT EXISTS idx_days_date    ON days(date);
                                CREATE INDEX IF NOT EXISTS idx_days_week_id ON days(week_id);
                                CREATE INDEX IF NOT EXISTS idx_offers_day_id ON offers(day_id);
                            ",
                            kind: MigrationKind::Up,
                        },
                    ],
                )
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .manage(AuthState::new())
        .invoke_handler(tauri::generate_handler![
            hash_password,
            verify_password,
            set_session,
            clear_session,
            get_current_user,
            check_auth_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
