import Link from "next/link";
import { ArrowRightLeft, ArrowRight } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getSectorMaps } from "@/lib/sectors";
import { getAuthContext, canManageSector, isFullWrite } from "@/lib/auth/context";
import { scopedHandoffWhere } from "@/lib/auth/scope";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SectorChip } from "@/components/ui/SectorChip";
import { EmptyState } from "@/components/ui/EmptyState";
import { HandoffActions } from "@/components/transferencias/HandoffActions";
import { aceitarHandoff, rejeitarHandoff } from "./actions";
import type { HandoffStatus } from "@/generated/prisma/enums";

const STATUS_LABEL: Record<HandoffStatus, string> = {
  PENDING: "Aguardando aceite",
  ACCEPTED: "Aceita",
  REJECTED: "Rejeitada",
};

const STATUS_BADGE_VARIANT: Record<HandoffStatus, "warning" | "success" | "danger"> = {
  PENDING: "warning",
  ACCEPTED: "success",
  REJECTED: "danger",
};

const FILTER_TABS: { value: HandoffStatus; label: string }[] = [
  { value: "PENDING", label: "Aguardando aceite" },
  { value: "ACCEPTED", label: "Aceitas" },
  { value: "REJECTED", label: "Rejeitadas" },
];

export default async function HandoffsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const ctx = await getAuthContext();
  const canCreate = isFullWrite(ctx.role) || (ctx.role === "SECTOR_ADMIN" && ctx.sectors.length > 0);
  const { labels: sectorLabels, colors: sectorColors } = await getSectorMaps(ctx.tenantId);

  const statusFilter =
    status && ["PENDING", "ACCEPTED", "REJECTED"].includes(status) ? (status as HandoffStatus) : "PENDING";

  const prisma = getPrisma();
  const handoffs = await prisma.handoff.findMany({
    where: { ...scopedHandoffWhere(ctx), status: statusFilter },
    orderBy: { createdAt: "desc" },
    include: { requester: { select: { name: true } } },
  });

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

  function buildUrl(newStatus: HandoffStatus) {
    return `/transferencias?status=${newStatus}`;
  }

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[length:var(--fs-display)] font-display font-semibold text-fg tracking-[-0.01em]">
            Transferências
          </h1>
          <p className="text-[length:var(--fs-helper)] text-fg-muted mt-0.5">
            Solicitações de transferência de acompanhamento entre setores
          </p>
        </div>
        {canCreate && (
          <Link
            href="/transferencias/novo"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
          >
            + Nova Transferência
          </Link>
        )}
      </div>

      <div className="flex items-center gap-1 mb-4">
        {FILTER_TABS.map((tab) => {
          const isActive = tab.value === statusFilter;
          return (
            <Link
              key={tab.value}
              href={buildUrl(tab.value)}
              className={`inline-flex items-center h-8 px-3 rounded-md text-[12px] font-medium transition-colors ${
                isActive
                  ? "bg-surface-2 text-fg border border-border-strong"
                  : "text-fg-muted hover:text-fg hover:bg-surface-2"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {handoffs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ArrowRightLeft />}
            title={`Nenhuma transferência ${STATUS_LABEL[statusFilter].toLowerCase()}`}
            description="Transferências entre setores solicitadas na ficha de uma empresa ou pessoa aparecem aqui."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {handoffs.map((h) => {
            const canResolve = h.status === "PENDING" && canManageSector(ctx, h.toSector);
            const aceitarAction = aceitarHandoff.bind(null, h.id);
            const rejeitarAction = rejeitarHandoff.bind(null, h.id);

            return (
              <Card key={h.id} className="p-4">
                <div className="flex items-start gap-3">
                  <Link href={`/transferencias/${h.id}`} className="group flex items-start gap-3 flex-1 min-w-0">
                    <span className="w-9 h-9 rounded-lg bg-surface-hover border border-border flex items-center justify-center text-fg-secondary flex-shrink-0">
                      <ArrowRightLeft size={16} />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <SectorChip label={sectorLabels[h.fromSector] ?? h.fromSector} color={sectorColors[h.fromSector] ?? "#586577"} />
                        <ArrowRight size={13} className="text-fg-muted flex-shrink-0" />
                        <SectorChip label={sectorLabels[h.toSector] ?? h.toSector} color={sectorColors[h.toSector] ?? "#586577"} />
                        <Badge variant={STATUS_BADGE_VARIANT[h.status]}>{STATUS_LABEL[h.status]}</Badge>
                      </div>

                      <p className="text-[length:var(--fs-body)] font-medium text-fg group-hover:text-brand transition-colors">
                        {entityNames[h.entityId] ?? "(removido)"}
                      </p>

                      {h.message && (
                        <p className="text-[length:var(--fs-helper)] text-fg-secondary mt-1">{h.message}</p>
                      )}

                      <p className="text-[length:var(--fs-helper)] text-fg-muted mt-1.5">
                        Solicitado por {h.requester.name} em{" "}
                        {h.createdAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                      </p>
                    </div>
                  </Link>

                  {canResolve && (
                    <HandoffActions aceitarAction={aceitarAction} rejeitarAction={rejeitarAction} />
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
