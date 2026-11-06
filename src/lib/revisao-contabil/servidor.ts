// O banco da Revisão do fechamento (Fase 2, 05/11/2026). Toda consulta leva o
// tenant; quem chama já passou pelo gate do módulo (`podeNoModulo` nas ações,
// `abrirTelaDoModulo` nas telas). As regras puras moram em `fechamento.ts`, e
// o motor em `motor/`.

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { apagarArquivo, guardarArquivo, lerArquivo } from "./armazenamento";
import {
  assinaturas,
  correcoesDoBanco,
  empresaDoMotor,
  ESTADOS_DO_ACHADO,
  fechamentoDoMotor,
  type Acompanhamento,
  type Correcoes,
  type DadosDoFechamento,
  CAMPOS_DA_CORRECAO,
} from "./fechamento";
import { identifier } from "./motor/base";
import { executar, importar, type Execucao } from "./motor/execucao";
import { interpreted } from "./motor/manual";
import type { Fatos } from "./motor/tipos";

type Resultado<T = undefined> = { ok: true; valor: T } | { ok: false; erro: string };

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

const CAMPOS_DA_EMPRESA = { id: true, name: true, displayName: true, cnpj: true, cnaePrincipal: true, taxRegimeKind: true } as const;
const CAMPOS_DO_DOCUMENTO = {
  id: true,
  nome: true,
  sha256: true,
  tamanho: true,
  tipo: true,
  interpretado: true,
  extraidoEm: true,
  ativo: true,
  createdAt: true,
} as const;

// ─── Leitura ─────────────────────────────────────────────────────────────────

export async function listarFechamentos(tenantId: string, filtros: { busca?: string } = {}) {
  const busca = filtros.busca?.trim();
  const digitos = busca?.replace(/\D/g, "") ?? "";
  return getPrisma().revisaoFechamento.findMany({
    where: {
      tenantId,
      ...(busca
        ? {
            company: {
              OR: [
                { name: { contains: busca } },
                { displayName: { contains: busca } },
                ...(digitos.length >= 3 ? [{ cnpj: { contains: digitos } }] : []),
              ],
            },
          }
        : {}),
    },
    orderBy: [{ fim: "desc" }, { createdAt: "desc" }],
    take: 300,
    select: {
      id: true,
      inicio: true,
      fim: true,
      regime: true,
      updatedAt: true,
      company: { select: { id: true, name: true, displayName: true, cnpj: true } },
      _count: { select: { documentos: true } },
      execucoes: { orderBy: { executadaEm: "desc" }, take: 1, select: { id: true, executadaEm: true, achados: true } },
    },
  });
}

/** As empresas que podem abrir fechamento: as em atividade ou em implantação, com CNPJ. */
export async function empresasParaFechamento(tenantId: string) {
  return getPrisma().company.findMany({
    where: { tenantId, status: { in: ["ACTIVE", "PROSPECT"] }, cnpj: { not: null } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, displayName: true, logoUrl: true, cnpj: true, parentCompanyId: true, taxRegimeKind: true },
  });
}

async function fechamentoComEmpresa(tenantId: string, id: string) {
  return getPrisma().revisaoFechamento.findFirst({
    where: { id, tenantId },
    include: { company: { select: CAMPOS_DA_EMPRESA } },
  });
}

