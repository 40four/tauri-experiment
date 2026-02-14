use serde::{Deserialize, Serialize};
use tauri::State;
use std::sync::Mutex;
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuthSession {
    pub user_id: i64,
    pub username: String,
    pub logged_in: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VerifyPasswordRequest {
    pub password: String,
    pub hash: String,
}

#[derive(Debug, Serialize)]
pub struct HashResponse {
    pub hash: String,
}

#[derive(Debug, Serialize)]
pub struct VerifyResponse {
    pub valid: bool,
}

pub struct AuthState {
    pub current_user: Mutex<Option<AuthSession>>,
}

impl AuthState {
    pub fn new() -> Self {
        Self {
            current_user: Mutex::new(None),
        }
    }
}

// Tauri command to hash a password using Argon2
#[tauri::command]
pub async fn hash_password(password: String) -> Result<HashResponse, String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    
    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|e| format!("Failed to hash password: {}", e))?;
    
    Ok(HashResponse { hash })
}

// Tauri command to verify a password against a hash
#[tauri::command]
pub async fn verify_password(request: VerifyPasswordRequest) -> Result<VerifyResponse, String> {
    let parsed_hash = PasswordHash::new(&request.hash)
        .map_err(|e| format!("Failed to parse hash: {}", e))?;
    
    let argon2 = Argon2::default();
    
    let valid = argon2.verify_password(request.password.as_bytes(), &parsed_hash).is_ok();
    
    Ok(VerifyResponse { valid })
}

// Session management commands
#[tauri::command]
pub async fn set_session(
    state: State<'_, AuthState>,
    session: AuthSession,
) -> Result<(), String> {
    *state.current_user.lock().unwrap() = Some(session);
    Ok(())
}

#[tauri::command]
pub async fn clear_session(
    state: State<'_, AuthState>,
) -> Result<(), String> {
    *state.current_user.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
pub async fn get_current_user(
    state: State<'_, AuthState>,
) -> Result<Option<AuthSession>, String> {
    Ok(state.current_user.lock().unwrap().clone())
}

#[tauri::command]
pub async fn check_auth_status(
    state: State<'_, AuthState>,
) -> Result<bool, String> {
    Ok(state.current_user.lock().unwrap().is_some())
}
