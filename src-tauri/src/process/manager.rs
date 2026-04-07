use std::io::{BufRead, BufReader};
use std::os::unix::process::CommandExt;
use std::path::Path;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter, Manager};

use crate::state::{SharedState, Status};

extern crate libc;

/// A command to start, with its label and whether it's the preview target
struct StartCommand {
    label: String,
    command: String,
    /// The port this process listens on (for preview)
    port: u16,
    /// Extra env vars to set
    env_vars: Vec<(String, String)>,
}

/// Strip leading env var assignments from a shell script line
/// e.g. "SERVER_PORT=3003 SOCKET_PORT=3003 pnpm -r dev" -> "pnpm -r dev"
fn strip_env_prefix(script: &str) -> String {
    let mut result_parts = Vec::new();
    let mut found_cmd = false;

    for part in script.split_whitespace() {
        if !found_cmd && part.contains('=') {
            // Skip env var assignments like VAR=value
            continue;
        } else {
            found_cmd = true;
            result_parts.push(part);
        }
    }

    result_parts.join(" ")
}

/// Detect start commands from package.json, with proper port allocation.
fn detect_start_commands(worktree_path: &Path, backend_port: u16, socket_port: u16, frontend_port: u16) -> Vec<StartCommand> {
    let pkg_path = worktree_path.join("package.json");
    if let Ok(content) = std::fs::read_to_string(&pkg_path) {
        if let Ok(pkg) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(scripts) = pkg.get("scripts").and_then(|s| s.as_object()) {
                let pm = detect_package_manager(worktree_path);

                // Check for separate backend/frontend scripts
                let has_backend = scripts.contains_key("dev:backend");
                let has_frontend = scripts.contains_key("dev:frontend");

                if has_backend && has_frontend {
                    let backend_script = scripts["dev:backend"].as_str().unwrap_or("");
                    let frontend_script = scripts["dev:frontend"].as_str().unwrap_or("");

                    let backend_cmd = strip_env_prefix(backend_script);
                    let frontend_cmd = strip_env_prefix(frontend_script);

                    // Always set port env vars as process environment variables,
                    // because tools like Next.js determine the dev server port from
                    // process env BEFORE loading .env files.
                    let backend_env = vec![
                        ("SERVER_PORT".to_string(), backend_port.to_string()),
                        ("SOCKET_PORT".to_string(), socket_port.to_string()),
                    ];

                    let frontend_env = vec![
                        ("SERVER_PORT".to_string(), backend_port.to_string()),
                        ("SOCKET_PORT".to_string(), socket_port.to_string()),
                        ("PORT".to_string(), frontend_port.to_string()),
                    ];

                    return vec![
                        StartCommand {
                            label: "backend".to_string(),
                            command: backend_cmd,
                            port: backend_port,
                            env_vars: backend_env,
                        },
                        StartCommand {
                            label: "frontend".to_string(),
                            command: frontend_cmd,
                            port: frontend_port,
                            env_vars: frontend_env,
                        },
                    ];
                }

                // Fallback: single dev or start script
                let script_name = if scripts.contains_key("dev") { "dev" }
                    else if scripts.contains_key("start") { "start" }
                    else { "dev" };

                return vec![StartCommand {
                    label: "dev".to_string(),
                    command: format!("{} run {}", pm, script_name),
                    port: frontend_port,
                    env_vars: vec![("PORT".to_string(), frontend_port.to_string())],
                }];
            }
        }
    }

    vec![StartCommand {
        label: "dev".to_string(),
        command: "npm run dev".to_string(),
        port: frontend_port,
        env_vars: vec![("PORT".to_string(), frontend_port.to_string())],
    }]
}

/// Detect package manager from lockfile
fn detect_package_manager(path: &Path) -> &'static str {
    if path.join("pnpm-lock.yaml").exists() {
        "pnpm"
    } else if path.join("yarn.lock").exists() {
        "yarn"
    } else if path.join("bun.lock").exists() || path.join("bun.lockb").exists() {
        "bun"
    } else {
        "npm"
    }
}

/// Check if node_modules exists, if not install dependencies
fn ensure_dependencies(worktree_path: &Path) -> Result<(), String> {
    if worktree_path.join("node_modules").exists() {
        return Ok(());
    }

    let pm = detect_package_manager(worktree_path);
    let install_cmd = format!("{} install", pm);

    let output = Command::new("sh")
        .args(["-c", &install_cmd])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to install deps: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Dependency install failed: {}", stderr));
    }

    Ok(())
}

