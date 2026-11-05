import "server-only";

// Banco do Planejamento tributário (05/11/2026): listar, ler, criar, salvar,
// lixeira e versões das avaliações — sempre preso ao escritório.
//
// Repete o comportamento do `lib/studies/store.ts` do Connect Tributário:
// - salvar exige a revisão que a tela leu; outra sessão no meio = recusa,
//   sem gravar por cima;
// - cada gravação (criar, salvar, lixeira, restaurar) sobe a revisão e guarda
//   uma foto em `avaliacoes_tributarias_versoes`;
// - avaliação na lixeira não abre nem salva; não há exclusão definitiva.
//
// A permissão (ver/agir) é conferida por quem chama — as ações e as telas.

import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { studySchema, type Study } from "./avaliacao/model";
import { colunasDaAvaliacao, MOTOR_ATUAL, type ModoDaAvaliacao } from "./regras";

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

export const MSG_MUDOU_EM_OUTRA_SESSAO =
  "A avaliação mudou em outra sessão. Recarregue a página e confira antes de salvar.";
export const MSG_NAO_ENCONTRADA = "Avaliação não encontrada.";
export const MSG_NA_LIXEIRA = "A avaliação está na lixeira. Restaure para abrir ou salvar.";

export type ItemDaLista = {
  id: string;
  nome: string;
  cnpj: string | null;
  modo: ModoDaAvaliacao;
  ano: number;
  revisao: number;
  updatedAt: Date;
  naLixeiraEm: Date | null;
  empresa: { id: string; nome: string } | null;
  atualizadoPor: string | null;
};

const LIMITE_DA_LISTA = 500;

