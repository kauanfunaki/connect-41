"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { CompanyStatus } from "@/generated/prisma/enums";
import { getAuthContext } from "@/lib/auth/context";
import { canWriteEntity } from "@/lib/auth/policy";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { getCompanySectors, getApplicableCustomFields, saveCustomFieldValues } from "@/lib/customFields";
import { pick } from "@/lib/forms";
import { isPrismaForeignKeyError } from "@/lib/prismaErrors";
import { isValidCNPJ, digitsOnly } from "@/lib/validation/common";
import { logAudit } from "@/lib/audit";

export type EmpresaState = { error: string } | null;

function companyData(form: FormData) {
  return {
    name:                  (form.get("name") as string)?.trim(),
    tradeName:             pick(form, "tradeName"),
    cnpj:                  digitsOnly(pick(form, "cnpj")),
    taxRegime:             pick(form, "taxRegime"),
    zipCode:               pick(form, "zipCode"),
    addressStreet:         pick(form, "addressStreet"),
    addressNumber:         pick(form, "addressNumber"),
    addressComplement:     pick(form, "addressComplement"),
    neighborhood:          pick(form, "neighborhood"),
    city:                  pick(form, "city"),
    stateCode:             pick(form, "stateCode"),
    stateRegistration:     pick(form, "stateRegistration"),
    municipalRegistration: pick(form, "municipalRegistration"),
    nire:                  pick(form, "nire"),
    email:                 pick(form, "email"),
    phone:                 pick(form, "phone"),
    website:               pick(form, "website"),
    status:                (form.get("status") as CompanyStatus) ?? CompanyStatus.PROSPECT,
    source:                pick(form, "source"),
    branchId:              pick(form, "branchId"),
  };
}

// Valida razão social e CNPJ (dígito verificador). Sem constraint de unicidade no
// banco ainda (há duplicatas legadas a limpar antes) — a checagem de duplicado é
// feita no app, por tenant.
async function validateCompany(
  data: ReturnType<typeof companyData>,
  tenantId: string,
  ignoreId?: string
): Promise<string | null> {
  if (!data.name) return "Razão Social é obrigatória.";
  if (data.cnpj && !isValidCNPJ(data.cnpj)) return "CNPJ inválido.";

  if (data.cnpj) {
    const prisma = getPrisma();
    const dup = await prisma.company.findFirst({
      where: { tenantId, cnpj: data.cnpj, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
      select: { id: true },
    });
    if (dup) return "Já existe uma empresa com este CNPJ.";
  }
  return null;
}

export async function criarEmpresa(
  _prev: EmpresaState,
  form: FormData
): Promise<EmpresaState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWriteEntity(ctx)) return { error: "Sem permissão para criar empresas." };

  const data = companyData(form);
  const validationError = await validateCompany(data, ctx.tenantId);
  if (validationError) return { error: validationError };

  const prisma = getPrisma();
  let id: string;

  try {
    const company = await prisma.company.create({ data: { tenantId: ctx.tenantId, ...data } });
    id = company.id;
  } catch (err) {
    console.error("[criarEmpresa]", err);
    return { error: "Erro ao criar empresa. Tente novamente." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "company.create",
    entityType: "Company",
    entityId: id,
    metadata: { name: data.name },
  });

  redirect(`/empresas/${id}`);
}

export async function atualizarEmpresa(
  _prev: EmpresaState,
  form: FormData
): Promise<EmpresaState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWriteEntity(ctx)) return { error: "Sem permissão para editar empresas." };

  const id = form.get("id") as string;
  const data = companyData(form);
  const validationError = await validateCompany(data, ctx.tenantId, id);
  if (validationError) return { error: validationError };

  const prisma = getPrisma();

  const existing = await prisma.company.findFirst({
    where: { id, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true },
  });
  if (!existing) return { error: "Empresa não encontrada ou fora do seu escopo." };

  try {
    await prisma.company.update({ where: { id }, data });
  } catch (err) {
    console.error("[atualizarEmpresa]", err);
    return { error: "Erro ao atualizar empresa." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "company.update",
    entityType: "Company",
    entityId: id,
    metadata: { name: data.name },
  });

  const companySectors = await getCompanySectors(ctx.tenantId, id);
  const applicableFields = await getApplicableCustomFields(ctx, "COMPANY", id, companySectors);
  await saveCustomFieldValues(ctx.tenantId, id, applicableFields, form);

  revalidatePath(`/empresas/${id}`);
  redirect(`/empresas/${id}`);
}

export async function excluirEmpresa(id: string): Promise<EmpresaState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWriteEntity(ctx)) return { error: "Sem permissão." };

  const prisma = getPrisma();

  const existing = await prisma.company.findFirst({
    where: { id, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true, name: true },
  });
  if (!existing) return { error: "Empresa não encontrada ou fora do seu escopo." };

  try {
    await prisma.company.delete({ where: { id } });
  } catch (err) {
    if (isPrismaForeignKeyError(err)) {
      return {
        error:
          "Esta empresa tem registros vinculados (colaboradores, serviços, vagas, etc.) e não pode ser excluída.",
      };
    }
    console.error("[excluirEmpresa]", err);
    return { error: "Erro ao excluir empresa." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "company.delete",
    entityType: "Company",
    entityId: id,
    metadata: { name: existing.name },
  });

  revalidatePath("/empresas");
  redirect("/empresas");
}

export async function atualizarStatusEmMassa(ids: string[], status: CompanyStatus): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWriteEntity(ctx) || ids.length === 0) return;

  const prisma = getPrisma();
  await prisma.company.updateMany({
    where: { id: { in: ids }, ...(await scopedCompanyWhere(ctx)) },
    data: { status },
  });

  revalidatePath("/empresas");
}

// Exclusão em massa é mais restrita que a individual (canWrite) — só Super Admin.
export async function excluirEmpresasEmMassa(ids: string[]): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || ctx.role !== "SUPER_ADMIN" || ids.length === 0) return;

  const prisma = getPrisma();
  await prisma.company.deleteMany({
    where: { id: { in: ids }, ...(await scopedCompanyWhere(ctx)) },
  });

  revalidatePath("/empresas");
}
