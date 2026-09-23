"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { VagaStatus, VagaPrioridade, VagaContrato, VagaModalidade } from "@/generated/prisma/enums";
import { validarFaixa } from "@/lib/carreiras/portal";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { scopedVagaWhere } from "@/lib/auth/scope";

export type VagaState = { error: string } | null;

function pick(form: FormData, key: string): string | null {
  return (form.get(key) as string)?.trim() || null;
}

function enumOuNulo<T extends string>(valor: string | null, opcoes: Record<string, T>): T | null {
  return valor && (Object.values(opcoes) as string[]).includes(valor) ? (valor as T) : null;
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
    isPublic:          form.get("isPublic") === "true",
    publicDescription: pick(form, "publicDescription"),
    workMode:          enumOuNulo(pick(form, "workMode"), VagaModalidade),
    contractType:      enumOuNulo(pick(form, "contractType"), VagaContrato),
  };
}

/** A faixa salarial do formulário, já validada — ou o erro para a tela. */
function faixaDoForm(form: FormData) {
  return validarFaixa(pick(form, "salaryMin"), pick(form, "salaryMax"), form.get("showSalary") === "true");
}

export async function criarVaga(_prev: VagaState, form: FormData): Promise<VagaState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };

  const data = vagaData(form);
  if (!data.title) return { error: "Título da vaga é obrigatório" };
  if (!data.companyId) return { error: "Empresa é obrigatória" };
  const faixa = faixaDoForm(form);
  if (!faixa.ok) return { error: faixa.erro };
  if (!data.sectorCode) return { error: "Setor é obrigatório" };
  if (!canManageSector(ctx, data.sectorCode)) {
    return { error: "Sem permissão para criar vagas neste setor." };
  }

  const prisma = getPrisma();
  let id: string;
  try {
    const vaga = await prisma.vaga.create({
      data: { tenantId: ctx.tenantId, ...data, salaryMin: faixa.salaryMin, salaryMax: faixa.salaryMax, showSalary: faixa.showSalary },
    });
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
  const faixa = faixaDoForm(form);
  if (!faixa.ok) return { error: faixa.erro };

  const prisma = getPrisma();
  const existing = await prisma.vaga.findFirst({ where: { id, ...scopedVagaWhere(ctx) } });
  if (!existing) return { error: "Vaga não encontrada ou fora do seu escopo." };

  try {
    await prisma.vaga.update({
      where: { id },
      data: { ...data, salaryMin: faixa.salaryMin, salaryMax: faixa.salaryMax, showSalary: faixa.showSalary },
    });
  } catch (err) {
    console.error("[atualizarVaga]", err);
    return { error: "Erro ao atualizar vaga." };
  }

  revalidatePath(`/vagas/${id}`);
  redirect(`/vagas/${id}`);
}

export async function encerrarVaga(id: string): Promise<{ error: string } | null> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };

  const prisma = getPrisma();
  const existing = await prisma.vaga.findFirst({ where: { id, ...scopedVagaWhere(ctx) } });
  if (!existing) return { error: "Vaga não encontrada ou fora do seu escopo." };
  if (!canManageSector(ctx, existing.sectorCode)) return { error: "Sem permissão para encerrar esta vaga." };

  await prisma.vaga.update({
    where: { id },
    data: { status: VagaStatus.ENCERRADA, closedAt: new Date() },
  });

  revalidatePath(`/vagas/${id}`);
  revalidatePath("/vagas");
  return null;
}

// Contrapartida de encerrarVaga — encerrar era irreversível pela UI, o que
// tornava um clique acidental caro demais. Limpa closedAt e devolve a vaga
// para ABERTA (não EM_ANDAMENTO: quem reabre decide o andamento depois).
export async function reabrirVaga(id: string): Promise<{ error: string } | null> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };

  const prisma = getPrisma();
  const existing = await prisma.vaga.findFirst({ where: { id, ...scopedVagaWhere(ctx) } });
  if (!existing) return { error: "Vaga não encontrada ou fora do seu escopo." };
  if (!canManageSector(ctx, existing.sectorCode)) return { error: "Sem permissão para reabrir esta vaga." };

  await prisma.vaga.update({
    where: { id },
    data: { status: VagaStatus.ABERTA, closedAt: null },
  });

  revalidatePath(`/vagas/${id}`);
  revalidatePath("/vagas");
  return null;
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
