import { useState, useRef, useCallback, useEffect } from "react";
import type { Branch, DevCategory } from "../lib/types";
import { DEV_CATEGORIES } from "../lib/types";
import { BranchCard } from "./BranchCard";

interface SwimLaneBoardProps {
  branches: Branch[];
  getCategory: (branchName: string) => DevCategory;
  setCategory: (branchName: string, category: DevCategory) => void;
  onRefresh: () => void;
  filter: DevCategory | "all";
  onSelect?: (branchName: string) => void;
}

const LANE_ORDER: DevCategory[] = ["developing", "todo", "done"];

export function SwimLaneBoard({
  branches,
  getCategory,
  setCategory,
  onRefresh,
  filter,
  onSelect,
}: SwimLaneBoardProps) {
  const lanes = LANE_ORDER.filter((cat) => filter === "all" || filter === cat);
  const [dragging, setDragging] = useState<{
    branchName: string;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    active: boolean;
  } | null>(null);
  const [dropTarget, setDropTarget] = useState<DevCategory | null>(null);
  const [laneWidths, setLaneWidths] = useState<Record<string, number>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const laneRefs = useRef<Map<DevCategory, HTMLDivElement>>(new Map());
  const resizingRef = useRef<{
    lane: string;
    startX: number;
    startWidth: number;
    nextLane: string;
    nextStartWidth: number;
  } | null>(null);

  // Mouse-based drag: track movement globally
  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setDragging((prev) => {
        if (!prev) return null;
        const dx = Math.abs(e.clientX - prev.startX);
        const dy = Math.abs(e.clientY - prev.startY);
        const active = prev.active || dx > 5 || dy > 5;
        return { ...prev, currentX: e.clientX, currentY: e.clientY, active };
      });

      let found: DevCategory | null = null;
      laneRefs.current.forEach((el, cat) => {
        const rect = el.getBoundingClientRect();
        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        ) {
          found = cat;
        }
      });
      setDropTarget(found);
    };

    const handleMouseUp = () => {
      if (dragging.active && dropTarget && dragging.branchName) {
        setCategory(dragging.branchName, dropTarget);
      } else if (!dragging.active && onSelect) {
        onSelect(dragging.branchName);
      }
      setDragging(null);
      setDropTarget(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, dropTarget, setCategory]);

  const handleCardMouseDown = useCallback(
    (e: React.MouseEvent, branchName: string) => {
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      setDragging({
        branchName,
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
        active: false,
      });
    },
    []
  );

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, laneIndex: number) => {
      e.preventDefault();
      const lane = lanes[laneIndex];
      const nextLane = lanes[laneIndex + 1];
      if (!containerRef.current) return;

      const laneEls = containerRef.current.querySelectorAll<HTMLElement>("[data-lane]");
      const laneEl = laneEls[laneIndex];
      const nextLaneEl = laneEls[laneIndex + 1];
      if (!laneEl || !nextLaneEl) return;

      resizingRef.current = {
        lane,
        startX: e.clientX,
        startWidth: laneEl.offsetWidth,
        nextLane,
        nextStartWidth: nextLaneEl.offsetWidth,
      };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!resizingRef.current) return;
        const delta = ev.clientX - resizingRef.current.startX;
        const newWidth = Math.max(160, resizingRef.current.startWidth + delta);
        const newNextWidth = Math.max(160, resizingRef.current.nextStartWidth - delta);
        setLaneWidths((prev) => ({
          ...prev,
          [resizingRef.current!.lane]: newWidth,
          [resizingRef.current!.nextLane]: newNextWidth,
        }));
      };

      const handleMouseUp = () => {
        resizingRef.current = null;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [lanes]
  );

  const isDragging = dragging?.active ?? false;

  return (
    <>
      <div
        ref={containerRef}
        style={{
          display: "flex",
          gap: 0,
          padding: "8px 10px",
          overflowX: "auto",
          overflowY: "hidden",
          flex: 1,
          minHeight: 0,
        }}
      >
        {lanes.map((category, index) => {
          const { label, color } = DEV_CATEGORIES[category];
          const laneBranches = branches.filter((b) => getCategory(b.name) === category);
          const isOver = dropTarget === category && isDragging;
          const width = laneWidths[category];

          return (
            <div
              key={category}
              style={{
                display: "flex",
                flex: width ? "none" : 1,
                width: width || undefined,
                minWidth: 0,
              }}
            >
              <div
                data-lane={category}
                ref={(el) => {
                  if (el) laneRefs.current.set(category, el);
                }}
                style={{
                  flex: 1,
                  minWidth: 160,
                  display: "flex",
                  flexDirection: "column",
                  background: isOver ? "var(--bg-card-hover)" : "var(--bg-secondary)",
                  borderRadius: "var(--radius)",
                  overflow: "hidden",
                  border: isOver ? `2px dashed ${color}` : "1px solid var(--border)",
                  transition: "background 0.15s, border-color 0.15s",
                }}
              >
                {/* Lane header */}
                <div
                  style={{
                    padding: "8px 10px",
                    borderBottom: `2px solid ${color}33`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: color,
                        display: "inline-block",
                      }}
                    />
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      color: "var(--text-secondary)",
                      background: "var(--bg-card)",
                      padding: "1px 6px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                    }}
                  >
                    {laneBranches.length}
                  </span>
                </div>

                {/* Lane content */}
                <div
                  style={{
                    padding: 6,
                    overflowY: "auto",
                    flex: 1,
                  }}
                >
                  {laneBranches.length === 0 ? (
                    <div
                      style={{
                        padding: 24,
                        textAlign: "center",
                        color: isOver ? color : "var(--text-secondary)",
                        fontSize: 11,
                        transition: "color 0.15s",
                      }}
                    >
                      {isOver ? "Release to move here" : "No branches"}
                    </div>
                  ) : (
                    laneBranches.map((branch) => (
                      <div
                        key={branch.name}
                        onMouseDown={(e) => handleCardMouseDown(e, branch.name)}
                        style={{
                          cursor: "grab",
                          opacity:
                            isDragging && dragging?.branchName === branch.name ? 0.3 : 1,
                          transition: "opacity 0.15s",
                        }}
                      >
                        <BranchCard
                          branch={branch}
                          onRefresh={onRefresh}
                          onSelect={onSelect ? () => onSelect(branch.name) : undefined}
                          compact
                        />
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Resize handle between lanes */}
              {index < lanes.length - 1 && (
                <div
                  onMouseDown={(e) => handleResizeStart(e, index)}
                  style={{
                    width: 8,
                    cursor: "col-resize",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: 2,
                      height: 32,
                      borderRadius: 1,
                      background: "var(--border-strong)",
                      transition: "background 0.15s",
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Floating drag indicator */}
      {isDragging && dragging && (
        <div
          style={{
            position: "fixed",
            left: dragging.currentX + 12,
            top: dragging.currentY - 14,
            padding: "4px 10px",
            background: "var(--accent)",
            color: "var(--bg-primary)",
            borderRadius: 8,
            fontSize: 11,
            fontWeight: 600,
            pointerEvents: "none",
            zIndex: 9999,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            whiteSpace: "nowrap",
            maxWidth: 200,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {dragging.branchName}
        </div>
      )}
    </>
  );
}
