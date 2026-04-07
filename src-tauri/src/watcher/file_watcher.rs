use notify::RecursiveMode;
use notify_debouncer_mini::new_debouncer;
use std::path::Path;
use std::sync::mpsc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub fn watch_worktree(app: AppHandle, branch_name: &str, worktree_path: &Path) {
    let branch = branch_name.to_string();
    let path = worktree_path.to_path_buf();

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
            match rx.recv() {
                Ok(Ok(_events)) => {
                    let _ = app.emit(&format!("file-changed:{}", branch), ());
                }
                Ok(Err(e)) => {
                    eprintln!("Watch error: {}", e);
                }
                Err(_) => break,
            }
        }
    });
}
