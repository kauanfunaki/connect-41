"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { canManageMeetings, getValidAccessToken } from "@/lib/integrations/oauth";
import { createGoogleMeetEvent } from "@/lib/integrations/google";
import { createTeamsMeetingEvent } from "@/lib/integrations/microsoft";
import { logAudit } from "@/lib/audit";
import { parseSaoPauloDateTimeLocal } from "@/lib/datetime";
import type { MeetingProvider } from "@/generated/prisma/enums";

export type MeetingState = { error: string } | null;

// Mesma lógica de src/app/(app)/kanban/meetings-actions.ts (agendarReuniao),
// sem pipelineItemId — reunião criada direto pela Agenda, sem precisar de um
// card de Kanban. Meeting.pipelineItemId já é opcional no schema.
export async function criarReuniaoAvulsa(_prev: MeetingState, form: FormData): Promise<MeetingState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };
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
    console.error("[criarReuniaoAvulsa]", err);
    return { error: "Erro ao criar a reunião no provedor. Tente novamente." };
  }

  const prisma = getPrisma();
  // Participantes só podem ser usuários com acesso à plataforma do próprio
  // tenant — evita atrelar um userId arbitrário vindo do form.
  const validAttendeeIds = attendeeIds.length > 0
    ? (await prisma.user.findMany({ where: { id: { in: attendeeIds }, tenantId: ctx.tenantId }, select: { id: true } })).map((u) => u.id)
    : [];

  const meeting = await prisma.meeting.create({
    data: {
      tenantId: ctx.tenantId,
      provider,
      title,
      meetingUrl: created.meetingUrl,
      externalEventId: created.externalEventId,
      startAt,
      endAt,
      createdByUserId: ctx.userId,
      attendees: { create: validAttendeeIds.map((userId) => ({ userId })) },
    },
  });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "meeting.create",
    entityType: "Meeting",
    entityId: meeting.id,
    metadata: { provider, title },
  });

  revalidatePath("/agenda");
  return null;
}

export async function excluirReuniaoAvulsa(meetingId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canManageMeetings(ctx)) return;

  const prisma = getPrisma();
  const meeting = await prisma.meeting.findFirst({ where: { id: meetingId, tenantId: ctx.tenantId } });
  if (!meeting) return;

  await prisma.meeting.delete({ where: { id: meetingId } });

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "meeting.delete", entityType: "Meeting", entityId: meetingId });

  revalidatePath("/agenda");
}
