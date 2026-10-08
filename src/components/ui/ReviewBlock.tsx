import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/Button";

type Props = {
  title: string;
  onEdit: () => void;
  items: { label: string; value: React.ReactNode }[];
};

// Bloco de resumo da etapa "Revisão e salvar" — usado pelos wizards multi-step.
export function ReviewBlock({ title, onEdit, items }: Props) {
  return (
    <div className="bg-canvas border border-border rounded-lg px-4 py-3.5 mb-2.5 last:mb-0">
      <div className="flex items-center justify-between mb-2">
        <b className="text-ui font-semibold text-fg">{title}</b>
        {/* Revisão de 05/10: botão não é link — o "Editar" era texto azul sublinhado. */}
        <Button variant="ghost" size="xs" onClick={onEdit}>
          <Pencil size={13} />
          Editar
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-ui">
        {items.map((it) => (
          <span key={it.label} className="text-fg-muted">
            {it.label}: <b className="text-fg font-medium">{it.value || "—"}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
