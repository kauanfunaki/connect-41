"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { PersonType } from "@/generated/prisma/enums";

export type PessoaState = { error: string } | null;

async function getTenantId(): Promise<string | null> {
  const h = await headers();
  return h.get("x-tenant-id");
}

function pick(form: FormData, key: string): string | null {
  return (form.get(key) as string)?.trim() || null;
}

function pessoaData(form: FormData) {
  const birthDateRaw = pick(form, "birthDate");
  return {
    name:            (form.get("name") as string)?.trim(),
    cpf:             pick(form, "cpf"),
    email:           pick(form, "email"),
    phone:           pick(form, "phone"),
    birthDate:       birthDateRaw ? new Date(birthDateRaw) : null,
    type:            (form.get("type") as PersonType) ?? PersonType.CANDIDATO,
    currentCompanyId: pick(form, "currentCompanyId"),
  };
}

export async function criarPessoa(
  _prev: PessoaState,
  form: FormData
): Promise<PessoaState> {
  const tenantId = await getTenantId();
  if (!tenantId) return { error: "Não autenticado" };

  const data = pessoaData(form);
  if (!data.name) return { error: "Nome é obrigatório" };

  const prisma = getPrisma();
  let id: string;

  try {
    const person = await prisma.person.create({ data: { tenantId, ...data } });
    id = person.id;
  } catch (err) {
    console.error("[criarPessoa]", err);
    return { error: "Erro ao criar pessoa. Tente novamente." };
  }

  redirect(`/pessoas/${id}`);
}

export async function atualizarPessoa(
  _prev: PessoaState,
  form: FormData
): Promise<PessoaState> {
  const tenantId = await getTenantId();
  if (!tenantId) return { error: "Não autenticado" };

  const id = form.get("id") as string;
  const data = pessoaData(form);
  if (!data.name) return { error: "Nome é obrigatório" };

  const prisma = getPrisma();

  try {
    await prisma.person.update({ where: { id, tenantId }, data });
  } catch (err) {
    console.error("[atualizarPessoa]", err);
    return { error: "Erro ao atualizar pessoa." };
  }

  revalidatePath(`/pessoas/${id}`);
  redirect(`/pessoas/${id}`);
}

export async function excluirPessoa(id: string): Promise<void> {
  const tenantId = await getTenantId();
  if (!tenantId) return;

  const prisma = getPrisma();
  try {
    await prisma.person.delete({ where: { id, tenantId } });
  } catch (err) {
    console.error("[excluirPessoa]", err);
    return;
  }

  revalidatePath("/pessoas");
  redirect("/pessoas");
}
