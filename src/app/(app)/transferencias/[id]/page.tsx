import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRightLeft, ArrowRight, Eye } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getSectorMaps } from "@/lib/sectors";
import { getSectorUsers } from "@/lib/sectorUsers";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { scopedHandoffWhere } from "@/lib/auth/scope";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { formatInstantDate, formatInstantDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { SectorChip } from "@/components/ui/SectorChip";
import { AssigneeSelect } from "@/components/transferencias/AssigneeSelect";
import { SectorStatusSelect } from "@/components/transferencias/SectorStatusSelect";
import { atualizarStatusSetor, atribuirResponsavelSetor, registrarVisualizacao } from "../actions";
import {
  aggregateHandoffStatus,
  HANDOFF_STATUS_LABEL,
  HANDOFF_STATUS_BADGE,
  HANDOFF_PRIORITY_LABEL,
  HANDOFF_PRIORITY_BADGE,
} from "@/lib/handoffs";

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
    include: {
      requester: { select: { name: true } },
      sectors: {
        orderBy: { createdAt: "asc" },
        include: { assignee: { select: { id: true, name: true } } },
      },
    },
  });

  if (!handoff) notFound();

  if (ctx.userId) await registrarVisualizacao(handoff.id);

  const entity =
    handoff.entityType === "COMPANY"
      ? await prisma.company.findFirst({ where: { id: handoff.entityId, tenantId: ctx.tenantId }, select: { id: true, name: true } })
      : await prisma.person.findFirst({ where: { id: handoff.entityId, tenantId: ctx.tenantId }, select: { id: true, name: true } });

  const entityHref = handoff.entityType === "COMPANY" ? `/empresas/${handoff.entityId}` : `/pessoas/${handoff.entityId}`;
  const { labels: sectorLabels, colors: sectorColors } = await getSectorMaps(ctx.tenantId);
  const aggregate = aggregateHandoffStatus(handoff.sectors.map((s) => s.status));

  // Opções de responsável por setor — só carrega pros setores que o usuário
  // coordena (o select nem aparece pros demais). Sempre membros do setor.
  const manageableSectors = handoff.sectors.filter((s) => canManageSector(ctx, s.sectorCode));
  const assigneeOptionsBySector = Object.fromEntries(
    await Promise.all(
      manageableSectors.map(async (s) => [s.sectorCode, await getSectorUsers(ctx.tenantId, s.sectorCode)] as const)
    )
  );

  const views = await prisma.handoffView.findMany({
    where: { handoffId: handoff.id },
    include: { user: { select: { name: true } } },
    orderBy: { viewedAt: "desc" },
  });

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
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-10 h-10 rounded-lg bg-surface-hover border border-border flex items-center justify-center text-fg-secondary flex-shrink-0">
            <ArrowRightLeft size={18} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <SectorChip label={sectorLabels[handoff.fromSector] ?? handoff.fromSector} color={sectorColors[handoff.fromSector] ?? "#586577"} />
              <ArrowRight size={13} className="text-fg-muted flex-shrink-0" />
              {handoff.sectors.map((s) => (
                <SectorChip
                  key={s.sectorCode}
                  label={sectorLabels[s.sectorCode] ?? s.sectorCode}
                  color={sectorColors[s.sectorCode] ?? "#586577"}
                />
              ))}
              <Badge variant={HANDOFF_STATUS_BADGE[aggregate]}>{HANDOFF_STATUS_LABEL[aggregate]}</Badge>
              <Badge variant={HANDOFF_PRIORITY_BADGE[handoff.priority]}>
                Prioridade {HANDOFF_PRIORITY_LABEL[handoff.priority].toLowerCase()}
              </Badge>
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
              {formatInstantDate(handoff.createdAt, { day: "2-digit", month: "long", year: "numeric" })}
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-5 mb-4">
        <h2 className="text-[14px] font-semibold text-fg mb-2">Informações gerais</h2>
        {handoff.message ? (
          <p className="text-[length:var(--fs-body)] text-fg-secondary whitespace-pre-wrap">{handoff.message}</p>
        ) : (
          <p className="text-[length:var(--fs-body)] text-fg-muted italic">Nenhuma informação geral adicionada.</p>
        )}
        {handoff.description && (
          <>
            <h2 className="text-[14px] font-semibold text-fg mb-2 mt-4">Descrição</h2>
            <p className="text-[length:var(--fs-body)] text-fg-secondary whitespace-pre-wrap">{handoff.description}</p>
          </>
        )}
      </Card>

      {/* Um card por setor de destino: instrução, situação e responsável. */}
      <div className="space-y-3 mb-4">
        {handoff.sectors.map((s) => {
          const canManage = canManageSector(ctx, s.sectorCode);
          const canUpdateStatus = (canManage || s.assignedTo === ctx.userId) && ctx.role !== "READONLY";
          return (
            <Card key={s.id} className="p-5">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <SectorChip
                    label={sectorLabels[s.sectorCode] ?? s.sectorCode}
                    color={sectorColors[s.sectorCode] ?? "#586577"}
                  />
                  {!canUpdateStatus && (
                    <Badge variant={HANDOFF_STATUS_BADGE[s.status]}>{HANDOFF_STATUS_LABEL[s.status]}</Badge>
                  )}
                </div>
                {canUpdateStatus && (
                  <SectorStatusSelect action={atualizarStatusSetor.bind(null, s.id)} current={s.status} />
                )}
              </div>

              {s.instruction ? (
                <p className="text-[length:var(--fs-body)] text-fg-secondary whitespace-pre-wrap mb-3">{s.instruction}</p>
              ) : (
                <p className="text-[length:var(--fs-body)] text-fg-muted italic mb-3">Sem instrução específica para este setor.</p>
              )}

              <div className="flex items-center gap-2 pt-3 border-t border-border">
                <span className="text-[12px] text-fg-muted">Responsável:</span>
                {canManage ? (
                  <AssigneeSelect
                    action={atribuirResponsavelSetor.bind(null, s.id)}
                    options={assigneeOptionsBySector[s.sectorCode] ?? []}
                    currentAssigneeId={s.assignee?.id ?? null}
                  />
                ) : (
                  <span className="text-[12px] text-fg">{s.assignee?.name ?? "Sem responsável"}</span>
                )}
                {/* Só faz sentido mostrar a data de finalização quando o setor de
                    fato finalizou — dados migrados do modelo antigo podiam ter
                    resolvedAt preenchido em setor ainda "Resolvendo". */}
                {s.status === "DONE" && s.resolvedAt && (
                  <span className="text-[12px] text-fg-muted ml-auto">
                    Finalizada em {formatInstantDateTime(s.resolvedAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {views.length > 0 && (
        <Card className="p-5">
          <h2 className="text-[14px] font-semibold text-fg mb-2 flex items-center gap-1.5">
            <Eye size={14} className="text-fg-muted" />
            Visualizado por
          </h2>
          <div className="space-y-1.5">
            {views.map((v) => (
              <p key={v.id} className="text-[13px] text-fg-secondary">
                <span className="font-medium text-fg">{v.user.name}</span>{" "}
                <span className="text-fg-muted">
                  em {formatInstantDateTime(v.viewedAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </p>
            ))}
          </div>
        </Card>
      )}
    </PageContainer>
  );
}
