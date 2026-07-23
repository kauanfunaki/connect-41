import { Check } from "lucide-react";

// Bolinha de estágio compartilhada (visão de lista, subtarefas, preview no
// modal de editar lista) — 4 estados visuais:
// NOT_STARTED vazia · IN_PROGRESS preenchida pela metade · PENDING pontilhada
// · DONE cheia com check.
export type StageDotType = "NOT_STARTED" | "IN_PROGRESS" | "PENDING" | "DONE";

export function stageDotStyle(color: string, type: StageDotType): React.CSSProperties {
  switch (type) {
    case "DONE":
      return { borderColor: color, background: color, borderStyle: "solid" };
    case "IN_PROGRESS":
      return { borderColor: color, background: `linear-gradient(90deg, ${color} 50%, transparent 50%)`, borderStyle: "solid" };
    case "PENDING":
      return { borderColor: color, background: "transparent", borderStyle: "dashed" };
    case "NOT_STARTED":
    default:
      return { borderColor: color, background: "transparent", borderStyle: "solid" };
  }
}

type Props = { color: string; type: StageDotType; size?: number; showCheckOnHover?: boolean };

export function StageDot({ color, type, size = 14, showCheckOnHover = false }: Props) {
  return (
    <span
      className="rounded-full border flex items-center justify-center flex-shrink-0"
      style={{ ...stageDotStyle(color, type), width: size, height: size, borderWidth: 1.5 }}
    >
      {type === "DONE" && <Check size={size - 5} className="text-on-brand" />}
      {type !== "DONE" && showCheckOnHover && (
        <Check size={size - 5} className="opacity-0 group-hover/dot:opacity-100 transition-opacity" style={{ color }} />
      )}
    </span>
  );
}
