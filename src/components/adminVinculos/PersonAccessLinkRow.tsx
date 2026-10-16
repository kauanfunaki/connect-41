"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { Select } from "@/components/ui/Select";
import { LinhaFiltravel } from "@/components/shared/FiltroDeColunas";
import { Cartao, TopoDoCartao } from "@/components/shared/ListaResponsiva";
import { CampoForm } from "@/components/ui/CampoForm";

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
  /** No celular, a mesma pessoa num cartão, com os dois campos rotulados. */
  comoCartao?: boolean;
};

// Linha única cobrindo os dois vínculos que antes viviam em telas separadas:
// Pessoa <-> User (era só em /pessoas/[id]) e User <-> ChatwootAgentLink (era
// só em /admin/atendentes). O segundo select fica desabilitado até a pessoa
// ter uma conta vinculada, porque o vínculo real no banco é
// ChatwootAgentLink.linkedUserId -> User, não -> Person diretamente.
export function PersonAccessLinkRow({
  personId, personName, linkedUserId, users, agentLinks, canEdit, vincularUsuarioAction, vincularAgenteAction, comoCartao = false,
}: Props) {
  const id = useId();
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

  const conta = canEdit ? (
    <Select
      id={`${id}-conta`}
      compact
      aria-label={comoCartao ? undefined : `Conta de acesso de ${personName}`}
      value={userId}
      disabled={isPending}
      onChange={(e) => handleUserChange(e.target.value)}
    >
      <option value="">Não vinculado</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
      ))}
    </Select>
  ) : (
    <p className="text-fs-3 text-fg truncate">{user ? `${user.name} (${user.email})` : "Não vinculado"}</p>
  );

  const atendente = agentLinks ? (
    canEdit ? (
      <Select
        id={`${id}-atendente`}
        compact
        aria-label={comoCartao ? undefined : `Atendente do Chatwoot de ${personName}`}
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
      <p className="text-fs-3 text-fg truncate">{currentAgentLink?.chatwootAgentName ?? "Não vinculado"}</p>
    )
  ) : null;

  // No celular, um cartão por pessoa (15/10/2026): a tabela de 640px rolava
  // de lado. Os dois campos descem um embaixo do outro, com o rótulo do
  // cabeçalho da tabela.
  if (comoCartao) {
    return (
      <Cartao>
        <TopoDoCartao
          nome={
            <Link href={`/pessoas/${personId}`} className="text-fg hover:text-brand transition-colors">
              {personName}
            </Link>
          }
        />
        <div className="mt-2 flex flex-col gap-3">
          <CampoForm label="Conta de acesso" htmlFor={`${id}-conta`}>
            {conta}
          </CampoForm>
          {atendente && (
            <CampoForm label="Atendente Chatwoot" htmlFor={`${id}-atendente`} helper={!userId && canEdit ? "Vincule uma conta primeiro." : undefined}>
              {atendente}
            </CampoForm>
          )}
        </div>
      </Cartao>
    );
  }

  // Uma linha da tabela de vínculos (era uma fileira de flex com cabeçalho de
  // mentira até 30/09). `LinhaFiltravel` some quando o funil das colunas não a
  // deixa passar. Selects compactos, como o de setor em Módulos: é controle
  // de linha de tabela, não campo de formulário.
  return (
    <LinhaFiltravel id={personId} className="border-b border-border">
      <td className="px-4 py-3">
        <Link
          href={`/pessoas/${personId}`}
          className="block max-w-[280px] text-ui text-fg hover:text-brand transition-colors truncate"
          title={personName}
        >
          {personName}
        </Link>
      </td>

      <td className="px-4 py-3">
        <div className="w-56 mx-auto">{conta}</div>
      </td>

      {atendente && (
        <td className="px-4 py-3">
          <div className="w-56 mx-auto">{atendente}</div>
        </td>
      )}
    </LinhaFiltravel>
  );
}
