import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Pencil, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { VagaPrioridade } from "@/generated/prisma/enums";
import { VAGA_STATUS_LABEL, VAGA_STATUS_STYLE } from "@/lib/vagaStatus";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { scopedVagaWhere } from "@/lib/auth/scope";
import { getSectorMaps } from "@/lib/sectors";
import { DeleteButton } from "@/components/pessoas/DeleteButton";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { AddCandidatoForm } from "@/components/vagas/AddCandidatoForm";
import { AssistenteDaVaga } from "@/components/vagas/AssistenteDaVaga";
import { TriagemDaVaga } from "@/components/vagas/TriagemDaVaga";
import { isAiConfigured } from "@/lib/ai";
import { requisitosAtuais } from "@/lib/recrutamento/triagemServidor";
import { compararParaTriagem, type Faixa } from "@/lib/recrutamento/triagem";
import { resumoDasRespostas } from "@/lib/recrutamento/respostas";
import { RecruitmentFunnel, type FunnelCard } from "@/components/vagas/RecruitmentFunnel";
import { computeFunnelConversion, type Stage } from "@/lib/recruitmentFunnel";
import { formatInstantDate } from "@/lib/format";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { excluirVaga, encerrarVaga, reabrirVaga } from "../actions";
import { adicionarCandidato, moverEtapaCandidatura, encerrarCandidatura } from "./actions";
import { podeAgirNaVaga, ehCoordenadorDoRecrutamento, SETOR_RECRUTAMENTO } from "@/lib/recrutamento/acessoVagas";
import { AcessoDosRecrutadores } from "@/components/vagas/AcessoDosRecrutadores";
import { Selo } from "@/components/ui/Selo";
import { InfoRow } from "@/components/empresas/InfoRow";
import { Funil } from "@/components/shared/Graficos";

const PRIORITY_LABEL: Record<VagaPrioridade, string> = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA:  "Alta",
};

