"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";

export type WorkShiftState = { error: string } | null;

function isPrismaUniqueError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
}

async function assertCompanyInScope(companyId: string, ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true },
  });
  return !!company;
}

export async function criarTurno(_prev: WorkShiftState, form: FormData): Promise<WorkShiftState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para criar turnos." };

  const companyId = form.get("companyId") as string;
  if (!companyId || !(await assertCompanyInScope(companyId, ctx))) {
    return { error: "Empresa não encontrada ou fora do seu escopo." };
  }

  const name = (form.get("name") as string)?.trim();
  const startTime = (form.get("startTime") as string)?.trim();
  const endTime = (form.get("endTime") as string)?.trim();
  if (!name) return { error: "Nome do turno é obrigatório" };
  if (!startTime || !endTime) return { error: "Informe o horário de início e fim." };

  const prisma = getPrisma();
  try {
    await prisma.workShift.create({ data: { tenantId: ctx.tenantId, companyId, name, startTime, endTime } });
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: `Já existe um turno "${name}" nesta empresa.` };
    console.error("[criarTurno]", err);
    return { error: "Erro ao criar turno." };
  }

  revalidatePath(`/empresas/${companyId}/turnos`);
  redirect(`/empresas/${companyId}/turnos`);
}

export async function atualizarTurno(_prev: WorkShiftState, form: FormData): Promise<WorkShiftState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para editar turnos." };

  const id = form.get("id") as string;
  const companyId = form.get("companyId") as string;
  if (!companyId || !(await assertCompanyInScope(companyId, ctx))) {
    return { error: "Empresa não encontrada ou fora do seu escopo." };
  }

  const name = (form.get("name") as string)?.trim();
  const startTime = (form.get("startTime") as string)?.trim();
  const endTime = (form.get("endTime") as string)?.trim();
  if (!name) return { error: "Nome do turno é obrigatório" };
  if (!startTime || !endTime) return { error: "Informe o horário de início e fim." };

  const prisma = getPrisma();
  const existing = await prisma.workShift.findFirst({ where: { id, tenantId: ctx.tenantId, companyId } });
  if (!existing) return { error: "Turno não encontrado." };

  try {
    await prisma.workShift.update({ where: { id }, data: { name, startTime, endTime } });
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: `Já existe um turno "${name}" nesta empresa.` };
    console.error("[atualizarTurno]", err);
    return { error: "Erro ao atualizar turno." };
  }

  revalidatePath(`/empresas/${companyId}/turnos`);
  redirect(`/empresas/${companyId}/turnos`);
}

export async function excluirTurno(id: string, companyId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWrite(ctx.role)) return;
  if (!(await assertCompanyInScope(companyId, ctx))) return;

  const prisma = getPrisma();
  const existing = await prisma.workShift.findFirst({ where: { id, tenantId: ctx.tenantId, companyId } });
  if (!existing) return;

  try {
    await prisma.workShift.delete({ where: { id } });
  } catch (err) {
    console.error("[excluirTurno]", err);
    return;
  }

  revalidatePath(`/empresas/${companyId}/turnos`);
}
