"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { isPrismaUniqueError } from "@/lib/prismaErrors";

export type HolidayState = { error: string } | null;

export async function criarFeriado(_prev: HolidayState, form: FormData): Promise<HolidayState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { error: "Sem permissão para cadastrar feriados." };

  const dateRaw = (form.get("date") as string)?.trim();
  const name = (form.get("name") as string)?.trim();
  if (!dateRaw) return { error: "Informe a data do feriado." };
  if (!name) return { error: "Nome do feriado é obrigatório" };

  const prisma = getPrisma();
  try {
    await prisma.holiday.create({ data: { tenantId: ctx.tenantId, date: new Date(dateRaw), name } });
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: "Já existe um feriado cadastrado nesta data." };
    console.error("[criarFeriado]", err);
    return { error: "Erro ao cadastrar feriado." };
  }

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "holiday.create", entityType: "Holiday", metadata: { name, date: dateRaw } });

  revalidatePath("/admin/feriados");
  redirect("/admin/feriados");
}

export type ImportFeriadosResult = { error: string } | { success: true; imported: number; skipped: number };

type BrasilApiFeriado = { date: string; name: string; type: string };

// BrasilAPI (brasilapi.com.br) — feriados nacionais, gratuita, sem chave.
// Cobre só feriados nacionais; estaduais/municipais seguem manuais (a API
// pública não tem esse recorte por município/UF).
export async function importarFeriadosNacionais(year: number): Promise<ImportFeriadosResult> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { error: "Sem permissão para cadastrar feriados." };

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { error: "Ano inválido." };
  }

  let feriados: BrasilApiFeriado[];
  try {
    const res = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`, {
      cache: "no-store",
    });
    if (!res.ok) return { error: "Não foi possível consultar a lista de feriados nacionais." };
    feriados = await res.json();
  } catch (err) {
    console.error("[importarFeriadosNacionais]", err);
    return { error: "Não foi possível consultar a lista de feriados nacionais." };
  }

  const prisma = getPrisma();
  const existing = await prisma.holiday.findMany({
    where: { tenantId: ctx.tenantId, date: { gte: new Date(`${year}-01-01`), lt: new Date(`${year + 1}-01-01`) } },
    select: { date: true },
  });
  const existingKeys = new Set(existing.map((e) => e.date.toISOString().slice(0, 10)));

  const toCreate = feriados.filter((f) => !existingKeys.has(f.date));

  if (toCreate.length > 0) {
    await prisma.holiday.createMany({
      data: toCreate.map((f) => ({ tenantId: ctx.tenantId, date: new Date(f.date), name: f.name })),
    });
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "holiday.import",
    entityType: "Holiday",
    metadata: { year, imported: toCreate.length, skipped: feriados.length - toCreate.length },
  });

  revalidatePath("/admin/feriados");
  return { success: true, imported: toCreate.length, skipped: feriados.length - toCreate.length };
}

export async function excluirFeriado(id: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) return;

  const prisma = getPrisma();
  const existing = await prisma.holiday.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) return;

  try {
    await prisma.holiday.delete({ where: { id } });
  } catch (err) {
    console.error("[excluirFeriado]", err);
    return;
  }

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "holiday.delete", entityType: "Holiday", entityId: id, metadata: { name: existing.name } });

  revalidatePath("/admin/feriados");
}
