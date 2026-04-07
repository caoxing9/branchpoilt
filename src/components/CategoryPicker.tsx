import type { DevCategory } from "../lib/types";
import { DEV_CATEGORIES } from "../lib/types";

interface CategoryPickerProps {
  value: DevCategory;
  onChange: (category: DevCategory) => void;
}

export function CategoryPicker({ value, onChange }: CategoryPickerProps) {
  return (
    <div style={{ display: "inline-flex", gap: 2 }}>
      {(Object.entries(DEV_CATEGORIES) as [DevCategory, { label: string; color: string }][]).map(
        ([key, { label, color }]) => (
          <button
            key={key}
            onClick={(e) => {
              e.stopPropagation();
              onChange(key);
            }}
            style={{
              padding: "2px 6px",
              fontSize: 10,
              borderRadius: 3,
              background: value === key ? color + "33" : "transparent",
              color: value === key ? color : "var(--text-secondary)",
              border: `1px solid ${value === key ? color + "66" : "transparent"}`,
              fontWeight: value === key ? 600 : 400,
              transition: "all 0.15s",
            }}
          >
            {label}
          </button>
        )
      )}
    </div>
  );
}
