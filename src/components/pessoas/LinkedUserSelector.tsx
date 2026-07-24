"use client";

import { useState, useTransition } from "react";
import { Select } from "@/components/ui/Select";

export type LinkableUser = { id: string; name: string; email: string };

type Props = {
  personId: string;
  linkedUserId: string | null;
  users: LinkableUser[];
  canEdit: boolean;
  action: (personId: string, userId: string | null) => Promise<void>;
};

// Vínculo entre o cadastro interno (Pessoa) e a conta de acesso (User de
// /admin/usuarios) — só associa um User já existente, não cria nem edita
// login/permissões aqui (isso continua exclusivo de /admin/usuarios).
export function LinkedUserSelector({ personId, linkedUserId, users, canEdit, action }: Props) {
  const [value, setValue] = useState(linkedUserId ?? "");
  const [isPending, startTransition] = useTransition();

  if (!canEdit) {
    const u = users.find((u) => u.id === linkedUserId);
    return <p className="text-[13px] text-fg">{u ? `${u.name} (${u.email})` : "Não vinculado"}</p>;
  }

  return (
    <Select
      value={value}
      disabled={isPending}
      onChange={(e) => {
        const v = e.target.value;
        setValue(v);
        startTransition(() => action(personId, v || null));
      }}
    >
      <option value="">Não vinculado</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
      ))}
    </Select>
  );
}
