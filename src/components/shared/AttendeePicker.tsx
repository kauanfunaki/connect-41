"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/Input";

type UserOption = { id: string; name: string };

type Props = {
  users: UserOption[];
  name?: string;
  label?: string;
  defaultSelectedIds?: string[];
};

// Multi-select pesquisável pra formulários (não persiste por toggle como
// AssigneeToggleList/kanban — só mantém seleção local e emite <input hidden>
// pro form pai capturar no submit). Existe porque a lista de checkboxes
// virava inviável com muitos colaboradores (produção real do cliente).
export function AttendeePicker({ users, name = "attendeeIds", label = "Responsáveis", defaultSelectedIds = [] }: Props) {
  const [selected, setSelected] = useState<string[]>(defaultSelectedIds);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selectedUsers = useMemo(() => users.filter((u) => selected.includes(u.id)), [users, selected]);
  const normalizedQuery = query.trim().toLowerCase();
  const availableUsers = useMemo(
    () =>
      users.filter(
        (u) => !selected.includes(u.id) && (normalizedQuery === "" || u.name.toLowerCase().includes(normalizedQuery))
      ),
    [users, selected, normalizedQuery]
  );

  function add(userId: string) {
    setSelected((prev) => [...prev, userId]);
    setQuery("");
    setOpen(false);
  }

  function remove(userId: string) {
    setSelected((prev) => prev.filter((id) => id !== userId));
  }

  if (users.length === 0) return null;

  return (
    <div>
      <p className="text-[length:var(--fs-label)] font-medium text-fg mb-1.5">{label}</p>

      {selectedUsers.map((u) => (
        <input key={u.id} type="hidden" name={name} value={u.id} />
      ))}

      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedUsers.map((u) => (
            <span
              key={u.id}
              className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-brand/[0.06] border border-brand/30 text-[12px] text-fg"
            >
              {u.name}
              <button
                type="button"
                onClick={() => remove(u.id)}
                className="text-fg-muted hover:text-danger transition-colors"
                aria-label={`Remover ${u.name}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder="Buscar responsável…"
          icon={<Search size={14} />}
          className="h-8 text-[12px]"
        />
        {open && (
          <div className="absolute z-20 top-[calc(100%+4px)] left-0 right-0 max-h-[176px] overflow-y-auto bg-surface-elevated border border-border-strong rounded-xl shadow-[var(--c41-shadow-lg)] p-1.5">
            {availableUsers.length === 0 ? (
              <p className="text-[12px] text-fg-muted px-2 py-1.5">
                {normalizedQuery ? "Nenhum responsável encontrado." : "Todos já foram adicionados."}
              </p>
            ) : (
              availableUsers.slice(0, 30).map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(u.id)}
                  className="w-full text-left px-2 py-1.5 rounded-lg text-[12.5px] text-fg-secondary hover:bg-surface-hover hover:text-fg transition-colors"
                >
                  {u.name}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