/** O fechamento com documentos, a última execução (com o acompanhamento) e se ela ainda vale. */
export async function carregarFechamento(tenantId: string, id: string) {
  const prisma = getPrisma();
  const f = await prisma.revisaoFechamento.findFirst({
    where: { id, tenantId },
    include: {
      company: { select: CAMPOS_DA_EMPRESA },
      documentos: { orderBy: [{ createdAt: "asc" }, { nome: "asc" }], select: CAMPOS_DO_DOCUMENTO },
      execucoes: { orderBy: { executadaEm: "desc" }, take: 10, select: { id: true, executadaEm: true, achados: true, versao: true, executadaPorId: true } },
    },
  });
  if (!f) return null;
  const ultima = f.execucoes[0]
    ? await prisma.revisaoExecucao.findFirst({ where: { id: f.execucoes[0].id, tenantId }, include: { acompanhamentos: true } })
    : null;
  const correcoes = correcoesDoBanco(f.correcoes);
  const empresa = empresaDoMotor(f.company);
  const fechamento = fechamentoDoMotor(f);
  const atual = assinaturas(
    empresa,
    fechamento,
    f.documentos.map((d) => ({ id: d.id, sha256: d.sha256, extraidoEm: d.extraidoEm, ativo: d.ativo })),
    correcoes,
    f.tolerancia,
  );
  const acompanhamento = new Map<string, Acompanhamento>((ultima?.acompanhamentos ?? []).map((a) => [a.achadoId, a]));
  const autores = await nomesDasPessoas(tenantId, [...f.execucoes.map((e) => e.executadaPorId), ...(ultima?.acompanhamentos ?? []).map((a) => a.atualizadoPorId)]);
  return {
    fechamento: f,
    empresa,
    correcoes,
    execucao: ultima ? { id: ultima.id, executadaEm: ultima.executadaEm, resultado: ultima.resultado as unknown as Execucao } : null,
    /** A execução ainda corresponde ao cadastro e às entradas de agora. */
    valida: !!ultima && ultima.assinaturaContexto === atual.contexto && ultima.assinaturaEntradas === atual.entradas,
    acompanhamento,
    autores,
  };
}

async function nomesDasPessoas(tenantId: string, ids: (string | null)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unicos.length) return new Map();
  const pessoas = await getPrisma().user.findMany({ where: { id: { in: unicos }, tenantId }, select: { id: true, name: true } });
  return new Map(pessoas.map((p) => [p.id, p.name]));
}

/** Um documento com o que o motor leu, para conferir a leitura. */
export async function carregarDocumento(tenantId: string, fechamentoId: string, id: string) {
  const d = await getPrisma().revisaoDocumento.findFirst({ where: { id, tenantId, fechamentoId } });
  return d ? { ...d, fatos: d.fatos as unknown as Fatos } : null;
}

/** O arquivo original de um documento, para baixar. */
export async function arquivoDoDocumento(tenantId: string, id: string): Promise<{ nome: string; conteudo: Buffer } | null> {
  const d = await getPrisma().revisaoDocumento.findFirst({ where: { id, tenantId }, select: { nome: true, arquivo: true } });
  if (!d) return null;
  const conteudo = await lerArquivo(tenantId, d.arquivo);
  return conteudo ? { nome: d.nome, conteudo } : null;
}

/** Uma execução com o cadastro e o acompanhamento, para os relatórios. */
export async function carregarExecucao(tenantId: string, id: string) {
  const e = await getPrisma().revisaoExecucao.findFirst({
    where: { id, tenantId },
    include: { acompanhamentos: true, fechamento: { select: { company: { select: { name: true, displayName: true } } } } },
  });
  if (!e) return null;
  return {
    resultado: e.resultado as unknown as Execucao,
    acompanhamento: new Map<string, Acompanhamento>(e.acompanhamentos.map((a) => [a.achadoId, a])),
    nomeDaEmpresa: e.fechamento.company.displayName?.trim() || e.fechamento.company.name,
  };
}

const dataBr = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");

/** "Empresa · 01/01/2026 a 30/06/2026" — o nome do fechamento na auditoria e nos títulos. */
export function rotuloDoFechamento(f: { inicio: Date; fim: Date; company: { name: string; displayName?: string | null } }): string {
  return `${f.company.displayName?.trim() || f.company.name} · ${dataBr(f.inicio)} a ${dataBr(f.fim)}`;
}

