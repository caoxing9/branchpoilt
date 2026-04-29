import { useEffect, useRef } from "react";
import {
  List,
  useDynamicRowHeight,
  type ListImperativeAPI,
  type RowComponentProps,
} from "react-window";
import { AnsiLine } from "./AnsiLine";

const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

type DynamicRowHeight = ReturnType<typeof useDynamicRowHeight>;

interface LogRowExtraProps {
  logs: string[];
  searchTerm: string;
  activeMatchLine: number;
  activeMatchLocal: number;
  rowHeight: DynamicRowHeight;
  onCopy: (text: string) => void;
}

function LogRow({
  index,
  style,
  logs,
  searchTerm,
  activeMatchLine,
  activeMatchLocal,
  rowHeight,
  onCopy,
}: RowComponentProps<LogRowExtraProps>) {
  const ref = useRef<HTMLDivElement>(null);
  const line = logs[index] ?? "";

  useEffect(() => {
    if (ref.current) {
      return rowHeight.observeRowElements([ref.current]);
    }
  }, [rowHeight]);

  let toneClass = "";
  if (line.includes("[backend]")) toneClass = "log-row-backend";
  else if (line.includes("[frontend]")) toneClass = "log-row-frontend";
  else if (line.includes("error") || line.includes("Error")) toneClass = "log-row-error";

  return (
    <div
      ref={ref}
      data-react-window-index={index}
      className={`log-row ${toneClass}`}
      style={style}
    >
      <span className="log-row-content">
        <AnsiLine
          text={line}
          highlight={searchTerm}
          activeMatchInLine={index === activeMatchLine ? activeMatchLocal : -1}
        />
      </span>
      <button
        className="log-copy-btn"
        onClick={(e) => {
          e.stopPropagation();
          onCopy(stripAnsi(line));
        }}
        title="Copy this line"
        tabIndex={-1}
      >
        Copy
      </button>
    </div>
  );
}

interface LogListProps {
  logs: string[];
  searchTerm: string;
  activeMatchLine: number;
  activeMatchLocal: number;
  onCopy: (text: string) => void;
  listRef: React.RefObject<ListImperativeAPI | null>;
  onRowsRendered?: (visible: { startIndex: number; stopIndex: number }) => void;
  /** Used to invalidate the height cache when logs are cleared/replaced. */
  cacheKey: string;
}

export function LogList({
  logs,
  searchTerm,
  activeMatchLine,
  activeMatchLocal,
  onCopy,
  listRef,
  onRowsRendered,
  cacheKey,
}: LogListProps) {
  const rowHeight = useDynamicRowHeight({ defaultRowHeight: 18, key: cacheKey });

  return (
    <List
      listRef={listRef}
      rowComponent={LogRow}
      rowCount={logs.length}
      rowHeight={rowHeight}
      overscanCount={20}
      onRowsRendered={onRowsRendered}
      rowProps={{
        logs,
        searchTerm,
        activeMatchLine,
        activeMatchLocal,
        rowHeight,
        onCopy,
      }}
      style={{
        background: "var(--log-bg)",
        flex: 1,
        minHeight: 0,
        fontFamily: "'SF Mono', 'Fira Code', monospace",
        fontSize: 11,
        lineHeight: 1.6,
        color: "var(--log-text)",
      }}
      className="log-list"
    />
  );
}
