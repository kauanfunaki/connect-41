import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { scopedVagaWhere } from "@/lib/auth/scope";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { ExcluirComConfirmacao } from "@/components/vagas/ExcluirComConfirmacao";
import { ScorecardForm } from "@/components/vagas/ScorecardForm";
import { NotaDaTriagem } from "@/components/vagas/NotaDaTriagem";
import { RespostasDoCandidato } from "@/components/vagas/RespostasDoCandidato";
import { lerFonte } from "@/lib/recrutamento/respostas";
import { requisitosAtuais } from "@/lib/recrutamento/triagemServidor";
import type { AvaliacaoDeRequisito, Faixa, Requisito } from "@/lib/recrutamento/triagem";
import { MeetingsSection } from "@/components/kanban/MeetingsSection";
import { TesteCard } from "@/components/teste/TesteCard";
import { STAGE_LABEL, type Stage } from "@/lib/recruitmentFunnel";
import { CRITERIA, RECOMMENDATION_LABEL, consolidateScorecards, scorecardAverage } from "@/lib/scorecard";
import { formatInstantDate } from "@/lib/format";
// Média do scorecard em pt-BR ("4,5", era "4.5") — DRG-02, 07/10/2026.
import { num } from "@/lib/valora/formato";
import { canManageMeetings } from "@/lib/integrations/oauth";
import { salvarScorecard, excluirScorecard } from "./actions";
import { agendarEntrevista, excluirEntrevista } from "./meeting-actions";
import type { DiscScores, DiscDimension } from "@/lib/disc";
import type { QuizScores } from "@/lib/quiz";
import { podeAgirNaVaga } from "@/lib/recrutamento/acessoVagas";
import { Selo } from "@/components/ui/Selo";
import { Aviso } from "@/components/ui/Aviso";

