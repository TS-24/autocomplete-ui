use std::collections::HashMap;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::Mutex;
use std::time::Duration;

use serde::Deserialize;
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

/// Must match `identifier` in tauri.conf.json — changing it later orphans
/// every user's stored key (docs/architecture.md §7).
const KEYRING_SERVICE: &str = "com.autocomplete-ui.app";
const KEYRING_ACCOUNT: &str = "pks-api-key";

const DB_FILE_NAME: &str = "autocomplete-ui.db";
const REQUEST_TIMEOUT_SECS: u64 = 15;

pub struct AppState {
    /// Cached API key so we don't hit the keychain on every fetch.
    key_cache: Mutex<Option<String>>,
    /// Long-lived pool for `sql_batch` (WAL mode; coexists with the
    /// tauri-plugin-sql pool used by the webview).
    sqlite: Mutex<Option<sqlx::SqlitePool>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            key_cache: Mutex::new(None),
            sqlite: Mutex::new(None),
        }
    }
}

fn keyring_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|e| e.to_string())
}

fn get_cached_key(state: &AppState) -> Result<String, String> {
    if let Some(key) = state.key_cache.lock().map_err(|_| "key cache poisoned")?.clone() {
        return Ok(key);
    }
    let key = keyring_entry()?
        .get_password()
        .map_err(|_| "No API key configured".to_string())?;
    *state
        .key_cache
        .lock()
        .map_err(|_| "key cache poisoned")? = Some(key.clone());
    Ok(key)
}

/// True when an API key is stored in the OS keychain.
#[tauri::command]
pub fn has_api_key(state: State<'_, AppState>) -> Result<bool, String> {
    let cached = state.key_cache.lock().map_err(|_| "key cache poisoned")?;
    if cached.is_some() {
        return Ok(true);
    }
    Ok(keyring_entry()?.get_password().is_ok())
}

/// Store the PKS API key in the OS keychain (never persisted anywhere else).
#[tauri::command]
pub fn set_api_key(state: State<'_, AppState>, key: String) -> Result<(), String> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return Err("API key cannot be empty".to_string());
    }
    keyring_entry()?.set_password(trimmed).map_err(|e| e.to_string())?;
    *state
        .key_cache
        .lock()
        .map_err(|_| "key cache poisoned")? = Some(trimmed.to_string());
    Ok(())
}

#[tauri::command]
pub fn clear_api_key(state: State<'_, AppState>) -> Result<(), String> {
    keyring_entry()?.delete_credential().map_err(|e| e.to_string())?;
    *state
        .key_cache
        .lock()
        .map_err(|_| "key cache poisoned")? = None;
    Ok(())
}

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("cannot resolve app config dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create config dir: {e}"))?;
    Ok(dir.join(DB_FILE_NAME))
}

async fn get_pool(app: &AppHandle, state: &AppState) -> Result<sqlx::SqlitePool, String> {
    if let Some(pool) = state.sqlite.lock().map_err(|_| "pool poisoned")?.clone() {
        return Ok(pool);
    }
    let path = db_path(app)?;
    let options = sqlx::sqlite::SqliteConnectOptions::from_str(&format!(
        "sqlite://{}",
        path.display()
    ))
    .map_err(|e| e.to_string())?
    .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
    .foreign_keys(true)
    .busy_timeout(Duration::from_secs(5));
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(4)
        .connect_with(options)
        .await
        .map_err(|e| format!("cannot open database: {e}"))?;
    *state.sqlite.lock().map_err(|_| "pool poisoned")? = Some(pool.clone());
    Ok(pool)
}

/// GET a PKS API path with the key injected server-side. The webview never
/// sees the key (docs/architecture.md §1).
#[tauri::command]
pub async fn pks_fetch(
    state: State<'_, AppState>,
    base_url: String,
    path: String,
    query: HashMap<String, String>,
) -> Result<Value, String> {
    let key = get_cached_key(&state)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .user_agent("autocomplete-ui/0.1.0")
        .build()
        .map_err(|e| e.to_string())?;
    let url = format!("{}{}", base_url.trim_end_matches('/'), path);
    let response = client
        .get(&url)
        .query(&query)
        .header("X-API-Key", &key)
        .send()
        .await
        .map_err(|e| format!("request to {url} failed: {e}"))?;

    let status = response.status();
    let body: Value = response
        .json()
        .await
        .map_err(|e| format!("invalid JSON from {url}: {e}"))?;
    if !status.is_success() {
        let message = body
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(Value::as_str)
            .unwrap_or("unknown error");
        return Err(format!("{url} → HTTP {status}: {message}"));
    }
    Ok(body)
}

#[derive(Debug, Deserialize)]
pub struct BatchStmt {
    sql: String,
    #[serde(default)]
    params: Vec<Value>,
}

#[derive(Debug, serde::Serialize)]
pub struct BatchResult {
    rows_affected: u64,
}

fn bind_value(args: &mut sqlx::sqlite::SqliteArguments, v: &Value) -> Result<(), String> {
    use sqlx::Arguments as _;
    let result = match v {
        Value::Null => args.add::<Option<String>>(None),
        Value::Bool(b) => args.add::<i64>(if *b { 1 } else { 0 }),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                args.add::<i64>(i)
            } else if let Some(f) = n.as_f64() {
                args.add::<f64>(f)
            } else {
                return Err(format!("unsupported number param: {n}"));
            }
        }
        Value::String(s) => args.add::<&str>(s),
        other => return Err(format!("unsupported param type: {other:?}")),
    };
    result.map_err(|e| e.to_string())
}

/// Execute statements atomically in ONE transaction. Used for mirror page
/// upserts (docs/sync-engine.md §7) where per-query IPC would be too slow.
#[tauri::command]
pub async fn sql_batch(
    app: AppHandle,
    state: State<'_, AppState>,
    statements: Vec<BatchStmt>,
) -> Result<BatchResult, String> {
    let pool = get_pool(&app, &state).await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let mut rows_affected: u64 = 0;
    for stmt in &statements {
        let mut args = sqlx::sqlite::SqliteArguments::default();
        for p in &stmt.params {
            bind_value(&mut args, p)?;
        }
        let done = sqlx::query_with(sqlx::AssertSqlSafe(stmt.sql.as_str()), args)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("sql_batch failed: {e} (sql: {})", stmt.sql))?;
        rows_affected += done.rows_affected();
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(BatchResult { rows_affected })
}
