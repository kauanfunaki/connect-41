"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { VagaStatus, VagaPrioridade } from "@/generated/prisma/enums";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { scopedVagaWhere } from "@/lib/auth/scope";

export type VagaState = { error: string } | null;

function pick(form: FormData, key: string): string | null {
  return (form.get(key) as string)?.trim() || null;
}

function vagaData(form: FormData) {
  return {
    title:             (form.get("title") as string)?.trim(),
    companyId:         form.get("companyId") as string,
    sectorCode:        (form.get("sectorCode") as string)?.trim(),
    cargoId:           pick(form, "cargoId"),
    quantity:          parseInt((form.get("quantity") as string) || "1") || 1,
    responsibleUserId: pick(form, "responsibleUserId"),
    priority:          (form.get("priority") as VagaPrioridade) ?? VagaPrioridade.MEDIA,
    notes:             pick(form, "notes"),
  };
}

export async function criarVaga(_prev: VagaState, form: FormData): Promise<VagaState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };

  const data = vagaData(form);
  if (!data.title) return { error: "Título da vaga é obrigatório" };
  if (!data.companyId) return { error: "Empresa é obrigatória" };
  if (!data.sectorCode) return { error: "Setor é obrigatório" };
  if (!canManageSector(ctx, data.sectorCode)) {
    return { error: "Sem permissão para criar vagas neste setor." };
  }

  const prisma = getPrisma();
  let id: string;
  try {
    const vaga = await prisma.vaga.create({ data: { tenantId: ctx.tenantId, ...data } });
    id = vaga.id;
  } catch (err) {
    console.error("[criarVaga]", err);
    return { error: "Erro ao criar vaga. Tente novamente." };
  }

  redirect(`/vagas/${id}`);
}

export async function atualizarVaga(_prev: VagaState, form: FormData): Promise<VagaState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };

  const id = form.get("id") as string;
  const data = vagaData(form);
  if (!data.title) return { error: "Título da vaga é obrigatório" };
  if (!canManageSector(ctx, data.sectorCode)) {
    return { error: "Sem permissão para editar vagas neste setor." };
  }

  const prisma = getPrisma();
  const existing = await prisma.vaga.findFirst({ where: { id, ...scopedVagaWhere(ctx) } });
  if (!existing) return { error: "Vaga não encontrada ou fora do seu escopo." };

  try {
    await prisma.vaga.update({ where: { id }, data });
  } catch (err) {
    console.error("[atualizarVaga]", err);
    return { error: "Erro ao atualizar vaga." };
  }

  revalidatePath(`/vagas/${id}`);
  redirect(`/vagas/${id}`);
}

export async function encerrarVaga(id: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return;

  const prisma = getPrisma();
  const existing = await prisma.vaga.findFirst({ where: { id, ...scopedVagaWhere(ctx) } });
  if (!existing || !canManageSector(ctx, existing.sectorCode)) return;

  await prisma.vaga.update({
    where: { id },
    data: { status: VagaStatus.ENCERRADA, closedAt: new Date() },
  });

  revalidatePath(`/vagas/${id}`);
}

export async function excluirVaga(id: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return;

  const prisma = getPrisma();
  const existing = await prisma.vaga.findFirst({ where: { id, ...scopedVagaWhere(ctx) } });
  if (!existing || !canManageSector(ctx, existing.sectorCode)) return;

  try {
    await prisma.vaga.delete({ where: { id } });
  } catch (err) {
    console.error("[excluirVaga]", err);
    return;
  }

  revalidatePath("/vagas");
  redirect("/vagas");
}
