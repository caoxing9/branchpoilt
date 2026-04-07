use tauri::{AppHandle, Emitter, State};

use crate::state::{AppSettings, SharedState};

#[tauri::command]
pub fn get_settings(state: State<'_, SharedState>) -> Result<AppSettings, String> {
    let s = state.lock().unwrap();
    Ok(s.settings.clone())
}

#[tauri::command]
pub fn set_project_path(
    path: String,
    app: AppHandle,
    state: State<'_, SharedState>,
) -> Result<(), String> {
    // Validate it's a git repo
    let repo_path = std::path::Path::new(&path);
    if !repo_path.join(".git").exists() {
        return Err("Not a git repository".to_string());
    }

    let mut s = state.lock().unwrap();
    s.settings.project_path = Some(path);
    // Reset environments for new project
    s.environments.clear();
    s.next_port = s.settings.base_port;
    drop(s);

    let _ = app.emit("environment-updated", ());
    Ok(())
}
