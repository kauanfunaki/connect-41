"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { isPrismaUniqueError } from "@/lib/prismaErrors";

export type CargoState = { error: string } | null;

function pick(form: FormData, key: string): string | null {
  return (form.get(key) as string)?.trim() || null;
}

function cargoData(form: FormData) {
  return {
    name:                   (form.get("name") as string)?.trim(),
    area:                   pick(form, "area"),
    description:            pick(form, "description"),
    technicalRequirements:  pick(form, "technicalRequirements"),
    behavioralRequirements: pick(form, "behavioralRequirements"),
    salaryRangeMin:         pick(form, "salaryRangeMin"),
    salaryRangeMid:         pick(form, "salaryRangeMid"),
    salaryRangeMax:         pick(form, "salaryRangeMax"),
  };
}

async function assertCompanyInScope(tenantId: string, companyId: string, ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true },
  });
  return !!company;
}

export async function criarCargo(_prev: CargoState, form: FormData): Promise<CargoState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para criar cargos." };

  const companyId = form.get("companyId") as string;
  if (!companyId || !(await assertCompanyInScope(ctx.tenantId, companyId, ctx))) {
    return { error: "Empresa não encontrada ou fora do seu escopo." };
  }

  const data = cargoData(form);
  if (!data.name) return { error: "Nome do cargo é obrigatório" };

  const prisma = getPrisma();
  try {
    await prisma.cargo.create({ data: { tenantId: ctx.tenantId, companyId, ...data } });
  } catch (err) {
    if (isPrismaUniqueError(err)) {
      return { error: `Já existe um cargo "${data.name}" nesta empresa.` };
    }
    console.error("[criarCargo]", err);
    return { error: "Erro ao criar cargo. Tente novamente." };
  }

  revalidatePath(`/empresas/${companyId}/cargos`);
  redirect(`/empresas/${companyId}/cargos`);
}

export async function atualizarCargo(_prev: CargoState, form: FormData): Promise<CargoState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para editar cargos." };

  const id = form.get("id") as string;
  const companyId = form.get("companyId") as string;
  if (!companyId || !(await assertCompanyInScope(ctx.tenantId, companyId, ctx))) {
    return { error: "Empresa não encontrada ou fora do seu escopo." };
  }

  const data = cargoData(form);
  if (!data.name) return { error: "Nome do cargo é obrigatório" };

  const prisma = getPrisma();
  const existing = await prisma.cargo.findFirst({ where: { id, tenantId: ctx.tenantId, companyId } });
  if (!existing) return { error: "Cargo não encontrado." };

  try {
    await prisma.cargo.update({ where: { id }, data });
  } catch (err) {
    if (isPrismaUniqueError(err)) {
      return { error: `Já existe um cargo "${data.name}" nesta empresa.` };
    }
    console.error("[atualizarCargo]", err);
    return { error: "Erro ao atualizar cargo." };
  }

  revalidatePath(`/empresas/${companyId}/cargos`);
  redirect(`/empresas/${companyId}/cargos`);
}

export async function excluirCargo(id: string, companyId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWrite(ctx.role)) return;
  if (!(await assertCompanyInScope(ctx.tenantId, companyId, ctx))) return;

  const prisma = getPrisma();
  const existing = await prisma.cargo.findFirst({ where: { id, tenantId: ctx.tenantId, companyId } });
  if (!existing) return;

  try {
    await prisma.cargo.delete({ where: { id } });
  } catch (err) {
    console.error("[excluirCargo]", err);
    return;
  }

  revalidatePath(`/empresas/${companyId}/cargos`);
}