export async function listarAvaliacoes(
  tenantId: string,
  filtro: { lixeira: boolean; companyId?: string | null; busca?: string | null },
): Promise<ItemDaLista[]> {
  const busca = filtro.busca?.trim();
  const digitos = busca?.replace(/\D/g, "") ?? "";
  const linhas = await getPrisma().avaliacaoTributaria.findMany({
    where: {
      tenantId,
      naLixeiraEm: filtro.lixeira ? { not: null } : null,
      ...(filtro.companyId ? { companyId: filtro.companyId } : {}),
      ...(busca
        ? { OR: [{ nome: { contains: busca } }, ...(digitos.length >= 3 ? [{ cnpj: { contains: digitos } }] : [])] }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: LIMITE_DA_LISTA,
    select: {
      id: true, nome: true, cnpj: true, modo: true, ano: true, revisao: true, updatedAt: true, naLixeiraEm: true,
      company: { select: { id: true, name: true, displayName: true } },
      atualizadoPor: { select: { name: true } },
    },
  });
  return linhas.map((l) => ({
    id: l.id,
    nome: l.nome,
    cnpj: l.cnpj,
    modo: l.modo === "guiada" ? "guiada" : "rapida",
    ano: l.ano,
    revisao: l.revisao,
    updatedAt: l.updatedAt,
    naLixeiraEm: l.naLixeiraEm,
    empresa: l.company ? { id: l.company.id, nome: l.company.displayName?.trim() || l.company.name } : null,
    atualizadoPor: l.atualizadoPor?.name ?? null,
  }));
}

export type AvaliacaoAberta = {
  id: string;
  revisao: number;
  motor: string;
  estudo: Study;
  companyId: string | null;
  empresa: { id: string; nome: string } | null;
  naLixeiraEm: Date | null;
  createdAt: Date;
  updatedAt: Date;
  atualizadoPor: string | null;
};

/**
 * A avaliação inteira, com os dados passados de novo por `studySchema` — o que
 * já foi gravado é válido, e o parse completa campos que versões novas do
 * modelo acrescentarem com valor padrão.
 */
export async function lerAvaliacao(tenantId: string, id: string): Promise<AvaliacaoAberta | null> {
  const a = await getPrisma().avaliacaoTributaria.findFirst({
    where: { id, tenantId },
    select: {
      id: true, revisao: true, motor: true, dados: true, companyId: true, naLixeiraEm: true, createdAt: true, updatedAt: true,
      company: { select: { id: true, name: true, displayName: true } },
      atualizadoPor: { select: { name: true } },
    },
  });
  if (!a) return null;
  const estudo = studySchema.safeParse(a.dados);
  if (!estudo.success) return null;
  return {
    id: a.id,
    revisao: a.revisao,
    motor: a.motor,
    estudo: estudo.data,
    companyId: a.companyId,
    empresa: a.company ? { id: a.company.id, nome: a.company.displayName?.trim() || a.company.name } : null,
    naLixeiraEm: a.naLixeiraEm,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    atualizadoPor: a.atualizadoPor?.name ?? null,
  };
}

export async function criarAvaliacao(
  tenantId: string,
  userId: string,
  estudo: Study,
  companyId: string | null,
): Promise<{ id: string }> {
  const colunas = colunasDaAvaliacao(estudo);
  return getPrisma().$transaction(async (tx) => {
    const a = await tx.avaliacaoTributaria.create({
      data: {
        tenantId, companyId, ...colunas, dados: json(estudo), motor: MOTOR_ATUAL, revisao: 1,
        criadoPorId: userId || null, atualizadoPorId: userId || null,
      },
      select: { id: true },
    });
    await tx.avaliacaoTributariaVersao.create({
      data: { avaliacaoId: a.id, revisao: 1, acao: "Avaliação criada", dados: json(estudo), motor: MOTOR_ATUAL, autorId: userId || null },
    });
    return a;
  });
}

export type ResultadoDaGravacao = { ok: true; revisao: number } | { ok: false; error: string };

/** Por que a gravação condicional não pegou nenhuma linha. */
async function motivoDaRecusa(tenantId: string, id: string): Promise<string> {
  const a = await getPrisma().avaliacaoTributaria.findFirst({ where: { id, tenantId }, select: { naLixeiraEm: true } });
  if (!a) return MSG_NAO_ENCONTRADA;
  if (a.naLixeiraEm) return MSG_NA_LIXEIRA;
  return MSG_MUDOU_EM_OUTRA_SESSAO;
}

export async function salvarAvaliacao(
  tenantId: string,
  userId: string,
  id: string,
  revisaoLida: number,
  estudo: Study,
): Promise<ResultadoDaGravacao> {
  const colunas = colunasDaAvaliacao(estudo);
  const gravou = await getPrisma().$transaction(async (tx) => {
    const r = await tx.avaliacaoTributaria.updateMany({
      where: { id, tenantId, revisao: revisaoLida, naLixeiraEm: null },
      data: { ...colunas, dados: json(estudo), motor: MOTOR_ATUAL, revisao: revisaoLida + 1, atualizadoPorId: userId || null },
    });
    if (r.count === 0) return false;
    await tx.avaliacaoTributariaVersao.create({
      data: { avaliacaoId: id, revisao: revisaoLida + 1, acao: "Edição da avaliação", dados: json(estudo), motor: MOTOR_ATUAL, autorId: userId || null },
    });
    return true;
  });
  if (!gravou) return { ok: false, error: await motivoDaRecusa(tenantId, id) };
  return { ok: true, revisao: revisaoLida + 1 };
}

/** Lixeira e restauração: sobem a revisão e guardam a foto, como o original. */
export async function mudarLixeira(
  tenantId: string,
  userId: string,
  id: string,
  revisaoLida: number,
  paraLixeira: boolean,
): Promise<ResultadoDaGravacao> {
  const prisma = getPrisma();
  const atual = await prisma.avaliacaoTributaria.findFirst({
    where: { id, tenantId },
    select: { revisao: true, naLixeiraEm: true, dados: true },
  });
  if (!atual) return { ok: false, error: MSG_NAO_ENCONTRADA };
  // Já está onde pediram: nada a fazer (o original também não regrava).
  if (Boolean(atual.naLixeiraEm) === paraLixeira) return { ok: true, revisao: atual.revisao };
  if (atual.revisao !== revisaoLida) return { ok: false, error: MSG_MUDOU_EM_OUTRA_SESSAO };

  const gravou = await prisma.$transaction(async (tx) => {
    const r = await tx.avaliacaoTributaria.updateMany({
      where: { id, tenantId, revisao: revisaoLida, naLixeiraEm: paraLixeira ? null : { not: null } },
      data: { naLixeiraEm: paraLixeira ? new Date() : null, revisao: revisaoLida + 1, atualizadoPorId: userId || null },
    });
    if (r.count === 0) return false;
    await tx.avaliacaoTributariaVersao.create({
      data: {
        avaliacaoId: id,
        revisao: revisaoLida + 1,
        acao: paraLixeira ? "Avaliação movida para a lixeira" : "Avaliação restaurada",
        dados: atual.dados as Prisma.InputJsonValue,
        motor: MOTOR_ATUAL,
        autorId: userId || null,
      },
    });
    return true;
  });
  if (!gravou) return { ok: false, error: MSG_MUDOU_EM_OUTRA_SESSAO };
  return { ok: true, revisao: revisaoLida + 1 };
}

export type VersaoDaLista = { id: string; revisao: number; acao: string; motor: string; createdAt: Date; autor: string | null };

const LIMITE_DE_VERSOES = 50;

export async function versoesDaAvaliacao(tenantId: string, avaliacaoId: string): Promise<VersaoDaLista[]> {
  const linhas = await getPrisma().avaliacaoTributariaVersao.findMany({
    where: { avaliacaoId, avaliacao: { tenantId } },
    orderBy: { revisao: "desc" },
    take: LIMITE_DE_VERSOES,
    select: { id: true, revisao: true, acao: true, motor: true, createdAt: true, autor: { select: { name: true } } },
  });
  return linhas.map((v) => ({ id: v.id, revisao: v.revisao, acao: v.acao, motor: v.motor, createdAt: v.createdAt, autor: v.autor?.name ?? null }));
}

/** Os dados de uma versão, para abrir como rascunho não salvo. */
export async function dadosDaVersao(tenantId: string, avaliacaoId: string, versaoId: string): Promise<Study | null> {
  const v = await getPrisma().avaliacaoTributariaVersao.findFirst({
    where: { id: versaoId, avaliacaoId, avaliacao: { tenantId } },
    select: { dados: true },
  });
  if (!v) return null;
  const estudo = studySchema.safeParse(v.dados);
  return estudo.success ? estudo.data : null;
}

/** A empresa escolhida existe neste escritório? (O id vem da tela.) */
export async function empresaParaAvaliacao(tenantId: string, companyId: string) {
  return getPrisma().company.findFirst({
    where: { id: companyId, tenantId },
    select: { id: true, name: true, displayName: true, cnpj: true, taxRegimeKind: true, stateCode: true, city: true },
  });
}