/** O rótulo de um fechamento pelo id, para a auditoria. */
export async function rotuloPeloId(tenantId: string, id: string): Promise<string | null> {
  const f = await getPrisma().revisaoFechamento.findFirst({
    where: { id, tenantId },
    select: { inicio: true, fim: true, company: { select: { name: true, displayName: true } } },
  });
  return f ? rotuloDoFechamento(f) : null;
}

// ─── Escrita ─────────────────────────────────────────────────────────────────

export async function criarFechamento(tenantId: string, userId: string, dados: DadosDoFechamento): Promise<Resultado<{ id: string }>> {
  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({ where: { id: dados.companyId, tenantId }, select: { id: true, cnpj: true } });
  if (!empresa) return { ok: false, erro: "Empresa não encontrada." };
  if (!empresa.cnpj) return { ok: false, erro: "A empresa não tem CNPJ no cadastro. A revisão confere o CNPJ dos documentos." };
  const f = await prisma.revisaoFechamento.create({
    data: {
      tenantId,
      companyId: empresa.id,
      inicio: new Date(dados.inicio + "T00:00:00Z"),
      fim: new Date(dados.fim + "T00:00:00Z"),
      regime: dados.regime,
      enquadramento: dados.enquadramento,
      finalidade: dados.finalidade,
      criadoPorId: userId,
    },
    select: { id: true },
  });
  return { ok: true, valor: f };
}

/** Período, regime, enquadramento e finalidade. A empresa não muda: os documentos são dela. */
export async function editarFechamento(tenantId: string, id: string, dados: DadosDoFechamento): Promise<Resultado> {
  const r = await getPrisma().revisaoFechamento.updateMany({
    where: { id, tenantId, companyId: dados.companyId },
    data: {
      inicio: new Date(dados.inicio + "T00:00:00Z"),
      fim: new Date(dados.fim + "T00:00:00Z"),
      regime: dados.regime,
      enquadramento: dados.enquadramento,
      finalidade: dados.finalidade,
    },
  });
  return r.count ? { ok: true, valor: undefined } : { ok: false, erro: "Fechamento não encontrado." };
}

export async function gravarTolerancia(tenantId: string, id: string, centavos: number): Promise<Resultado> {
  const r = await getPrisma().revisaoFechamento.updateMany({ where: { id, tenantId }, data: { tolerancia: centavos } });
  return r.count ? { ok: true, valor: undefined } : { ok: false, erro: "Fechamento não encontrado." };
}

/** Apaga o fechamento, os documentos, as execuções e os arquivos guardados. */
export async function excluirFechamento(tenantId: string, id: string): Promise<Resultado<{ nome: string }>> {
  const prisma = getPrisma();
  const f = await prisma.revisaoFechamento.findFirst({
    where: { id, tenantId },
    select: { inicio: true, fim: true, company: { select: { name: true, displayName: true } }, documentos: { select: { arquivo: true } } },
  });
  if (!f) return { ok: false, erro: "Fechamento não encontrado." };
  await prisma.revisaoFechamento.delete({ where: { id } });
  await Promise.all(f.documentos.map((d) => apagarArquivo(tenantId, d.arquivo)));
  return { ok: true, valor: { nome: rotuloDoFechamento(f) } };
}

/**
 * Lê um arquivo enviado (ou os de um ZIP) pelo motor e guarda cada um. Arquivo
 * que o motor recusa não para os outros: volta na lista de erros, como no original.
 */