export default async function VagaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  // Vaga e teste são do setor que contrata (o escopo já filtra); aqui só o
  // módulo ligado, que antes não era checado e deixava a tela abrir desligada.
  if (!(await isModuleEnabled(ctx.tenantId, "recrutamento_vagas"))) notFound();

  const prisma = getPrisma();
  const vaga = await prisma.vaga.findFirst({
    where: { id, ...scopedVagaWhere(ctx) },
    include: {
      company: { select: { id: true, name: true } },
      cargo: { select: { id: true, name: true } },
      candidaturas: {
        orderBy: { createdAt: "desc" },
        include: {
          person: { select: { id: true, name: true } },
          _count: { select: { scorecards: true } },
        },
      },
    },
  });
  if (!vaga) notFound();

  const canManage = canManageSector(ctx, vaga.sectorCode);
  const tenantSlug = (
    await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { slug: true } })
  )?.slug;
  const publicBaseUrl = process.env.APP_PUBLIC_URL ?? "";
  const canAct = await podeAgirNaVaga(ctx, vaga);
  const { labels: sectorLabels } = await getSectorMaps(ctx.tenantId);

  // Quem do Recrutamento vê a vaga — só a coordenação do Recrutamento enxerga
  // e decide (28/09). Coordenadores e admins veem tudo de qualquer jeito, então
  // a lista oferece só os recrutadores.
  const coordenaRecrutamento = ehCoordenadorDoRecrutamento(ctx);
  const [recrutadores, escolhidos] = coordenaRecrutamento
    ? await Promise.all([
        prisma.user.findMany({
          where: {
            tenantId: ctx.tenantId,
            active: true,
            role: "SECTOR_USER",
            sectors: { some: { sectorCode: SETOR_RECRUTAMENTO } },
          },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        prisma.vagaRecrutador.findMany({ where: { vagaId: id }, select: { userId: true } }),
      ])
    : [[], []];

  // Triagem (R1): requisitos atuais e a última nota de cada candidatura. Nota
  // de versão anterior dos requisitos aparece, mas marcada como desatualizada.
  const [requisitos, iaConfigurada] = await Promise.all([requisitosAtuais(ctx.tenantId, id), isAiConfigured(ctx.tenantId)]);
  const ultimasNotas = await prisma.candidaturaNota.findMany({
    where: { tenantId: ctx.tenantId, candidatura: { vagaId: id } },
    orderBy: { createdAt: "desc" },
    distinct: ["candidaturaId"],
    select: { candidaturaId: true, score: true, faixa: true, requisitosId: true },
  });
  const notaDa = new Map(ultimasNotas.map((n) => [n.candidaturaId, n]));
  const emAndamento = vaga.candidaturas.filter((c) => c.status === "EM_ANDAMENTO");
  const pendentes = requisitos ? emAndamento.filter((c) => notaDa.get(c.id)?.requisitosId !== requisitos.id).length : 0;

  const linkedPersonIds = new Set(vaga.candidaturas.map((c) => c.personId));
  const candidatos = await prisma.person.findMany({
    where: { tenantId: ctx.tenantId, type: "CANDIDATO", active: true, id: { notIn: [...linkedPersonIds] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const deleteAction = excluirVaga.bind(null, id);
  const encerrarAction = encerrarVaga.bind(null, id);
  const reabrirAction = reabrirVaga.bind(null, id);
  const addCandidatoAction = adicionarCandidato.bind(null, id);
  const moverEtapaAction = moverEtapaCandidatura.bind(null, id);
  const encerrarCandidaturaAction = encerrarCandidatura.bind(null, id);

  // Funil: separa candidaturas ativas (colunas do board) das encerradas
  // (reprovado/desistente, faixa embaixo). O cálculo de conversão usa TODAS
  // (o stage preservado é o que mede quem alcançou cada etapa).
  const funnelStats = computeFunnelConversion(vaga.candidaturas.map((c) => ({ stage: c.stage, status: c.status })));
  const activeCards: FunnelCard[] = vaga.candidaturas
    .filter((c) => c.status !== "REPROVADO" && c.status !== "DESISTENTE")
    .map((c) => ({
      id: c.id,
      personId: c.person.id,
      personName: c.person.name,
      origin: c.origin,
      hasResume: c.resumeUrl != null,
      stage: c.stage as Stage,
      scorecardCount: c._count.scorecards,
      respostas: resumoDasRespostas({
        pretensaoSalarial: c.pretensaoSalarial === null ? null : c.pretensaoSalarial.toNumber(),
        disponibilidade: c.disponibilidade,
        deslocamentoMinutos: c.deslocamentoMinutos,
      }),
      nota: (() => {
        const n = notaDa.get(c.id);
        return n ? { score: n.score, faixa: n.faixa as Faixa, desatualizada: n.requisitosId !== requisitos?.id } : null;
      })(),
    }))
    // Dentro de cada etapa, o mais aderente primeiro; sem nota vai para o fim.
    .sort(compararParaTriagem);
  const encerrados = vaga.candidaturas.filter((c) => c.status === "REPROVADO" || c.status === "DESISTENTE");

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Vagas", href: "/vagas" }, { label: vaga.title, truncate: true }]} />

      {/* Selo, empresa e ações dentro do próprio `PageHeader` (polimento de
          30/09): eram um cabeçalho montado em volta dele, e o selo ficava
          centrado na margem de baixo do título, e não no título. "Editar" era
          um link desenhado à mão como botão.
          07/10/2026 (auditoria DRG-23): o selo saiu do título para o `meta`,
          criado em 02/10 para "selos e datas embaixo do título" — o mesmo
          lugar do lead e da proposta do Valora. */}
      <PageHeader
        title={vaga.title}
        meta={
          <Selo cor={VAGA_STATUS_STYLE[vaga.status]}>
            {VAGA_STATUS_LABEL[vaga.status]}
          </Selo>
        }
        subtitle={<>{vaga.company.name} · {sectorLabels[vaga.sectorCode] ?? vaga.sectorCode}</>}
        action={
          canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <Button href={`/vagas/${id}/editar`} variant="secondary" size="sm">
              <Pencil size={14} /> Editar
            </Button>
            {vaga.status !== "ENCERRADA" ? (
              <ConfirmActionButton
                action={encerrarAction}
                label="Encerrar Vaga"
                title={`Encerrar "${vaga.title}"?`}
                description="A vaga sai das listagens ativas e do portal público. Os candidatos e o histórico do funil são preservados, e você pode reabrir a vaga depois."
                confirmLabel="Encerrar"
                successMessage="Vaga encerrada."
              />
            ) : (
              <ConfirmActionButton
                action={reabrirAction}
                label="Reabrir Vaga"
                title={`Reabrir "${vaga.title}"?`}
                description="A vaga volta para o status Aberta e reaparece nas listagens. Se ela estava publicada no portal, volta a ficar visível."
                confirmLabel="Reabrir"
                successMessage="Vaga reaberta."
              />
            )}
            <DeleteButton action={deleteAction} nome={vaga.title} />
          </div>
          )
        }
      />

      {/* Detalhes */}
      <Card className="p-5 mb-4">
        <h2 className="text-[length:var(--fs-card-title)] font-semibold text-fg mb-4">Detalhes</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-8 gap-y-4">
          <InfoRow label="Cargo" value={vaga.cargo?.name} />
          <InfoRow label="Quantidade" value={String(vaga.quantity)} />
          <InfoRow label="Prioridade" value={PRIORITY_LABEL[vaga.priority]} />
          <InfoRow
            label="Aberta em"
            value={formatInstantDate(vaga.openedAt, { day: "2-digit", month: "long", year: "numeric" })}
          />
          {vaga.closedAt && (
            <InfoRow
              label="Encerrada em"
              value={formatInstantDate(vaga.closedAt, { day: "2-digit", month: "long", year: "numeric" })}
            />
          )}
        </div>
        {vaga.notes && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-[length:var(--fs-helper)] text-fg-muted mb-0.5">Observações</p>
            <p className="text-[length:var(--fs-ui)] text-fg whitespace-pre-wrap">{vaga.notes}</p>
          </div>
        )}
        {vaga.isPublic && tenantSlug && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-[length:var(--fs-helper)] text-fg-muted mb-0.5">Portal público</p>
            <a
              href={`${publicBaseUrl}/carreiras/${tenantSlug}/${vaga.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[length:var(--fs-ui)] text-brand hover:underline break-all"
            >
              {publicBaseUrl}/carreiras/{tenantSlug}/{vaga.id}
            </a>
          </div>
        )}
      </Card>

      {coordenaRecrutamento && (
        <AcessoDosRecrutadores
          vagaId={id}
          restrita={vaga.restrictedToRecruiters}
          escolhidos={escolhidos.map((e) => e.userId)}
          recrutadores={recrutadores}
          podeEditar={canManageSector(ctx, SETOR_RECRUTAMENTO)}
        />
      )}

      <TriagemDaVaga
        vagaId={id}
        requisitos={requisitos}
        pendentes={pendentes}
        emAndamento={emAndamento.length}
        podeEditar={canManage}
        podePontuar={canAct}
        iaConfigurada={iaConfigurada}
      />

      {/* Funil de recrutamento */}
      <Card className="p-5 mb-4">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="min-w-0 text-[length:var(--fs-card-title)] font-semibold text-fg">
            Funil de recrutamento ({vaga.candidaturas.length} candidato{vaga.candidaturas.length !== 1 ? "s" : ""})
          </h2>
          {/* Era link de texto azul (30/09): botão não é link. */}
          {canAct && (
            <Button href="/candidatos/nova" variant="secondary" size="xs">
              <UserPlus size={11} /> Novo Candidato
            </Button>
          )}
        </div>

        {vaga.candidaturas.length === 0 ? (
          <p className="text-[13px] text-fg-muted">Nenhum candidato vinculado ainda.</p>
        ) : (
          <>
            {/* Conversão por etapa: o mesmo Funil do painel da Home (07/10,
                auditoria dos gráficos). Eram cinco cartões à mão com "% do
                total", enquanto o painel mostra a passagem da etapa anterior
                — o mesmo funil com dois desenhos e duas "conversões". Agora as
                duas leituras estão no gráfico, e a nota diz qual é qual. */}
            <div className="mb-5 max-w-2xl">
              <Funil
                titulo="Candidaturas que chegaram a cada etapa"
                etapas={funnelStats.stages.map((s) => ({ chave: s.stage, rotulo: s.label, valor: s.reached }))}
              />
              <p className="mt-2 text-[length:var(--fs-micro)] text-fg-muted">
                A barra é a parte do total de candidaturas que chegou a cada etapa; o percentual ao lado é quantas passaram da etapa
                anterior.
              </p>
            </div>

            {/* Board arrastável */}
            <RecruitmentFunnel
              vagaId={id}
              cards={activeCards}
              canManage={canManage}
              moveAction={moverEtapaAction}
              encerrarAction={encerrarCandidaturaAction}
            />
            {canManage && (
              <p className="text-[11px] text-fg-muted mt-2">
                Arraste os candidatos entre as etapas. Soltar em “Contratado” inicia a admissão.
              </p>
            )}

            {/* Encerrados */}
            {encerrados.length > 0 && (
              <div className="mt-5 pt-4 border-t border-border">
                <h3 className="text-[12px] font-semibold text-fg-muted mb-2">
                  Encerrados ({encerrados.length})
                </h3>
                <div className="space-y-1.5">
                  {encerrados.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[12px]">
                      <Link href={`/candidatos/${c.person.id}`} className="min-w-0 text-fg-secondary hover:text-brand transition-colors">
                        {c.person.name}
                      </Link>
                      <span className="min-w-0 text-fg-muted">
                        {c.status === "REPROVADO" ? "Reprovado" : "Desistente"}
                        {(c.rejectionReason || c.withdrawalReason) && ` · ${c.rejectionReason ?? c.withdrawalReason}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {canAct && <div className="mt-4"><AddCandidatoForm action={addCandidatoAction} candidatos={candidatos} /></div>}

        {/* Quem não pode agir na vaga também não pergunta ao assistente: as
            sugestões dele são movimentos no funil, e sugerir o que a pessoa não
            pode fazer só gera botão que falha. */}
        {canAct && (
          <div className="mt-6">
            <AssistenteDaVaga vagaId={vaga.id} />
          </div>
        )}
      </Card>
    </PageContainer>
  );
}
