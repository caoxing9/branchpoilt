import Anser from "anser";
import type { CSSProperties, ReactNode } from "react";

interface AnsiLineProps {
  text: string;
  /** Search term to highlight (case-insensitive). Empty = no highlighting. */
  highlight?: string;
  /** Index of the match within this line that should be marked as the active match. -1 if none. */
  activeMatchInLine?: number;
}

export function AnsiLine({ text, highlight = "", activeMatchInLine = -1 }: AnsiLineProps) {
  const parsed = Anser.ansiToJson(text, { use_classes: false, remove_empty: true });

  // Build parts with absolute character ranges over the visible text.
  let cursor = 0;
  const parts = parsed.map((p) => {
    const start = cursor;
    const end = cursor + p.content.length;
    cursor = end;
    const style: CSSProperties = {};
    if (p.fg) style.color = `rgb(${p.fg})`;
    if (p.bg) style.backgroundColor = `rgb(${p.bg})`;
    if (p.decoration === "bold") style.fontWeight = 700;
    if (p.decoration === "italic") style.fontStyle = "italic";
    if (p.decoration === "underline") style.textDecoration = "underline";
    return { content: p.content, start, end, style };
  });

  // Find match ranges.
  const term = highlight.trim();
  const matches: Array<{ start: number; end: number; index: number }> = [];
  if (term.length > 0) {
    const visible = parts.map((p) => p.content).join("").toLowerCase();
    const needle = term.toLowerCase();
    let i = 0;
    let mi = 0;
    while (true) {
      const found = visible.indexOf(needle, i);
      if (found === -1) break;
      matches.push({ start: found, end: found + needle.length, index: mi++ });
      i = found + Math.max(needle.length, 1);
    }
  }

  if (parts.length === 0) return <>{text}</>;

  return (
    <>
      {parts.map((part, pi) => {
        const hasStyle = Object.keys(part.style).length > 0;
        const overlapping = matches.filter((m) => m.end > part.start && m.start < part.end);
        if (overlapping.length === 0) {
          return hasStyle ? (
            <span key={pi} style={part.style}>{part.content}</span>
          ) : (
            <span key={pi}>{part.content}</span>
          );
        }
        // Split this part into segments around overlapping match ranges.
        const segs: ReactNode[] = [];
        let segCursor = part.start;
        overlapping.forEach((m, idx) => {
          const mStart = Math.max(m.start, part.start);
          const mEnd = Math.min(m.end, part.end);
          if (mStart > segCursor) {
            segs.push(part.content.slice(segCursor - part.start, mStart - part.start));
          }
          const isActive = m.index === activeMatchInLine;
          segs.push(
            <mark
              key={`m${idx}`}
              className={isActive ? "log-mark log-mark-active" : "log-mark"}
            >
              {part.content.slice(mStart - part.start, mEnd - part.start)}
            </mark>
          );
          segCursor = mEnd;
        });
        if (segCursor < part.end) {
          segs.push(part.content.slice(segCursor - part.start));
        }
        return hasStyle ? (
          <span key={pi} style={part.style}>{segs}</span>
        ) : (
          <span key={pi}>{segs}</span>
        );
      })}
    </>
  );
}
