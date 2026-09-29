"use server";

// Horas trabalhadas num processo do Societário (29/09, horas de operação da
// Gestão). Mesmo desenho do card: um cronômetro por vez no processo, e o
// lançamento manual para o que foi feito longe da tela.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { setorDoModulo } from "@/lib/modules";
import { lerDataDoCampo } from "@/lib/societario/datas";
import { minutosApontados, segundosDesde } from "@/lib/datetime";

const SECTOR = "societario";
const MODULE = "societario_processos";

export type HorasState = { error: string } | { ok: true } | null;

async function processoNoAlcance(processId: string) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return null;
  if (!canActOnSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) return null;
  const p = await getPrisma().process.findFirst({
    where: { id: processId, tenantId: ctx.tenantId },
    select: { id: true, activeTimerUserId: true, activeTimerStartedAt: true },
  });
  return p ? { ctx, p } : null;
}

export async function iniciarCronometroDoProcesso(processId: string): Promise<HorasState> {
  const r = await processoNoAlcance(processId);
  if (!r) return { error: "Processo não encontrado." };
  if (r.p.activeTimerUserId) return { error: "Já há um cronômetro rodando neste processo." };
  // Só grava se ninguém começou no mesmo instante: duas pessoas clicando juntas
  // não viram dois cronômetros.
  const u = await getPrisma().process.updateMany({
    where: { id: processId, activeTimerUserId: null },
    data: { activeTimerUserId: r.ctx.userId, activeTimerStartedAt: new Date() },
  });
  if (u.count === 0) return { error: "Outra pessoa começou o cronômetro agora." };
  revalidatePath(`/processos/${processId}`);
  return { ok: true };
}

export async function pararCronometroDoProcesso(processId: string): Promise<HorasState> {
  const r = await processoNoAlcance(processId);
  if (!r) return { error: "Processo não encontrado." };
  const { p, ctx } = r;
  if (p.activeTimerUserId !== ctx.userId || !p.activeTimerStartedAt) return { error: "O cronômetro não é seu." };
  // A mesma conta que a tela mostra antes de parar (`minutosApontados`).
  const minutes = minutosApontados(segundosDesde(p.activeTimerStartedAt.toISOString()));
  const prisma = getPrisma();
  await prisma.$transaction([
    prisma.process.update({ where: { id: processId }, data: { activeTimerUserId: null, activeTimerStartedAt: null } }),
    prisma.timeEntry.create({
      data: { tenantId: ctx.tenantId, processId, userId: ctx.userId, minutes, note: "cronômetro", loggedOn: new Date() },
    }),
  ]);
  revalidatePath(`/processos/${processId}`);
  return { ok: true };
}

export async function lancarHorasNoProcesso(processId: string, _prev: HorasState, form: FormData): Promise<HorasState> {
  const r = await processoNoAlcance(processId);
  if (!r) return { error: "Processo não encontrado." };
  const horas = Number(String(form.get("horas") ?? "0").replace(",", "."));
  const minutosExtras = Number(String(form.get("minutos") ?? "0"));
  const minutes = Math.round((Number.isFinite(horas) ? horas : 0) * 60 + (Number.isFinite(minutosExtras) ? minutosExtras : 0));
  if (minutes <= 0 || minutes > 16 * 60) return { error: "Informe o tempo gasto (até 16 horas por lançamento)." };
  const dia = lerDataDoCampo(form.get("dia"));
  if (!dia.ok) return { error: "Data inválida." };
  const note = String(form.get("nota") ?? "").trim().slice(0, 280) || null;
  await getPrisma().timeEntry.create({
    data: { tenantId: r.ctx.tenantId, processId, userId: r.ctx.userId, minutes, note, loggedOn: dia.data ?? new Date() },
  });
  revalidatePath(`/processos/${processId}`);
  return { ok: true };
}

export async function apagarHorasDoProcesso(processId: string, entryId: string): Promise<HorasState> {
  const r = await processoNoAlcance(processId);
  if (!r) return { error: "Processo não encontrado." };
  // Cada um apaga o próprio lançamento.
  const d = await getPrisma().timeEntry.deleteMany({ where: { id: entryId, processId, tenantId: r.ctx.tenantId, userId: r.ctx.userId } });
  if (d.count === 0) return { error: "Lançamento não encontrado." };
  revalidatePath(`/processos/${processId}`);
  return { ok: true };
}
