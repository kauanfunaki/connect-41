// Triagem de currículos (R1) no servidor: requisitos da vaga, leitura do
// currículo, pontuação de uma candidatura e a fila do lote. As regras de nota
// estão em ./triagem (puras e testadas); as chamadas de IA em src/lib/ai.ts.

import { readFile } from "fs/promises";
import path from "path";
import { getPrisma } from "@/lib/prisma";
import { avaliarRequisitos, extrairPerfilProfissional, isAiConfigured } from "@/lib/ai";
import {
  calcularNota,
  ehBloqueioDoAgente,
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

/**
 * O PDF da candidatura; se ele não existir no disco, o último currículo em PDF
 * anexado à pessoa. A segunda tentativa não é só para quem não tem
 * `resumeUrl`: até 23/09 a pasta de currículos não tinha volume e cada deploy
 * apagava o arquivo, deixando a candidatura com um caminho que não abre.
 */
async function lerCurriculo(tenantId: string, c: { resumeUrl: string | null; personId: string }): Promise<string | null> {
  const ler = async (arquivo: string) => {
    try {
      return (await readFile(arquivo)).toString("base64");
    } catch {
      return null;
    }
  };
  // resumeUrl e fileUrl são gerados pelo servidor (tenant/uuid.pdf), nunca vêm do candidato.
  if (c.resumeUrl) {
    const pdf = await ler(path.join(RESUMES_DIR, c.resumeUrl));
    if (pdf) return pdf;
  }
  const doc = await getPrisma().document.findFirst({
    where: { tenantId, entityType: "PERSON", entityId: c.personId, category: "CURRICULO", mimeType: "application/pdf" },
    orderBy: { createdAt: "desc" },
    select: { fileUrl: true },
  });
  return doc ? ler(path.join(DOCUMENTS_DIR, doc.fileUrl)) : null;
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
  /** Nulo na pontuação automática (cron). */
  userId: string | null;
  origem: "USUARIO" | "LOTE" | "AUTO";
}): Promise<ResultadoDaPontuacao> {
  const prisma = getPrisma();
  const c = await prisma.candidatura.findFirst({
    where: { id: p.candidaturaId, tenantId: p.tenantId },
    select: { id: true, personId: true, resumeUrl: true, perfilProfissional: true },
  });
  if (!c) return { ok: false, erro: "Candidatura não encontrada." };
  const contexto = {
    trigger: p.origem === "AUTO" ? ("CRON" as const) : ("USUARIO" as const),
    userId: p.userId,
    entityType: "candidatura",
    entityId: c.id,
  };

  try {
    let perfil: PerfilProfissional;
    if (c.perfilProfissional) perfil = normalizarPerfil(c.perfilProfissional);
    else {
      const pdf = await lerCurriculo(p.tenantId, c);
      if (!pdf) {
        await registrarFalha(c.id, "Sem currículo em PDF.");
        return { ok: false, erro: "Sem currículo em PDF." };
      }
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
    await prisma.candidatura.update({ where: { id: c.id }, data: { triagemFalha: null, triagemFalhaEm: null } });
    return { ok: true, score: nota.score, faixa: nota.faixa };
  } catch (err) {
    const erro = err instanceof Error ? err.message.slice(0, 200) : "Falha ao pontuar.";
    await registrarFalha(c.id, erro);
    return { ok: false, erro };
  }
}

/** Guarda a falha para o cron não insistir — menos quando o bloqueio é do agente, não do currículo. */
async function registrarFalha(candidaturaId: string, erro: string) {
  if (ehBloqueioDoAgente(erro)) return;
  await getPrisma().candidatura.update({ where: { id: candidaturaId }, data: { triagemFalha: erro.slice(0, 200), triagemFalhaEm: new Date() } });
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

// ─── Pontuação automática (cron) ───────────────────────────────────────────

/**
 * Candidaturas por rodada do cron. Cada uma são até duas chamadas de IA; com o
 * n8n chamando a cada 5 minutos, 8 por rodada dão ~2 mil por dia — folga sobre
 * os ~200 currículos diários do Recrutamento, sem segurar a requisição.
 */
const POR_RODADA = 8;

/**
 * Tempo da rodada. Com modelo lento (o `gpt-5-nano` do teste de 23/09 levou
 * ~45 s por chamada, duas por candidatura) 8 candidaturas passariam dos 5
 * minutos entre rodadas e do tempo de espera do n8n. Passado o orçamento, a
 * rodada não começa candidatura nova — a que está em curso termina.
 */
const ORCAMENTO_DA_RODADA_MS = 3 * 60_000;

/** Uma instância do app, e a rodada não pode se sobrepor à anterior: duas pontuariam a mesma candidatura. */
let rodando = false;

export type RodadaAutomatica = { pontuadas: number; falhas: number; tenantsBloqueados: number; ocupado?: true };

/**
 * Pontua as candidaturas novas: em andamento, **sem nenhuma nota**, sem falha
 * registrada, em vaga aberta que já tem requisitos. Mudar o requisito da vaga
 * não entra aqui — reprocessar é um clique, para não gastar sem ninguém pedir.
 */
export async function pontuarNovasCandidaturas(): Promise<RodadaAutomatica> {
  if (rodando) return { pontuadas: 0, falhas: 0, tenantsBloqueados: 0, ocupado: true };
  rodando = true;
  try {
    const prisma = getPrisma();
    const fila = await prisma.candidatura.findMany({
      where: {
        status: "EM_ANDAMENTO",
        triagemFalhaEm: null,
        notas: { none: {} },
        vaga: { status: { in: ["ABERTA", "EM_ANDAMENTO"] }, requisitos: { some: {} } },
      },
      orderBy: { createdAt: "asc" },
      take: POR_RODADA * 3, // folga para pular tenants sem IA sem nova consulta
      select: { id: true, tenantId: true, vagaId: true },
    });

    const iaDoTenant = new Map<string, boolean>();
    const requisitosDaVaga = new Map<string, RequisitosDaVaga | null>();
    const bloqueados = new Set<string>();
    let pontuadas = 0;
    let falhas = 0;
    let tentadas = 0;
    const inicio = Date.now();

    for (const c of fila) {
      if (tentadas >= POR_RODADA || Date.now() - inicio > ORCAMENTO_DA_RODADA_MS) break;
      if (bloqueados.has(c.tenantId)) continue;
      if (!iaDoTenant.has(c.tenantId)) iaDoTenant.set(c.tenantId, await isAiConfigured(c.tenantId));
      if (!iaDoTenant.get(c.tenantId)) continue;
      if (!requisitosDaVaga.has(c.vagaId)) requisitosDaVaga.set(c.vagaId, await requisitosAtuais(c.tenantId, c.vagaId));
      const requisitos = requisitosDaVaga.get(c.vagaId);
      if (!requisitos) continue;

      tentadas++;
      const r = await pontuarCandidatura({ tenantId: c.tenantId, candidaturaId: c.id, requisitos, userId: null, origem: "AUTO" });
      if (r.ok) pontuadas++;
      else {
        falhas++;
        if (ehBloqueioDoAgente(r.erro)) bloqueados.add(c.tenantId);
      }
    }
    return { pontuadas, falhas, tenantsBloqueados: bloqueados.size };
  } finally {
    rodando = false;
  }
}
