use std::path::{Path, PathBuf};
use std::process::Command;

pub fn create_worktree(repo_path: &Path, branch_name: &str) -> Result<PathBuf, String> {
    let safe_name = branch_name.replace('/', "-");
    let worktree_path = repo_path.join(".worktrees").join(&safe_name);

    if worktree_path.exists() {
        return Ok(worktree_path);
    }

    // Create .worktrees directory
    std::fs::create_dir_all(repo_path.join(".worktrees"))
        .map_err(|e| format!("Failed to create .worktrees dir: {}", e))?;

    let output = Command::new("git")
        .current_dir(repo_path)
        .args(["worktree", "add", worktree_path.to_str().unwrap(), branch_name])
        .output()
        .map_err(|e| format!("Failed to run git worktree add: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git worktree add failed: {}", stderr));
    }

    Ok(worktree_path)
}

pub fn remove_worktree(repo_path: &Path, branch_name: &str) -> Result<(), String> {
    let safe_name = branch_name.replace('/', "-");
    let worktree_path = repo_path.join(".worktrees").join(&safe_name);

    if !worktree_path.exists() {
        return Ok(());
    }

    let output = Command::new("git")
        .current_dir(repo_path)
        .args(["worktree", "remove", "--force", worktree_path.to_str().unwrap()])
        .output()
        .map_err(|e| format!("Failed to run git worktree remove: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git worktree remove failed: {}", stderr));
    }

    Ok(())
}
