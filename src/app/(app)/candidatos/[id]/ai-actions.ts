"use server";

import { readFile } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { extractResumeData, isAiConfigured } from "@/lib/ai";
import { logAudit } from "@/lib/audit";

export type AiExtractState = { error: string } | { filled: string[]; summary: string } | null;

const RESUMES_DIR = path.join(process.cwd(), "storage", "resumes");
const DOCUMENTS_DIR = path.join(process.cwd(), "storage", "documents");

// Acha o currículo mais recente do candidato: candidatura do portal
// (Candidatura.resumeUrl) ou upload interno (Document categoria CURRICULO, PDF).
async function findResumePath(tenantId: string, personId: string): Promise<string | null> {
  const prisma = getPrisma();

  const candidatura = await prisma.candidatura.findFirst({
    where: { tenantId, personId, resumeUrl: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { resumeUrl: true },
  });
  if (candidatura?.resumeUrl) return path.join(RESUMES_DIR, candidatura.resumeUrl);

  const doc = await prisma.document.findFirst({
    where: { tenantId, entityType: "PERSON", entityId: personId, category: "CURRICULO", mimeType: "application/pdf" },
    orderBy: { createdAt: "desc" },
    select: { fileUrl: true },
  });
  if (doc) return path.join(DOCUMENTS_DIR, doc.fileUrl);

  return null;
}

export async function extrairDadosCurriculo(personId: string): Promise<AiExtractState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão." };
  if (!(await isAiConfigured(ctx.tenantId))) {
    return { error: "IA não configurada. Cadastre uma chave em Integrações → Inteligência Artificial." };
  }

  const prisma = getPrisma();
  const person = await prisma.person.findFirst({
    where: { id: personId, tenantId: ctx.tenantId, type: "CANDIDATO" },
  });
  if (!person) return { error: "Candidato não encontrado." };

  const resumePath = await findResumePath(ctx.tenantId, personId);
  if (!resumePath) {
    return { error: "Nenhum currículo em PDF encontrado (candidatura do portal ou documento categoria Currículo)." };
  }

  let pdfBase64: string;
  try {
    pdfBase64 = (await readFile(resumePath)).toString("base64");
  } catch {
    return { error: "Arquivo do currículo não encontrado no armazenamento." };
  }

  let extraction;
  try {
    extraction = await extractResumeData(ctx.tenantId, pdfBase64);
  } catch (err) {
    console.error("[extrairDadosCurriculo]", err);
    return { error: err instanceof Error ? err.message : "Erro ao processar o currículo com IA." };
  }

  // Só preenche campo vazio — a IA nunca sobrescreve dado digitado por gente.
  const updates: Record<string, string> = {};
  const filled: string[] = [];
  const candidates: Array<[keyof typeof extraction, string, string | null]> = [
    ["email", "E-mail", person.email],
    ["phone", "Telefone", person.phone],
    ["city", "Cidade", person.city],
    ["stateCode", "UF", person.stateCode],
    ["education", "Escolaridade", person.education],
  ];
  for (const [key, label, current] of candidates) {
    const value = extraction[key];
    if (!current && typeof value === "string" && value.trim()) {
      updates[key] = key === "stateCode" ? value.trim().toUpperCase().slice(0, 2) : value.trim();
      filled.push(label);
    }
  }

  if (Object.keys(updates).length > 0) {
    await prisma.person.update({ where: { id: personId }, data: updates });
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "ai.resumeExtract",
    entityType: "Person",
    entityId: personId,
    metadata: { filled },
  });

  revalidatePath(`/candidatos/${personId}`);
  return { filled, summary: extraction.summary };
}
