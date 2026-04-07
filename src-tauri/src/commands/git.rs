use tauri::{AppHandle, Emitter, State};

use crate::git::branches::list_local_branches;
use crate::git::worktree::{self, DbMode};
use crate::process::manager::{self, stop_service, WorktreeDbInfo};
use crate::state::{Branch, SharedState};

#[tauri::command]
pub fn list_branches(state: State<'_, SharedState>) -> Result<Vec<Branch>, String> {
    let s = state.lock().unwrap();
    let path = s.project_path().ok_or("No project path set")?;
    let envs = &s.environments;
    list_local_branches(&path, envs)
}

#[tauri::command(async)]
pub fn remove_worktree(branch_name: String, state: State<'_, SharedState>) -> Result<(), String> {
    // Stop service first
    let _ = stop_service(&state, &branch_name);

    let s = state.lock().unwrap();
    let path = s.project_path().ok_or("No project path set")?;
    drop(s);

    worktree::remove_worktree(&path, &branch_name)?;

    let mut s = state.lock().unwrap();
    s.environments.remove(&branch_name);
    Ok(())
}

#[tauri::command(async)]
pub fn create_worktree(
    branch_name: String,
    db_mode: Option<String>,
    source_branch: Option<String>,
    app: AppHandle,
    state: State<'_, SharedState>,
) -> Result<(), String> {
    let repo_path = {
        let s = state.lock().unwrap();
        s.project_path().ok_or("No project path set")?
    };

    let mode = match db_mode.as_deref() {
        Some("clone") => {
            let src = source_branch.ok_or("source_branch is required for clone mode")?;
            DbMode::Clone { source_branch: src }
        }
        Some("reuse") => {
            let src = source_branch.ok_or("source_branch is required for reuse mode")?;
            DbMode::Reuse { source_branch: src }
        }
        _ => DbMode::New,
    };

    worktree::create_worktree_full(&app, &repo_path, &branch_name, mode)?;

    let _ = app.emit("environment-updated", ());
    Ok(())
}

#[tauri::command]
pub fn list_worktree_db_info(state: State<'_, SharedState>) -> Result<Vec<WorktreeDbInfo>, String> {
    let s = state.lock().unwrap();
    let path = s.project_path().ok_or("No project path set")?;
    drop(s);
    Ok(manager::list_worktree_db_info(&path))
}

#[tauri::command]
pub fn open_in_vscode(path: String) -> Result<(), String> {
    let dir = std::path::Path::new(&path);
    // Look for a .code-workspace file in the worktree root so VS Code
    // opens the multi-root workspace directly instead of a plain folder.
    let workspace_file = std::fs::read_dir(dir)
        .ok()
        .and_then(|entries| {
            entries
                .filter_map(|e| e.ok())
                .find(|e| {
                    e.path()
                        .extension()
                        .map_or(false, |ext| ext == "code-workspace")
                })
                .map(|e| e.path())
        });

    let target = workspace_file
        .as_deref()
        .unwrap_or(dir);

    std::process::Command::new("code")
        .arg(target)
        .spawn()
        .map_err(|e| format!("Failed to open VS Code: {}", e))?;
    Ok(())
}
