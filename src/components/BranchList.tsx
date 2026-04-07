import { useEffect, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import type { Branch } from "../lib/types";
import { listBranches } from "../lib/commands";
import { BranchCard } from "./BranchCard";

export function BranchList() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await listBranches();
      setBranches(data);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
    const unlisten = listen("environment-updated", () => refresh());
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refresh]);

  if (error) {
    return (
      <div
        style={{
          padding: 20,
          textAlign: "center",
          color: "var(--text-secondary)",
        }}
      >
        <p style={{ marginBottom: 8 }}>No project loaded</p>
        <p style={{ fontSize: 11 }}>Select a git project to get started</p>
      </div>
    );
  }

  if (branches.length === 0) {
    return (
      <div style={{ padding: 20, textAlign: "center", color: "var(--text-secondary)" }}>
        No branches found
      </div>
    );
  }

  return (
    <div style={{ padding: "8px 10px", overflowY: "auto", flex: 1 }}>
      {branches.map((branch) => (
        <BranchCard key={branch.name} branch={branch} onRefresh={refresh} />
      ))}
    </div>
  );
}