export async function importarArquivo(
  tenantId: string,
  userId: string,
  fechamentoId: string,
  nome: string,
  conteudo: Uint8Array,
): Promise<Resultado<{ ids: string[]; erros: { name: string; error: string }[] }>> {
  const f = await fechamentoComEmpresa(tenantId, fechamentoId);
  if (!f) return { ok: false, erro: "Fechamento não encontrado." };
  let lidos: Awaited<ReturnType<typeof importar>>;
  try {
    lidos = await importar(empresaDoMotor(f.company), fechamentoDoMotor(f), nome, conteudo);
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Não deu para ler o arquivo." };
  }
  const prisma = getPrisma();
  const ids: string[] = [];
  // A ordem de chegada é a ordem da análise, como no original: um milissegundo
  // por documento, para os arquivos de um mesmo ZIP não empatarem.
  const agora = Date.now();
  for (const [i, d] of lidos.documents.entries()) {
    const arquivo = await guardarArquivo(tenantId, d.name, d.raw);
    await prisma.revisaoDocumento.create({
      data: {
        id: d.id,
        tenantId,
        fechamentoId,
        nome: d.name.slice(0, 255),
        sha256: d.sha256,
        tamanho: d.size,
        arquivo,
        tipo: d.facts.kind.slice(0, 60),
        interpretado: interpreted(d.facts),
        fatos: json(d.facts),
        extraidoEm: new Date(d.extractedAt),
        enviadoPorId: userId,
        createdAt: new Date(agora + i),
      },
    });
    ids.push(d.id);
  }
  return { ok: true, valor: { ids, erros: lidos.errors } };
}

export async function marcarDocumento(tenantId: string, fechamentoId: string, id: string, ativo: boolean): Promise<Resultado> {
  const r = await getPrisma().revisaoDocumento.updateMany({ where: { id, tenantId, fechamentoId }, data: { ativo } });
  return r.count ? { ok: true, valor: undefined } : { ok: false, erro: "Documento não encontrado." };
}

/** Apaga o documento, o arquivo e as correções de leitura dele. */
export async function excluirDocumento(tenantId: string, fechamentoId: string, id: string): Promise<Resultado<{ nome: string }>> {
  const prisma = getPrisma();
  const d = await prisma.revisaoDocumento.findFirst({ where: { id, tenantId, fechamentoId }, select: { nome: true, arquivo: true } });
  if (!d) return { ok: false, erro: "Documento não encontrado." };
  await prisma.$transaction(async (tx) => {
    await tx.revisaoDocumento.delete({ where: { id } });
    const f = await tx.revisaoFechamento.findUnique({ where: { id: fechamentoId }, select: { correcoes: true } });
    const correcoes = correcoesDoBanco(f?.correcoes);
    const restantes = Object.fromEntries(Object.entries(correcoes).filter(([k]) => !k.startsWith(id + ":")));
    if (Object.keys(restantes).length !== Object.keys(correcoes).length) {
      await tx.revisaoFechamento.update({ where: { id: fechamentoId }, data: { correcoes: json(restantes) } });
    }
  });
  await apagarArquivo(tenantId, d.arquivo);
  return { ok: true, valor: { nome: d.nome } };
}

/**
 * Grava a correção de leitura de uma linha do balancete. Campo vazio tira a
 * correção dele; linha sem campo nenhum sai das correções.
 */
export async function corrigirLeitura(
  tenantId: string,
  fechamentoId: string,
  documentoId: string,
  linha: number,
  campos: Correcoes[string],
): Promise<Resultado> {
  const prisma = getPrisma();
  const d = await carregarDocumento(tenantId, fechamentoId, documentoId);
  if (!d) return { ok: false, erro: "Documento não encontrado." };
  if (!Number.isInteger(linha) || linha < 0 || linha >= (d.fatos.accounts?.length ?? 0)) return { ok: false, erro: "Linha do balancete não encontrada." };
  const f = await prisma.revisaoFechamento.findFirst({ where: { id: fechamentoId, tenantId }, select: { correcoes: true } });
  if (!f) return { ok: false, erro: "Fechamento não encontrado." };
  const correcoes = correcoesDoBanco(f.correcoes);
  const chave = `${documentoId}:${linha}`;
  const limpos = Object.fromEntries(CAMPOS_DA_CORRECAO.filter((k) => typeof campos[k] === "number").map((k) => [k, campos[k]]));
  if (Object.keys(limpos).length) correcoes[chave] = limpos;
  else delete correcoes[chave];
  await prisma.revisaoFechamento.update({ where: { id: fechamentoId }, data: { correcoes: json(correcoes) } });
  return { ok: true, valor: undefined };
}

