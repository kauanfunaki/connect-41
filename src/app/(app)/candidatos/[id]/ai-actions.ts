"use server";

import { readFile } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { extractResumeData, isAiConfigured } from "@/lib/ai";
import { logAudit } from "@/lib/audit";
import { lerArquivoDoDocumentoDaFicha } from "@/lib/documents";
import {
  escolherCurriculo,
  guardarResumoDoCurriculo,
  nomeDoCurriculoDoPortal,
  type CurriculoEscolhido,
} from "@/lib/recrutamento/curriculoDoCandidato";

export type AiExtractState =
  | { error: string }
  | {
      filled: string[];
      summary: string;
      /** Quando foi lido (ISO) — o bloco mostra "lido em dd/mm". */
      readAt: string;
      /** Se o resumo ficou guardado (sem a tabela nova, não fica). */
      guardado: boolean;
    }
  | null;

const RESUMES_DIR = path.join(process.cwd(), "storage", "resumes");

/** O currículo da pessoa — o mesmo que o bloco "Currículo" da ficha mostra. */
async function acharCurriculo(tenantId: string, personId: string): Promise<CurriculoEscolhido | null> {
  const prisma = getPrisma();
  const [candidaturas, documentos] = await Promise.all([
    prisma.candidatura.findMany({
      where: { tenantId, personId, resumeUrl: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, vaga: { select: { title: true } } },
    }),
    prisma.document.findMany({
      where: { tenantId, entityType: "PERSON", entityId: personId, category: "CURRICULO" },
      orderBy: { createdAt: "desc" },
      select: { id: true, fileName: true, fileUrl: true, mimeType: true, createdAt: true, uploadedBy: { select: { name: true } } },
    }),
  ]);
  return escolherCurriculo(
    candidaturas.map((c) => ({ candidaturaId: c.id, vagaTitulo: c.vaga.title, em: c.createdAt })),
    documentos.map((d) => ({
      documentId: d.id,
      fileName: d.fileName,
      fileUrl: d.fileUrl,
      mimeType: d.mimeType,
      enviadoPor: d.uploadedBy.name,
      em: d.createdAt,
    }))
  );
}

/** O conteúdo do PDF escolhido, ou null se o arquivo sumiu do armazenamento. */
async function lerPdf(tenantId: string, curriculo: CurriculoEscolhido): Promise<Buffer | null> {
  if (curriculo.tipo === "documento") return lerArquivoDoDocumentoDaFicha(curriculo.fileUrl);
  const prisma = getPrisma();
  const c = await prisma.candidatura.findFirst({
    where: { id: curriculo.candidaturaId, tenantId },
    select: { resumeUrl: true },
  });
  if (!c?.resumeUrl) return null;
  // resumeUrl é sempre "<tenantId>/<uuid>.pdf", gravado pela rota de candidatura
  // do portal; a conferência de prefixo segura um valor adulterado no banco.
  const alvo = path.resolve(RESUMES_DIR, c.resumeUrl);
  if (!alvo.startsWith(path.resolve(RESUMES_DIR) + path.sep)) return null;
  try {
    return await readFile(alvo);
  } catch {
    return null;
  }
}

/**
 * "Ler com IA" (antes "Analisar currículo"): lê o PDF do currículo, preenche os
 * campos vazios da ficha e escreve um resumo profissional — que, desde
 * 14/10/2026, fica guardado e aparece no bloco Currículo depois de recarregar.
 */
export async function extrairDadosCurriculo(personId: string): Promise<AiExtractState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!(await podeNoModulo(ctx, "recrutamento_candidatos", "gerir"))) return { error: "Sem permissão." };
  if (!(await isAiConfigured(ctx.tenantId))) {
    return { error: "IA não configurada. Cadastre uma chave em Integrações → Inteligência artificial." };
  }

  const prisma = getPrisma();
  const person = await prisma.person.findFirst({
    where: { id: personId, tenantId: ctx.tenantId, type: "CANDIDATO" },
  });
  if (!person) return { error: "Candidato não encontrado." };

  const curriculo = await acharCurriculo(ctx.tenantId, personId);
  if (!curriculo) {
    return { error: "Nenhum currículo encontrado. Anexe o currículo em PDF na ficha, ou ele vem com a candidatura do portal." };
  }
  if (!curriculo.pdf) {
    return { error: "A IA só lê currículo em PDF. Anexe o currículo em PDF na ficha." };
  }

  const arquivo = await lerPdf(ctx.tenantId, curriculo);
  if (!arquivo) return { error: "Arquivo do currículo não encontrado no armazenamento." };
  const pdfBase64 = arquivo.toString("base64");

  let extraction;
  try {
    extraction = await extractResumeData(ctx.tenantId, pdfBase64, {
      userId: ctx.userId,
      entityType: "pessoa",
      entityId: personId,
    });
  } catch (err) {
    console.error("[extrairDadosCurriculo]", err);
    return { error: err instanceof Error ? err.message : "Erro ao processar o currículo com IA." };
  }

  // Só preenche campo vazio — a IA nunca sobrescreve dado digitado por gente.
  // maxLength bate com a coluna do banco (VARCHAR) — trunca defensivamente
  // mesmo com o structured output, porque o schema JSON não garante tamanho.
  const updates: Record<string, string> = {};
  const filled: string[] = [];
  const candidates: Array<[keyof typeof extraction, string, string | null, number]> = [
    ["email", "E-mail", person.email, 120],
    ["phone", "Telefone", person.phone, 30],
    ["city", "Cidade", person.city, 80],
    ["stateCode", "UF", person.stateCode, 2],
    ["education", "Escolaridade", person.education, 80],
  ];
  for (const [key, label, current, maxLength] of candidates) {
    const value = extraction[key];
    if (!current && typeof value === "string" && value.trim()) {
      const trimmed = value.trim().slice(0, maxLength);
      updates[key] = key === "stateCode" ? trimmed.toUpperCase() : trimmed;
      filled.push(label);
    }
  }

  try {
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
  } catch (err) {
    console.error("[extrairDadosCurriculo] falha ao salvar", err);
    return { error: "IA extraiu os dados, mas houve um erro ao salvar na ficha. Tente novamente." };
  }

  const guardado = await guardarResumoDoCurriculo(prisma, {
    tenantId: ctx.tenantId,
    personId,
    summary: extraction.summary,
    filledFields: filled,
    fonte: curriculo,
    nomeDoArquivo: curriculo.tipo === "documento" ? curriculo.fileName : nomeDoCurriculoDoPortal(person.name),
  });

  revalidatePath(`/candidatos/${personId}`);
  return { filled, summary: extraction.summary, readAt: new Date().toISOString(), guardado };
}
