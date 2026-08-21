import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { ArrowRightLeft, Columns3, ListTodo, Video } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullAccess, scopedSectors } from "@/lib/auth/context";
import { scopedPipelineWhere } from "@/lib/auth/scope";
import { getSectorMaps, getActiveSectors } from "@/lib/sectors";
import { parseTaskWidgets, visibleTaskWidgets, type TaskWidgetKey } from "@/lib/taskWidgets";
import { ConfigurarTarefasButton } from "@/components/tarefas/ConfigurarTarefasButton";
import { salvarWidgetsSetor, restaurarWidgetsSetor } from "./actions";
import { PageContainer } from "@/components/shared/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { SectorChip } from "@/components/ui/SectorChip";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatInstantDate, formatInstantDateTime } from "@/lib/format";
import {
  HANDOFF_STATUS_LABEL,
  HANDOFF_STATUS_BADGE,
  HANDOFF_PRIORITY_LABEL,
  HANDOFF_PRIORITY_BADGE,
} from "@/lib/handoffs";
import type { HandoffPriority, Prisma } from "@/generated/prisma/client";
import { boardPath } from "@/lib/kanbanPaths";

const PRIORITY_ORDER: Record<HandoffPriority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

// Tela de Tarefas: as obrigações de quem está logado, num lugar só.
//
// QUAIS blocos aparecem é configurado pelo SUPER_ADMIN, por setor
// (SectorTaskView / src/lib/taskWidgets.ts). Transferências, cards de kanban e
// reuniões servem todo mundo hoje, mas deixam de descrever o trabalho de um
// setor assim que ele ganha módulos próprios — daí a tela não ser fixa. Setor
// sem configuração mostra tudo, e quem está em mais de um setor vê a união.
export default async function TarefasPage() {
  const ctx = await getAuthContext();
  const prisma = getPrisma();
  const [{ labels: sectorLabels, colors: sectorColors }, taskViews] = await Promise.all([
    getSectorMaps(ctx.tenantId),
    prisma.sectorTaskView.findMany({
      where: { tenantId: ctx.tenantId },
      select: { sectorCode: true, widgets: true },
    }),
  ]);

  const configBySector: Record<string, TaskWidgetKey[]> = {};
  for (const v of taskViews) configBySector[v.sectorCode] = parseTaskWidgets(v.widgets);

  // Com setor ativo, quem manda é a configuração DAQUELE setor; em "Todos",
  // continua sendo a união dos setores da pessoa — o comportamento anterior.
  // (`scopedSectors` devolve null para full access em "Todos"; aí cai em
  // ctx.sectors, e lista vazia já significa "widgets padrão" lá dentro.)
  const visiveis = new Set(visibleTaskWidgets(scopedSectors(ctx) ?? ctx.sectors, configBySector));
  const mostraTransferencias = visiveis.has("transferencias");
  const mostraCards = visiveis.has("cards-kanban");
  const mostraReunioes = visiveis.has("reunioes");

  // Só o SUPER_ADMIN configura — o gate de verdade está na action; esconder o
  // botão é só para não oferecer o que vai ser recusado.
  const podeConfigurar = ctx.role === "SUPER_ADMIN";
  const setoresParaConfigurar = podeConfigurar
    ? (await getActiveSectors(ctx.tenantId)).map((s) => ({ code: s.code, label: s.label }))
    : [];

  // Instruções de transferência em aberto que são responsabilidade minha:
  // - colaborador: as designadas pra mim;
  // - coordenador (SECTOR_ADMIN): tudo do(s) setor(es) que coordena;
  // - gerência geral (ADMIN/SUPER_ADMIN/READONLY): tudo do tenant.
  const instrucaoWhere: Prisma.HandoffSectorWhereInput = isFullAccess(ctx.role)
    ? { tenantId: ctx.tenantId, status: { not: "DONE" } }
    : ctx.role === "SECTOR_ADMIN" && ctx.sectors.length > 0
      ? {
          tenantId: ctx.tenantId,
          status: { not: "DONE" },
          OR: [{ sectorCode: { in: ctx.sectors } }, { assignees: { some: { userId: ctx.userId } } }],
        }
      : { tenantId: ctx.tenantId, status: { not: "DONE" }, assignees: { some: { userId: ctx.userId } } };

  // Bloco escondido não consulta o banco: a configuração do setor deixa de ser
  // só visual e vira menos trabalho por request.
  const now = new Date();
  const [instrucoesRaw, meusCards, reunioes] = await Promise.all([
    mostraTransferencias
      ? prisma.handoffSector.findMany({
          where: instrucaoWhere,
          include: {
            assignees: { include: { user: { select: { name: true } } } },
            handoff: {
              select: {
                id: true,
                fromSector: true,
                priority: true,
                message: true,
                entityType: true,
                entityId: true,
                createdAt: true,
                requester: { select: { name: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
    mostraCards && ctx.userId
      ? prisma.pipelineItem.findMany({
          where: {
            tenantId: ctx.tenantId,
            pipeline: scopedPipelineWhere(ctx),
            stage: { isTerminal: false },
            assignees: { some: { userId: ctx.userId } },
          },
          orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
          select: {
            id: true,
            entityId: true,
            entityType: true,
            title: true,
            dueDate: true,
            pipelineId: true,
            stage: { select: { name: true } },
            pipeline: { select: { name: true, sectorCode: true } },
          },
        })
      : Promise.resolve([]),
    mostraReunioes && ctx.userId
      ? prisma.meeting.findMany({
          where: {
            tenantId: ctx.tenantId,
            endAt: { gte: now },
            OR: [{ createdByUserId: ctx.userId }, { attendees: { some: { userId: ctx.userId } } }],
          },
          orderBy: { startAt: "asc" },
          take: 5,
        })
      : Promise.resolve([]),
  ]);

  // Urgente primeiro; empate resolve pela mais antiga.
  const instrucoes = instrucoesRaw.sort(
    (a, b) =>
      PRIORITY_ORDER[a.handoff.priority] - PRIORITY_ORDER[b.handoff.priority] ||
      a.handoff.createdAt.getTime() - b.handoff.createdAt.getTime()
  );

  // Nomes das entidades referenciadas
  const companyIds = new Set<string>();
  const personIds = new Set<string>();
  for (const i of instrucoes) (i.handoff.entityType === "COMPANY" ? companyIds : personIds).add(i.handoff.entityId);
  for (const c of meusCards) {
    if (!c.entityId) continue; // tarefa sem empresa/pessoa associada
    (c.entityType === "COMPANY" ? companyIds : personIds).add(c.entityId);
  }
  const [companies, people] = await Promise.all([
    companyIds.size > 0
      ? prisma.company.findMany({ where: { id: { in: Array.from(companyIds) } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    personIds.size > 0
      ? prisma.person.findMany({ where: { id: { in: Array.from(personIds) } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const entityNames: Record<string, string> = {};
  companies.forEach((c) => (entityNames[c.id] = c.name));
  people.forEach((p) => (entityNames[p.id] = p.name));

  return (
    <PageContainer>
      <PageHeader
        title="Tarefas"
        subtitle="Suas obrigações em aberto, conforme o que cada setor acompanha aqui"
        action={
          <div className="flex items-center gap-2">
            {podeConfigurar && (
              <ConfigurarTarefasButton
                sectors={setoresParaConfigurar}
                configBySector={configBySector}
                saveAction={salvarWidgetsSetor}
                resetAction={restaurarWidgetsSetor}
              />
            )}
            <Link
              href="/kanban"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md border border-border text-[13px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors"
            >
              <Columns3 size={14} /> Ver quadros
            </Link>
          </div>
        }
      />

      {visiveis.size === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-5">
          <EmptyState
            icon={<ListTodo />}
            title="Nada configurado para o seu setor"
            description="O super admin ainda não definiu quais obrigações aparecem aqui para o seu setor."
          />
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-4">
        <div className="flex flex-col gap-4 min-w-0">
          {/* Transferências sob minha responsabilidade */}
          {mostraTransferencias && (
          <div className="bg-surface border border-border rounded-lg p-5">
            <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-3.5 flex items-center gap-2">
              <ArrowRightLeft size={15} className="text-fg-muted" /> Transferências em aberto
            </h2>
            {instrucoes.length === 0 ? (
              <EmptyState
                icon={<ListTodo />}
                title="Nenhuma transferência pendente"
                description="Instruções de transferência do seu setor ou designadas a você aparecem aqui."
              />
            ) : (
              <div className="space-y-3">
                {instrucoes.map((i) => (
                  <Link
                    key={i.id}
                    href={`/transferencias/${i.handoff.id}`}
                    className="block group border border-border rounded-lg px-4 py-3 hover:border-border-strong hover:bg-surface-hover transition-colors"
                  >
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <SectorChip
                        label={sectorLabels[i.sectorCode] ?? i.sectorCode}
                        color={sectorColors[i.sectorCode] ?? "#586577"}
                      />
                      <Badge variant={HANDOFF_STATUS_BADGE[i.status]}>{HANDOFF_STATUS_LABEL[i.status]}</Badge>
                      <Badge variant={HANDOFF_PRIORITY_BADGE[i.handoff.priority]}>
                        {HANDOFF_PRIORITY_LABEL[i.handoff.priority]}
                      </Badge>
                    </div>
                    <p className="text-[length:var(--fs-body)] font-medium text-fg group-hover:text-brand transition-colors">
                      {entityNames[i.handoff.entityId] ?? "(removido)"}
                    </p>
                    {(i.instruction ?? i.handoff.message) && (
                      <p className="text-[length:var(--fs-helper)] text-fg-secondary mt-0.5 line-clamp-2">
                        {i.instruction ?? i.handoff.message}
                      </p>
                    )}
                    <p className="text-[length:var(--fs-helper)] text-fg-muted mt-1">
                      De {sectorLabels[i.handoff.fromSector] ?? i.handoff.fromSector} · {i.handoff.requester.name} ·{" "}
                      {formatInstantDate(i.handoff.createdAt, { day: "2-digit", month: "short" })} ·{" "}
                      {i.assignees.length > 0
                        ? `${i.assignees.length > 1 ? "Responsáveis" : "Responsável"}: ${i.assignees.map((a) => a.user.name).join(", ")}`
                        : "Sem responsável"}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
          )}

          {/* Cards de kanban atribuídos a mim */}
          {mostraCards && (
          <div className="bg-surface border border-border rounded-lg p-5">
            <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-3.5 flex items-center gap-2">
              <Columns3 size={15} className="text-fg-muted" /> Meus cards de kanban
            </h2>
            {meusCards.length === 0 ? (
              <p className="text-[length:var(--fs-body)] text-fg-muted">Nenhum card atribuído a você.</p>
            ) : (
              <div className="space-y-1">
                {meusCards.map((c) => (
                  <Link
                    key={c.id}
                    href={`${boardPath({ id: c.pipelineId })}/itens/${c.id}`}
                    className="flex items-center justify-between gap-3 py-2 group"
                  >
                    <span className="text-[length:var(--fs-body)] text-fg group-hover:text-brand transition-colors truncate min-w-0">
                      {c.title ?? (c.entityId ? entityNames[c.entityId] : null) ?? "(sem título)"}
                      <span className="text-fg-muted font-normal">
                        {" · "}
                        {sectorLabels[c.pipeline.sectorCode] ?? c.pipeline.sectorCode}
                        {" · "}
                        {c.stage.name}
                      </span>
                    </span>
                    <span className="flex-shrink-0 text-[length:var(--fs-helper)] text-fg-muted">
                      {c.dueDate ? formatInstantDate(c.dueDate, { day: "2-digit", month: "short" }) : "Sem prazo"}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
          )}
        </div>

        {/* Próximas reuniões */}
        {mostraReunioes && (
        <div className="bg-surface border border-border rounded-lg p-5 h-fit">
          <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-3.5 flex items-center gap-2">
            <Video size={15} className="text-fg-muted" /> Próximas reuniões
          </h2>
          {reunioes.length === 0 ? (
            <p className="text-[length:var(--fs-body)] text-fg-muted">Nenhuma reunião agendada.</p>
          ) : (
            <div className="space-y-3">
              {reunioes.map((m) => (
                <div key={m.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[length:var(--fs-body)] font-medium text-fg truncate">{m.title}</p>
                    <p className="text-[length:var(--fs-helper)] text-fg-muted">
                      {formatInstantDateTime(m.startAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <a
                    href={m.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 text-[12.5px] font-medium text-brand border border-brand/30 rounded-full px-3 py-1 hover:bg-brand-subtle transition-colors"
                  >
                    Entrar
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
        )}
      </div>
      )}
    </PageContainer>
  );
}
