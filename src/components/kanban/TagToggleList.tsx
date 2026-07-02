"use client";

import { useState, useTransition } from "react";

type TagOption = { id: string; name: string; color: string };

type Props = {
  allTags: TagOption[];
  selectedIds: string[];
  toggleAction: (tagId: string, marcado: boolean) => Promise<void>;
};

export function TagToggleList({ allTags, selectedIds, toggleAction }: Props) {
  const [selected, setSelected] = useState(new Set(selectedIds));
  const [, startTransition] = useTransition();

  function toggle(tagId: string) {
    const marcado = !selected.has(tagId);
    setSelected((prev) => {
      const next = new Set(prev);
      if (marcado) next.add(tagId);
      else next.delete(tagId);
      return next;
    });
    startTransition(() => {
      toggleAction(tagId, marcado);
    });
  }

  if (allTags.length === 0) {
    return <p className="text-[12px] text-fg-muted">Nenhuma tag cadastrada para este setor.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {allTags.map((t) => {
        const active = selected.has(t.id);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => toggle(t.id)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[12px] font-medium transition-colors ${
              active ? "border-transparent" : "border-border text-fg-muted hover:text-fg"
            }`}
            style={active ? { background: `${t.color}1A`, color: t.color, borderColor: `${t.color}40` } : undefined}
          >
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: t.color }} />
            {t.name}
          </button>
        );
      })}
    </div>
  );
}
