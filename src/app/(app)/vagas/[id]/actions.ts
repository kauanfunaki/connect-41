"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { ProcessoSeletivoStatus, PersonEmploymentStatus, PersonType } from "@/generated/prisma/enums";
import { getAuthContext, canManageSector, canActOnSector } from "@/lib/auth/context";
import { scopedVagaWhere } from "@/lib/auth/scope";
import { isPrismaUniqueError } from "@/lib/prismaErrors";

export type CandidaturaState = { error: string } | null;

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

export async function atualizarStatusCandidatura(
  candidaturaId: string,
  _prev: CandidaturaState,
  form: FormData
): Promise<CandidaturaState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };

  const prisma = getPrisma();
  const candidatura = await prisma.candidatura.findFirst({
    where: { id: candidaturaId, tenantId: ctx.tenantId },
    include: { vaga: true },
  });
  if (!candidatura) return { error: "Candidatura não encontrada." };
  if (!canActOnSector(ctx, candidatura.vaga.sectorCode)) {
    return { error: "Sem permissão para atualizar esta candidatura." };
  }

  const status = form.get("status") as ProcessoSeletivoStatus;
  if (!Object.values(ProcessoSeletivoStatus).includes(status)) {
    return { error: "Status inválido." };
  }
  const rejectionReason = (form.get("rejectionReason") as string)?.trim() || null;
  const withdrawalReason = (form.get("withdrawalReason") as string)?.trim() || null;

  try {
    await prisma.candidatura.update({
      where: { id: candidaturaId },
      data: {
        status,
        rejectionReason: status === "REPROVADO" ? rejectionReason : null,
        withdrawalReason: status === "DESISTENTE" ? withdrawalReason : null,
        hiredAt: status === "CONTRATADO" ? new Date() : candidatura.hiredAt,
      },
    });

    // Converte o candidato em colaborador — o próximo passo (dados de admissão
    // completos, cargo, salário etc.) continua na Ficha da Pessoa normalmente.
    if (status === "CONTRATADO") {
      await prisma.person.update({
        where: { id: candidatura.personId },
        data: {
          type: PersonType.COLABORADOR,
          employmentStatus: PersonEmploymentStatus.ADMISSAO_EM_ANDAMENTO,
          currentCompanyId: candidatura.vaga.companyId,
          cargoId: candidatura.vaga.cargoId ?? undefined,
        },
      });
    }
  } catch (err) {
    console.error("[atualizarStatusCandidatura]", err);
    return { error: "Erro ao atualizar status da candidatura." };
  }

  revalidatePath(`/vagas/${candidatura.vagaId}`);
  revalidatePath(`/pessoas/${candidatura.personId}`);
  return null;
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
