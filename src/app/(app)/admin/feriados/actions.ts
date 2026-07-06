"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";

export type HolidayState = { error: string } | null;

function isPrismaUniqueError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
}

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

  revalidatePath("/admin/feriados");
  redirect("/admin/feriados");
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

  revalidatePath("/admin/feriados");
}
