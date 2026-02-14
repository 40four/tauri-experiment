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
                    vec![Migration {
                        version: 1,
                        description: "create_users_table",
                        sql: "CREATE TABLE IF NOT EXISTS users (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            username TEXT NOT NULL UNIQUE,
                            password_hash TEXT NOT NULL,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )",
                        kind: MigrationKind::Up,
                    }],
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
