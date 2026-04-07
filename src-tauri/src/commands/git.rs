use tauri::State;

use crate::git::branches::list_local_branches;
use crate::git::worktree;
use crate::process::manager::stop_service;
use crate::state::{Branch, SharedState};

#[tauri::command]
pub fn list_branches(state: State<'_, SharedState>) -> Result<Vec<Branch>, String> {
    let s = state.lock().unwrap();
    let path = s.project_path().ok_or("No project path set")?;
    let envs = &s.environments;
    list_local_branches(&path, envs)
}

#[tauri::command]
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
