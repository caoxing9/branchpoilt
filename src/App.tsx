import { useState } from "react";
import { BranchList } from "./components/BranchList";
import { setProjectPath, openPreviewWindow } from "./lib/commands";

function App() {
  const [, setRefreshKey] = useState(0);

  async function handleSelectProject() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (selected) {
        await setProjectPath(selected as string);
        setRefreshKey((k) => k + 1);
      }
    } catch (e) {
      console.error("Failed to select project:", e);
    }
  }

  async function handleCompare() {
    try {
      await openPreviewWindow([]);
    } catch (e) {
      console.error("Failed to open preview:", e);
    }
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
      {/* Title bar - draggable */}
      <div
        data-tauri-drag-region
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 12px 6px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: -0.3 }}>
          BranchPilot
        </span>
        <div style={{ display: "flex", gap: 4 }}>
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
        </div>
      </div>

      {/* Branch list */}
      <BranchList />
    </div>
  );
}

export default App;