/// Spawn a single process and wire up logging + exit monitoring
fn spawn_process(
    app: &AppHandle,
    state: &tauri::State<'_, SharedState>,
    branch_name: &str,
    cmd: &StartCommand,
    worktree_path: &Path,
) -> Result<u32, String> {
    eprintln!("[BranchPilot] spawn: branch={}, label={}, cmd='{}', dir={}, port={}",
        branch_name, cmd.label, cmd.command, worktree_path.display(), cmd.port);

    let mut command = Command::new("sh");
    command.args(["-c", &cmd.command])
        .current_dir(worktree_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Set env vars
    for (key, val) in &cmd.env_vars {
        command.env(key, val);
    }

    let mut child = unsafe {
        command
            .pre_exec(|| {
                libc::setpgid(0, 0);
                Ok(())
            })
            .spawn()
            .map_err(|e| format!("Failed to start {}: {}", cmd.label, e))?
    };

    let pid = child.id();

    // Stream stdout
    let log_prefix = format!("[{}] ", cmd.label);
    let branch_name_s = branch_name.to_string();
    let app_clone = app.clone();
    let prefix = log_prefix.clone();
    if let Some(stdout) = child.stdout.take() {
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if let Ok(line) = line {
                    let _ = app_clone.emit(
                        &format!("branch-log:{}", branch_name_s),
                        format!("{}{}", prefix, line),
                    );
                }
            }
        });
    }

    // Stream stderr
    let branch_name_s = branch_name.to_string();
    let app_clone = app.clone();
    let prefix = log_prefix;
    if let Some(stderr) = child.stderr.take() {
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(line) = line {
                    let _ = app_clone.emit(
                        &format!("branch-log:{}", branch_name_s),
                        format!("{}{}", prefix, line),
                    );
                }
            }
        });
    }

    // Monitor exit
    let branch_name_s = branch_name.to_string();
    let label_s = cmd.label.clone();
    let app_clone = app.clone();
    std::thread::spawn(move || {
        let status = child.wait();
        eprintln!("[BranchPilot] process exited: branch={}, label={}, status={:?}",
            branch_name_s, label_s, status);
        if let Some(state) = app_clone.try_state::<SharedState>() {
            let mut s = state.lock().unwrap();
            s.pids.remove(&format!("{}:{}", branch_name_s, label_s));
            // If no more PIDs for this branch, mark as error
            let has_remaining = s.pids.keys().any(|k| k.starts_with(&format!("{}:", branch_name_s)));
            if !has_remaining {
                if let Some(env) = s.environments.get_mut(&branch_name_s) {
                    if env.status == Status::Running {
                        env.status = Status::Error;
                    }
                }
            }
        }
        let _ = app_clone.emit("environment-updated", ());
    });

    // Store PID with label
    {
        let mut s = state.lock().unwrap();
        s.pids.insert(format!("{}:{}", branch_name, cmd.label), pid);
    }

    Ok(pid)
}

/// Read an env var value from the project's .env files
pub fn read_env_var(worktree_path: &Path, key: &str) -> Option<String> {
    let env_files = [
        "enterprise/app-ee/.env.development.local",
        ".env.development.local",
        "enterprise/app-ee/.env.local",
        ".env.local",
        "enterprise/app-ee/.env.development",
        ".env.development",
        "enterprise/app-ee/.env",
        ".env",
    ];

    let prefix = format!("{}=", key);
    for env_file in &env_files {
        let path = worktree_path.join(env_file);
        if let Ok(content) = std::fs::read_to_string(&path) {
            for line in content.lines() {
                let line = line.trim();
                if line.starts_with('#') || !line.contains('=') {
                    continue;
                }
                if let Some(val) = line.strip_prefix(&prefix) {
                    return Some(val.to_string());
                }
            }
        }
    }
    None
}

/// Read the base PRISMA_DATABASE_URL from the project's .env files
pub fn read_base_database_url(worktree_path: &Path) -> Option<String> {
    read_env_var(worktree_path, "PRISMA_DATABASE_URL")
}

/// Replace the database name in a PostgreSQL URL
/// e.g. "postgresql://user:pass@host:5432/teable?schema=public"
///   -> "postgresql://user:pass@host:5432/teable_fix_share?schema=public"
pub fn replace_db_name(url: &str, new_db_name: &str) -> String {
    // URL format: postgresql://user:pass@host:port/dbname?params
    if let Some(slash_pos) = url.rfind("://") {
        let after_proto = &url[slash_pos + 3..];
        // Find the slash before db name (after host:port)
        if let Some(db_start) = after_proto.find('/') {
            let prefix = &url[..slash_pos + 3 + db_start + 1]; // everything up to and including the /
            let after_db = &after_proto[db_start + 1..];
            // Find where db name ends (? or end of string)
            let db_end = after_db.find('?').unwrap_or(after_db.len());
            let suffix = &after_db[db_end..]; // ?params or empty
            return format!("{}{}{}", prefix, new_db_name, suffix);
        }
    }
    url.to_string()
}

