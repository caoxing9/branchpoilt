import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getBranchLogs } from "../lib/commands";
import { AnsiLine } from "./AnsiLine";

interface LogViewerProps {
  branchName: string;
}

export function LogViewer({ branchName }: LogViewerProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load initial logs
    getBranchLogs(branchName).then(setLogs).catch(console.error);

    // Listen for new log lines
    const unlisten = listen<string>(`branch-log:${branchName}`, (event) => {
      setLogs((prev) => {
        const next = [...prev, event.payload];
        // Keep last 500 lines in UI
        return next.length > 500 ? next.slice(-500) : next;
      });
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [branchName]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div
      ref={containerRef}
      style={{
        maxHeight: 150,
        overflowY: "auto",
        background: "var(--log-bg)",
        borderRadius: 4,
        padding: "6px 8px",
        margin: "4px 0",
        fontFamily: "'SF Mono', 'Fira Code', monospace",
        fontSize: 10,
        lineHeight: 1.5,
        color: "var(--log-text-muted)",
      }}
    >
      {logs.length === 0 ? (
        <div style={{ color: "var(--log-text-dim)" }}>No logs yet...</div>
      ) : (
        logs.map((line, i) => (
          <div key={i} style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            <AnsiLine text={line} />
          </div>
        ))
      )}
    </div>
  );
}
