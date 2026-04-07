import type { BranchStatus } from "../lib/types";

const statusConfig: Record<BranchStatus, { color: string; label: string }> = {
  running: { color: "var(--status-running)", label: "Running" },
  stopped: { color: "var(--status-stopped)", label: "Stopped" },
  building: { color: "var(--status-building)", label: "Building" },
  error: { color: "var(--status-error)", label: "Error" },
};

export function StatusBadge({ status }: { status: BranchStatus }) {
  const config = statusConfig[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        color: config.color,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: config.color,
          display: "inline-block",
        }}
      />
      {config.label}
    </span>
  );
}
