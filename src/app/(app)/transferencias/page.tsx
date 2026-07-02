import Link from "next/link";
import { getPrisma } from "@/lib/prisma";
import { getSectorMaps } from "@/lib/sectors";
import { getAuthContext, canManageSector, isFullWrite } from "@/lib/auth/context";
import { scopedHandoffWhere } from "@/lib/auth/scope";
import { HandoffActions } from "@/components/transferencias/HandoffActions";
import { aceitarHandoff, rejeitarHandoff } from "./actions";
import type { HandoffStatus } from "@/generated/prisma/enums";

const STATUS_LABEL: Record<HandoffStatus, string> = {
  PENDING: "Pendente",
  ACCEPTED: "Aceito",
  REJECTED: "Rejeitado",
};

const STATUS_STYLE: Record<HandoffStatus, string> = {
  PENDING: "bg-warning/10 text-warning border-warning/25",
  ACCEPTED: "bg-success/10 text-success border-success/25",
  REJECTED: "bg-danger/10 text-danger border-danger/25",
};

const FILTER_TABS: { value: HandoffStatus; label: string }[] = [
  { value: "PENDING", label: "Pendentes" },
  { value: "ACCEPTED", label: "Aceitos" },
  { value: "REJECTED", label: "Rejeitados" },
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
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Transferências</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            Transferências de acompanhamento entre setores
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

      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        {handoffs.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-fg-muted">
            Nenhuma transferência {STATUS_LABEL[statusFilter].toLowerCase()} encontrada.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {handoffs.map((h) => {
              const entityHref = h.entityType === "COMPANY" ? `/empresas/${h.entityId}` : `/pessoas/${h.entityId}`;
              const canResolve = h.status === "PENDING" && canManageSector(ctx, h.toSector);
              const aceitarAction = aceitarHandoff.bind(null, h.id);
              const rejeitarAction = rejeitarHandoff.bind(null, h.id);

              return (
                <div key={h.id} className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Link
                          href={entityHref}
                          className="text-[13px] font-medium text-fg hover:text-brand transition-colors"
                        >
                          {entityNames[h.entityId] ?? "(removido)"}
                        </Link>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${STATUS_STYLE[h.status]}`}
                        >
                          {STATUS_LABEL[h.status]}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-[12px] text-fg-muted mb-1">
                        <SectorChip code={h.fromSector} labels={sectorLabels} colors={sectorColors} />
                        <span>→</span>
                        <SectorChip code={h.toSector} labels={sectorLabels} colors={sectorColors} />
                      </div>

                      {h.message && <p className="text-[13px] text-fg-secondary mb-1">{h.message}</p>}

                      <p className="text-[11px] text-fg-muted">
                        Solicitado por {h.requester.name} em{" "}
                        {h.createdAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                      </p>
                    </div>

                    {canResolve && (
                      <HandoffActions aceitarAction={aceitarAction} rejeitarAction={rejeitarAction} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SectorChip({
  code,
  labels,
  colors,
}: {
  code: string;
  labels: Record<string, string>;
  colors: Record<string, string>;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: colors[code] ?? "#586577" }}
      />
      {labels[code] ?? code}
    </span>
  );
}
