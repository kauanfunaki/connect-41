"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { sendAdmissaoEmail } from "@/lib/email/sendMail";
import { formatInstantDate } from "@/lib/format";

const LINK_TTL_DAYS = 7;

export type GerarLinkResult =
  | { error: string }
  | { ok: true; token: string; expiresAtLabel: string; emailSent: boolean };

async function assertColaboradorEmAdmissao(personId: string, ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  const prisma = getPrisma();
  return prisma.person.findFirst({
    where: { id: personId, type: "COLABORADOR", ...(await scopedPersonWhere(ctx)) },
    select: { id: true, name: true, email: true, employmentStatus: true, currentCompany: { select: { name: true } } },
  });
}

export async function gerarLinkAdmissao(personId: string): Promise<GerarLinkResult> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para gerar link de admissão." };

  const person = await assertColaboradorEmAdmissao(personId, ctx);
  if (!person) return { error: "Colaborador não encontrado ou fora do seu escopo." };
  if (person.employmentStatus !== "ADMISSAO_EM_ANDAMENTO") {
    return { error: "O link de admissão só pode ser gerado enquanto a admissão está em andamento." };
  }

  const prisma = getPrisma();
  // Um link ativo por vez: regenerar invalida o anterior (novo token). Os dados
  // já submetidos ficam no Person — o link é só o gate, então trocá-lo não perde
  // nada. Só um CONCLUIDO é preservado (histórico).
  await prisma.admissaoLink.deleteMany({ where: { personId, status: { not: "CONCLUIDO" } } });

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + LINK_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.admissaoLink.create({
    data: { tenantId: ctx.tenantId, personId, token, expiresAt, createdById: ctx.userId },
  });

  // Envio de e-mail é best-effort — o caminho principal é copiar o link na tela.
  let emailSent = false;
  if (person.email) {
    const result = await sendAdmissaoEmail({
      tenantId: ctx.tenantId,
      to: person.email,
      personName: person.name,
      token,
      companyName: person.currentCompany?.name ?? null,
    });
    emailSent = result.ok;
  }

  revalidatePath(`/pessoas/${personId}`);
  return { ok: true, token, expiresAtLabel: formatInstantDate(expiresAt), emailSent };
}

export async function concluirAdmissao(personId: string): Promise<{ error: string } | null> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para concluir a admissão." };

  const person = await assertColaboradorEmAdmissao(personId, ctx);
  if (!person) return { error: "Colaborador não encontrado ou fora do seu escopo." };

  const prisma = getPrisma();
  const link = await prisma.admissaoLink.findFirst({
    where: { personId, tenantId: ctx.tenantId, status: "PREENCHIDO" },
    orderBy: { submittedAt: "desc" },
  });
  if (!link) {
    return { error: "A admissão ainda não foi preenchida pelo colaborador." };
  }

  await prisma.$transaction([
    prisma.person.update({ where: { id: personId }, data: { employmentStatus: "ATIVO" } }),
    prisma.admissaoLink.update({ where: { id: link.id }, data: { status: "CONCLUIDO" } }),
  ]);

  revalidatePath(`/pessoas/${personId}`);
  return null;
}
