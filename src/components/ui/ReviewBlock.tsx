type Props = {
  title: string;
  onEdit: () => void;
  items: { label: string; value: React.ReactNode }[];
};

// Bloco de resumo da etapa "Revisão e salvar" — usado pelos wizards multi-step.
export function ReviewBlock({ title, onEdit, items }: Props) {
  return (
    <div className="bg-canvas border border-border rounded-xl px-4 py-3.5 mb-2.5 last:mb-0">
      <div className="flex items-center justify-between mb-2">
        <b className="text-[13px] font-semibold text-fg">{title}</b>
        <button type="button" onClick={onEdit} className="text-[12px] font-semibold text-brand-hover hover:underline">
          Editar
        </button>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
        {items.map((it) => (
          <span key={it.label} className="text-fg-muted">
            {it.label}: <b className="text-fg font-medium">{it.value || "—"}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
