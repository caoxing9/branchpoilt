import { useState } from "react";
import type { Branch } from "../lib/types";
import { StatusBadge } from "./StatusBadge";
import { LogViewer } from "./LogViewer";
import { startBranch, stopBranch } from "../lib/commands";

interface BranchCardProps {
  branch: Branch;
  onRefresh: () => void;
}

export function BranchCard({ branch, onRefresh }: BranchCardProps) {
  const [loading, setLoading] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const env = branch.environment;
  const status = env?.status ?? "stopped";
  const port = env?.port;

  async function handleToggle() {
    setLoading(true);
    try {
      if (status === "running" || status === "building") {
        await stopBranch(branch.name);
      } else {
        await startBranch(branch.name);
      }
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        padding: "10px 12px",
        background: "var(--bg-card)",
        borderRadius: "var(--radius)",
        marginBottom: 6,
        transition: "background 0.15s",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 13,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {branch.name}
            {branch.isCurrent && (
              <span
                style={{
                  marginLeft: 6,
                  fontSize: 10,
                  color: "var(--accent)",
                  fontWeight: 400,
                }}
              >
                current
              </span>
            )}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 3,
            }}
          >
            <StatusBadge status={status} />
            {port && (
              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                :{port}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 4 }}>
          {(status === "running" || status === "error") && (
            <button
              onClick={() => setShowLogs(!showLogs)}
              style={{
                padding: "4px 6px",
                background: showLogs ? "var(--border)" : "var(--bg-secondary)",
                color: "var(--text-secondary)",
                borderRadius: 4,
                fontSize: 10,
              }}
            >
              Logs
            </button>
          )}
          {status === "running" && port && (
            <button
              onClick={() =>
                window.open(`http://localhost:${port}`, "_blank")
              }
              style={{
                padding: "4px 8px",
                background: "var(--accent-dim)",
                color: "var(--accent)",
                borderRadius: 4,
                fontSize: 11,
              }}
            >
              Preview
            </button>
          )}
          <button
            onClick={handleToggle}
            disabled={loading}
            style={{
              padding: "4px 10px",
              background:
                status === "running" || status === "building"
                  ? "var(--status-error)22"
                  : "var(--accent-dim)",
              color:
                status === "running" || status === "building"
                  ? "var(--status-error)"
                  : "var(--accent)",
              borderRadius: 4,
              fontSize: 11,
              opacity: loading ? 0.5 : 1,
            }}
          >
            {loading
              ? "..."
              : status === "running" || status === "building"
                ? "Stop"
                : "Start"}
          </button>
        </div>
      </div>

      {/* Log viewer */}
      {showLogs && <LogViewer branchName={branch.name} />}
    </div>
  );
}
