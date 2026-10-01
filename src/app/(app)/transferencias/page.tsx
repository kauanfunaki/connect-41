import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ArrowRightLeft, ArrowRight, Inbox, Loader, CheckCircle2 } from "lucide-react";
import { FaixaDeTotais } from "@/components/financeiro/FiltroDePeriodo";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { getPrisma } from "@/lib/prisma";
import { getSectorMaps } from "@/lib/sectors";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { scopedHandoffWhere } from "@/lib/auth/scope";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SectorChip } from "@/components/ui/SectorChip";
import { formatInstantDate } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  aggregateHandoffStatus,
  HANDOFF_STATUS_LABEL,
  HANDOFF_STATUS_BADGE,
  HANDOFF_PRIORITY_LABEL,
  HANDOFF_PRIORITY_BADGE,
} from "@/lib/handoffs";
import type { HandoffSectorStatus, HandoffPriority } from "@/generated/prisma/enums";

const FILTER_TABS: { value: HandoffSectorStatus; label: string }[] = [
  { value: "NEW", label: "Novas" },
  { value: "IN_PROGRESS", label: "Resolvendo" },
  { value: "DONE", label: "Finalizadas" },
];

export default async function HandoffsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; prioridade?: string }>;
}) {
  const { status, prioridade } = await searchParams;
  const ctx = await getAuthContext();
  const canCreate = isFullWrite(ctx.role) || (ctx.role === "SECTOR_ADMIN" && ctx.sectors.length > 0);
  const { labels: sectorLabels, colors: sectorColors } = await getSectorMaps(ctx.tenantId);

  const statusFilter =
    status && ["NEW", "IN_PROGRESS", "DONE"].includes(status) ? (status as HandoffSectorStatus) : "NEW";

  const prisma = getPrisma();
  const allHandoffs = await prisma.handoff.findMany({
    where: scopedHandoffWhere(ctx),
    orderBy: { createdAt: "desc" },
    include: {
      requester: { select: { name: true } },
      sectors: { select: { sectorCode: true, status: true }, orderBy: { createdAt: "asc" } },
    },
  });

  // Status agregado (Nova = nenhum setor começou; Finalizada = todos terminaram;
  // Resolvendo = qualquer coisa no meio) — derivado dos setores, não armazenado.
  const prioridadeFiltro = prioridade && prioridade in HANDOFF_PRIORITY_LABEL ? (prioridade as HandoffPriority) : null;
  const naPrioridade = allHandoffs.filter((h) => !prioridadeFiltro || h.priority === prioridadeFiltro);
  const contagem: Record<HandoffSectorStatus, number> = { NEW: 0, IN_PROGRESS: 0, DONE: 0 };
  for (const h of naPrioridade) contagem[aggregateHandoffStatus(h.sectors.map((s) => s.status))]++;
  const handoffs = naPrioridade.filter(
    (h) => aggregateHandoffStatus(h.sectors.map((s) => s.status)) === statusFilter
  );
  const hrefDaSituacao = (s: HandoffSectorStatus) =>
    `/transferencias?status=${s}${prioridadeFiltro ? `&prioridade=${prioridadeFiltro}` : ""}`;

  // Resolve nomes das entidades (Company ou Person)
  const companyIds = handoffs.filter((h) => h.entityType === "COMPANY").map((h) => h.entityId);
  const personIds = handoffs.filter((h) => h.entityType === "PERSON").map((h) => h.entityId);

  const [companies, people] = await Promise.all([
    companyIds.length > 0
      ? prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    personIds.length > 0
      ? prisma.person.findMany({ where: { id: { in: personIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);

  const entityNames: Record<string, string> = {};
  companies.forEach((c) => (entityNames[c.id] = c.name));
  people.forEach((p) => (entityNames[p.id] = p.name));

  return (
    <PageContainer>
      <PageHeader
        title="Transferências"
        subtitle="Solicitações de transferência de acompanhamento entre setores"
        action={<>{canCreate && (
          <Button
            href="/transferencias/novo"
            variant="primary"
          >
            + Nova Transferência
          </Button>
        )}</>}
      />
      {/* As três situações em cartão, com a contagem, e cada uma leva à sua
          lista — eram pílulas, que a conferência de 30/09 reprovou como filtro.
          A situação e a prioridade escolhem-se também no "Filtros". */}
      <FaixaDeTotais
        itens={FILTER_TABS.map((t) => ({
          rotulo: t.label,
          valor: String(contagem[t.value]),
          icone: t.value === "NEW" ? <Inbox /> : t.value === "IN_PROGRESS" ? <Loader /> : <CheckCircle2 />,
          tom: t.value === "NEW" ? (contagem.NEW > 0 ? "text-warning" : undefined) : t.value === "DONE" ? "text-success" : undefined,
          detalhe: t.value === statusFilter ? "mostrando agora" : undefined,
          href: hrefDaSituacao(t.value),
        }))}
      />
      <FiltrosDaTela
        className="mb-4"
        campos={[
          {
            chave: "status",
            rotulo: "Situação",
            vazioLabel: "Novas",
            opcoes: FILTER_TABS.filter((t) => t.value !== "NEW").map((t) => ({ value: t.value, label: t.label })),
          },
          {
            chave: "prioridade",
            rotulo: "Prioridade",
            vazioLabel: "Todas",
            opcoes: (Object.keys(HANDOFF_PRIORITY_LABEL) as HandoffPriority[]).map((p) => ({ value: p, label: HANDOFF_PRIORITY_LABEL[p] })),
          },
        ]}
      />

      {handoffs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ArrowRightLeft />}
            title={`Nenhuma transferência ${HANDOFF_STATUS_LABEL[statusFilter].toLowerCase()}`}
            description="Transferências entre setores solicitadas na ficha de uma empresa ou pessoa aparecem aqui."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {handoffs.map((h) => {
            const aggregate = aggregateHandoffStatus(h.sectors.map((s) => s.status));
            return (
              <Card
                key={h.id}
                className="p-4 transition-[border-color,box-shadow,transform] duration-150 hover:border-brand/40 hover:shadow-[var(--c41-shadow-md)] hover:-translate-y-px"
              >
                <Link href={`/transferencias/${h.id}`} className="group flex items-start gap-3">
                  <span className="w-9 h-9 rounded-lg bg-surface-hover border border-border flex items-center justify-center text-fg-secondary flex-shrink-0">
                    <ArrowRightLeft size={16} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <SectorChip label={sectorLabels[h.fromSector] ?? h.fromSector} color={sectorColors[h.fromSector] ?? "#586577"} />
                      <ArrowRight size={13} className="text-fg-muted flex-shrink-0" />
                      {h.sectors.map((s) => (
                        <SectorChip
                          key={s.sectorCode}
                          label={sectorLabels[s.sectorCode] ?? s.sectorCode}
                          color={sectorColors[s.sectorCode] ?? "#586577"}
                        />
                      ))}
                      <Badge variant={HANDOFF_STATUS_BADGE[aggregate]}>{HANDOFF_STATUS_LABEL[aggregate]}</Badge>
                      <Badge variant={HANDOFF_PRIORITY_BADGE[h.priority]}>{HANDOFF_PRIORITY_LABEL[h.priority]}</Badge>
                    </div>

                    <p className="text-[length:var(--fs-body)] font-medium text-fg group-hover:text-brand transition-colors">
                      {entityNames[h.entityId] ?? "(removido)"}
                    </p>

                    {h.message && (
                      <p className="text-[length:var(--fs-helper)] text-fg-secondary mt-1">{h.message}</p>
                    )}

                    <p className="text-[length:var(--fs-helper)] text-fg-muted mt-1.5">
                      Solicitado por {h.requester.name} em{" "}
                      {formatInstantDate(h.createdAt, { day: "2-digit", month: "long", year: "numeric" })}
                    </p>
                  </div>
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
