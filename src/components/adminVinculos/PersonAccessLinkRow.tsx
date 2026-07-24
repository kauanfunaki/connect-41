"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Select } from "@/components/ui/Select";

export type LinkableUser = { id: string; name: string; email: string };
export type LinkableAgent = { id: string; chatwootAgentName: string; linkedUserId: string | null };

type Props = {
  personId: string;
  personName: string;
  linkedUserId: string | null;
  users: LinkableUser[];
  agentLinks: LinkableAgent[] | null; // null = Chatwoot não configurado, esconde a coluna
  canEdit: boolean;
  vincularUsuarioAction: (personId: string, userId: string | null) => Promise<void>;
  vincularAgenteAction: (agentLinkId: string, userId: string | null) => Promise<void>;
};

// Linha única cobrindo os dois vínculos que antes viviam em telas separadas:
// Pessoa <-> User (era só em /pessoas/[id]) e User <-> ChatwootAgentLink (era
// só em /admin/atendentes). O segundo select fica desabilitado até a pessoa
// ter uma conta vinculada, porque o vínculo real no banco é
// ChatwootAgentLink.linkedUserId -> User, não -> Person diretamente.
export function PersonAccessLinkRow({
  personId, personName, linkedUserId, users, agentLinks, canEdit, vincularUsuarioAction, vincularAgenteAction,
}: Props) {
  const [userId, setUserId] = useState(linkedUserId ?? "");
  const currentAgentLink = agentLinks?.find((a) => a.linkedUserId === userId) ?? null;
  const [agentLinkId, setAgentLinkId] = useState(currentAgentLink?.id ?? "");
  const [isPending, startTransition] = useTransition();

  function handleUserChange(newUserId: string) {
    const previousAgentLinkId = agentLinkId;
    setUserId(newUserId);
    setAgentLinkId("");
    startTransition(async () => {
      // Solta o vínculo de atendente antigo (apontava pro user anterior) antes
      // de trocar de conta, pra não deixar um ChatwootAgentLink órfão apontando
      // pra alguém que não é mais dono desta pessoa.
      if (previousAgentLinkId) await vincularAgenteAction(previousAgentLinkId, null);
      await vincularUsuarioAction(personId, newUserId || null);
    });
  }

  function handleAgentChange(newAgentLinkId: string) {
    const previousAgentLinkId = agentLinkId;
    setAgentLinkId(newAgentLinkId);
    startTransition(async () => {
      if (previousAgentLinkId && previousAgentLinkId !== newAgentLinkId) {
        await vincularAgenteAction(previousAgentLinkId, null);
      }
      if (newAgentLinkId) await vincularAgenteAction(newAgentLinkId, userId || null);
    });
  }

  const user = users.find((u) => u.id === userId);

  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <Link href={`/pessoas/${personId}`} className="flex-1 min-w-0 text-[13.5px] text-fg hover:text-brand transition-colors truncate">
        {personName}
      </Link>

      <div className="w-56 flex-shrink-0">
        {canEdit ? (
          <Select value={userId} disabled={isPending} onChange={(e) => handleUserChange(e.target.value)}>
            <option value="">Não vinculado</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
            ))}
          </Select>
        ) : (
          <p className="text-[13px] text-fg truncate">{user ? `${user.name} (${user.email})` : "Não vinculado"}</p>
        )}
      </div>

      {agentLinks && (
        <div className="w-56 flex-shrink-0">
          {canEdit ? (
            <Select
              value={agentLinkId}
              disabled={isPending || !userId}
              title={!userId ? "Vincule uma conta primeiro" : undefined}
              onChange={(e) => handleAgentChange(e.target.value)}
            >
              <option value="">Não vinculado</option>
              {agentLinks.map((a) => (
                <option key={a.id} value={a.id}>{a.chatwootAgentName}</option>
              ))}
            </Select>
          ) : (
            <p className="text-[13px] text-fg truncate">{currentAgentLink?.chatwootAgentName ?? "Não vinculado"}</p>
          )}
        </div>
      )}
    </div>
  );
}
