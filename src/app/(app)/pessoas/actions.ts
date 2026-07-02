"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { PersonType } from "@/generated/prisma/enums";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { getPersonSectors, getApplicableCustomFields, saveCustomFieldValues } from "@/lib/customFields";

export type PessoaState = { error: string } | null;

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
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para criar pessoas." };

  const data = pessoaData(form);
  if (!data.name) return { error: "Nome é obrigatório" };

  const prisma = getPrisma();
  let id: string;

  try {
    const person = await prisma.person.create({ data: { tenantId: ctx.tenantId, ...data } });
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
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para editar pessoas." };

  const id = form.get("id") as string;
  const data = pessoaData(form);
  if (!data.name) return { error: "Nome é obrigatório" };

  const prisma = getPrisma();

  const existing = await prisma.person.findFirst({
    where: { id, ...(await scopedPersonWhere(ctx)) },
    select: { id: true },
  });
  if (!existing) return { error: "Pessoa não encontrada ou fora do seu escopo." };

  try {
    await prisma.person.update({ where: { id }, data });
  } catch (err) {
    console.error("[atualizarPessoa]", err);
    return { error: "Erro ao atualizar pessoa." };
  }

  const personSectors = await getPersonSectors(ctx.tenantId, id);
  const applicableFields = await getApplicableCustomFields(ctx, "PERSON", id, personSectors);
  await saveCustomFieldValues(ctx.tenantId, id, applicableFields, form);

  revalidatePath(`/pessoas/${id}`);
  redirect(`/pessoas/${id}`);
}

export async function excluirPessoa(id: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWrite(ctx.role)) return;

  const prisma = getPrisma();

  const existing = await prisma.person.findFirst({
    where: { id, ...(await scopedPersonWhere(ctx)) },
    select: { id: true },
  });
  if (!existing) return;

  try {
    await prisma.person.delete({ where: { id } });
  } catch (err) {
    console.error("[excluirPessoa]", err);
    return;
  }

  revalidatePath("/pessoas");
  redirect("/pessoas");
}

export async function inativarPessoasEmMassa(ids: string[]): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWrite(ctx.role) || ids.length === 0) return;

  const prisma = getPrisma();
  await prisma.person.updateMany({
    where: { id: { in: ids }, ...(await scopedPersonWhere(ctx)) },
    data: { active: false },
  });

  revalidatePath("/pessoas");
}