/// Create an isolated database for a branch if it doesn't exist
pub fn ensure_branch_database(base_url: &str, branch_name: &str) -> Result<String, String> {
    let safe_name = branch_name
        .replace('/', "_")
        .replace('-', "_")
        .to_lowercase();
    let branch_db_name = format!("teable_{}", safe_name);

    // Extract connection info without db name for admin connection
    // Connect to 'postgres' db to create the new one
    let admin_url = replace_db_name(base_url, "postgres");
    // Strip query params for psql
    let admin_url_clean = admin_url.split('?').next().unwrap_or(&admin_url);

    // Check if database already exists
    let check = Command::new("psql")
        .args([admin_url_clean, "-tAc",
            &format!("SELECT 1 FROM pg_database WHERE datname = '{}'", branch_db_name)])
        .output()
        .map_err(|e| format!("Failed to run psql: {}", e))?;

    let exists = String::from_utf8_lossy(&check.stdout).trim() == "1";

    if !exists {
        // Extract the base db name from the original URL
        let base_db = extract_db_name(base_url).unwrap_or("teable".to_string());

        eprintln!("[BranchPilot] Creating database '{}' from template '{}'", branch_db_name, base_db);

        // Create database from template (clones all data)
        let create = Command::new("psql")
            .args([admin_url_clean, "-c",
                &format!("CREATE DATABASE \"{}\" TEMPLATE \"{}\"", branch_db_name, base_db)])
            .output()
            .map_err(|e| format!("Failed to create database: {}", e))?;

        if !create.status.success() {
            let stderr = String::from_utf8_lossy(&create.stderr);
            // If template is being accessed, fall back to empty db + migration
            if stderr.contains("being accessed by other users") {
                eprintln!("[BranchPilot] Template db in use, creating empty database '{}'", branch_db_name);
                let create_empty = Command::new("psql")
                    .args([admin_url_clean, "-c",
                        &format!("CREATE DATABASE \"{}\"", branch_db_name)])
                    .output()
                    .map_err(|e| format!("Failed to create empty database: {}", e))?;

                if !create_empty.status.success() {
                    let stderr = String::from_utf8_lossy(&create_empty.stderr);
                    return Err(format!("Failed to create database: {}", stderr));
                }
            } else {
                return Err(format!("Failed to create database: {}", stderr));
            }
        }
    } else {
        eprintln!("[BranchPilot] Database '{}' already exists", branch_db_name);
    }

    // Return the new database URL
    let new_url = replace_db_name(base_url, &branch_db_name);
    Ok(new_url)
}

/// Assign a unique Redis db number for a branch.
/// Redis URLs look like: redis://:password@host:port/db_number
/// We hash the branch name to pick a db in range 2..15 (reserving 0-1).
fn assign_redis_db(base_uri: &str, branch_name: &str) -> String {
    // Simple hash: sum of bytes mod 14, offset by 2 → range [2, 15]
    let hash: u32 = branch_name.bytes().map(|b| b as u32).sum();
    let db_num = (hash % 14) + 2;

    // Replace the db number at the end of the URI: redis://:pass@host:port/OLD -> redis://:pass@host:port/NEW
    if let Some(last_slash) = base_uri.rfind('/') {
        // Check that what's after the last slash looks like a db number
        let after_slash = &base_uri[last_slash + 1..];
        if after_slash.chars().all(|c| c.is_ascii_digit()) {
            return format!("{}/{}", &base_uri[..last_slash], db_num);
        }
    }
    // Fallback: append /db_num
    format!("{}/{}", base_uri.trim_end_matches('/'), db_num)
}

/// Extract database name from a PostgreSQL URL
fn extract_db_name(url: &str) -> Option<String> {
    if let Some(slash_pos) = url.rfind("://") {
        let after_proto = &url[slash_pos + 3..];
        if let Some(db_start) = after_proto.find('/') {
            let after_db = &after_proto[db_start + 1..];
            let db_end = after_db.find('?').unwrap_or(after_db.len());
            return Some(after_db[..db_end].to_string());
        }
    }
    None
}

