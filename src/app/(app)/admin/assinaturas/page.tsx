import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Building2, Receipt } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { PainelDasAssinaturas, type PlanoParaEscolher } from "@/components/admin/assinaturas/PainelDasAssinaturas";
import { hojeIso } from "@/lib/datas/calendario";
import {
  ACOES_DO_HISTORICO,
  historicoDaAssinatura,
  totaisDasAssinaturas,
  type EntradaDoHistorico,
  type LinhaDaAssinatura,
  type LinhaDoLog,
} from "@/lib/assinaturas/painel";

/** Quantas linhas da Auditoria a tela lê para o histórico — sobra para anos de uso. */
const LIMITE_DO_HISTORICO = 3000;

/**
 * O histórico das assinaturas, tirado da Auditoria: cada "Salvar" grava ali o
 * plano, a situação e o modo como ficaram. A linha da Auditoria é gravada no
 * escritório de quem agiu (o Super Admin pode estar dentro de qualquer um),
 * então a busca passa por todos — `tenantId in (…)` usa o índice
 * (tenantId, entityType, entityId). Nunca derruba a tela: sem leitura, a tela
 * abre sem histórico.
 */
async function lerHistoricos(tenantIds: string[], nomeDoPlano: (id: string) => string | undefined): Promise<Map<string, EntradaDoHistorico[]>> {
  const porAssinatura = new Map<string, LinhaDoLog[]>();
  try {
    const linhas = await getPrisma().auditLog.findMany({
      where: { tenantId: { in: tenantIds }, entityType: "Subscription", action: { in: [...ACOES_DO_HISTORICO] } },
      orderBy: { createdAt: "desc" },
      take: LIMITE_DO_HISTORICO,
      select: { entityId: true, action: true, metadata: true, createdAt: true, actorName: true, user: { select: { name: true } } },
    });
    for (const l of linhas) {
      if (!l.entityId) continue;
      const lista = porAssinatura.get(l.entityId) ?? [];
      lista.push({ action: l.action, metadata: l.metadata, createdAt: l.createdAt, quem: l.actorName ?? l.user?.name ?? null });
      porAssinatura.set(l.entityId, lista);
    }
  } catch (err) {
    console.error("[assinaturas] histórico", err);
  }
  return new Map([...porAssinatura].map(([tenantId, linhas]) => [tenantId, historicoDaAssinatura(linhas, nomeDoPlano)]));
}

// Escolha A do Kauan (14/10/2026): números no topo, botões de situação com a
// contagem, a tabela com selos e "renova em X dias", e o Editar num painel ao
// lado, com o histórico. Era uma lista de linhas em texto cinza. Só o Super
// Admin — as regras de salvar são as de antes (actions.ts).
export default async function AssinaturasPage() {
  const ctx = await getAuthContext();
  if (ctx.role !== "SUPER_ADMIN") notFound();

  const prisma = getPrisma();
  const [tenants, plans, userCounts] = await Promise.all([
    prisma.tenant.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, logoUrl: true, managementMode: true, subscription: true },
    }),
    prisma.subscriptionPlan.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, managementMode: true, billingType: true, basePrice: true, pricePerUser: true, active: true },
    }),
    prisma.user.groupBy({ by: ["tenantId"], where: { active: true }, _count: { _all: true } }),
  ]);

  const activeUsersByTenant = new Map(userCounts.map((u) => [u.tenantId, u._count._all]));
  const planoPorId = new Map(plans.map((p) => [p.id, p]));
  const historicos = await lerHistoricos(
    tenants.map((t) => t.id),
    (id) => planoPorId.get(id)?.name,
  );

  const linhas: LinhaDaAssinatura[] = tenants.map((t) => {
    const s = t.subscription;
    const plano = s ? planoPorId.get(s.planId) : undefined;
    return {
      tenantId: t.id,
      nome: t.name,
      logoUrl: t.logoUrl,
      modo: t.managementMode,
      usuariosAtivos: activeUsersByTenant.get(t.id) ?? 0,
      assinatura: s
        ? {
            planId: s.planId,
            plano: plano
              ? {
                  id: plano.id,
                  nome: plano.name,
                  cobranca: plano.billingType,
                  valorMensal: Number(plano.basePrice),
                  valorPorUsuario: Number(plano.pricePerUser ?? 0),
                }
              : null,
            status: s.status,
            seatLimit: s.seatLimit,
            inicio: s.startedAt.toISOString(),
            renovacao: s.currentPeriodEnd ? s.currentPeriodEnd.toISOString().slice(0, 10) : null,
            implantacaoValor: s.setupFeeAmount?.toString() ?? null,
            implantacaoPagaEm: s.setupFeePaidAt?.toISOString() ?? null,
            notes: s.notes,
          }
        : null,
    };
  });

  // Na escolha do plano: os ativos, mais o que o cliente já usa mesmo inativo —
  // sem ele, o campo abria vazio e salvar trocava o plano sem ninguém pedir.
  const emUso = new Set(tenants.map((t) => t.subscription?.planId).filter(Boolean));
  const planosParaEscolher: PlanoParaEscolher[] = plans
    .filter((p) => p.active || emUso.has(p.id))
    .map((p) => ({ id: p.id, nome: p.name, ativo: p.active }));

  return (
    <PageContainer>
      <PageHeader
        title="Assinaturas"
        subtitle="Plano, situação e uso de cada escritório cliente."
        action={
          <Button href="/admin/planos" variant="secondary">
            <Receipt size={14} /> Planos
          </Button>
        }
      />

      {tenants.length === 0 ? (
        <Card>
          <EmptyState icon={<Building2 />} title="Nenhum escritório cadastrado" />
        </Card>
      ) : (
        <PainelDasAssinaturas
          linhas={linhas}
          totais={totaisDasAssinaturas(linhas)}
          planos={planosParaEscolher}
          historicos={Object.fromEntries(historicos)}
          hoje={hojeIso()}
        />
      )}
    </PageContainer>
  );
}
