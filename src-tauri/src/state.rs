use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Running,
    Stopped,
    Building,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchEnvironment {
    pub branch_name: String,
    pub worktree_path: Option<String>,
    pub port: Option<u16>,
    pub status: Status,
    pub start_command: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    pub is_current: bool,
    pub environment: Option<BranchEnvironment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub project_path: Option<String>,
    pub base_port: u16,
    pub default_start_command: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            project_path: None,
            base_port: 3001,
            default_start_command: "npm run dev".to_string(),
        }
    }
}

pub struct AppState {
    pub settings: AppSettings,
    pub environments: HashMap<String, BranchEnvironment>,
    pub pids: HashMap<String, u32>,
    pub logs: HashMap<String, VecDeque<String>>,
    pub next_port: u16,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            settings: AppSettings::default(),
            environments: HashMap::new(),
            pids: HashMap::new(),
            logs: HashMap::new(),
            next_port: 3001,
        }
    }

    pub fn project_path(&self) -> Option<PathBuf> {
        self.settings.project_path.as_ref().map(PathBuf::from)
    }

}

pub type SharedState = Mutex<AppState>;
