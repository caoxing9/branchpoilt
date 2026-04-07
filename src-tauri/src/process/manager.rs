use std::io::{BufRead, BufReader};
use std::os::unix::process::CommandExt;
use std::path::Path;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter, Manager};

use crate::state::{SharedState, Status};

extern crate libc;

/// Detect the start command from package.json
pub fn detect_start_command(worktree_path: &Path) -> String {
    let pkg_path = worktree_path.join("package.json");
    if let Ok(content) = std::fs::read_to_string(&pkg_path) {
        if let Ok(pkg) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(scripts) = pkg.get("scripts").and_then(|s| s.as_object()) {
                // Prefer "dev" over "start"
                if scripts.contains_key("dev") {
                    return detect_package_manager(worktree_path, "dev");
                }
                if scripts.contains_key("start") {
                    return detect_package_manager(worktree_path, "start");
                }
            }
        }
    }
    "npm run dev".to_string()
}

/// Detect package manager from lockfile
fn detect_package_manager(path: &Path, script: &str) -> String {
    if path.join("pnpm-lock.yaml").exists() {
        format!("pnpm run {}", script)
    } else if path.join("yarn.lock").exists() {
        format!("yarn {}", script)
    } else if path.join("bun.lock").exists() || path.join("bun.lockb").exists() {
        format!("bun run {}", script)
    } else {
        format!("npm run {}", script)
    }
}

/// Check if node_modules exists, if not install dependencies
fn ensure_dependencies(worktree_path: &Path) -> Result<(), String> {
    if worktree_path.join("node_modules").exists() {
        return Ok(());
    }

    let install_cmd = if worktree_path.join("pnpm-lock.yaml").exists() {
        "pnpm install"
    } else if worktree_path.join("yarn.lock").exists() {
        "yarn install"
    } else {
        "npm install"
    };

    let output = Command::new("sh")
        .args(["-c", install_cmd])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to install deps: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Dependency install failed: {}", stderr));
    }

    Ok(())
}

/// Start a dev server for a branch
pub fn start_service(
    app: AppHandle,
    state: tauri::State<'_, SharedState>,
    branch_name: &str,
    worktree_path: &Path,
    port: u16,
) -> Result<(), String> {
    // Install deps if needed
    ensure_dependencies(worktree_path)?;

    let cmd = detect_start_command(worktree_path);

    // Spawn process with its own process group
    let mut child = unsafe {
        Command::new("sh")
            .args(["-c", &cmd])
            .current_dir(worktree_path)
            .env("PORT", port.to_string())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .pre_exec(|| {
                // Create new process group
                libc::setpgid(0, 0);
                Ok(())
            })
            .spawn()
            .map_err(|e| format!("Failed to start service: {}", e))?
    };

    let pid = child.id();

    // Store PID
    {
        let mut s = state.lock().unwrap();
        s.pids.insert(branch_name.to_string(), pid);
        if let Some(env) = s.environments.get_mut(branch_name) {
            env.status = Status::Running;
        }
    }

    // Stream stdout logs
    let branch_for_stdout = branch_name.to_string();
    let app_for_stdout = app.clone();
    if let Some(stdout) = child.stdout.take() {
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if let Ok(line) = line {
                    let _ = app_for_stdout.emit(
                        &format!("branch-log:{}", branch_for_stdout),
                        line,
                    );
                }
            }
        });
    }

    // Stream stderr logs
    let branch_for_stderr = branch_name.to_string();
    let app_for_stderr = app.clone();
    if let Some(stderr) = child.stderr.take() {
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(line) = line {
                    let _ = app_for_stderr.emit(
                        &format!("branch-log:{}", branch_for_stderr),
                        line,
                    );
                }
            }
        });
    }

    // Monitor process exit
    let branch_for_wait = branch_name.to_string();
    let app_for_wait = app.clone();
    std::thread::spawn(move || {
        let _ = child.wait();
        // Use try_state to avoid requiring Manager in thread
        if let Some(state) = app_for_wait.try_state::<SharedState>() {
            let mut s = state.lock().unwrap();
            s.pids.remove(&branch_for_wait);
            if let Some(env) = s.environments.get_mut(&branch_for_wait) {
                if env.status == Status::Running {
                    env.status = Status::Error;
                }
            }
        }
        let _ = app_for_wait.emit("environment-updated", ());
    });

    let _ = app.emit("environment-updated", ());
    Ok(())
}

/// Stop a branch service by killing the process group
pub fn stop_service(state: &SharedState, branch_name: &str) -> Result<(), String> {
    let mut s = state.lock().unwrap();

    if let Some(pid) = s.pids.remove(branch_name) {
        // Kill the entire process group
        unsafe {
            libc::killpg(pid as i32, libc::SIGTERM);
        }

        // Give it a moment, then force kill if needed
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(3));
            unsafe {
                libc::killpg(pid as i32, libc::SIGKILL);
            }
        });
    }

    if let Some(env) = s.environments.get_mut(branch_name) {
        env.status = Status::Stopped;
    }

    Ok(())
}

/// Kill all running processes (called on app exit)
pub fn cleanup_all(state: &SharedState) {
    let s = state.lock().unwrap();
    for (_, pid) in s.pids.iter() {
        unsafe {
            libc::killpg(*pid as i32, libc::SIGTERM);
        }
    }
}
