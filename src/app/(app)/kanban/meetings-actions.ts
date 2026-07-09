"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { canManageMeetings, getValidAccessToken } from "@/lib/integrations/oauth";
import { createGoogleMeetEvent } from "@/lib/integrations/google";
import { createTeamsMeetingEvent } from "@/lib/integrations/microsoft";
import { logAudit } from "@/lib/audit";
import type { MeetingProvider } from "@/generated/prisma/enums";

export type MeetingState = { error: string } | null;

export async function agendarReuniao(
  pipelineId: string,
  pipelineItemId: string,
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

  if (!title) return { error: "Título é obrigatório." };
  if (provider !== "GOOGLE" && provider !== "MICROSOFT") return { error: "Selecione um provedor." };

  const startAt = new Date(startRaw);
  const endAt = new Date(endRaw);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    return { error: "Datas inválidas — o fim deve ser depois do início." };
  }

  const prisma = getPrisma();
  const item = await prisma.pipelineItem.findFirst({ where: { id: pipelineItemId, tenantId: ctx.tenantId } });
  if (!item) return { error: "Item não encontrado." };

  const accessToken = await getValidAccessToken(ctx.tenantId, ctx.userId, provider);
  if (!accessToken) {
    return {
      error: `Conecte sua conta ${provider === "GOOGLE" ? "Google" : "Microsoft"} em Configurações → Integrações antes de agendar.`,
    };
  }

  let created: { externalEventId: string; meetingUrl: string };
  try {
    created =
      provider === "GOOGLE"
        ? await createGoogleMeetEvent(accessToken, { title, startAt, endAt })
        : await createTeamsMeetingEvent(accessToken, { title, startAt, endAt });
  } catch (err) {
    console.error("[agendarReuniao]", err);
    return { error: "Erro ao criar a reunião no provedor. Tente novamente." };
  }

  await prisma.meeting.create({
    data: {
      tenantId: ctx.tenantId,
      provider,
      title,
      meetingUrl: created.meetingUrl,
      externalEventId: created.externalEventId,
      startAt,
      endAt,
      pipelineItemId,
      createdByUserId: ctx.userId,
    },
  });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "meeting.create",
    entityType: "Meeting",
    entityId: pipelineItemId,
    metadata: { provider, title },
  });

  revalidatePath(`/kanban/${pipelineId}/itens/${pipelineItemId}`);
  return null;
}

// Remove só o registro local (não cancela o evento no Google/Microsoft) —
// suficiente pro MVP; cancelamento remoto fica pra uma próxima rodada.
export async function excluirReuniao(pipelineId: string, meetingId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canManageMeetings(ctx)) return;

  const prisma = getPrisma();
  const meeting = await prisma.meeting.findFirst({ where: { id: meetingId, tenantId: ctx.tenantId } });
  if (!meeting) return;

  await prisma.meeting.delete({ where: { id: meetingId } });

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "meeting.delete", entityType: "Meeting", entityId: meetingId });

  if (meeting.pipelineItemId) revalidatePath(`/kanban/${pipelineId}/itens/${meeting.pipelineItemId}`);
}
