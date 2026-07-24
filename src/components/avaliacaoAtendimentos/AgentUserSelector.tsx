"use client";

import { useState, useTransition } from "react";
import { Select } from "@/components/ui/Select";

export type LinkableUser = { id: string; name: string; email: string };

type Props = {
  agentLinkId: string;
  linkedUserId: string | null;
  users: LinkableUser[];
  canEdit: boolean;
  action: (agentLinkId: string, userId: string | null) => Promise<void>;
};

// Vínculo entre o agente do Chatwoot (cache em ChatwootAgentLink) e a conta de
// acesso (User de /admin/usuarios) — mesmo padrão de LinkedUserSelector
// (Pessoa <-> User). Só associa a um User já existente; login/permissões
// continuam exclusivos de /admin/usuarios.
export function AgentUserSelector({ agentLinkId, linkedUserId, users, canEdit, action }: Props) {
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
        startTransition(() => action(agentLinkId, v || null));
      }}
    >
      <option value="">Não vinculado</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
      ))}
    </Select>
  );
}
