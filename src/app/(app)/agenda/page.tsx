import Link from "next/link";
import { Video, ExternalLink } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { canManageMeetings } from "@/lib/integrations/oauth";
import { PageContainer } from "@/components/shared/PageContainer";
import { redirect } from "next/navigation";

const PROVIDER_LABEL = { GOOGLE: "Google Meet", MICROSOFT: "MS Teams" } as const;

// Módulo "Agenda" — ponto de entrada único pras reuniões que o coordenador
// agendou (via Google Meet/Teams), hoje só visíveis dentro do detalhe do
// item de Kanban. Decisão do usuário (2026-07-10): disponível pra
// coordenadores (SECTOR_ADMIN) e admins de todos os setores — controlado por
// role, não pelo catálogo de módulos (que é por setor único).
export default async function AgendaPage() {
  const ctx = await getAuthContext();
  if (!canManageMeetings(ctx)) redirect("/");

  const prisma = getPrisma();
  const now = new Date();

  const [upcoming, past] = await Promise.all([
    prisma.meeting.findMany({
      where: { tenantId: ctx.tenantId, createdByUserId: ctx.userId, startAt: { gte: now } },
      orderBy: { startAt: "asc" },
      include: { pipelineItem: { select: { id: true, pipelineId: true } } },
    }),
    prisma.meeting.findMany({
      where: { tenantId: ctx.tenantId, createdByUserId: ctx.userId, startAt: { lt: now } },
      orderBy: { startAt: "desc" },
      take: 20,
      include: { pipelineItem: { select: { id: true, pipelineId: true } } },
    }),
  ]);

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Agenda</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          Reuniões que você agendou via Google Meet/Microsoft Teams.
        </p>
      </div>

      <Section title={`Próximas (${upcoming.length})`} meetings={upcoming} empty="Nenhuma reunião agendada." />
      <Section title={`Passadas (${past.length})`} meetings={past} empty="Nenhuma reunião passada." muted />
    </PageContainer>
  );
}

type MeetingRow = {
  id: string;
  provider: "GOOGLE" | "MICROSOFT";
  title: string;
  meetingUrl: string;
  startAt: Date;
  endAt: Date;
  pipelineItem: { id: string; pipelineId: string } | null;
};

function Section({
  title,
  meetings,
  empty,
  muted,
}: {
  title: string;
  meetings: MeetingRow[];
  empty: string;
  muted?: boolean;
}) {
  return (
    <div className="mb-6">
      <h2 className="text-[13px] font-semibold text-fg mb-2">{title}</h2>
      {meetings.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg py-8 text-center text-[13px] text-fg-muted">{empty}</div>
      ) : (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {meetings.map((m) => (
            <div key={m.id} className={`flex items-center justify-between gap-3 px-4 py-3 ${muted ? "opacity-70" : ""}`}>
              <div className="min-w-0 flex items-center gap-2">
                <Video size={14} className="text-fg-muted flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[13px] text-fg font-medium truncate">{m.title}</p>
                  <p className="text-[12px] text-fg-muted">
                    {PROVIDER_LABEL[m.provider]} ·{" "}
                    {m.startAt.toLocaleString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {m.pipelineItem && (
                      <>
                        {" · "}
                        <Link
                          href={`/pipelines/${m.pipelineItem.pipelineId}/itens/${m.pipelineItem.id}`}
                          className="hover:underline"
                        >
                          Ver item vinculado
                        </Link>
                      </>
                    )}
                  </p>
                </div>
              </div>
              <a
                href={m.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[12px] text-brand hover:underline flex-shrink-0"
              >
                Entrar <ExternalLink size={12} />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