export default async function CandidaturaScorecardPage({
  params,
}: {
  params: Promise<{ id: string; candidaturaId: string }>;
}) {
  const { id: vagaId, candidaturaId } = await params;
  const ctx = await getAuthContext();

  const prisma = getPrisma();
  const candidatura = await prisma.candidatura.findFirst({
    where: { id: candidaturaId, vagaId, tenantId: ctx.tenantId, vaga: { ...scopedVagaWhere(ctx) } },
    include: {
      person: { select: { id: true, name: true, dataDeletionRequestedAt: true } },
      vaga: { select: { id: true, title: true, sectorCode: true, restrictedToRecruiters: true } },
      scorecards: {
        orderBy: { createdAt: "asc" },
        include: { evaluator: { select: { id: true, name: true } } },
      },
      meetings: {
        orderBy: { startAt: "desc" },
        include: { attendees: { include: { user: { select: { id: true, name: true } } } } },
      },
      assessmentLinks: {
        where: { candidaturaId },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { template: { select: { name: true } } },
      },
    },
  });
  if (!candidatura) notFound();

  const canAct = await podeAgirNaVaga(ctx, candidatura.vaga);
  const consolidation = consolidateScorecards(candidatura.scorecards);
  const myScorecard = candidatura.scorecards.find((s) => s.evaluator.id === ctx.userId);

  const testeLink = candidatura.assessmentLinks[0];
  const initialTesteLink =
    testeLink?.status === "PENDENTE"
      ? { status: "PENDENTE" as const, token: testeLink.token, expiresAtLabel: formatInstantDate(testeLink.expiresAt) }
      : testeLink?.status === "RESPONDIDO" && testeLink.type === "DISC"
        ? {
            status: "RESPONDIDO" as const,
            id: testeLink.id,
            type: "DISC" as const,
            scores: testeLink.scores as unknown as DiscScores,
            primaryProfile: testeLink.primaryProfile as DiscDimension,
            secondaryProfile: testeLink.secondaryProfile as DiscDimension | null,
            submittedAtLabel: testeLink.submittedAt ? formatInstantDate(testeLink.submittedAt) : "—",
          }
        : testeLink?.status === "RESPONDIDO"
          ? {
              status: "RESPONDIDO" as const,
              id: testeLink.id,
              type: "MULTIPLA_ESCOLHA" as const,
              scores: testeLink.scores as unknown as QuizScores,
              templateName: testeLink.template?.name ?? "Modelo excluído",
              submittedAtLabel: testeLink.submittedAt ? formatInstantDate(testeLink.submittedAt) : "—",
            }
          : null;

  const canSchedule = canManageMeetings(ctx);
  const [oauthAccounts, allUsers, templates] = await Promise.all([
    canSchedule
      ? prisma.oAuthAccount.findMany({ where: { tenantId: ctx.tenantId, userId: ctx.userId }, select: { provider: true } })
      : Promise.resolve([]),
    canSchedule
      ? prisma.user.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
    canAct
      ? prisma.assessmentTemplate.findMany({
          where: { tenantId: ctx.tenantId, sectorCode: "recrutamento", active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const [notas, requisitos] = await Promise.all([
    prisma.candidaturaNota.findMany({
      where: { tenantId: ctx.tenantId, candidaturaId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { requisitos: { select: { versao: true, itens: true } } },
    }),
    requisitosAtuais(ctx.tenantId, vagaId),
  ]);
  const hasGoogle = oauthAccounts.some((a) => a.provider === "GOOGLE");
  const hasMicrosoft = oauthAccounts.some((a) => a.provider === "MICROSOFT");

  return (
    <PageContainer>
      <Breadcrumb
        items={[
          { label: "Vagas", href: "/vagas" },
          { label: candidatura.vaga.title, href: `/vagas/${vagaId}`, truncate: true },
          { label: candidatura.person.name, truncate: true },
        ]}
      />
      <BackButton className="mb-3" />

      <PageHeader
        title={<><Link href={`/candidatos/${candidatura.person.id}`} className="hover:text-brand transition-colors">
            {candidatura.person.name}
          </Link></>}
        subtitle={<>Pareceres de entrevista · etapa atual: {STAGE_LABEL[candidatura.stage as Stage]}</>}
      />

      {/* Pedido feito pelo próprio candidato, na conta dele do portal de vagas.
          É pedido legal (LGPD): fica à vista de quem abre a candidatura, e não
          só no sino de quem estava de plantão. */}
      {candidatura.person.dataDeletionRequestedAt && (
        <Aviso tom="atencao" className="mb-4">
          O candidato pediu a exclusão dos dados pessoais (LGPD) em{" "}
          {formatInstantDate(candidatura.person.dataDeletionRequestedAt)}, pelo portal de vagas. Tratar o pedido na ficha do candidato.
        </Aviso>
      )}

      <NotaDaTriagem
        vagaId={vagaId}
        candidaturaId={candidaturaId}
        versaoAtual={requisitos?.versao ?? null}
        podePontuar={canAct}
        falha={candidatura.triagemFalha}
        notas={notas.map((n) => ({
          id: n.id,
          score: n.score,
          faixa: n.faixa as Faixa,
          resumo: n.resumo,
          avaliacoes: n.avaliacoes as AvaliacaoDeRequisito[],
          versao: n.requisitos.versao,
          itens: n.requisitos.itens as Requisito[],
          createdAt: n.createdAt,
          origem: n.origem,
        }))}
      />

      <RespostasDoCandidato
        vagaId={vagaId}
        candidaturaId={candidaturaId}
        podeEditar={canAct}
        fonte={lerFonte(candidatura.respostasFonte)}
        respostas={{
          pretensaoSalarial: candidatura.pretensaoSalarial === null ? null : candidatura.pretensaoSalarial.toNumber(),
          disponibilidade: candidatura.disponibilidade,
          deslocamentoMinutos: candidatura.deslocamentoMinutos,
        }}
      />

      {/* Entrevistas */}
      {canSchedule && (
        <MeetingsSection
          meetings={candidatura.meetings.map((m) => ({
            id: m.id,
            provider: m.provider,
            title: m.title,
            meetingUrl: m.meetingUrl,
            startAt: m.startAt.toISOString(),
            endAt: m.endAt.toISOString(),
            attendees: m.attendees.map((a) => ({ id: a.user.id, name: a.user.name })),
          }))}
          canSchedule={canSchedule}
          hasGoogle={hasGoogle}
          hasMicrosoft={hasMicrosoft}
          allUsers={allUsers}
          scheduleAction={agendarEntrevista.bind(null, vagaId, candidaturaId)}
          deleteAction={excluirEntrevista.bind(null, vagaId, candidaturaId)}
        />
      )}

      {/* Teste */}
      <div className="mb-4">
        <TesteCard
          personId={candidatura.person.id}
          candidaturaId={candidaturaId}
          initialLink={initialTesteLink}
          canManage={canAct}
          templates={templates}
          urlPublica={(process.env.APP_PUBLIC_URL ?? "").replace(/\/$/, "")}
        />
      </div>

      {/* Consolidado */}
      {consolidation.count > 0 && (
        <Card className="p-5 mb-4">
          <h2 className="text-[length:var(--fs-card-title)] font-semibold text-fg mb-3">Consolidado ({consolidation.count} parecer{consolidation.count !== 1 ? "es" : ""})</h2>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[length:var(--fs-ui)] text-fg">
              Média: <strong className="tnum">{consolidation.averageScore != null ? num(consolidation.averageScore, 1) : "—"}</strong>/5
            </span>
            <Selo tom="sucesso">
              {consolidation.tally.AVANCAR} avançar
            </Selo>
            <Selo tom="atencao">
              {consolidation.tally.TALVEZ} talvez
            </Selo>
            <Selo tom="perigo">
              {consolidation.tally.REPROVAR} reprovar
            </Selo>
          </div>
        </Card>
      )}

      {/* Pareceres */}
      <Card className="p-5 mb-4">
        <h2 className="text-[length:var(--fs-card-title)] font-semibold text-fg mb-3">Pareceres</h2>
        {candidatura.scorecards.length === 0 ? (
          <p className="text-[length:var(--fs-ui)] text-fg-muted">Nenhum parecer ainda.</p>
        ) : (
          <div className="divide-y divide-border">
            {candidatura.scorecards.map((s) => {
              const avg = scorecardAverage(s);
              return (
                <div key={s.id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 text-[length:var(--fs-ui)] font-medium text-fg">
                      {s.evaluator.name}
                      {s.evaluator.id === ctx.userId && <span className="text-[length:var(--fs-micro)] text-fg-muted font-normal"> (você)</span>}
                    </p>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <span className="text-[length:var(--fs-2)] text-fg-muted tnum">{avg != null ? `${num(avg, 1)}/5` : "sem nota"}</span>
                      <Selo cor={s.recommendation === "AVANCAR" ? "bg-success/10 text-success border-success/25"
                          : s.recommendation === "REPROVAR" ? "bg-danger/10 text-danger border-danger/25"
                          : "bg-warning/10 text-warning border-warning/25"}>
                        {RECOMMENDATION_LABEL[s.recommendation]}
                      </Selo>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                    {CRITERIA.map((c) => (
                      <span key={c.key} className="text-[length:var(--fs-micro)] text-fg-muted">
                        {c.label}: <span className="text-fg tnum">{s[c.key] ?? "—"}</span>
                      </span>
                    ))}
                  </div>
                  {s.notes && <p className="text-[length:var(--fs-2)] text-fg-secondary mt-1.5 whitespace-pre-wrap">{s.notes}</p>}
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[length:var(--fs-micro)] text-fg-muted">{formatInstantDate(s.createdAt)}</span>
                    {s.evaluator.id === ctx.userId && (
                      <ExcluirComConfirmacao
                        action={excluirScorecard.bind(null, vagaId, candidaturaId, s.id)}
                        titulo="Excluir o seu parecer?"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Meu parecer */}
      {canAct && (
        <Card className="p-5">
          <h2 className="text-[length:var(--fs-card-title)] font-semibold text-fg mb-3">{myScorecard ? "Editar meu parecer" : "Adicionar meu parecer"}</h2>
          <ScorecardForm
            action={salvarScorecard.bind(null, vagaId, candidaturaId)}
            defaults={
              myScorecard
                ? {
                    comunicacao: myScorecard.comunicacao,
                    tecnico: myScorecard.tecnico,
                    fitCultural: myScorecard.fitCultural,
                    experiencia: myScorecard.experiencia,
                    recommendation: myScorecard.recommendation,
                    notes: myScorecard.notes,
                  }
                : undefined
            }
          />
        </Card>
      )}
    </PageContainer>
  );
}
