"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { CompanyStatus } from "@/generated/prisma/enums";

export type EmpresaState = { error: string } | null;

async function getTenantId(): Promise<string | null> {
  const h = await headers();
  return h.get("x-tenant-id");
}

function pickString(form: FormData, key: string): string | null {
  return (form.get(key) as string)?.trim() || null;
}

function companyData(form: FormData) {
  return {
    name:                  (form.get("name") as string)?.trim(),
    tradeName:             pickString(form, "tradeName"),
    cnpj:                  pickString(form, "cnpj"),
    taxRegime:             pickString(form, "taxRegime"),
    zipCode:               pickString(form, "zipCode"),
    addressStreet:         pickString(form, "addressStreet"),
    addressNumber:         pickString(form, "addressNumber"),
    addressComplement:     pickString(form, "addressComplement"),
    neighborhood:          pickString(form, "neighborhood"),
    city:                  pickString(form, "city"),
    stateCode:             pickString(form, "stateCode"),
    stateRegistration:     pickString(form, "stateRegistration"),
    municipalRegistration: pickString(form, "municipalRegistration"),
    nire:                  pickString(form, "nire"),
    email:                 pickString(form, "email"),
    phone:                 pickString(form, "phone"),
    website:               pickString(form, "website"),
    status:                (form.get("status") as CompanyStatus) ?? CompanyStatus.PROSPECT,
    source:                pickString(form, "source"),
  };
}

export async function criarEmpresa(
  _prev: EmpresaState,
  form: FormData
): Promise<EmpresaState> {
  const tenantId = await getTenantId();
  if (!tenantId) return { error: "Não autenticado" };

  const data = companyData(form);
  if (!data.name) return { error: "Razão Social é obrigatória" };

  const prisma = getPrisma();
  let id: string;

  try {
    const company = await prisma.company.create({ data: { tenantId, ...data } });
    id = company.id;
  } catch (err) {
    console.error("[criarEmpresa]", err);
    return { error: "Erro ao criar empresa. Tente novamente." };
  }

  redirect(`/empresas/${id}`);
}

export async function atualizarEmpresa(
  _prev: EmpresaState,
  form: FormData
): Promise<EmpresaState> {
  const tenantId = await getTenantId();
  if (!tenantId) return { error: "Não autenticado" };

  const id = form.get("id") as string;
  const data = companyData(form);
  if (!data.name) return { error: "Razão Social é obrigatória" };

  const prisma = getPrisma();

  try {
    await prisma.company.update({ where: { id, tenantId }, data });
  } catch (err) {
    console.error("[atualizarEmpresa]", err);
    return { error: "Erro ao atualizar empresa." };
  }

  revalidatePath(`/empresas/${id}`);
  redirect(`/empresas/${id}`);
}

export async function excluirEmpresa(id: string): Promise<void> {
  const tenantId = await getTenantId();
  if (!tenantId) return;

  const prisma = getPrisma();
  try {
    await prisma.company.delete({ where: { id, tenantId } });
  } catch (err) {
    console.error("[excluirEmpresa]", err);
    return;
  }

  revalidatePath("/empresas");
  redirect("/empresas");
}
