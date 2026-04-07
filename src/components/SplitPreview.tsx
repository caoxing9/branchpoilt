import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { BranchEnvironment } from "../lib/types";
import { getEnvironments } from "../lib/commands";
import { PreviewFrame } from "./PreviewFrame";

export function SplitPreview() {
  const [environments, setEnvironments] = useState<BranchEnvironment[]>([]);

  const refresh = async () => {
    try {
      const envs = await getEnvironments();
      setEnvironments(envs.filter((e) => e.status === "running" && e.port));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    refresh();
    const unlisten = listen("environment-updated", () => refresh());
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  if (environments.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "var(--bg-primary)",
          color: "var(--text-secondary)",
          fontSize: 13,
        }}
      >
        No running branches to preview. Start a branch first.
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        padding: 8,
        height: "100vh",
        background: "var(--bg-primary)",
      }}
    >
      {environments.map((env) => (
        <PreviewFrame
          key={env.branchName}
          branchName={env.branchName}
          port={env.port!}
        />
      ))}
    </div>
  );
}
