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

export async function criarEmpresa(
  _prev: EmpresaState,
  form: FormData
): Promise<EmpresaState> {
  const tenantId = await getTenantId();
  if (!tenantId) return { error: "Não autenticado" };

  const name = (form.get("name") as string)?.trim();
  if (!name) return { error: "Nome é obrigatório" };

  const prisma = getPrisma();
  let id: string;

  try {
    const company = await prisma.company.create({
      data: {
        tenantId,
        name,
        cnpj:    (form.get("cnpj")    as string) || null,
        email:   (form.get("email")   as string) || null,
        phone:   (form.get("phone")   as string) || null,
        address: (form.get("address") as string) || null,
        status:  (form.get("status")  as CompanyStatus) ?? CompanyStatus.PROSPECT,
        source:  (form.get("source")  as string) || null,
      },
    });
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
  const name = (form.get("name") as string)?.trim();
  if (!name) return { error: "Nome é obrigatório" };

  const prisma = getPrisma();

  try {
    await prisma.company.update({
      where: { id, tenantId },
      data: {
        name,
        cnpj:    (form.get("cnpj")    as string) || null,
        email:   (form.get("email")   as string) || null,
        phone:   (form.get("phone")   as string) || null,
        address: (form.get("address") as string) || null,
        status:  form.get("status") as CompanyStatus,
        source:  (form.get("source")  as string) || null,
      },
    });
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
