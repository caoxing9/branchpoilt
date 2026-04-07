import { useEffect, useState, useCallback, useMemo } from "react";
import { listen } from "@tauri-apps/api/event";
import type { Branch, DevCategory } from "../lib/types";
import { DEV_CATEGORIES } from "../lib/types";
import { listBranches } from "../lib/commands";
import { BranchCard } from "./BranchCard";
import { BranchDetail } from "./BranchDetail";
import { SwimLaneBoard } from "./SwimLaneBoard";
import { useDevCategories } from "../hooks/useDevCategories";

type ViewMode = "list" | "board";
type SortKey = "name" | "status" | "category";
type SortDir = "asc" | "desc";

const STATUS_ORDER: Record<string, number> = {
  running: 0,
  building: 1,
  error: 2,
  stopped: 3,
};

const CATEGORY_ORDER: Record<DevCategory, number> = {
  developing: 0,
  todo: 1,
  done: 2,
};

export function BranchList() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [filter, setFilter] = useState<DevCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const { getCategory, setCategory } = useDevCategories();

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

  const handleSortToggle = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKey]
  );

  const processedBranches = useMemo(() => {
    let list = branches;

    // Search filter
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((b) => b.name.toLowerCase().includes(q));
    }

    // Category filter
    if (filter !== "all") {
      list = list.filter((b) => getCategory(b.name) === filter);
    }

    // Sort
    const dir = sortDir === "asc" ? 1 : -1;
    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return dir * a.name.localeCompare(b.name);
        case "status": {
          const sa = STATUS_ORDER[a.environment?.status ?? "stopped"] ?? 3;
          const sb = STATUS_ORDER[b.environment?.status ?? "stopped"] ?? 3;
          return dir * (sa - sb) || a.name.localeCompare(b.name);
        }
        case "category": {
          const ca = CATEGORY_ORDER[getCategory(a.name)];
          const cb = CATEGORY_ORDER[getCategory(b.name)];
          return dir * (ca - cb) || a.name.localeCompare(b.name);
        }
        default:
          return 0;
      }
    });

    return list;
  }, [branches, search, filter, sortKey, sortDir, getCategory]);

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

  // Detail view
  const detailBranch = selectedBranch
    ? branches.find((b) => b.name === selectedBranch)
    : null;

  if (detailBranch) {
    return (
      <BranchDetail
        branch={detailBranch}
        devCategory={getCategory(detailBranch.name)}
        onCategoryChange={(cat) => setCategory(detailBranch.name, cat)}
        onBack={() => setSelectedBranch(null)}
        onRefresh={refresh}
      />
    );
  }

  const sortLabel = (key: SortKey) => {
    const arrow = sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";
    return arrow;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* Toolbar row 1: search + view toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {/* Search */}
        <div style={{ flex: 1, position: "relative" }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search branches..."
            style={{
              width: "100%",
              padding: "4px 8px 4px 24px",
              fontSize: 11,
              background: "var(--bg-card)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          <span
            style={{
              position: "absolute",
              left: 7,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 11,
              color: "var(--text-secondary)",
              pointerEvents: "none",
            }}
          >
            ⌕
          </span>
        </div>

        {/* View toggle */}
        <div style={{ display: "flex", gap: 2, background: "var(--bg-card)", borderRadius: 4, padding: 2, flexShrink: 0 }}>
          <button
            onClick={() => setViewMode("list")}
            style={{
              padding: "2px 8px",
              fontSize: 11,
              borderRadius: 3,
              background: viewMode === "list" ? "var(--border)" : "transparent",
              color: viewMode === "list" ? "var(--text-primary)" : "var(--text-secondary)",
            }}
          >
            List
          </button>
          <button
            onClick={() => setViewMode("board")}
            style={{
              padding: "2px 8px",
              fontSize: 11,
              borderRadius: 3,
              background: viewMode === "board" ? "var(--border)" : "transparent",
              color: viewMode === "board" ? "var(--text-primary)" : "var(--text-secondary)",
            }}
          >
            Board
          </button>
        </div>
      </div>

      {/* Toolbar row 2: category filter + sort */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "4px 10px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {/* Category filter */}
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => setFilter("all")}
            style={{
              padding: "2px 8px",
              fontSize: 11,
              borderRadius: 4,
              background: filter === "all" ? "var(--accent-dim)" : "transparent",
              color: filter === "all" ? "var(--accent)" : "var(--text-secondary)",
            }}
          >
            All
          </button>
          {(Object.entries(DEV_CATEGORIES) as [DevCategory, { label: string; color: string }][]).map(
            ([key, { label, color }]) => (
              <button
                key={key}
                onClick={() => setFilter(filter === key ? "all" : key)}
                style={{
                  padding: "2px 8px",
                  fontSize: 11,
                  borderRadius: 4,
                  background: filter === key ? color + "33" : "transparent",
                  color: filter === key ? color : "var(--text-secondary)",
                }}
              >
                {label}
              </button>
            )
          )}
        </div>

        {/* Sort buttons */}
        <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "var(--text-secondary)", marginRight: 4 }}>Sort:</span>
          {([
            ["name", "Name"],
            ["status", "Status"],
            ["category", "Category"],
          ] as [SortKey, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => handleSortToggle(key)}
              style={{
                padding: "2px 6px",
                fontSize: 10,
                borderRadius: 3,
                background: sortKey === key ? "var(--border)" : "transparent",
                color: sortKey === key ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              {label}{sortLabel(key)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {viewMode === "board" ? (
        <SwimLaneBoard
          branches={processedBranches}
          getCategory={getCategory}
          setCategory={setCategory}
          onRefresh={refresh}
          filter={filter}
          onSelect={(name) => setSelectedBranch(name)}
        />
      ) : (
        <div style={{ padding: "8px 10px", overflowY: "auto", flex: 1 }}>
          {processedBranches.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "var(--text-secondary)", fontSize: 12 }}>
              No matching branches
            </div>
          ) : (
            processedBranches.map((branch) => (
              <BranchCard
                key={branch.name}
                branch={branch}
                onRefresh={refresh}
                devCategory={getCategory(branch.name)}
                onCategoryChange={(cat) => setCategory(branch.name, cat)}
                onSelect={() => setSelectedBranch(branch.name)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