/** Roda o motor sobre os documentos ativos e guarda a execução. */
export async function executarAnalise(tenantId: string, userId: string, fechamentoId: string): Promise<Resultado<{ id: string; achados: number }>> {
  const prisma = getPrisma();
  const f = await fechamentoComEmpresa(tenantId, fechamentoId);
  if (!f) return { ok: false, erro: "Fechamento não encontrado." };
  const docs = await prisma.revisaoDocumento.findMany({
    where: { tenantId, fechamentoId },
    orderBy: [{ createdAt: "asc" }, { nome: "asc" }],
    select: { id: true, nome: true, sha256: true, tamanho: true, extraidoEm: true, ativo: true, fatos: true },
  });
  const empresa = empresaDoMotor(f.company);
  const fechamento = fechamentoDoMotor(f);
  const correcoes = correcoesDoBanco(f.correcoes);
  let r: Execucao;
  try {
    r = executar({
      company: empresa,
      closing: fechamento,
      documents: docs
        .filter((d) => d.ativo)
        .map((d) => ({
          id: d.id,
          name: d.nome,
          companyId: f.companyId,
          closingId: f.id,
          cnpj: identifier(f.company.cnpj),
          period: [fechamento.start, fechamento.end],
          sha256: d.sha256,
          size: d.tamanho,
          extractedAt: d.extraidoEm.toISOString(),
          facts: d.fatos as unknown as Fatos,
        })),
      corrections: correcoes,
      tolerance: f.tolerancia,
    });
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Não deu para executar a análise." };
  }
  const a = assinaturas(empresa, fechamento, docs, correcoes, f.tolerancia);
  await prisma.revisaoExecucao.create({
    data: {
      id: r.runId,
      tenantId,
      fechamentoId,
      versao: r.version,
      assinaturaContexto: a.contexto,
      assinaturaEntradas: a.entradas,
      resultado: json(r),
      achados: r.findings.length,
      executadaPorId: userId,
      executadaEm: new Date(r.executedAt),
    },
  });
  return { ok: true, valor: { id: r.runId, achados: r.findings.length } };
}

/** Quem cuida, o estado e a nota de um achado da execução. */
export async function gravarAcompanhamento(
  tenantId: string,
  userId: string,
  execucaoId: string,
  achadoId: string,
  dados: { responsavel: string; estado: string; nota: string },
): Promise<Resultado> {
  if (!(ESTADOS_DO_ACHADO as readonly string[]).includes(dados.estado)) return { ok: false, erro: "Escolha o estado do achado." };
  if (dados.responsavel.length > 120) return { ok: false, erro: "O responsável passa de 120 caracteres." };
  if (dados.nota.length > 5000) return { ok: false, erro: "A anotação passa de 5.000 caracteres." };
  const prisma = getPrisma();
  const e = await prisma.revisaoExecucao.findFirst({ where: { id: execucaoId, tenantId }, select: { resultado: true } });
  if (!e) return { ok: false, erro: "Execução não encontrada." };
  const achados = (e.resultado as unknown as Execucao).findings ?? [];
  if (!achados.some((f) => f.id === achadoId)) return { ok: false, erro: "Achado não encontrado nesta execução." };
  const valores = { responsavel: dados.responsavel || null, estado: dados.estado, nota: dados.nota || null, atualizadoPorId: userId };
  await prisma.revisaoAcompanhamento.upsert({
    where: { execucaoId_achadoId: { execucaoId, achadoId } },
    create: { tenantId, execucaoId, achadoId, ...valores },
    update: valores,
  });
  return { ok: true, valor: undefined };
}
