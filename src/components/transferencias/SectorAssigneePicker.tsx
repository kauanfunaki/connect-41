"use client";

import { useMemo, useState } from "react";
import { Search, User, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";

type UserOption = { id: string; name: string };

type Props = {
  name: string;
  options: UserOption[];
  defaultValue?: string | null;
};

// Mesmo padrão de busca+lista do AssigneeToggleList (Kanban), mas seleção
// única e local — aqui a transferência ainda não existe, então não há
// action assíncrona pra chamar por clique, só um campo hidden que vai junto
// no submit do formulário inteiro.
export function SectorAssigneePicker({ name, options, defaultValue = null }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(defaultValue);
  const [query, setQuery] = useState("");

  const selectedUser = options.find((u) => u.id === selectedId) ?? null;
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(
    () => options.filter((u) => normalizedQuery === "" || u.name.toLowerCase().includes(normalizedQuery)),
    [options, normalizedQuery]
  );

  if (options.length === 0) {
    return <p className="text-[12px] text-fg-muted">Nenhum membro elegível neste setor.</p>;
  }

  return (
    <div className="flex items-center gap-1.5">
      <Dropdown
        width={240}
        trigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-[12.5px] transition-colors ${
              selectedUser ? "border-border-strong text-fg" : "border-dashed border-border-strong text-fg-muted hover:text-fg hover:bg-surface-hover"
            }`}
          >
            <User size={12} />
            {selectedUser ? selectedUser.name : "Definir responsável"}
          </button>
        )}
      >
        {({ close }) => (
          <div className="space-y-2.5">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar responsável…"
              icon={<Search size={14} />}
              className="h-8 text-[12px]"
            />
            <div className="flex flex-col gap-0.5 max-h-[200px] overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-[12px] text-fg-muted py-1">Nenhum responsável encontrado.</p>
              ) : (
                filtered.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(u.id);
                      setQuery("");
                      close();
                    }}
                    className={`text-left px-2 py-1.5 rounded-md text-[12px] transition-colors ${
                      u.id === selectedId ? "bg-brand-subtle text-brand font-medium" : "text-fg-secondary hover:bg-surface-hover hover:text-fg"
                    }`}
                  >
                    {u.name}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </Dropdown>
      {selectedUser && (
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="text-fg-muted hover:text-danger p-1"
          aria-label="Remover responsável"
        >
          <X size={12} />
        </button>
      )}
      <input type="hidden" name={name} value={selectedId ?? ""} />
    </div>
  );
}
