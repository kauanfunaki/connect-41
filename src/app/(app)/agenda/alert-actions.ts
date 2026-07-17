"use server";

import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { getSectorMaps } from "@/lib/sectors";
import { formatInstantTime } from "@/lib/format";

// Quantos minutos antes do início a notificação focal aparece.
const ALERT_LEAD_MINUTES = 15;

export type MeetingAlert = {
  meetingId: string;
  title: string;
  meetingUrl: string;
  provider: string;
  startAtIso: string;
  startTimeLabel: string; // "14:30" já em horário de São Paulo
  endTimeLabel: string;
  sectorLabel: string | null;
  companyName: string | null;
  clientName: string | null;
};

// Reuniões próximas (até 15min antes do início, até o fim) em que o usuário é
// responsável/participante e ainda não deu ciência — alimenta o bloco focal
// que trava a tela até o "OK".
export async function buscarAlertasReuniao(): Promise<MeetingAlert[]> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return [];

  const prisma = getPrisma();
  const now = new Date();
  const windowEnd = new Date(now.getTime() + ALERT_LEAD_MINUTES * 60 * 1000);

  const meetings = await prisma.meeting.findMany({
    where: {
      tenantId: ctx.tenantId,
      startAt: { lte: windowEnd },
      endAt: { gte: now },
      attendees: { some: { userId: ctx.userId, acknowledgedAt: null } },
    },
    orderBy: { startAt: "asc" },
    include: { company: { select: { name: true } } },
  });

  if (meetings.length === 0) return [];

  const { labels: sectorLabels } = await getSectorMaps(ctx.tenantId);

  return meetings.map((m) => ({
    meetingId: m.id,
    title: m.title,
    meetingUrl: m.meetingUrl,
    provider: m.provider === "GOOGLE" ? "Google Meet" : "Microsoft Teams",
    startAtIso: m.startAt.toISOString(),
    startTimeLabel: formatInstantTime(m.startAt, { hour: "2-digit", minute: "2-digit" }),
    endTimeLabel: formatInstantTime(m.endAt, { hour: "2-digit", minute: "2-digit" }),
    sectorLabel: m.sectorCode ? sectorLabels[m.sectorCode] ?? m.sectorCode : null,
    companyName: m.company?.name ?? null,
    clientName: m.clientName,
  }));
}

// "OK, estou ciente" — registra a ciência do participante e o bloco focal não
// volta a aparecer pra esta reunião.
export async function confirmarCienciaReuniao(meetingId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return;

  const prisma = getPrisma();
  await prisma.meetingAttendee.updateMany({
    where: { meetingId, userId: ctx.userId, meeting: { tenantId: ctx.tenantId } },
    data: { acknowledgedAt: new Date() },
  });
}
