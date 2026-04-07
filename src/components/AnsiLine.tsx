import Anser from "anser";

interface AnsiLineProps {
  text: string;
}

export function AnsiLine({ text }: AnsiLineProps) {
  const parsed = Anser.ansiToJson(text, { use_classes: false, remove_empty: true });

  if (parsed.length === 0) {
    return <>{text}</>;
  }

  return (
    <>
      {parsed.map((part, i) => {
        const style: React.CSSProperties = {};
        if (part.fg) style.color = `rgb(${part.fg})`;
        if (part.bg) style.backgroundColor = `rgb(${part.bg})`;
        if (part.decoration === "bold") style.fontWeight = 700;
        if (part.decoration === "italic") style.fontStyle = "italic";
        if (part.decoration === "underline") style.textDecoration = "underline";

        return Object.keys(style).length > 0 ? (
          <span key={i} style={style}>{part.content}</span>
        ) : (
          <span key={i}>{part.content}</span>
        );
      })}
    </>
  );
}
