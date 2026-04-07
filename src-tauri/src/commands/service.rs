use tauri::{AppHandle, Manager, State, Emitter, WebviewUrl, WebviewWindowBuilder};

use crate::git::worktree;
use crate::process::manager;
use crate::process::port::find_available_port;
use crate::state::{BranchEnvironment, SharedState, Status};
use crate::watcher::file_watcher;

#[tauri::command]
pub fn start_branch(
    branch_name: String,
    app: AppHandle,
    state: State<'_, SharedState>,
) -> Result<(), String> {
    let (repo_path, port, worktree_path);

    {
        let mut s = state.lock().unwrap();
        repo_path = s.project_path().ok_or("No project path set")?;

        // Check if already running
        if let Some(env) = s.environments.get(&branch_name) {
            if env.status == Status::Running || env.status == Status::Building {
                return Err("Branch is already running".to_string());
            }
        }

        // Allocate port
        port = find_available_port(s.next_port);
        s.next_port = port + 1;
    }

    // Create worktree
    worktree_path = worktree::create_worktree(&repo_path, &branch_name)?;

    // Update state
    {
        let mut s = state.lock().unwrap();
        s.environments.insert(
            branch_name.clone(),
            BranchEnvironment {
                branch_name: branch_name.clone(),
                worktree_path: Some(worktree_path.to_string_lossy().to_string()),
                port: Some(port),
                status: Status::Building,
                start_command: None,
            },
        );
    }

    let _ = app.emit("environment-updated", ());

    // Start service
    manager::start_service(app.clone(), state.clone(), &branch_name, &worktree_path, port)?;

    // Start file watcher
    file_watcher::watch_worktree(app, &branch_name, &worktree_path);

    Ok(())
}

#[tauri::command]
pub fn stop_branch(
    branch_name: String,
    app: AppHandle,
    state: State<'_, SharedState>,
) -> Result<(), String> {
    manager::stop_service(&state, &branch_name)?;
    let _ = app.emit("environment-updated", ());
    Ok(())
}

#[tauri::command]
pub fn get_environments(state: State<'_, SharedState>) -> Result<Vec<BranchEnvironment>, String> {
    let s = state.lock().unwrap();
    Ok(s.environments.values().cloned().collect())
}

#[tauri::command]
pub fn get_branch_logs(branch_name: String, state: State<'_, SharedState>) -> Result<Vec<String>, String> {
    let s = state.lock().unwrap();
    Ok(s.logs
        .get(&branch_name)
        .map(|logs| logs.iter().cloned().collect())
        .unwrap_or_default())
}

#[tauri::command]
pub fn open_preview_window(
    _branches: Vec<String>,
    app: AppHandle,
) -> Result<(), String> {
    // Check if preview window already exists
    if let Some(window) = app.get_webview_window("preview") {
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    // Create new preview window
    let url = WebviewUrl::App("preview.html".into());
    WebviewWindowBuilder::new(&app, "preview", url)
        .title("BranchPilot - Compare")
        .inner_size(1200.0, 800.0)
        .resizable(true)
        .build()
        .map_err(|e| format!("Failed to create preview window: {}", e))?;

    Ok(())
}
