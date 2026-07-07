"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { BenefitType } from "@/generated/prisma/enums";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";

export type BenefitCatalogState = { error: string } | null;

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

export async function criarBeneficio(_prev: BenefitCatalogState, form: FormData): Promise<BenefitCatalogState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para criar benefícios." };

  const companyId = form.get("companyId") as string;
  if (!companyId || !(await assertCompanyInScope(companyId, ctx))) {
    return { error: "Empresa não encontrada ou fora do seu escopo." };
  }

  const name = (form.get("name") as string)?.trim();
  const type = form.get("type") as BenefitType;
  if (!name) return { error: "Nome do benefício é obrigatório" };
  if (!Object.values(BenefitType).includes(type)) return { error: "Tipo de benefício inválido." };

  const eligibilityRule = (form.get("eligibilityRule") as string)?.trim() || null;

  const prisma = getPrisma();
  try {
    await prisma.benefitCatalog.create({ data: { tenantId: ctx.tenantId, companyId, name, type, eligibilityRule } });
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: `Já existe um benefício "${name}" nesta empresa.` };
    console.error("[criarBeneficio]", err);
    return { error: "Erro ao criar benefício. Tente novamente." };
  }

  revalidatePath(`/empresas/${companyId}/beneficios`);
  redirect(`/empresas/${companyId}/beneficios`);
}

export async function atualizarBeneficio(_prev: BenefitCatalogState, form: FormData): Promise<BenefitCatalogState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para editar benefícios." };

  const id = form.get("id") as string;
  const companyId = form.get("companyId") as string;
  if (!companyId || !(await assertCompanyInScope(companyId, ctx))) {
    return { error: "Empresa não encontrada ou fora do seu escopo." };
  }

  const name = (form.get("name") as string)?.trim();
  const type = form.get("type") as BenefitType;
  if (!name) return { error: "Nome do benefício é obrigatório" };
  if (!Object.values(BenefitType).includes(type)) return { error: "Tipo de benefício inválido." };
  const eligibilityRule = (form.get("eligibilityRule") as string)?.trim() || null;

  const prisma = getPrisma();
  const existing = await prisma.benefitCatalog.findFirst({ where: { id, tenantId: ctx.tenantId, companyId } });
  if (!existing) return { error: "Benefício não encontrado." };

  try {
    await prisma.benefitCatalog.update({ where: { id }, data: { name, type, eligibilityRule } });
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: `Já existe um benefício "${name}" nesta empresa.` };
    console.error("[atualizarBeneficio]", err);
    return { error: "Erro ao atualizar benefício." };
  }

  revalidatePath(`/empresas/${companyId}/beneficios`);
  redirect(`/empresas/${companyId}/beneficios`);
}

export async function excluirBeneficio(id: string, companyId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWrite(ctx.role)) return;
  if (!(await assertCompanyInScope(companyId, ctx))) return;

  const prisma = getPrisma();
  const existing = await prisma.benefitCatalog.findFirst({ where: { id, tenantId: ctx.tenantId, companyId } });
  if (!existing) return;

  try {
    await prisma.benefitCatalog.delete({ where: { id } });
  } catch (err) {
    console.error("[excluirBeneficio]", err);
    return;
  }

  revalidatePath(`/empresas/${companyId}/beneficios`);
}
