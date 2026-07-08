"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { PersonType } from "@/generated/prisma/enums";
import { getAuthContext } from "@/lib/auth/context";
import { canWriteEntity } from "@/lib/auth/policy";
import { pick, pickDate } from "@/lib/forms";
import { isPrismaUniqueError, isPrismaForeignKeyError } from "@/lib/prismaErrors";
import { validatePersonForm } from "@/lib/validation/person";
import type { ActionState } from "@/lib/actionState";

export type CandidatoState = ActionState;

function candidatoData(form: FormData) {
  return {
    name:      (form.get("name") as string)?.trim(),
    cpf:       pick(form, "cpf"),
    email:     pick(form, "email"),
    phone:     pick(form, "phone"),
    birthDate: pickDate(form, "birthDate"),
    rg:        pick(form, "rg"),
    education: pick(form, "education"),

    zipCode:           pick(form, "zipCode"),
    addressStreet:     pick(form, "addressStreet"),
    addressNumber:     pick(form, "addressNumber"),
    addressComplement: pick(form, "addressComplement"),
    neighborhood:      pick(form, "neighborhood"),
    city:              pick(form, "city"),
    stateCode:         pick(form, "stateCode"),
  };
}

// Candidatos são sempre criados com type=CANDIDATO — a promoção pra COLABORADOR
// só acontece ao marcar a candidatura como CONTRATADO (ver vagas/[id]/actions.ts).
export async function criarCandidato(
  _prev: CandidatoState,
  form: FormData
): Promise<CandidatoState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWriteEntity(ctx)) return { error: "Sem permissão para criar candidatos." };

  const validationError = validatePersonForm(form);
  if (validationError) return { error: validationError };

  const data = candidatoData(form);

  const prisma = getPrisma();
  let id: string;

  try {
    const person = await prisma.person.create({
      data: { tenantId: ctx.tenantId, type: PersonType.CANDIDATO, ...data },
    });
    id = person.id;
  } catch (err) {
    if (isPrismaUniqueError(err)) {
      return { error: "Já existe uma pessoa cadastrada com este CPF." };
    }
    console.error("[criarCandidato]", err);
    return { error: "Erro ao criar candidato. Tente novamente." };
  }

  redirect(`/candidatos/${id}`);
}

export async function atualizarCandidato(
  _prev: CandidatoState,
  form: FormData
): Promise<CandidatoState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWriteEntity(ctx)) return { error: "Sem permissão para editar candidatos." };

  const validationError = validatePersonForm(form);
  if (validationError) return { error: validationError };

  const id = form.get("id") as string;
  const data = candidatoData(form);

  const prisma = getPrisma();

  const existing = await prisma.person.findFirst({
    where: { id, tenantId: ctx.tenantId, type: PersonType.CANDIDATO },
    select: { id: true },
  });
  if (!existing) return { error: "Candidato não encontrado." };

  try {
    await prisma.person.update({ where: { id }, data });
  } catch (err) {
    if (isPrismaUniqueError(err)) {
      return { error: "Já existe uma pessoa cadastrada com este CPF." };
    }
    console.error("[atualizarCandidato]", err);
    return { error: "Erro ao atualizar candidato." };
  }

  revalidatePath(`/candidatos/${id}`);
  redirect(`/candidatos/${id}`);
}

export async function excluirCandidato(id: string): Promise<CandidatoState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWriteEntity(ctx)) return { error: "Sem permissão." };

  const prisma = getPrisma();

  const existing = await prisma.person.findFirst({
    where: { id, tenantId: ctx.tenantId, type: PersonType.CANDIDATO },
    select: { id: true },
  });
  if (!existing) return { error: "Candidato não encontrado." };

  try {
    await prisma.person.delete({ where: { id } });
  } catch (err) {
    if (isPrismaForeignKeyError(err)) {
      return {
        error:
          "Este candidato tem candidaturas vinculadas e não pode ser excluído. Use “Inativar” para arquivá-lo.",
      };
    }
    console.error("[excluirCandidato]", err);
    return { error: "Erro ao excluir candidato." };
  }

  revalidatePath("/candidatos");
  redirect("/candidatos");
}

export async function inativarCandidatosEmMassa(ids: string[]): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWriteEntity(ctx) || ids.length === 0) return;

  const prisma = getPrisma();
  await prisma.person.updateMany({
    where: { id: { in: ids }, tenantId: ctx.tenantId, type: PersonType.CANDIDATO },
    data: { active: false },
  });

  revalidatePath("/candidatos");
}
