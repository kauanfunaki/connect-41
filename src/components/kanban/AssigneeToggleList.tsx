"use client";

import { useMemo, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";

type UserOption = { id: string; name: string };

type Props = {
  allUsers: UserOption[];
  selectedIds: string[];
  toggleAction: (userId: string, marcado: boolean) => Promise<void>;
};

function UserRow({ user, active, onToggle }: { user: UserOption; active: boolean; onToggle: () => void }) {
  return (
    <label
      className={`cursor-pointer flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] transition-colors ${
        active ? "text-fg" : "text-fg-muted hover:text-fg hover:bg-surface-hover"
      }`}
    >
      <Checkbox checked={active} onChange={onToggle} />
      {user.name}
    </label>
  );
}

// Popover pesquisável: responsáveis já selecionados ficam sempre visíveis no topo;
// a busca filtra apenas os disponíveis (evita renderizar lista gigante sem filtro).
export function AssigneeToggleList({ allUsers, selectedIds, toggleAction }: Props) {
  const [selected, setSelected] = useState(new Set(selectedIds));
  const [query, setQuery] = useState("");
  const [, startTransition] = useTransition();

  function toggle(userId: string) {
    const marcado = !selected.has(userId);
    setSelected((prev) => {
      const next = new Set(prev);
      if (marcado) next.add(userId);
      else next.delete(userId);
      return next;
    });
    startTransition(() => {
      toggleAction(userId, marcado);
    });
  }

  const normalizedQuery = query.trim().toLowerCase();
  const selectedUsers = useMemo(() => allUsers.filter((u) => selected.has(u.id)), [allUsers, selected]);
  const availableUsers = useMemo(
    () =>
      allUsers.filter(
        (u) => !selected.has(u.id) && (normalizedQuery === "" || u.name.toLowerCase().includes(normalizedQuery))
      ),
    [allUsers, selected, normalizedQuery]
  );

  if (allUsers.length === 0) {
    return <p className="text-[12px] text-fg-muted">Nenhum usuário disponível neste setor.</p>;
  }

  return (
    <div className="space-y-2.5">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar responsável…"
        icon={<Search size={14} />}
        className="h-8 text-[12px]"
      />

      <div className="flex flex-col gap-0.5 max-h-[200px] overflow-y-auto">
        {selectedUsers.map((u) => (
          <UserRow key={u.id} user={u} active onToggle={() => toggle(u.id)} />
        ))}
        {availableUsers.length === 0 && selectedUsers.length === 0 ? (
          <p className="text-[12px] text-fg-muted py-1">
            {normalizedQuery ? "Nenhum responsável encontrado." : "Nenhum usuário disponível."}
          </p>
        ) : (
          availableUsers.map((u) => <UserRow key={u.id} user={u} active={false} onToggle={() => toggle(u.id)} />)
        )}
      </div>
    </div>
  );
}
