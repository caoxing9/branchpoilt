use std::collections::HashMap;
use std::path::Path;
use std::process::Command;

use crate::state::{Branch, BranchEnvironment};

pub fn list_local_branches(
    repo_path: &Path,
    environments: &HashMap<String, BranchEnvironment>,
) -> Result<Vec<Branch>, String> {
    // Use `git worktree list --porcelain` to get only branches with worktrees
    let output = Command::new("git")
        .current_dir(repo_path)
        .args(["worktree", "list", "--porcelain"])
        .output()
        .map_err(|e| format!("Failed to run git worktree list: {}", e))?;

    if !output.status.success() {
        return Err("git worktree list failed".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Get current branch of this worktree
    let head_output = Command::new("git")
        .current_dir(repo_path)
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .ok()
        .and_then(|o| if o.status.success() {
            Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
        } else {
            None
        });

    let mut result = Vec::new();
    let mut current_branch: Option<String> = None;

    for line in stdout.lines() {
        if let Some(branch_ref) = line.strip_prefix("branch ") {
            let name = branch_ref
                .strip_prefix("refs/heads/")
                .unwrap_or(branch_ref)
                .to_string();
            current_branch = Some(name);
        } else if line.is_empty() {
            // End of a worktree entry
            if let Some(name) = current_branch.take() {
                let is_current = head_output.as_deref() == Some(&name);
                let environment = environments.get(&name).cloned();
                result.push(Branch {
                    name,
                    is_current,
                    environment,
                });
            }
        }
    }
    // Handle last entry (if no trailing empty line)
    if let Some(name) = current_branch.take() {
        let is_current = head_output.as_deref() == Some(&name);
        let environment = environments.get(&name).cloned();
        result.push(Branch {
            name,
            is_current,
            environment,
        });
    }

    // Sort: current branch first, then alphabetically
    result.sort_by(|a, b| {
        if a.is_current && !b.is_current {
            std::cmp::Ordering::Less
        } else if !a.is_current && b.is_current {
            std::cmp::Ordering::Greater
        } else {
            a.name.cmp(&b.name)
        }
    });

    Ok(result)
}
