mod pks;

use pks::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            pks::has_api_key,
            pks::set_api_key,
            pks::clear_api_key,
            pks::pks_fetch,
            pks::sql_batch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
