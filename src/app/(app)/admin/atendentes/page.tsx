import { notFound } from "next/navigation";
import { Users2 } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullAccess } from "@/lib/auth/context";
import { canWriteEntity } from "@/lib/auth/policy";
import { PersonType } from "@/generated/prisma/enums";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { PersonAccessLinkRow } from "@/components/adminVinculos/PersonAccessLinkRow";
import { vincularUsuarioPessoa } from "@/app/(app)/pessoas/actions";
import { vincularAgenteChatwoot } from "./actions";

// Tela única de vínculos de acesso: Pessoa (colaborador interno) <-> User
// (login) <-> ChatwootAgentLink (atendente). Antes eram duas telas separadas
// (User em /pessoas/[id], atendente aqui) — unificado por pedido do usuário,
// já que os dois vínculos formam uma cadeia só (Pessoa -> User -> Atendente).
export default async function AdminAtendentesPage() {
  const ctx = await getAuthContext();
  if (!isFullAccess(ctx.role)) notFound();

  const prisma = getPrisma();
  const [people, users, agentLinks] = await Promise.all([
    prisma.person.findMany({
      where: { tenantId: ctx.tenantId, type: PersonType.COLABORADOR, isInternal: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, linkedUserId: true },
    }),
    prisma.user.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
    prisma.chatwootAgentLink.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { chatwootAgentName: "asc" },
      select: { id: true, chatwootAgentName: true, linkedUserId: true },
    }),
  ]);

  const canEdit = canWriteEntity(ctx);
  const hasChatwoot = agentLinks.length > 0;

  return (
    <PageContainer variant="narrow">
      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Vínculos de Acesso</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          Para cada colaborador interno: qual conta de acesso (User) é dele e, se aplicável, qual agente do Chatwoot é
          essa mesma pessoa — usado para mostrar nome/foto reais em{" "}
          <span className="font-medium text-fg">Avaliação de Atendimentos</span>. Configuração de uma vez só.
        </p>
      </div>

      {people.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg">
          <EmptyState
            icon={<Users2 />}
            title="Nenhum colaborador interno cadastrado"
            description="Marque um cadastro em Pessoas como funcionário interno para ele aparecer aqui."
          />
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          <div className="flex items-center gap-4 px-4 py-2 text-[11px] font-medium text-fg-muted uppercase tracking-wide">
            <span className="flex-1">Pessoa</span>
            <span className="w-56 flex-shrink-0">Conta (User)</span>
            {hasChatwoot && <span className="w-56 flex-shrink-0">Atendente Chatwoot</span>}
          </div>
          {people.map((p) => (
            <PersonAccessLinkRow
              key={p.id}
              personId={p.id}
              personName={p.name}
              linkedUserId={p.linkedUserId}
              users={users}
              agentLinks={hasChatwoot ? agentLinks : null}
              canEdit={canEdit}
              vincularUsuarioAction={vincularUsuarioPessoa}
              vincularAgenteAction={vincularAgenteChatwoot}
            />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
