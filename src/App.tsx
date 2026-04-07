import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { BranchList } from "./components/BranchList";
import { Onboarding } from "./components/Onboarding";
import { CreateWorktreeDialog } from "./components/CreateWorktreeDialog";
import { getSettings, setProjectPath, openPreviewWindow } from "./lib/commands";
import { useTheme } from "./hooks/useTheme";

type AppView = "loading" | "onboarding" | "main";

function App() {
  const [view, setView] = useState<AppView>("loading");
  const [error, setError] = useState<string | null>(null);
  const [, setRefreshKey] = useState(0);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const { theme, cycleTheme } = useTheme();

  useEffect(() => {
    getSettings()
      .then((settings) => {
        setView(settings.projectPath ? "main" : "onboarding");
      })
      .catch(() => {
        setView("onboarding");
      });
  }, []);

  async function handleSelectProject() {
    setError(null);
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected) {
        await setProjectPath(selected as string);
        setRefreshKey((k) => k + 1);
      }
    } catch (e) {
      setError(String(e));
      console.error("Failed to select project:", e);
    }
  }

  async function handleCompare() {
    setError(null);
    try {
      await openPreviewWindow([]);
    } catch (e) {
      setError(String(e));
      console.error("Failed to open preview:", e);
    }
  }

  if (view === "loading") {
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
      />
    );
  }

  if (view === "onboarding") {
    return (
      <Onboarding
        onComplete={() => {
          setRefreshKey((k) => k + 1);
          setView("main");
        }}
      />
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--bg-primary)",
      }}
    >
      {/* Title bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 12px 6px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span
          style={{ fontWeight: 700, fontSize: 14, letterSpacing: -0.3, flex: 1 }}
        >
          BranchPilot
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => setShowCreateDialog(true)}
            style={{
              padding: "3px 8px",
              background: "var(--accent)",
              color: "var(--accent-on)",
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            + Worktree
          </button>
          <button
            onClick={handleCompare}
            style={{
              padding: "3px 8px",
              background: "var(--accent-dim)",
              color: "var(--accent)",
              borderRadius: 4,
              fontSize: 11,
            }}
          >
            Compare
          </button>
          <button
            onClick={handleSelectProject}
            style={{
              padding: "3px 8px",
              background: "var(--bg-card)",
              color: "var(--text-secondary)",
              borderRadius: 4,
              fontSize: 11,
            }}
          >
            Open Project
          </button>
          <button
            onClick={cycleTheme}
            title={`Theme: ${theme}`}
            style={{
              padding: "3px 8px",
              background: "var(--bg-card)",
              color: "var(--text-secondary)",
              borderRadius: 4,
              fontSize: 11,
              minWidth: 24,
            }}
          >
            {theme === "dark" ? "\u263D" : theme === "light" ? "\u2600" : "\u25D0"}
          </button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div style={{ padding: "6px 12px", background: "var(--status-error)22", color: "var(--status-error)", fontSize: 11 }}>
          {error}
        </div>
      )}

      {/* Branch list */}
      <BranchList />

      {/* Create worktree dialog */}
      {showCreateDialog && (
        <CreateWorktreeDialog
          onClose={() => setShowCreateDialog(false)}
          onCreated={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
}

export default App;
