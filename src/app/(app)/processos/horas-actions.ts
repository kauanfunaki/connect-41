"use server";

// Horas trabalhadas num processo do Societário (29/09, horas de operação da
// Gestão). Mesmo desenho do card: um cronômetro por vez no processo, e o
// lançamento manual para o que foi feito longe da tela.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector, canManageSector, podeExcluir, SO_ADMIN_EXCLUI } from "@/lib/auth/context";
import { saoPauloParts } from "@/lib/agenda";
import { recusaDoLancamentoAtrasado } from "@/lib/horas/regras";
import { setoresDoModulo } from "@/lib/modules";
import { lerDataDoCampo } from "@/lib/societario/datas";
import { lerLancamentoDeHoras } from "@/lib/horas/edicao";
import { minutosApontados, segundosDesde } from "@/lib/datetime";

const SECTOR = "societario";
const MODULE = "societario_processos";

export type HorasState = { error: string } | { ok: true } | null;

async function processoNoAlcance(processId: string) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return null;
  const setores = (await setoresDoModulo(ctx.tenantId, MODULE)) ?? SECTOR;
  if (!canActOnSector(ctx, setores)) return null;
  const p = await getPrisma().process.findFirst({
    where: { id: processId, tenantId: ctx.tenantId },
    select: { id: true, activeTimerUserId: true, activeTimerStartedAt: true },
  });
  // Coordenar o setor libera o lançamento atrasado (04/11/2026).
  return p ? { ctx, p, coordena: canManageSector(ctx, setores) } : null;
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
      data: { tenantId: ctx.tenantId, processId, userId: ctx.userId, minutes, note: "cronômetro", loggedOn: new Date(), source: "CRONOMETRO" },
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
  const hoje = saoPauloParts(new Date()).dateKey;
  const recusa = dia.data ? recusaDoLancamentoAtrasado(dia.data.toISOString().slice(0, 10), hoje, r.coordena) : null;
  if (recusa) return { error: recusa };
  await getPrisma().timeEntry.create({
    data: { tenantId: r.ctx.tenantId, processId, userId: r.ctx.userId, minutes, note, loggedOn: dia.data ?? new Date(), source: "MANUAL" },
  });
  revalidatePath(`/processos/${processId}`);
  return { ok: true };
}

/**
 * Corrigir o próprio lançamento (13/10/2026): duração, dia e o que foi feito.
 * Cada um corrige só o seu — a mesma regra que valia para apagar.
 */
export async function editarHorasDoProcesso(processId: string, entryId: string, _prev: HorasState, form: FormData): Promise<HorasState> {
  const r = await processoNoAlcance(processId);
  if (!r) return { error: "Processo não encontrado." };
  const lido = lerLancamentoDeHoras(form);
  if (!lido.ok) return { error: lido.error };
  if (lido.dia) {
    const recusa = recusaDoLancamentoAtrasado(lido.dia.toISOString().slice(0, 10), saoPauloParts(new Date()).dateKey, r.coordena);
    if (recusa) return { error: recusa };
  }
  const u = await getPrisma().timeEntry.updateMany({
    where: { id: entryId, processId, tenantId: r.ctx.tenantId, userId: r.ctx.userId },
    // `editedAt`: a hora corrigida deixa de ser só do cronômetro (04/11/2026).
    data: { minutes: lido.minutos, note: lido.nota, editedAt: new Date(), ...(lido.dia ? { loggedOn: lido.dia } : {}) },
  });
  if (u.count === 0) return { error: "Lançamento não encontrado." };
  revalidatePath(`/processos/${processId}`);
  return { ok: true };
}

export async function apagarHorasDoProcesso(processId: string, entryId: string): Promise<HorasState> {
  const r = await processoNoAlcance(processId);
  if (!r) return { error: "Processo não encontrado." };
  // Apagar lançamento: só o administrador (13/10/2026), de qualquer pessoa.
  // Antes cada um apagava o próprio; agora corrige pelo `editarHorasDoProcesso`.
  if (!podeExcluir(r.ctx)) return { error: SO_ADMIN_EXCLUI };
  const d = await getPrisma().timeEntry.deleteMany({ where: { id: entryId, processId, tenantId: r.ctx.tenantId } });
  if (d.count === 0) return { error: "Lançamento não encontrado." };
  revalidatePath(`/processos/${processId}`);
  return { ok: true };
}
