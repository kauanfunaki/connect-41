import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { scopedVagaWhere } from "@/lib/auth/scope";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { DeleteFieldButton } from "@/components/admin/DeleteFieldButton";
import { ScorecardForm } from "@/components/vagas/ScorecardForm";
import { MeetingsSection } from "@/components/kanban/MeetingsSection";
import { STAGE_LABEL, type Stage } from "@/lib/recruitmentFunnel";
import { CRITERIA, RECOMMENDATION_LABEL, consolidateScorecards, scorecardAverage } from "@/lib/scorecard";
import { formatInstantDate } from "@/lib/format";
import { canManageMeetings } from "@/lib/integrations/oauth";
import { salvarScorecard, excluirScorecard } from "./actions";
import { agendarEntrevista, excluirEntrevista } from "./meeting-actions";

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
      person: { select: { id: true, name: true } },
      vaga: { select: { id: true, title: true, sectorCode: true } },
      scorecards: {
        orderBy: { createdAt: "asc" },
        include: { evaluator: { select: { id: true, name: true } } },
      },
      meetings: {
        orderBy: { startAt: "desc" },
        include: { attendees: { include: { user: { select: { id: true, name: true } } } } },
      },
    },
  });
  if (!candidatura) notFound();

  const canAct = canActOnSector(ctx, candidatura.vaga.sectorCode);
  const consolidation = consolidateScorecards(candidatura.scorecards);
  const myScorecard = candidatura.scorecards.find((s) => s.evaluator.id === ctx.userId);

  const canSchedule = canManageMeetings(ctx);
  const [oauthAccounts, allUsers] = await Promise.all([
    canSchedule
      ? prisma.oAuthAccount.findMany({ where: { tenantId: ctx.tenantId, userId: ctx.userId }, select: { provider: true } })
      : Promise.resolve([]),
    canSchedule
      ? prisma.user.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const hasGoogle = oauthAccounts.some((a) => a.provider === "GOOGLE");
  const hasMicrosoft = oauthAccounts.some((a) => a.provider === "MICROSOFT");

  return (
    <PageContainer variant="narrow">
      <BackButton className="mb-3" />
      <div className="flex items-center gap-2 mb-6">
        <Link href="/vagas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Vagas</Link>
        <span className="text-fg-muted">/</span>
        <Link href={`/vagas/${vagaId}`} className="text-[13px] text-fg-muted hover:text-fg transition-colors truncate max-w-[160px]">
          {candidatura.vaga.title}
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg truncate">{candidatura.person.name}</span>
      </div>

      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">
          <Link href={`/pessoas/${candidatura.person.id}`} className="hover:text-brand transition-colors">
            {candidatura.person.name}
          </Link>
        </h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          Pareceres de entrevista · etapa atual: {STAGE_LABEL[candidatura.stage as Stage]}
        </p>
      </div>

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

      {/* Consolidado */}
      {consolidation.count > 0 && (
        <div className="bg-surface border border-border rounded-lg p-5 mb-4">
          <h2 className="text-[14px] font-semibold text-fg mb-3">Consolidado ({consolidation.count} parecer{consolidation.count !== 1 ? "es" : ""})</h2>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[13px] text-fg">
              Média: <strong className="tnum">{consolidation.averageScore != null ? consolidation.averageScore.toFixed(1) : "—"}</strong>/5
            </span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium bg-success/10 text-success border border-success/25">
              {consolidation.tally.AVANCAR} avançar
            </span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium bg-warning/10 text-warning border border-warning/25">
              {consolidation.tally.TALVEZ} talvez
            </span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium bg-danger/10 text-danger border border-danger/25">
              {consolidation.tally.REPROVAR} reprovar
            </span>
          </div>
        </div>
      )}

      {/* Pareceres */}
      <div className="bg-surface border border-border rounded-lg p-5 mb-4">
        <h2 className="text-[14px] font-semibold text-fg mb-3">Pareceres</h2>
        {candidatura.scorecards.length === 0 ? (
          <p className="text-[13px] text-fg-muted">Nenhum parecer ainda.</p>
        ) : (
          <div className="divide-y divide-border">
            {candidatura.scorecards.map((s) => {
              const avg = scorecardAverage(s);
              return (
                <div key={s.id} className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-medium text-fg">
                      {s.evaluator.name}
                      {s.evaluator.id === ctx.userId && <span className="text-[11px] text-fg-muted font-normal"> (você)</span>}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-fg-muted tnum">{avg != null ? `${avg.toFixed(1)}/5` : "sem nota"}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                        s.recommendation === "AVANCAR" ? "bg-success/10 text-success border-success/25"
                          : s.recommendation === "REPROVAR" ? "bg-danger/10 text-danger border-danger/25"
                          : "bg-warning/10 text-warning border-warning/25"
                      }`}>
                        {RECOMMENDATION_LABEL[s.recommendation]}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                    {CRITERIA.map((c) => (
                      <span key={c.key} className="text-[11px] text-fg-muted">
                        {c.label}: <span className="text-fg tnum">{s[c.key] ?? "—"}</span>
                      </span>
                    ))}
                  </div>
                  {s.notes && <p className="text-[12px] text-fg-secondary mt-1.5 whitespace-pre-wrap">{s.notes}</p>}
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[11px] text-fg-muted">{formatInstantDate(s.createdAt)}</span>
                    {s.evaluator.id === ctx.userId && (
                      <DeleteFieldButton action={excluirScorecard.bind(null, vagaId, candidaturaId, s.id)} nome="seu parecer" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Meu parecer */}
      {canAct && (
        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-[14px] font-semibold text-fg mb-3">{myScorecard ? "Editar meu parecer" : "Adicionar meu parecer"}</h2>
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
        </div>
      )}
    </PageContainer>
  );
}
