"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { scopedVagaWhere } from "@/lib/auth/scope";
import { canManageMeetings, getValidAccessToken } from "@/lib/integrations/oauth";
import { createGoogleMeetEvent } from "@/lib/integrations/google";
import { createTeamsMeetingEvent } from "@/lib/integrations/microsoft";
import { logAudit } from "@/lib/audit";
import { parseSaoPauloDateTimeLocal } from "@/lib/datetime";
import { sendInterviewInviteEmail } from "@/lib/email/sendMail";
import { notifyUser } from "@/lib/notifications";
import { stageIndex } from "@/lib/recruitmentFunnel";
import { formatInstantDate } from "@/lib/format";
import type { MeetingProvider } from "@/generated/prisma/enums";

export type MeetingState = { error: string } | null;

// Mesma lógica de src/app/(app)/kanban/meetings-actions.ts (agendarReuniao),
// vinculada à candidatura em vez de um item de Kanban, com 3 efeitos colaterais
// específicos de recrutamento: avança a etapa pra Entrevista, convida o
// candidato por e-mail, e notifica os responsáveis selecionados.
export async function agendarEntrevista(
  vagaId: string,
  candidaturaId: string,
  _prev: MeetingState,
  form: FormData
): Promise<MeetingState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canManageMeetings(ctx)) return { error: "Sem permissão para agendar reuniões." };

  const title = (form.get("title") as string)?.trim();
  const provider = form.get("provider") as MeetingProvider;
  const startRaw = form.get("startAt") as string;
  const endRaw = form.get("endAt") as string;
  const attendeeIds = (form.getAll("attendeeIds") as string[]).filter(Boolean);

  if (!title) return { error: "Título é obrigatório." };
  if (provider !== "GOOGLE" && provider !== "MICROSOFT") return { error: "Selecione um provedor." };

  const startAt = parseSaoPauloDateTimeLocal(startRaw);
  const endAt = parseSaoPauloDateTimeLocal(endRaw);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    return { error: "Datas inválidas — o fim deve ser depois do início." };
  }

  const prisma = getPrisma();
  const candidatura = await prisma.candidatura.findFirst({
    where: { id: candidaturaId, vagaId, tenantId: ctx.tenantId, vaga: { ...scopedVagaWhere(ctx) } },
    include: {
      person: { select: { id: true, name: true, email: true } },
      vaga: { select: { title: true, company: { select: { name: true } } } },
    },
  });
  if (!candidatura) return { error: "Candidatura não encontrada ou fora do seu escopo." };

  const accessToken = await getValidAccessToken(ctx.tenantId, ctx.userId, provider);
  if (!accessToken) {
    return {
      error: `Não foi possível usar sua conta ${provider === "GOOGLE" ? "Google" : "Microsoft"} (desconectada ou token expirado). Reconecte em Configurações → Integrações antes de agendar.`,
    };
  }

  let created: { externalEventId: string; meetingUrl: string };
  try {
    created =
      provider === "GOOGLE"
        ? await createGoogleMeetEvent(accessToken, { title, startAt, endAt })
        : await createTeamsMeetingEvent(accessToken, { title, startAt, endAt });
  } catch (err) {
    console.error("[agendarEntrevista]", err);
    return { error: "Erro ao criar a reunião no provedor. Tente novamente." };
  }

  // Participantes só podem ser usuários com acesso à plataforma do próprio
  // tenant — evita atrelar um userId arbitrário vindo do form.
  const validAttendeeIds = attendeeIds.length > 0
    ? (await prisma.user.findMany({ where: { id: { in: attendeeIds }, tenantId: ctx.tenantId }, select: { id: true } })).map((u) => u.id)
    : [];

  await prisma.meeting.create({
    data: {
      tenantId: ctx.tenantId,
      provider,
      title,
      meetingUrl: created.meetingUrl,
      externalEventId: created.externalEventId,
      startAt,
      endAt,
      candidaturaId,
      clientName: candidatura.person.name,
      createdByUserId: ctx.userId,
      attendees: { create: validAttendeeIds.map((userId) => ({ userId })) },
    },
  });

  // Avança a etapa pra Entrevista se ainda não chegou lá — não regride quem já
  // avançou mais (ex: reagendar uma entrevista de quem já está em Proposta).
  if (stageIndex(candidatura.stage) < stageIndex("ENTREVISTA")) {
    await prisma.candidatura.update({ where: { id: candidaturaId }, data: { stage: "ENTREVISTA" } });
  }

  // Convite ao candidato — best-effort, não derruba o agendamento se falhar
  // (SMTP do tenant pode não estar configurado, ou o candidato não ter e-mail).
  if (candidatura.person.email) {
    await sendInterviewInviteEmail({
      tenantId: ctx.tenantId,
      to: candidatura.person.email,
      candidateName: candidatura.person.name,
      vagaTitle: candidatura.vaga.title,
      companyName: candidatura.vaga.company?.name ?? null,
      startAt,
      meetingUrl: created.meetingUrl,
    });
  }

  // Notifica os responsáveis selecionados (dispara push também, via notifyUser).
  const dataLabel = formatInstantDate(startAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  for (const userId of validAttendeeIds) {
    await notifyUser(userId, {
      tenantId: ctx.tenantId,
      type: "INTERVIEW_SCHEDULED",
      message: `Entrevista com ${candidatura.person.name} agendada para ${dataLabel}.`,
      entityType: "PERSON",
      entityId: candidatura.person.id,
    });
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "meeting.create",
    entityType: "Meeting",
    entityId: candidaturaId,
    metadata: { provider, title, context: "recrutamento" },
  });

  revalidatePath(`/vagas/${vagaId}/candidaturas/${candidaturaId}`);
  revalidatePath(`/vagas/${vagaId}`);
  return null;
}

// Remove só o registro local (não cancela o evento no Google/Microsoft) —
// mesmo comportamento de excluirReuniao no Kanban.
export async function excluirEntrevista(vagaId: string, candidaturaId: string, meetingId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canManageMeetings(ctx)) return;

  const prisma = getPrisma();
  const meeting = await prisma.meeting.findFirst({ where: { id: meetingId, tenantId: ctx.tenantId, candidaturaId } });
  if (!meeting) return;

  await prisma.meeting.delete({ where: { id: meetingId } });

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "meeting.delete", entityType: "Meeting", entityId: meetingId });

  revalidatePath(`/vagas/${vagaId}/candidaturas/${candidaturaId}`);
}
