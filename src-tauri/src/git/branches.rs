use git2::Repository;
use std::path::Path;

use crate::state::{Branch, BranchEnvironment};
use std::collections::HashMap;

pub fn list_local_branches(
    repo_path: &Path,
    environments: &HashMap<String, BranchEnvironment>,
) -> Result<Vec<Branch>, String> {
    let repo = Repository::open(repo_path).map_err(|e| format!("Failed to open repo: {}", e))?;

    let head = repo.head().ok();
    let current_branch = head
        .as_ref()
        .and_then(|h| h.shorthand().map(|s| s.to_string()));

    let branches = repo
        .branches(Some(git2::BranchType::Local))
        .map_err(|e| format!("Failed to list branches: {}", e))?;

    let mut result = Vec::new();
    for branch in branches {
        let (branch, _) = branch.map_err(|e| format!("Failed to read branch: {}", e))?;
        if let Some(name) = branch.name().ok().flatten() {
            let name = name.to_string();
            let is_current = current_branch.as_deref() == Some(&name);
            let environment = environments.get(&name).cloned();
            result.push(Branch {
                name,
                is_current,
                environment,
            });
        }
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
