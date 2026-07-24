import { notFound } from "next/navigation";
import { Headset } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullAccess } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { AgentUserSelector } from "@/components/avaliacaoAtendimentos/AgentUserSelector";
import { vincularAgenteChatwoot } from "@/app/(app)/avaliacao-atendimentos/actions";

// Vínculo agente do Chatwoot <-> usuário do Connect — configuração feita uma
// vez só, por isso vive aqui (Admin) em vez de aparecer toda vez que alguém
// abre o painel de Avaliação de Atendimentos pra só ver a nota. Só existe
// vínculo pra agentes que já têm assigneeId sincronizado (ver
// ChatwootAgentLink) — atendentes ainda sem isso aparecem em
// /avaliacao-atendimentos pelo nome cru, mas só ganham essa opção depois de
// alguma atividade nova sincronizar o id de verdade.
export default async function AdminAtendentesPage() {
  const ctx = await getAuthContext();
  if (!isFullAccess(ctx.role)) notFound();

  const prisma = getPrisma();
  const [agentLinks, users] = await Promise.all([
    prisma.chatwootAgentLink.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { chatwootAgentName: "asc" },
    }),
    prisma.user.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
  ]);

  return (
    <PageContainer variant="narrow">
      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Atendentes</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          Vínculo entre o agente do Chatwoot e a conta de acesso do Connect — usado pra mostrar nome/foto reais em{" "}
          <span className="font-medium text-fg">Avaliação de Atendimentos</span>. Configuração de uma vez só.
        </p>
      </div>

      {agentLinks.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg">
          <EmptyState
            icon={<Headset />}
            title="Nenhum atendente sincronizado ainda"
            description="Agentes aparecem aqui automaticamente conforme conversas do Chatwoot são sincronizadas."
          />
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {agentLinks.map((link) => (
            <div key={link.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <p className="text-[13.5px] text-fg truncate">{link.chatwootAgentName}</p>
              <div className="w-64 flex-shrink-0">
                <AgentUserSelector
                  agentLinkId={link.id}
                  linkedUserId={link.linkedUserId}
                  users={users}
                  canEdit
                  action={vincularAgenteChatwoot}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
