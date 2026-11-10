import { Suspense } from "react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ArrowRightLeft, ArrowRight, Inbox, Loader, CheckCircle2, Plus } from "lucide-react";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { Pagination } from "@/components/shared/Pagination";
import { getPrisma } from "@/lib/prisma";
import { getSectorMaps } from "@/lib/sectors";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { scopedHandoffWhere } from "@/lib/auth/scope";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { Selo, tomDaVariante } from "@/components/ui/Selo";
import { SectorChip } from "@/components/ui/SectorChip";
import { formatInstantDate, formatarNumero } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  aggregateHandoffStatus,
  whereDaSituacao,
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

/** Transferências por página — a lista pagina no servidor desde 10/11/2026. */
const POR_PAGINA = 50;

type Contagens = Record<HandoffSectorStatus, number>;

export default async function HandoffsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; prioridade?: string; pagina?: string }>;
}) {
  const { status, prioridade, pagina } = await searchParams;
  const ctx = await getAuthContext();
  const canCreate = isFullWrite(ctx.role) || (ctx.role === "SECTOR_ADMIN" && ctx.sectors.length > 0);

  const statusValido =
    status && ["NEW", "IN_PROGRESS", "DONE"].includes(status) ? (status as HandoffSectorStatus) : null;
  const statusFilter = statusValido ?? "NEW";
  const prioridadeFiltro = prioridade && prioridade in HANDOFF_PRIORITY_LABEL ? (prioridade as HandoffPriority) : null;
  const pedida = Math.max(1, Number.parseInt(pagina ?? "1", 10) || 1);

  // Situação e prioridade filtram no banco (10/11/2026): a tela lia todas as
  // transferências, finalizadas inclusive, e filtrava em JS. A situação é a de
  // `aggregateHandoffStatus` (Nova = nenhum setor começou; Finalizada = todos
  // terminaram; Resolvendo = o meio), escrita como filtro em `whereDaSituacao`.
  const whereDa = (s: HandoffSectorStatus) => ({
    AND: [scopedHandoffWhere(ctx), prioridadeFiltro ? { priority: prioridadeFiltro } : {}, whereDaSituacao(s)],
  });
  const prisma = getPrisma();

  // As três contagens começam já, sem a lista esperar por elas: os cartões e o
  // "Página X de N" aguardam dentro do Suspense.
  const contagens: Promise<Contagens> = Promise.all(
    FILTER_TABS.map((t) => prisma.handoff.count({ where: whereDa(t.value) }))
  ).then(([NEW, IN_PROGRESS, DONE]) => ({ NEW, IN_PROGRESS, DONE }));
  // Se a lista falhar antes de os Suspense lerem a promessa, a falha da
  // contagem não fica solta; quem lê `contagens` continua recebendo o erro.
  contagens.catch(() => {});

  const buscarPagina = (p: number) =>
    prisma.handoff.findMany({
      where: whereDa(statusFilter),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (p - 1) * POR_PAGINA,
      take: POR_PAGINA,
      include: {
        requester: { select: { name: true } },
        sectors: { select: { sectorCode: true, status: true }, orderBy: { createdAt: "asc" } },
      },
    });

  const [{ labels: sectorLabels, colors: sectorColors }, primeira] = await Promise.all([
    getSectorMaps(ctx.tenantId),
    buscarPagina(pedida),
  ]);
  // Página além do fim (link antigo, a última esvaziou): mostra a última que
  // existe. Só aqui a lista espera a contagem.
  let handoffs = primeira;
  if (handoffs.length === 0 && pedida > 1) {
    const ultima = ultimaPagina((await contagens)[statusFilter]);
    if (ultima < pedida) handoffs = await buscarPagina(ultima);
  }

  const hrefDaSituacao = (s: HandoffSectorStatus) =>
    status === s
      ? `/transferencias${prioridadeFiltro ? `?prioridade=${prioridadeFiltro}` : ""}`
      : `/transferencias?status=${s}${prioridadeFiltro ? `&prioridade=${prioridadeFiltro}` : ""}`;
  const hrefDaPagina = (p: number) => {
    const q = new URLSearchParams();
    if (statusValido) q.set("status", statusValido);
    if (prioridadeFiltro) q.set("prioridade", prioridadeFiltro);
    if (p > 1) q.set("pagina", String(p));
    const s = q.toString();
    return s ? `/transferencias?${s}` : "/transferencias";
  };

  // Resolve nomes das entidades (Company ou Person) — só os da página aberta.
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
            <Plus size={14} /> Nova transferência
          </Button>
        )}</>}
      />
      {/* As três situações em cartão, com a contagem, e cada uma leva à sua
          lista — eram pílulas, que a conferência de 30/09 reprovou como filtro.
          A situação e a prioridade escolhem-se também no "Filtros". Desde
          10/11/2026 a contagem chega depois da lista (Suspense). */}
      <Suspense fallback={<CartoesDasSituacoes status={status} hrefDaSituacao={hrefDaSituacao} />}>
        <CartoesComContagem contagens={contagens} status={status} hrefDaSituacao={hrefDaSituacao} />
      </Suspense>
      <FiltrosDaTela
        className="mb-4"
        campos={[
          {
            chave: "status",
            rotulo: "Situação",
            vazioLabel: "Novas",
            opcoes: FILTER_TABS.map((t) => ({ value: t.value, label: t.label })),
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
              // O cartão inteiro é o link (07/10/2026): o Link morava dentro do
              // `p-4` do Card, a borda acendia no cartão todo e os 16px da margem
              // não clicavam. O `Card` com `href`, no hover dos cartões-link.
              <Card key={h.id} href={`/transferencias/${h.id}`} className="group flex items-start gap-3 p-4">
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
                    {/* Selo, e não Badge: é a situação do cartão (regra de 02/10 no Selo). */}
                    <Selo tom={tomDaVariante(HANDOFF_STATUS_BADGE[aggregate])}>{HANDOFF_STATUS_LABEL[aggregate]}</Selo>
                    <Selo tom={tomDaVariante(HANDOFF_PRIORITY_BADGE[h.priority])}>{HANDOFF_PRIORITY_LABEL[h.priority]}</Selo>
                  </div>

                  <p className="text-card-title font-semibold text-fg group-hover:text-brand transition-colors">
                    {entityNames[h.entityId] ?? "(removido)"}
                  </p>

                  {h.message && (
                    <p className="text-helper text-fg-secondary mt-1">{h.message}</p>
                  )}

                  <p className="text-helper text-fg-muted mt-1.5">
                    Solicitado por {h.requester.name} em{" "}
                    {formatInstantDate(h.createdAt, { day: "2-digit", month: "long", year: "numeric" })}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Suspense fallback={null}>
        <Paginador contagens={contagens} situacao={statusFilter} pedida={pedida} hrefDaPagina={hrefDaPagina} />
      </Suspense>
    </PageContainer>
  );
}

function ultimaPagina(total: number) {
  return Math.max(1, Math.ceil(total / POR_PAGINA));
}

/** Os três cartões de situação; sem `contagens`, o lugar deles enquanto contam. */
function CartoesDasSituacoes({
  contagens,
  status,
  hrefDaSituacao,
}: {
  contagens?: Contagens;
  status: string | undefined;
  hrefDaSituacao: (s: HandoffSectorStatus) => string;
}) {
  return (
    <FaixaDeTotais
      itens={FILTER_TABS.map((t) => ({
        rotulo: t.label,
        valor: contagens ? formatarNumero(contagens[t.value], 0) : "—",
        icone: t.value === "NEW" ? <Inbox /> : t.value === "IN_PROGRESS" ? <Loader /> : <CheckCircle2 />,
        tom:
          t.value === "NEW"
            ? contagens && contagens.NEW > 0
              ? "text-warning-fg"
              : undefined
            : t.value === "DONE"
              ? "text-success-fg"
              : undefined,
        detalhe: t.value === status ? "mostrando agora" : undefined,
        ativo: t.value === status,
        href: hrefDaSituacao(t.value),
      }))}
    />
  );
}

async function CartoesComContagem({
  contagens,
  ...props
}: {
  contagens: Promise<Contagens>;
  status: string | undefined;
  hrefDaSituacao: (s: HandoffSectorStatus) => string;
}) {
  return <CartoesDasSituacoes contagens={await contagens} {...props} />;
}

async function Paginador({
  contagens,
  situacao,
  pedida,
  hrefDaPagina,
}: {
  contagens: Promise<Contagens>;
  situacao: HandoffSectorStatus;
  pedida: number;
  hrefDaPagina: (p: number) => string;
}) {
  const total = (await contagens)[situacao];
  const totalPages = ultimaPagina(total);
  return (
    <Pagination
      page={Math.min(pedida, totalPages)}
      totalPages={totalPages}
      buildHref={hrefDaPagina}
      total={total}
      rotulo="transferências"
    />
  );
}
