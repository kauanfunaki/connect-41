"use client";

import { useMemo, useState } from "react";
import { Search, User, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dropdown } from "@/components/ui/Dropdown";

type UserOption = { id: string; name: string };

type Props = {
  name: string;
  options: UserOption[];
  defaultValue?: string[];
};

// Mesmo padrão de busca+lista do AssigneeToggleList (Kanban), agora também
// multi-seleção — uma demanda pode cair em mais de uma pessoa do mesmo setor.
// A diferença pro Kanban é que aqui a transferência ainda não existe, então não
// há action assíncrona por clique: cada selecionado vira um campo hidden que vai
// junto no submit do formulário inteiro (o servidor lê com form.getAll).
export function SectorAssigneePicker({ name, options, defaultValue = [] }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>(defaultValue);
  const [query, setQuery] = useState("");

  const selectedUsers = options.filter((u) => selectedIds.includes(u.id));
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(
    () => options.filter((u) => normalizedQuery === "" || u.name.toLowerCase().includes(normalizedQuery)),
    [options, normalizedQuery]
  );

  function toggle(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  if (options.length === 0) {
    return <p className="text-[12px] text-fg-muted">Nenhum membro elegível neste setor.</p>;
  }

  const label =
    selectedUsers.length === 0
      ? "Definir responsáveis"
      : selectedUsers.length === 1
        ? selectedUsers[0].name
        : `${selectedUsers.length} responsáveis`;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Dropdown
        width={240}
        trigger={({ open, toggle: toggleOpen }) => (
          <button
            type="button"
            onClick={toggleOpen}
            aria-expanded={open}
            className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-[12.5px] transition-colors ${
              selectedUsers.length > 0
                ? "border-border-strong text-fg"
                : "border-dashed border-border-strong text-fg-muted hover:text-fg hover:bg-surface-hover"
            }`}
          >
            <User size={12} />
            {label}
          </button>
        )}
      >
        {() => (
          <div className="space-y-2.5">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar responsável…"
              icon={<Search size={14} />}
              className="h-8 text-[12px]"
            />
            {/* Sem close() ao escolher: em multi-seleção o normal é marcar
                vários seguidos, e fechar a cada clique obrigaria a reabrir. */}
            <div className="flex flex-col gap-0.5 max-h-[200px] overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-[12px] text-fg-muted py-1">Nenhum responsável encontrado.</p>
              ) : (
                filtered.map((u) => (
                  <label
                    key={u.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-[12px] text-fg-secondary hover:bg-surface-hover hover:text-fg transition-colors"
                  >
                    <Checkbox checked={selectedIds.includes(u.id)} onChange={() => toggle(u.id)} />
                    {u.name}
                  </label>
                ))
              )}
            </div>
          </div>
        )}
      </Dropdown>

      {selectedUsers.length > 1 &&
        selectedUsers.map((u) => (
          <span
            key={u.id}
            className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full bg-surface-2 text-[11.5px] text-fg-secondary"
          >
            {u.name}
            <button
              type="button"
              onClick={() => toggle(u.id)}
              className="text-fg-muted hover:text-danger p-0.5"
              aria-label={`Remover ${u.name}`}
            >
              <X size={11} />
            </button>
          </span>
        ))}

      {selectedUsers.length === 1 && (
        <button
          type="button"
          onClick={() => setSelectedIds([])}
          className="text-fg-muted hover:text-danger p-1"
          aria-label="Remover responsável"
        >
          <X size={12} />
        </button>
      )}

      {selectedIds.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
    </div>
  );
}
