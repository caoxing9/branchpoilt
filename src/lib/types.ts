export type BranchStatus = "running" | "stopped" | "building" | "error";

export interface BranchEnvironment {
  branchName: string;
  worktreePath: string | null;
  port: number | null;
  status: BranchStatus;
  startCommand: string | null;
}

export interface Branch {
  name: string;
  isCurrent: boolean;
  environment: BranchEnvironment | null;
}

export interface AppSettings {
  projectPath: string | null;
  basePort: number;
  defaultStartCommand: string;
}
