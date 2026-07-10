"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { isPrismaUniqueError } from "@/lib/prismaErrors";

export type DepartmentState = { error: string } | null;

async function assertCompanyInScope(companyId: string, ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true },
  });
  return !!company;
}

export async function criarDepartment(_prev: DepartmentState, form: FormData): Promise<DepartmentState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para criar departamentos." };

  const companyId = form.get("companyId") as string;
  if (!companyId || !(await assertCompanyInScope(companyId, ctx))) {
    return { error: "Empresa não encontrada ou fora do seu escopo." };
  }

  const name = (form.get("name") as string)?.trim();
  if (!name) return { error: "Nome do departamento é obrigatório" };

  const prisma = getPrisma();
  try {
    await prisma.department.create({ data: { tenantId: ctx.tenantId, companyId, name } });
  } catch (err) {
    if (isPrismaUniqueError(err)) {
      return { error: `Já existe um departamento "${name}" nesta empresa.` };
    }
    console.error("[criarDepartment]", err);
    return { error: "Erro ao criar departamento. Tente novamente." };
  }

  revalidatePath(`/empresas/${companyId}/departamentos`);
  redirect(`/empresas/${companyId}/departamentos`);
}

export async function atualizarDepartment(_prev: DepartmentState, form: FormData): Promise<DepartmentState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para editar departamentos." };

  const id = form.get("id") as string;
  const companyId = form.get("companyId") as string;
  if (!companyId || !(await assertCompanyInScope(companyId, ctx))) {
    return { error: "Empresa não encontrada ou fora do seu escopo." };
  }

  const name = (form.get("name") as string)?.trim();
  if (!name) return { error: "Nome do departamento é obrigatório" };

  const prisma = getPrisma();
  const existing = await prisma.department.findFirst({ where: { id, tenantId: ctx.tenantId, companyId } });
  if (!existing) return { error: "Departamento não encontrado." };

  try {
    await prisma.department.update({ where: { id }, data: { name } });
  } catch (err) {
    if (isPrismaUniqueError(err)) {
      return { error: `Já existe um departamento "${name}" nesta empresa.` };
    }
    console.error("[atualizarDepartment]", err);
    return { error: "Erro ao atualizar departamento." };
  }

  revalidatePath(`/empresas/${companyId}/departamentos`);
  redirect(`/empresas/${companyId}/departamentos`);
}

export async function excluirDepartment(id: string, companyId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWrite(ctx.role)) return;
  if (!(await assertCompanyInScope(companyId, ctx))) return;

  const prisma = getPrisma();
  const existing = await prisma.department.findFirst({ where: { id, tenantId: ctx.tenantId, companyId } });
  if (!existing) return;

  try {
    await prisma.department.delete({ where: { id } });
  } catch (err) {
    console.error("[excluirDepartment]", err);
    return;
  }

  revalidatePath(`/empresas/${companyId}/departamentos`);
}
