// Triagem de currículos (R1) no servidor: requisitos da vaga, leitura do
// currículo, pontuação de uma candidatura e a fila do lote. As regras de nota
// estão em ./triagem (puras e testadas); as chamadas de IA em src/lib/ai.ts.

import { readFile } from "fs/promises";
import path from "path";
import { getPrisma } from "@/lib/prisma";
import { avaliarRequisitos, extrairPerfilProfissional } from "@/lib/ai";
import {
  calcularNota,
  normalizarPerfil,
  normalizarRequisitos,
  type Faixa,
  type PerfilProfissional,
  type Requisito,
  type Requisitos,
} from "./triagem";

const RESUMES_DIR = path.join(process.cwd(), "storage", "resumes");
const DOCUMENTS_DIR = path.join(process.cwd(), "storage", "documents");

export type RequisitosDaVaga = Requisitos & { id: string; versao: number; createdAt: Date };

export async function requisitosAtuais(tenantId: string, vagaId: string): Promise<RequisitosDaVaga | null> {
  const row = await getPrisma().vagaRequisitos.findFirst({
    where: { tenantId, vagaId },
    orderBy: { versao: "desc" },
  });
  if (!row) return null;
  return {
    id: row.id,
    versao: row.versao,
    createdAt: row.createdAt,
    itens: row.itens as Requisito[],
    corteCompativel: row.corteCompativel,
    corteParcial: row.corteParcial,
  };
}

/** Grava os requisitos como versão nova. As notas antigas seguem apontando para a versão delas. */
export async function salvarRequisitos(tenantId: string, vagaId: string, userId: string, dados: unknown) {
  const req = normalizarRequisitos(dados);
  if ("erro" in req) return req;
  const prisma = getPrisma();
  const atual = await requisitosAtuais(tenantId, vagaId);
  if (atual && JSON.stringify([atual.itens, atual.corteCompativel, atual.corteParcial]) === JSON.stringify([req.itens, req.corteCompativel, req.corteParcial])) {
    return { versao: atual.versao, igual: true as const };
  }
  const row = await prisma.vagaRequisitos.create({
    data: {
      tenantId,
      vagaId,
      versao: (atual?.versao ?? 0) + 1,
      itens: req.itens,
      corteCompativel: req.corteCompativel,
      corteParcial: req.corteParcial,
      createdById: userId,
    },
    select: { versao: true },
  });
  return { versao: row.versao, igual: false as const };
}

/** O PDF da candidatura; na falta, o último currículo em PDF anexado à pessoa. */
async function lerCurriculo(tenantId: string, c: { resumeUrl: string | null; personId: string }): Promise<string | null> {
  let arquivo: string | null = null;
  // resumeUrl e fileUrl são gerados pelo servidor (tenant/uuid.pdf), nunca vêm do candidato.
  if (c.resumeUrl) arquivo = path.join(RESUMES_DIR, c.resumeUrl);
  else {
    const doc = await getPrisma().document.findFirst({
      where: { tenantId, entityType: "PERSON", entityId: c.personId, category: "CURRICULO", mimeType: "application/pdf" },
      orderBy: { createdAt: "desc" },
      select: { fileUrl: true },
    });
    if (doc) arquivo = path.join(DOCUMENTS_DIR, doc.fileUrl);
  }
  if (!arquivo) return null;
  try {
    return (await readFile(arquivo)).toString("base64");
  } catch {
    return null;
  }
}

export type ResultadoDaPontuacao = { ok: true; score: number; faixa: Faixa } | { ok: false; erro: string };

/**
 * Pontua uma candidatura contra os requisitos atuais da vaga. O perfil
 * profissional é extraído uma vez e guardado; depois só a pontuação roda.
 */
export async function pontuarCandidatura(p: {
  tenantId: string;
  candidaturaId: string;
  requisitos: RequisitosDaVaga;
  userId: string;
  origem: "USUARIO" | "LOTE";
}): Promise<ResultadoDaPontuacao> {
  const prisma = getPrisma();
  const c = await prisma.candidatura.findFirst({
    where: { id: p.candidaturaId, tenantId: p.tenantId },
    select: { id: true, personId: true, resumeUrl: true, perfilProfissional: true },
  });
  if (!c) return { ok: false, erro: "Candidatura não encontrada." };
  const contexto = { trigger: "USUARIO" as const, userId: p.userId, entityType: "candidatura", entityId: c.id };

  try {
    let perfil: PerfilProfissional;
    if (c.perfilProfissional) perfil = normalizarPerfil(c.perfilProfissional);
    else {
      const pdf = await lerCurriculo(p.tenantId, c);
      if (!pdf) return { ok: false, erro: "Sem currículo em PDF." };
      perfil = await extrairPerfilProfissional(p.tenantId, pdf, contexto);
      await prisma.candidatura.update({ where: { id: c.id }, data: { perfilProfissional: perfil, perfilProfissionalEm: new Date() } });
    }

    const ia = await avaliarRequisitos(p.tenantId, { perfil, requisitos: p.requisitos }, contexto);
    const nota = calcularNota(p.requisitos, ia.avaliacoes);
    await prisma.candidaturaNota.create({
      data: {
        tenantId: p.tenantId,
        candidaturaId: c.id,
        requisitosId: p.requisitos.id,
        score: nota.score,
        faixa: nota.faixa,
        avaliacoes: ia.avaliacoes,
        resumo: ia.resumo || null,
        origem: p.origem,
        createdById: p.userId,
      },
    });
    return { ok: true, score: nota.score, faixa: nota.faixa };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message.slice(0, 200) : "Falha ao pontuar." };
  }
}

/**
 * Candidaturas da vaga que entram no lote: em andamento, com currículo em
 * algum lugar. `pendentes` = ainda sem nota na versão atual dos requisitos;
 * `todas` = reprocessar a vaga inteira (a nota anterior fica no histórico).
 */
export async function filaDoLote(tenantId: string, vagaId: string, requisitosId: string, modo: "pendentes" | "todas"): Promise<{ id: string; nome: string }[]> {
  const cands = await getPrisma().candidatura.findMany({
    where: {
      tenantId,
      vagaId,
      status: "EM_ANDAMENTO",
      ...(modo === "pendentes" ? { notas: { none: { requisitosId } } } : {}),
    },
    select: { id: true, person: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return cands.map((c) => ({ id: c.id, nome: c.person.name }));
}
