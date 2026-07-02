"use client";

import { useState, useTransition } from "react";

type UserOption = { id: string; name: string };

type Props = {
  allUsers: UserOption[];
  selectedIds: string[];
  toggleAction: (userId: string, marcado: boolean) => Promise<void>;
};

export function AssigneeToggleList({ allUsers, selectedIds, toggleAction }: Props) {
  const [selected, setSelected] = useState(new Set(selectedIds));
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

  if (allUsers.length === 0) {
    return <p className="text-[12px] text-fg-muted">Nenhum usuário disponível neste setor.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {allUsers.map((u) => {
        const active = selected.has(u.id);
        return (
          <label
            key={u.id}
            className={`cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[12px] transition-colors ${
              active ? "border-brand/40 bg-brand/[0.06] text-fg" : "border-border text-fg-muted hover:text-fg"
            }`}
          >
            <input
              type="checkbox"
              checked={active}
              onChange={() => toggle(u.id)}
              className="w-3.5 h-3.5 rounded border-border"
            />
            {u.name}
          </label>
        );
      })}
    </div>
  );
}
