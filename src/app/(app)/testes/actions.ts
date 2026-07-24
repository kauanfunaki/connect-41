"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite, canActOnSector } from "@/lib/auth/context";
import { scopedPersonWhere, scopedAssessmentLinkWhere } from "@/lib/auth/scope";
import { sendTesteEmail } from "@/lib/email/sendMail";
import { formatInstantDate } from "@/lib/format";
import { stageIndex } from "@/lib/recruitmentFunnel";
import type { AssessmentType } from "@/generated/prisma/enums";

const LINK_TTL_DAYS = 7;
const SECTOR = "recrutamento";

export type GerarLinkTesteResult =
  | { error: string }
  | { ok: true; token: string; expiresAtLabel: string; emailSent: boolean };

async function assertPersonEmEscopo(personId: string, ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  const prisma = getPrisma();
  return prisma.person.findFirst({
    where: { id: personId, ...(await scopedPersonWhere(ctx)) },
    select: { id: true, name: true, email: true },
  });
}

export async function gerarLinkTeste(
  personId: string,
  candidaturaId: string | null,
  type: AssessmentType = "DISC",
  templateId: string | null = null
): Promise<GerarLinkTesteResult> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para gerar teste." };
  if (!canActOnSector(ctx, SECTOR)) return { error: "Sem permissão para o setor de Recrutamento." };

  const person = await assertPersonEmEscopo(personId, ctx);
  if (!person) return { error: "Pessoa não encontrada ou fora do seu escopo." };

  const prisma = getPrisma();

  if (candidaturaId) {
    const candidatura = await prisma.candidatura.findFirst({ where: { id: candidaturaId, personId, tenantId: ctx.tenantId } });
    if (!candidatura) return { error: "Candidatura não encontrada ou fora do seu escopo." };
  }

  // Modelo obrigatório e validado (tenant + setor + ativo) pra qualquer tipo
  // diferente de DISC — cobre num só findFirst tenant errado, setor errado e
  // modelo arquivado.
  let templateName: string | null = null;
  if (type !== "DISC") {
    if (!templateId) return { error: "Selecione um modelo de teste." };
    const template = await prisma.assessmentTemplate.findFirst({
      where: { id: templateId, tenantId: ctx.tenantId, sectorCode: SECTOR, active: true },
      select: { name: true },
    });
    if (!template) return { error: "Modelo de teste não encontrado, fora do seu escopo ou arquivado." };
    templateName = template.name;
  }

  // Um link ativo por vez (pra essa pessoa + candidatura): regenerar invalida
  // o anterior. Só PENDENTE é descartável; RESPONDIDO é histórico permanente.
  await prisma.assessmentLink.deleteMany({ where: { personId, candidaturaId, status: "PENDENTE" } });

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + LINK_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.assessmentLink.create({
    data: {
      tenantId: ctx.tenantId,
      personId,
      candidaturaId,
      sectorCode: SECTOR,
      type,
      templateId: type === "DISC" ? null : templateId,
      token,
      expiresAt,
      createdById: ctx.userId,
    },
  });

  // Envio de e-mail é best-effort — o caminho principal é copiar o link na tela.
  let emailSent = false;
  if (person.email) {
    const result = await sendTesteEmail({
      tenantId: ctx.tenantId,
      to: person.email,
      personName: person.name,
      token,
      testName: templateName ?? undefined,
    });
    emailSent = result.ok;
  }

  if (candidaturaId) {
    const candidatura = await prisma.candidatura.findUnique({ where: { id: candidaturaId }, select: { stage: true, vagaId: true } });
    if (candidatura) {
      if (stageIndex(candidatura.stage) < stageIndex("TESTE")) {
        await prisma.candidatura.update({ where: { id: candidaturaId }, data: { stage: "TESTE" } });
      }
      revalidatePath(`/vagas/${candidatura.vagaId}/candidaturas/${candidaturaId}`);
    }
  }
  revalidatePath(`/candidatos/${personId}`);
  revalidatePath(`/pessoas/${personId}`);
  revalidatePath("/testes");

  return { ok: true, token, expiresAtLabel: formatInstantDate(expiresAt), emailSent };
}

export async function excluirLinkTeste(id: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return;
  if (!canWrite(ctx.role)) return;

  const prisma = getPrisma();
  const link = await prisma.assessmentLink.findFirst({
    where: { id, status: "PENDENTE", ...scopedAssessmentLinkWhere(ctx) },
  });
  if (!link) return;

  await prisma.assessmentLink.delete({ where: { id } });

  revalidatePath(`/candidatos/${link.personId}`);
  revalidatePath(`/pessoas/${link.personId}`);
  revalidatePath("/testes");
  if (link.candidaturaId) {
    const candidatura = await prisma.candidatura.findUnique({ where: { id: link.candidaturaId }, select: { vagaId: true } });
    if (candidatura) revalidatePath(`/vagas/${candidatura.vagaId}/candidaturas/${link.candidaturaId}`);
  }
}
