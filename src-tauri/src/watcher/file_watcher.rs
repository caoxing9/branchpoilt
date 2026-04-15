use notify::RecursiveMode;
use notify_debouncer_mini::new_debouncer;
use std::collections::HashMap;
use std::path::Path;
use std::sync::{mpsc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// Global registry of watcher shutdown senders, keyed by branch name.
static WATCHER_HANDLES: std::sync::LazyLock<Mutex<HashMap<String, mpsc::Sender<()>>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

pub fn watch_worktree(app: AppHandle, branch_name: &str, worktree_path: &Path) {
    // Stop any existing watcher for this branch first
    stop_watching(branch_name);

    let branch = branch_name.to_string();
    let path = worktree_path.to_path_buf();

    let (shutdown_tx, shutdown_rx) = mpsc::channel::<()>();

    // Register the shutdown sender
    {
        let mut handles = WATCHER_HANDLES.lock().unwrap();
        handles.insert(branch.clone(), shutdown_tx);
    }

    let branch_clone = branch.clone();
    std::thread::spawn(move || {
        let (tx, rx) = mpsc::channel();

        let mut debouncer = match new_debouncer(Duration::from_millis(500), tx) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("Failed to create file watcher: {}", e);
                return;
            }
        };

        if let Err(e) = debouncer.watcher().watch(&path, RecursiveMode::Recursive) {
            eprintln!("Failed to watch path {:?}: {}", path, e);
            return;
        }

        loop {
            // Check for shutdown signal (non-blocking)
            if shutdown_rx.try_recv().is_ok() {
                eprintln!("[TeaBranch] File watcher stopped for branch: {}", branch_clone);
                break;
            }

            // Wait for file events with a timeout so we can check shutdown periodically
            match rx.recv_timeout(Duration::from_secs(2)) {
                Ok(Ok(_events)) => {
                    let _ = app.emit(&format!("file-changed:{}", branch_clone), ());
                }
                Ok(Err(e)) => {
                    eprintln!("Watch error: {}", e);
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    // No events, loop back to check shutdown
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }

        // Clean up our entry from the registry
        let mut handles = WATCHER_HANDLES.lock().unwrap();
        handles.remove(&branch_clone);
    });
}

/// Stop watching a specific branch. The watcher thread will exit within ~2 seconds.
pub fn stop_watching(branch_name: &str) {
    let mut handles = WATCHER_HANDLES.lock().unwrap();
    if let Some(tx) = handles.remove(branch_name) {
        let _ = tx.send(());
        eprintln!("[TeaBranch] Sent shutdown signal to file watcher for branch: {}", branch_name);
    }
}
