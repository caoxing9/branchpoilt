mod commands;
mod git;
mod process;
mod state;
mod tray;
mod watcher;

use tauri::Manager;

use state::{AppState, SharedState};
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(AppState::new()) as SharedState)
        .setup(|app| {
            tray::setup_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::git::list_branches,
            commands::git::remove_worktree,
            commands::service::start_branch,
            commands::service::stop_branch,
            commands::service::get_environments,
            commands::service::get_branch_logs,
            commands::service::open_preview_window,
            commands::settings::get_settings,
            commands::settings::set_project_path,
        ])
        .on_window_event(|window, event| {
            // Hide window on focus lost (menubar app behavior)
            if let tauri::WindowEvent::Focused(false) = event {
                if window.label() == "main" {
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                let state = app.state::<SharedState>();
                process::manager::cleanup_all(&state);
            }
        });
}
