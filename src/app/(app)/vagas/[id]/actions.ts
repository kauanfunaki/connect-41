"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { PersonEmploymentStatus, PersonType, RecruitmentStage } from "@/generated/prisma/enums";
import { getAuthContext, canManageSector, canActOnSector } from "@/lib/auth/context";
import { scopedVagaWhere } from "@/lib/auth/scope";
import { isPrismaUniqueError } from "@/lib/prismaErrors";

export type CandidaturaState = { error: string } | null;

// Promove o candidato a colaborador em admissão — mesma lógica usada quando o
// status vira CONTRATADO pelo controle de status ou pelo funil (soltar em
// "Contratado").
async function promoverParaColaborador(personId: string, companyId: string, cargoId: string | null) {
  const prisma = getPrisma();
  await prisma.person.update({
    where: { id: personId },
    data: {
      type: PersonType.COLABORADOR,
      employmentStatus: PersonEmploymentStatus.ADMISSAO_EM_ANDAMENTO,
      currentCompanyId: companyId,
      cargoId: cargoId ?? undefined,
    },
  });
}

export async function adicionarCandidato(
  vagaId: string,
  _prev: CandidaturaState,
  form: FormData
): Promise<CandidaturaState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };

  const prisma = getPrisma();
  const vaga = await prisma.vaga.findFirst({ where: { id: vagaId, ...scopedVagaWhere(ctx) } });
  if (!vaga) return { error: "Vaga não encontrada." };
  if (!canActOnSector(ctx, vaga.sectorCode)) {
    return { error: "Sem permissão para adicionar candidatos nesta vaga." };
  }

  const personId = form.get("personId") as string;
  if (!personId) return { error: "Selecione um candidato." };
  const origin = (form.get("origin") as string)?.trim() || null;

  try {
    await prisma.candidatura.create({
      data: { tenantId: ctx.tenantId, vagaId, personId, origin },
    });
  } catch (err) {
    if (isPrismaUniqueError(err)) {
      return { error: "Este candidato já está vinculado a esta vaga." };
    }
    console.error("[adicionarCandidato]", err);
    return { error: "Erro ao vincular candidato." };
  }

  revalidatePath(`/vagas/${vagaId}`);
  return null;
}

// Move a candidatura entre etapas do funil (drag-and-drop). Soltar em
// CONTRATADO dispara a contratação (status + promoção), reaproveitando a mesma
// lógica do controle de status.
export async function moverEtapaCandidatura(
  vagaId: string,
  candidaturaId: string,
  stage: RecruitmentStage
): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return;
  if (!Object.values(RecruitmentStage).includes(stage)) return;

  const prisma = getPrisma();
  const candidatura = await prisma.candidatura.findFirst({
    where: { id: candidaturaId, tenantId: ctx.tenantId, vagaId },
    include: { vaga: true },
  });
  if (!candidatura) return;
  if (!canActOnSector(ctx, candidatura.vaga.sectorCode)) return;

  try {
    if (stage === "CONTRATADO" && candidatura.status !== "CONTRATADO") {
      await prisma.candidatura.update({
        where: { id: candidaturaId },
        data: { stage, status: "CONTRATADO", hiredAt: new Date() },
      });
      await promoverParaColaborador(candidatura.personId, candidatura.vaga.companyId, candidatura.vaga.cargoId);
    } else {
      await prisma.candidatura.update({ where: { id: candidaturaId }, data: { stage } });
    }
  } catch (err) {
    console.error("[moverEtapaCandidatura]", err);
    return;
  }

  revalidatePath(`/vagas/${vagaId}`);
  revalidatePath(`/pessoas/${candidatura.personId}`);
}

// Encerra a candidatura (reprovação/desistência). Mantém o `stage` atual de
// propósito — é o que preserva a medição de "quantos alcançaram cada etapa".
export async function encerrarCandidatura(
  vagaId: string,
  candidaturaId: string,
  outcome: "REPROVADO" | "DESISTENTE",
  reason: string | null
): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return;
  if (outcome !== "REPROVADO" && outcome !== "DESISTENTE") return;

  const prisma = getPrisma();
  const candidatura = await prisma.candidatura.findFirst({
    where: { id: candidaturaId, tenantId: ctx.tenantId, vagaId },
    include: { vaga: { select: { sectorCode: true } } },
  });
  if (!candidatura) return;
  if (!canActOnSector(ctx, candidatura.vaga.sectorCode)) return;

  const cleanReason = reason?.trim() || null;
  try {
    await prisma.candidatura.update({
      where: { id: candidaturaId },
      data: {
        status: outcome,
        rejectionReason: outcome === "REPROVADO" ? cleanReason : null,
        withdrawalReason: outcome === "DESISTENTE" ? cleanReason : null,
      },
    });
  } catch (err) {
    console.error("[encerrarCandidatura]", err);
    return;
  }

  revalidatePath(`/vagas/${vagaId}`);
}

export async function removerCandidatura(vagaId: string, candidaturaId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return;

  const prisma = getPrisma();
  const vaga = await prisma.vaga.findFirst({ where: { id: vagaId, ...scopedVagaWhere(ctx) } });
  if (!vaga || !canManageSector(ctx, vaga.sectorCode)) return;

  const existing = await prisma.candidatura.findFirst({ where: { id: candidaturaId, vagaId } });
  if (!existing) return;

  try {
    await prisma.candidatura.delete({ where: { id: candidaturaId } });
  } catch (err) {
    console.error("[removerCandidatura]", err);
    return;
  }

  revalidatePath(`/vagas/${vagaId}`);
}
