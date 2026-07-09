"use client";

import { useMemo, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/Input";

type TagOption = { id: string; name: string; color: string };

type Props = {
  allTags: TagOption[];
  selectedIds: string[];
  toggleAction: (tagId: string, marcado: boolean) => Promise<void>;
};

function Chip({ tag, active, onClick }: { tag: TagOption; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[12px] font-medium transition-colors ${
        active ? "border-transparent" : "border-border text-fg-muted hover:text-fg"
      }`}
      style={active ? { background: `${tag.color}1A`, color: tag.color, borderColor: `${tag.color}40` } : undefined}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: tag.color }} />
      {tag.name}
    </button>
  );
}

// Popover pesquisável: tags já selecionadas ficam sempre visíveis no topo;
// a busca filtra apenas as disponíveis (evita renderizar lista gigante sem filtro).
export function TagToggleList({ allTags, selectedIds, toggleAction }: Props) {
  const [selected, setSelected] = useState(new Set(selectedIds));
  const [query, setQuery] = useState("");
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

  const normalizedQuery = query.trim().toLowerCase();
  const selectedTags = useMemo(() => allTags.filter((t) => selected.has(t.id)), [allTags, selected]);
  const availableTags = useMemo(
    () =>
      allTags.filter(
        (t) => !selected.has(t.id) && (normalizedQuery === "" || t.name.toLowerCase().includes(normalizedQuery))
      ),
    [allTags, selected, normalizedQuery]
  );

  if (allTags.length === 0) {
    return <p className="text-[12px] text-fg-muted">Nenhuma tag cadastrada para este setor.</p>;
  }

  return (
    <div className="space-y-2.5">
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedTags.map((t) => (
            <Chip key={t.id} tag={t} active onClick={() => toggle(t.id)} />
          ))}
        </div>
      )}

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar tag…"
        icon={<Search size={14} />}
        className="h-8 text-[12px]"
      />

      <div className="flex flex-wrap gap-1.5 max-h-[160px] overflow-y-auto">
        {availableTags.length === 0 ? (
          <p className="text-[12px] text-fg-muted py-1">
            {normalizedQuery ? "Nenhuma tag encontrada." : "Todas as tags já foram selecionadas."}
          </p>
        ) : (
          availableTags.map((t) => <Chip key={t.id} tag={t} active={false} onClick={() => toggle(t.id)} />)
        )}
      </div>
    </div>
  );
}