/// Start dev services for a branch.
/// `backend_port` / `frontend_port` are the ports to use (either from env files or allocated).
pub fn start_service(
    app: AppHandle,
    state: tauri::State<'_, SharedState>,
    branch_name: &str,
    worktree_path: &Path,
    backend_port: u16,
    socket_port: u16,
    frontend_port: u16,
) -> Result<(), String> {
    // Clean up stale Next.js dev lock files to prevent "is another instance running?" errors
    for lock_path in &[
        worktree_path.join("enterprise/app-ee/.next/dev/lock"),
        worktree_path.join(".next/dev/lock"),
    ] {
        if lock_path.exists() {
            eprintln!("[BranchPilot] Removing stale Next.js lock: {}", lock_path.display());
            let _ = std::fs::remove_file(lock_path);
        }
    }

    // Install deps if needed
    ensure_dependencies(worktree_path)?;

    // Database isolation: create branch-specific database
    let db_url = if let Some(base_url) = read_base_database_url(worktree_path) {
        match ensure_branch_database(&base_url, branch_name) {
            Ok(url) => {
                eprintln!("[BranchPilot] Using database URL: {}", url);
                Some(url)
            }
            Err(e) => {
                eprintln!("[BranchPilot] Warning: database isolation failed: {}. Using default.", e);
                None
            }
        }
    } else {
        eprintln!("[BranchPilot] No PRISMA_DATABASE_URL found, skipping database isolation");
        None
    };

    let mut commands = detect_start_commands(worktree_path, backend_port, socket_port, frontend_port);

    // Add PRISMA_DATABASE_URL to all commands if we have an isolated db
    if let Some(ref url) = db_url {
        for cmd in &mut commands {
            cmd.env_vars.push(("PRISMA_DATABASE_URL".to_string(), url.clone()));
        }
    }

    // Redis isolation: assign a unique Redis db number per branch to prevent session conflicts.
    // Redis supports db 0-15 by default; we use db 2+ (reserving 0-1 for default/test).
    if let Some(redis_uri) = read_env_var(worktree_path, "BACKEND_CACHE_REDIS_URI") {
        let isolated_uri = assign_redis_db(&redis_uri, branch_name);
        eprintln!("[BranchPilot] Using Redis URI: {}", isolated_uri);
        for cmd in &mut commands {
            cmd.env_vars.push(("BACKEND_CACHE_REDIS_URI".to_string(), isolated_uri.clone()));
        }
    }

    for cmd in &commands {
        spawn_process(&app, &state, branch_name, cmd, worktree_path)?;
    }

    // Update status to running
    {
        let mut s = state.lock().unwrap();
        if let Some(env) = s.environments.get_mut(branch_name) {
            env.status = Status::Running;
        }
    }

    let _ = app.emit("environment-updated", ());
    Ok(())
}

/// Kill any process listening on the given port via `lsof`
fn kill_port(port: u16) {
    let output = std::process::Command::new("lsof")
        .args(["-ti", &format!("tcp:{}", port)])
        .output();
    if let Ok(output) = output {
        let pids_str = String::from_utf8_lossy(&output.stdout);
        for pid_s in pids_str.split_whitespace() {
            if let Ok(pid) = pid_s.trim().parse::<i32>() {
                unsafe {
                    libc::kill(pid, libc::SIGKILL);
                }
            }
        }
    }
}

/// Stop a branch service by killing all process groups for this branch
pub fn stop_service(state: &SharedState, branch_name: &str) -> Result<(), String> {
    let mut s = state.lock().unwrap();

    // Collect ports before clearing, so we can do port-level cleanup
    let ports_to_kill: Vec<u16> = s.environments.get(branch_name)
        .map(|env| {
            let mut ports = Vec::new();
            if let Some(p) = env.port { ports.push(p); }
            if let Some(p) = env.backend_port { ports.push(p); }
            if let Some(p) = env.socket_port { ports.push(p); }
            ports
        })
        .unwrap_or_default();

    let prefix = format!("{}:", branch_name);
    let pids: Vec<(String, u32)> = s.pids.iter()
        .filter(|(k, _)| k.starts_with(&prefix))
        .map(|(k, v)| (k.clone(), *v))
        .collect();

    for (key, pid) in &pids {
        s.pids.remove(key);
        unsafe {
            libc::killpg(*pid as i32, libc::SIGTERM);
        }
    }

    if let Some(env) = s.environments.get_mut(branch_name) {
        env.status = Status::Stopped;
        env.port = None;
        env.backend_port = None;
        env.socket_port = None;
    }

    // Drop the lock before sleeping
    drop(s);

    // Background: force-kill process groups after timeout, then kill anything still on the ports
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(3));
        for (_, pid) in pids {
            unsafe {
                libc::killpg(pid as i32, libc::SIGKILL);
            }
        }
        // Final fallback: kill anything still listening on these ports
        for port in ports_to_kill {
            kill_port(port);
        }
    });

    Ok(())
}

/// Kill all running processes (called on app exit)
pub fn cleanup_all(state: &SharedState) {
    let s = state.lock().unwrap();
    for (_, pid) in s.pids.iter() {
        unsafe {
            libc::killpg(*pid as i32, libc::SIGKILL);
        }
    }
    // Also kill by port for any leaked child processes
    for env in s.environments.values() {
        if env.status == Status::Running || env.status == Status::Building {
            if let Some(p) = env.port { kill_port(p); }
            if let Some(p) = env.backend_port { kill_port(p); }
            if let Some(p) = env.socket_port { kill_port(p); }
        }
    }
}
