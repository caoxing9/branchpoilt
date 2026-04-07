import { useState, useEffect, useRef } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { createWorktree } from "../lib/commands";
import type { WorktreeProgress } from "../lib/types";

interface CreateWorktreeDialogProps {
  onClose: () => void;
  onCreated: () => void;
}

const STEPS = [
  { key: "fetch", label: "Fetch origin/develop" },
  { key: "branch", label: "Create branch & worktree" },
  { key: "env", label: "Setup environment" },
  { key: "install", label: "Install dependencies" },
  { key: "database", label: "Setup database" },
  { key: "migrate", label: "Run migration" },
  { key: "done", label: "Done" },
];

function Spinner({ size = 14, color = "var(--status-building)" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ animation: "wt-spin 0.8s linear infinite" }}
    >
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="3" opacity="0.25" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CreateWorktreeDialog({ onClose, onCreated }: CreateWorktreeDialogProps) {
  const [branchName, setBranchName] = useState("");
  const [creating, setCreating] = useState(false);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-close when done
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => {
      onCreated();
      onClose();
    }, 800);
    return () => clearTimeout(timer);
  }, [done]);

  useEffect(() => {
    if (!creating || !branchName) return;

    let unlisten: UnlistenFn | null = null;
    listen<WorktreeProgress>(`worktree-progress:${branchName}`, (event) => {
      setCurrentStep(event.payload.step);
      if (event.payload.done) {
        setDone(true);
        setCreating(false);
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [creating, branchName]);

  async function handleCreate() {
    const name = branchName.trim();
    if (!name) return;

    setError(null);
    setCreating(true);
    setCurrentStep(null);
    setDone(false);

    try {
      await createWorktree(name);
      // If the command returns without events, mark as done
      if (!done) {
        setDone(true);
        setCreating(false);
      }
    } catch (e) {
      setError(String(e));
      setCreating(false);
    }
  }

  function handleDone() {
    onCreated();
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !creating && !done) {
      handleCreate();
    }
    if (e.key === "Escape") {
      onClose();
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--overlay-bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !creating) onClose();
      }}
    >
      <div
        style={{
          background: "var(--bg-secondary)",
          borderRadius: 10,
          border: "1px solid var(--border)",
          padding: 24,
          width: 360,
          maxHeight: "80vh",
          overflow: "auto",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>
          New Worktree
        </div>

        {/* Branch name input */}
        {!creating && !done && (
          <>
            <div style={{ marginBottom: 8, fontSize: 12, color: "var(--text-secondary)" }}>
              Branch name (from origin/develop):
            </div>
            <input
              ref={inputRef}
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="feat/my-feature"
              style={{
                width: "100%",
                padding: "8px 10px",
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                color: "var(--text-primary)",
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button
                onClick={onClose}
                style={{
                  padding: "6px 14px",
                  background: "var(--bg-card)",
                  color: "var(--text-secondary)",
                  borderRadius: 6,
                  fontSize: 12,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!branchName.trim()}
                style={{
                  padding: "6px 14px",
                  background: branchName.trim() ? "var(--accent)" : "var(--bg-card)",
                  color: branchName.trim() ? "var(--accent-on)" : "var(--text-secondary)",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  border: "none",
                  cursor: branchName.trim() ? "pointer" : "default",
                }}
              >
                Create
              </button>
            </div>
          </>
        )}

        {/* Progress */}
        {(creating || done) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {STEPS.map((step) => {
              const isActive = currentStep === step.key;
              const isPast =
                currentStep != null &&
                STEPS.findIndex((s) => s.key === currentStep) >
                  STEPS.findIndex((s) => s.key === step.key);
              const isDone = step.key === "done" && done;

              let color = "var(--text-secondary)";
              if (isPast || isDone) {
                color = "var(--accent)";
              } else if (isActive) {
                color = "var(--status-building)";
              }

              return (
                <div
                  key={step.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    color,
                    opacity: !isPast && !isActive && !isDone ? 0.5 : 1,
                  }}
                >
                  <span style={{ width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0 }}>
                    {isActive ? (
                      <Spinner size={14} />
                    ) : isPast || isDone ? (
                      "\u2713"
                    ) : (
                      "\u00B7"
                    )}
                  </span>
                  <span>{step.label}</span>
                </div>
              );
            })}

            {done && (
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-secondary)", textAlign: "right" }}>
                Closing...
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            style={{
              marginTop: 12,
              padding: "8px 12px",
              background: "var(--status-error)22",
              color: "var(--status-error)",
              fontSize: 11,
              borderRadius: 6,
              lineHeight: 1.4,
            }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
