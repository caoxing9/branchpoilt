import { invoke } from "@tauri-apps/api/core";
import type { Branch, BranchEnvironment, AppSettings } from "./types";

export async function listBranches(): Promise<Branch[]> {
  return invoke("list_branches");
}

export async function getEnvironments(): Promise<BranchEnvironment[]> {
  return invoke("get_environments");
}

export async function startBranch(branchName: string): Promise<void> {
  return invoke("start_branch", { branchName });
}

export async function stopBranch(branchName: string): Promise<void> {
  return invoke("stop_branch", { branchName });
}

export async function removeBranch(branchName: string): Promise<void> {
  return invoke("remove_worktree", { branchName });
}

export async function getBranchLogs(branchName: string): Promise<string[]> {
  return invoke("get_branch_logs", { branchName });
}

export async function getSettings(): Promise<AppSettings> {
  return invoke("get_settings");
}

export async function setProjectPath(path: string): Promise<void> {
  return invoke("set_project_path", { path });
}

export async function openPreviewWindow(branches: string[]): Promise<void> {
  return invoke("open_preview_window", { branches });
}
