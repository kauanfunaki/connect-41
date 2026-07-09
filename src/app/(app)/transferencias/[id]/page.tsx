import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRightLeft, ArrowRight } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getSectorMaps } from "@/lib/sectors";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { scopedHandoffWhere } from "@/lib/auth/scope";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SectorChip } from "@/components/ui/SectorChip";
import { HandoffActions } from "@/components/transferencias/HandoffActions";
import { aceitarHandoff, rejeitarHandoff } from "../actions";
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

export default async function HandoffDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();

  const prisma = getPrisma();
  const handoff = await prisma.handoff.findFirst({
    where: { id, ...scopedHandoffWhere(ctx) },
    include: { requester: { select: { name: true } } },
  });

  if (!handoff) notFound();

  const entity =
    handoff.entityType === "COMPANY"
      ? await prisma.company.findFirst({ where: { id: handoff.entityId, tenantId: ctx.tenantId }, select: { id: true, name: true } })
      : await prisma.person.findFirst({ where: { id: handoff.entityId, tenantId: ctx.tenantId }, select: { id: true, name: true } });

  const entityHref = handoff.entityType === "COMPANY" ? `/empresas/${handoff.entityId}` : `/pessoas/${handoff.entityId}`;
  const { labels: sectorLabels, colors: sectorColors } = await getSectorMaps(ctx.tenantId);
  const canResolve = handoff.status === "PENDING" && canManageSector(ctx, handoff.toSector);
  const aceitarAction = aceitarHandoff.bind(null, handoff.id);
  const rejeitarAction = rejeitarHandoff.bind(null, handoff.id);

  return (
    <PageContainer variant="narrow">
      <div className="flex items-center gap-2 mb-5">
        <Link href="/transferencias" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Transferências
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg truncate">{entity?.name ?? "(removido)"}</span>
      </div>

      <Card className="p-6 mb-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-10 h-10 rounded-lg bg-surface-hover border border-border flex items-center justify-center text-fg-secondary flex-shrink-0">
              <ArrowRightLeft size={18} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <SectorChip label={sectorLabels[handoff.fromSector] ?? handoff.fromSector} color={sectorColors[handoff.fromSector] ?? "#586577"} />
                <ArrowRight size={13} className="text-fg-muted flex-shrink-0" />
                <SectorChip label={sectorLabels[handoff.toSector] ?? handoff.toSector} color={sectorColors[handoff.toSector] ?? "#586577"} />
                <Badge variant={STATUS_BADGE_VARIANT[handoff.status]}>{STATUS_LABEL[handoff.status]}</Badge>
              </div>
              {entity ? (
                <Link
                  href={entityHref}
                  className="text-[length:var(--fs-section)] font-display font-semibold text-fg hover:text-brand transition-colors"
                >
                  {entity.name}
                </Link>
              ) : (
                <p className="text-[length:var(--fs-section)] font-display font-semibold text-fg-muted">(removido)</p>
              )}
              <p className="text-[length:var(--fs-helper)] text-fg-muted mt-1">
                Solicitado por {handoff.requester.name} em{" "}
                {handoff.createdAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                {handoff.resolvedAt && (
                  <>
                    {" "}· resolvido em{" "}
                    {handoff.resolvedAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                  </>
                )}
              </p>
            </div>
          </div>

          {canResolve && <HandoffActions aceitarAction={aceitarAction} rejeitarAction={rejeitarAction} />}
        </div>
      </Card>

      <Card className="p-5 mb-4">
        <h2 className="text-[14px] font-semibold text-fg mb-2">Mensagem</h2>
        {handoff.message ? (
          <p className="text-[length:var(--fs-body)] text-fg-secondary whitespace-pre-wrap">{handoff.message}</p>
        ) : (
          <p className="text-[length:var(--fs-body)] text-fg-muted italic">Nenhuma mensagem informada.</p>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-[14px] font-semibold text-fg mb-2">Descrição</h2>
        {handoff.description ? (
          <p className="text-[length:var(--fs-body)] text-fg-secondary whitespace-pre-wrap">{handoff.description}</p>
        ) : (
          <p className="text-[length:var(--fs-body)] text-fg-muted italic">Nenhuma descrição adicionada.</p>
        )}
      </Card>
    </PageContainer>
  );
}
