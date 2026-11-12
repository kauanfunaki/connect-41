import "server-only";

// A conferência do financeiro (Bloco B, Fase B4, 12/11/2026): porte de `FinanceiroService`
// (`src/domain/conciliacao_bancaria/financeiro.py`). As conferências, a montagem do snapshot e a
// validação dos vínculos são as funções puras de `conciliacao/financeiro.ts`; aqui ficam as leituras,
// as gravações, os originais em disco e a versão otimista.
//
// - Nada dos módulos de origem é escrito: extrato, lançamentos e NEO só são lidos.
// - `snapshot`, `financeiroIds` e `comparacaoIds` são gravados com as chaves e os valores do original
//   (snake_case), para a carga copiar sem conversão. A tela recebe a forma de `financeiroTipos.ts`.
// - Versão otimista: toda alteração é um `updateMany` que exige a versão que a tela viu e a análise
//   viva; se outra pessoa mudou antes, nada é gravado e a recusa é VERSAO_DESATUALIZADA.
// - Os originais ficam em disco (`originaisFinanceiro.ts`), não no banco. O arquivo é gravado dentro
//   da transação, depois de a versão avançar, e apagado se a transação não vingar.
// - Auditoria: a rota registra (`logAudit`). Cada escrita devolve `auditoria` com a ação e os mesmos
//   dados do `_auditar` do original. O lote de sugestões, que no original gravava uma auditoria por
//   vínculo, devolve uma só, com a lista (`vinculos`).

import { createHash, randomUUID } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { corta } from "@/lib/revisao-contabil/motor/py";
import { reescala, texto } from "../motor/decimal";
import {
  ANALISE_MUDOU,
  ANALISE_NAO_ENCONTRADA,
  analiseParaTela,
  antesDaLeitura,
  ARQUIVO_REPETIDO,
  conferirDesfazer,
  conferirOriginal,
  conferirSugestoes,
  CONTA_ATIVA_NAO_ENCONTRADA,
  criacaoDaAnalise,
  dadosDoVinculoCriado,
  identidadeDoExtrato,
  incorporarDocumento,
  mediaTypeDoNome,
  nomeDoArquivo,
  ORIGINAL_NAO_ENCONTRADO,
  RESPONSAVEL_PADRAO,
  sugestoesParaTela,
  sugestoesParaValidar,
  TIPOS_DE_COMPARACAO,
  validarLote,
  validarVinculo,
  VERSAO_DESATUALIZADA,
  type LeituraDoDocumento,
  type RecusaFinanceiro,
  type ResultadoFinanceiro,
  type SnapshotFinanceiroPy,
  type SugestoesPy,
  type VinculoGravadoPy,
  type VinculoValidado,
} from "../conciliacao/financeiro";
import type {
  AnaliseFinanceiro,
  DesfazerVinculoFinanceiro,
  ListaAnalisesFinanceiro,
  NovaAnaliseFinanceiro,
  NovoVinculoFinanceiro,
  RenomearAnaliseFinanceiro,
  ResumoAnaliseFinanceiro,
  SugestoesEmLote,
  SugestoesFinanceiro,
  TipoComparacao,
  TipoDocumentoFinanceiro,
  VinculoFinanceiro,
} from "../conciliacao/financeiroTipos";
import { FinanceiroInvalido, lerFinanceiro, validarConteudo } from "../conciliacao/financeiroDocumentos";
import { sugerir } from "../conciliacao/sugestoesFinanceiro";
import { ExtratoDetalhadoInvalido, lerExtratoDetalhado } from "../conciliacao/extratoDetalhado";
import { lerRazaoDoArquivo } from "../conciliacao/razaoPdf";
import { RazaoInvalido } from "../conciliacao/razaoTipos";
import { lerSispag, SispagInvalido } from "../conciliacao/sispag";
import {
  desfazerVinculoFinanceiroSchema,
  excluirAnaliseSchema,
  novaAnaliseSchema,
  novoVinculoFinanceiroSchema,
  renomearAnaliseSchema,
  sugestoesEmLoteSchema,
  versaoSchema,
} from "../entradasFinanceiro";
import { descricaoDaAgencia } from "./cadastros";
import { apagarOriginal, chaveDoOriginal, gravarOriginal, lerOriginal } from "./originaisFinanceiro";
import { lerExtrato } from "./revisao";
import { dataDoDia, decDoBanco, dia, ehDuplicado, empresaDoTenant, NAO_ENCONTRADA, paraBanco } from "./base";

export type { ResultadoFinanceiro } from "../conciliacao/financeiro";

/** O que a rota passa ao `logAudit` (entidade: a análise). */
export type AuditoriaDoFinanceiro = { acao: string; dados: Record<string, unknown> };
/** O resultado de toda escrita: a análise como a tela a mostra (nula na exclusão) e a auditoria. */
export type EscritaDoFinanceiro = { analise: AnaliseFinanceiro | null; auditoria: AuditoriaDoFinanceiro | null };

/** As ações registradas, com a do original ao lado. */
export const ACOES_DO_FINANCEIRO = {
  /** `financeiro.analise_criada` */
  criada: "contabil.core.financeiro.analise.criada",
  /** `financeiro.analise_renomeada` */
  renomeada: "contabil.core.financeiro.analise.renomeada",
  /** `financeiro.analise_excluida` */
  excluida: "contabil.core.financeiro.analise.excluida",
  /** `financeiro.documento_adicionado` */
  documento: "contabil.core.financeiro.documento.adicionado",
  /** `financeiro.vinculo_criado` (uma conferência) */
  confirmado: "contabil.core.financeiro.vinculo.confirmado",
  /** `financeiro.vinculo_criado`, uma por sugestão do lote: aqui, um registro com a lista */
  confirmados: "contabil.core.financeiro.vinculos.confirmados",
  /** `financeiro.vinculo_desfeito` */
  desfeito: "contabil.core.financeiro.vinculo.desfeito",
} as const;

type Db = Prisma.TransactionClient | ReturnType<typeof getPrisma>;

/** Transações grandes (20 mil linhas no snapshot) passam do limite padrão de 5 s do Prisma. */
const OPCOES_DA_TRANSACAO = { timeout: 60_000 };

const empresaNaoEncontrada = (): RecusaFinanceiro => ({ ok: false, erro: NAO_ENCONTRADA, codigo: "NAO_ENCONTRADA" });
const analiseNaoEncontrada = (): RecusaFinanceiro => ({ ok: false, erro: ANALISE_NAO_ENCONTRADA, codigo: "NAO_ENCONTRADA" });
const contaNaoEncontrada = (): RecusaFinanceiro => ({ ok: false, erro: CONTA_ATIVA_NAO_ENCONTRADA, codigo: "NAO_ENCONTRADA" });
const versaoDesatualizada = (): RecusaFinanceiro => ({ ok: false, erro: VERSAO_DESATUALIZADA, codigo: "VERSAO_DESATUALIZADA" });
const entradaInvalida = (e: { issues: { message: string }[] }): RecusaFinanceiro => ({ ok: false, erro: e.issues[0]?.message ?? "Dados inválidos." });

const json = (v: unknown) => v as Prisma.InputJsonValue;
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

// ─── Leituras ───────────────────────────────────────────────────────────────

type LinhaDaAnalise = NonNullable<Awaited<ReturnType<typeof lerAnalise>>>;

/** `_obter`: a análise viva desta empresa e deste tenant. */
function lerAnalise(db: Db, tenantId: string, empresaId: string, analiseId: string) {
  return db.coreFinanceiroAnalise.findFirst({ where: { id: analiseId, tenantId, empresaId, deletedAt: null } });
}

/** `_vinculos`: os vivos, em ordem de criação. */
function lerVinculos(db: Db, tenantId: string, empresaId: string, analiseId: string) {
  return db.coreFinanceiroVinculo.findMany({
    where: { analiseId, tenantId, empresaId, deletedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

type VinculoDoBanco = Awaited<ReturnType<typeof lerVinculos>>[number];

const vinculoPy = (v: VinculoDoBanco): VinculoGravadoPy => ({
  estado: v.estado,
  tipo_comparacao: v.tipoComparacao,
  financeiro_ids: v.financeiroIds as string[],
  comparacao_ids: v.comparacaoIds as string[],
});

/** `_agencia`: a conta bancária ATIVA desta empresa (a criação e o envio de documento exigem). */
function lerAgenciaAtiva(db: Db, tenantId: string, empresaId: string, agenciaId: string) {
  return db.coreAgencia.findFirst({
    where: { id: agenciaId, tenantId, empresaId, deletedAt: null, ativa: true },
    select: { id: true, bancoSigla: true, agencia: true, numero: true, digito: true, contaContabilId: true },
  });
}

/** `_extrato_valido`: a conta ainda existe (ativa ou não) e o extrato do período é o mesmo da criação. */
async function extratoValido(db: Db, tenantId: string, empresaId: string, a: LinhaDaAnalise): Promise<boolean> {
  const agencia = await db.coreAgencia.findFirst({ where: { id: a.agenciaId, tenantId, empresaId, deletedAt: null }, select: { id: true } });
  if (!agencia) return false;
  const atuais = await lerExtrato(db, tenantId, empresaId, a.agenciaId, dia(a.periodoInicio), dia(a.periodoFim));
  return identidadeDoExtrato(atuais) === a.extratoHash;
}

/** `_responsavel`: o nome de quem age, gravado no vínculo. */
async function responsavel(db: Db, tenantId: string, userId: string): Promise<string> {
  const u = await db.user.findFirst({ where: { id: userId, tenantId }, select: { name: true } });
  return corta(u?.name || RESPONSAVEL_PADRAO, 200);
}

/** O dinheiro de `Decimal(15,2)` como o PostgreSQL o devolvia: com as 2 casas ("350.00"). */
const dinheiro = (v: Prisma.Decimal) => texto(reescala(decDoBanco(v), -2));

function resumo(a: {
  id: string; agenciaId: string; titulo: string; contaBancaria: string;
  periodoInicio: Date; periodoFim: Date; versao: number; createdAt: Date; updatedAt: Date;
}): ResumoAnaliseFinanceiro {
  return {
    id: a.id,
    agenciaId: a.agenciaId,
    titulo: a.titulo,
    contaBancaria: a.contaBancaria,
    periodoInicio: dia(a.periodoInicio),
    periodoFim: dia(a.periodoFim),
    versao: a.versao,
    criadaEm: a.createdAt.toISOString(),
    atualizadaEm: a.updatedAt.toISOString(),
  };
}

function vinculoParaTela(v: VinculoDoBanco): VinculoFinanceiro {
  return {
    id: v.id,
    tipoComparacao: v.tipoComparacao as TipoComparacao,
    financeiroIds: [...(v.financeiroIds as string[])],
    comparacaoIds: [...(v.comparacaoIds as string[])],
    totalFinanceiro: dinheiro(v.totalFinanceiro),
    totalComparacao: dinheiro(v.totalComparacao),
    diferenca: dinheiro(v.diferenca),
    observacao: v.observacao,
    estado: v.estado as VinculoFinanceiro["estado"],
    responsavel: v.responsavel,
    criadoEm: v.createdAt.toISOString(),
    desfeitoPor: v.desfeitoPor,
    desfeitoEm: v.desfeitoEm ? v.desfeitoEm.toISOString() : null,
    motivoDesfazer: v.motivoDesfazer,
  };
}

/** `obter`: a análise inteira para a tela, com a validade do extrato conferida agora. */
async function montar(db: Db, tenantId: string, empresaId: string, a: LinhaDaAnalise): Promise<AnaliseFinanceiro> {
  const valido = await extratoValido(db, tenantId, empresaId, a);
  const vinculos = (await lerVinculos(db, tenantId, empresaId, a.id)).map(vinculoParaTela);
  return analiseParaTela(resumo(a), a.snapshot as unknown as SnapshotFinanceiroPy, vinculos, valido);
}

/**
 * `_avancar`: a versão sobe só se ainda for a esperada e a análise estiver viva, junto com o que
 * muda. `false` quando outra pessoa alterou antes (nada é gravado).
 */
async function avancar(
  db: Db,
  tenantId: string,
  empresaId: string,
  analiseId: string,
  versao: number,
  dados: Prisma.CoreFinanceiroAnaliseUpdateManyMutationInput = {},
): Promise<boolean> {
  const r = await db.coreFinanceiroAnalise.updateMany({
    where: { id: analiseId, tenantId, empresaId, versao, deletedAt: null },
    data: { ...dados, versao: versao + 1, updatedAt: new Date() },
  });
  return r.count === 1;
}

/** Depois da escrita: a análise como a tela a mostra (ou "não encontrada", se outra pessoa a excluiu nesse meio-tempo). */
async function depois(tenantId: string, empresaId: string, analiseId: string, auditoria: AuditoriaDoFinanceiro | null): Promise<ResultadoFinanceiro<EscritaDoFinanceiro>> {
  const prisma = getPrisma();
  const a = await lerAnalise(prisma, tenantId, empresaId, analiseId);
  if (!a) return analiseNaoEncontrada();
  return { ok: true, valor: { analise: await montar(prisma, tenantId, empresaId, a), auditoria } };
}

/** `sugestoes` (sem a leitura da análise): o envelope de `sugerir`, ou a recusa do extrato alterado. */
function calcularSugestoes(a: LinhaDaAnalise, vinculos: readonly VinculoGravadoPy[], tipo: TipoComparacao, valido: boolean): ResultadoFinanceiro<unknown> {
  const recusa = conferirSugestoes(tipo, valido);
  if (recusa) return recusa;
  const snapshot = a.snapshot as unknown as SnapshotFinanceiroPy;
  return { ok: true, valor: sugerir(snapshot.linhas, vinculos, tipo, a.versao, dia(a.periodoInicio), dia(a.periodoFim)) };
}

// ─── Consultas ──────────────────────────────────────────────────────────────

export async function obterAnalise(tenantId: string, empresaId: string, analiseId: string): Promise<ResultadoFinanceiro<AnaliseFinanceiro>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const prisma = getPrisma();
  const a = await lerAnalise(prisma, tenantId, empresaId, analiseId);
  if (!a) return analiseNaoEncontrada();
  return { ok: true, valor: await montar(prisma, tenantId, empresaId, a) };
}

/** `listar`: só o resumo (sem o snapshot nem os originais), da mais recentemente alterada para a mais antiga. */
export async function listarAnalises(
  tenantId: string,
  empresaId: string,
  agenciaId: string | null,
  pagina: number,
  porPagina: number,
): Promise<ResultadoFinanceiro<ListaAnalisesFinanceiro>> {
  if (!Number.isInteger(pagina) || pagina < 1 || !Number.isInteger(porPagina) || porPagina < 1 || porPagina > 100) {
    return { ok: false, erro: "Página inválida." };
  }
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const prisma = getPrisma();
  const where: Prisma.CoreFinanceiroAnaliseWhereInput = { tenantId, empresaId, deletedAt: null, ...(agenciaId ? { agenciaId } : {}) };
  const [total, linhas] = await Promise.all([
    prisma.coreFinanceiroAnalise.count({ where }),
    prisma.coreFinanceiroAnalise.findMany({
      where,
      select: { id: true, agenciaId: true, titulo: true, contaBancaria: true, periodoInicio: true, periodoFim: true, versao: true, createdAt: true, updatedAt: true },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip: (pagina - 1) * porPagina,
      take: porPagina,
    }),
  ]);
  return { ok: true, valor: { itens: linhas.map(resumo), total, pagina, porPagina } };
}

/** `sugestoes`: só leitura; com o Extrato, só enquanto ele é o da criação. */
export async function sugestoesDaAnalise(
  tenantId: string,
  empresaId: string,
  analiseId: string,
  tipo: TipoComparacao,
): Promise<ResultadoFinanceiro<SugestoesFinanceiro>> {
  if (!TIPOS_DE_COMPARACAO.includes(tipo)) return { ok: false, erro: "Tipo de comparação inválido." };
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const prisma = getPrisma();
  const a = await lerAnalise(prisma, tenantId, empresaId, analiseId);
  if (!a) return analiseNaoEncontrada();
  const valido = tipo === "EXTRATO" ? await extratoValido(prisma, tenantId, empresaId, a) : true;
  const vinculos = (await lerVinculos(prisma, tenantId, empresaId, a.id)).map(vinculoPy);
  const r = calcularSugestoes(a, vinculos, tipo, valido);
  if (!r.ok) return r;
  return { ok: true, valor: sugestoesParaTela(r.valor) };
}

/** `original`: os bytes do documento, só pela análise viva desta empresa e deste tenant. */
export async function originalDoDocumento(
  tenantId: string,
  empresaId: string,
  analiseId: string,
  fonteId: string,
): Promise<ResultadoFinanceiro<{ nome: string; mediaType: string; bytes: Uint8Array }>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const prisma = getPrisma();
  const a = await lerAnalise(prisma, tenantId, empresaId, analiseId);
  if (!a) return analiseNaoEncontrada();
  const naoEncontrado: RecusaFinanceiro = { ok: false, erro: ORIGINAL_NAO_ENCONTRADO, codigo: "NAO_ENCONTRADA" };
  const d = await prisma.coreFinanceiroDocumento.findFirst({
    where: { id: fonteId, analiseId: a.id, tenantId, empresaId, deletedAt: null },
    select: { nomeArquivo: true, mediaType: true, storageKey: true },
  });
  if (!d) return naoEncontrado;
  const bytes = await lerOriginal(tenantId, d.storageKey);
  if (!bytes) return naoEncontrado;
  return { ok: true, valor: { nome: d.nomeArquivo, mediaType: d.mediaType, bytes: new Uint8Array(bytes) } };
}

// ─── Criação e gestão ───────────────────────────────────────────────────────

/**
 * `criar`: a conta bancária ativa da empresa, o extrato do período (já importado) como a primeira
 * fonte, a identidade do extrato e a versão 1.
 */
export async function criarAnalise(
  tenantId: string,
  userId: string,
  empresaId: string,
  d: NovaAnaliseFinanceiro,
): Promise<ResultadoFinanceiro<EscritaDoFinanceiro>> {
  const entrada = novaAnaliseSchema.safeParse(d);
  if (!entrada.success) return entradaInvalida(entrada.error);
  const { agenciaId, periodoInicio, periodoFim, titulo } = entrada.data;
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const prisma = getPrisma();
  const agencia = await lerAgenciaAtiva(prisma, tenantId, empresaId, agenciaId);
  if (!agencia) return contaNaoEncontrada();
  const transacoes = await lerExtrato(prisma, tenantId, empresaId, agencia.id, periodoInicio, periodoFim);
  const criacao = criacaoDaAnalise({ bancoSigla: agencia.bancoSigla, transacoes, novoId: randomUUID });
  if (!criacao.ok) return criacao;
  const nova = await prisma.coreFinanceiroAnalise.create({
    data: {
      tenantId,
      empresaId,
      agenciaId: agencia.id,
      criadoPorId: userId,
      titulo,
      contaBancaria: corta(descricaoDaAgencia(agencia), 255),
      periodoInicio: dataDoDia(periodoInicio),
      periodoFim: dataDoDia(periodoFim),
      extratoHash: criacao.valor.extratoHash,
      versao: 1,
      snapshot: json(criacao.valor.snapshot),
    },
    select: { id: true },
  });
  return depois(tenantId, empresaId, nova.id, { acao: ACOES_DO_FINANCEIRO.criada, dados: { agencia_id: agencia.id } });
}

/** `renomear`: só o nome muda (fontes, período e vínculos ficam). */
export async function renomearAnalise(
  tenantId: string,
  userId: string,
  empresaId: string,
  analiseId: string,
  d: RenomearAnaliseFinanceiro,
): Promise<ResultadoFinanceiro<EscritaDoFinanceiro>> {
  const entrada = renomearAnaliseSchema.safeParse(d);
  if (!entrada.success) return entradaInvalida(entrada.error);
  const { versao, titulo } = entrada.data;
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const feito = await getPrisma().$transaction(async (tx): Promise<ResultadoFinanceiro<string>> => {
    const a = await lerAnalise(tx, tenantId, empresaId, analiseId);
    if (!a) return analiseNaoEncontrada();
    if (!(await avancar(tx, tenantId, empresaId, a.id, versao, { titulo }))) return versaoDesatualizada();
    return { ok: true, valor: a.titulo };
  }, OPCOES_DA_TRANSACAO);
  if (!feito.ok) return feito;
  return depois(tenantId, empresaId, analiseId, { acao: ACOES_DO_FINANCEIRO.renomeada, dados: { anterior: feito.valor, titulo } });
}

/** `excluir`: exclusão lógica (a análise some da lista e da leitura; documentos e vínculos ficam no banco). */
export async function excluirAnalise(
  tenantId: string,
  userId: string,
  empresaId: string,
  analiseId: string,
  versao: number,
): Promise<ResultadoFinanceiro<{ analise: null; auditoria: AuditoriaDoFinanceiro }>> {
  const entrada = excluirAnaliseSchema.safeParse({ versao });
  if (!entrada.success) return entradaInvalida(entrada.error);
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const feito = await getPrisma().$transaction(async (tx): Promise<ResultadoFinanceiro<null>> => {
    const a = await lerAnalise(tx, tenantId, empresaId, analiseId);
    if (!a) return analiseNaoEncontrada();
    if (!(await avancar(tx, tenantId, empresaId, a.id, entrada.data.versao, { deletedAt: new Date() }))) return versaoDesatualizada();
    return { ok: true, valor: null };
  }, OPCOES_DA_TRANSACAO);
  if (!feito.ok) return feito;
  return { ok: true, valor: { analise: null, auditoria: { acao: ACOES_DO_FINANCEIRO.excluida, dados: { exclusao_logica: true } } } };
}

// ─── Documentos ─────────────────────────────────────────────────────────────

/** Os erros dos leitores viram a recusa com a frase do leitor (como a rota do original fazia). */
function ehErroDeLeitura(e: unknown): e is Error {
  return e instanceof FinanceiroInvalido || e instanceof SispagInvalido || e instanceof RazaoInvalido || e instanceof ExtratoDetalhadoInvalido;
}

async function lerDocumento(tipo: TipoDocumentoFinanceiro, conteudo: Uint8Array, nome: string): Promise<LeituraDoDocumento> {
  switch (tipo) {
    case "FINANCEIRO":
      return { tipo, documento: await lerFinanceiro(conteudo, nome) };
    case "SISPAG":
      return { tipo, sispag: lerSispag(conteudo) };
    case "RAZAO":
      return { tipo, razao: await lerRazaoDoArquivo(conteudo, nome) };
    case "EXTRATO_DETALHADO":
      return { tipo, extrato: lerExtratoDetalhado(conteudo) };
  }
}

/**
 * `adicionar_documento`: lê o documento pelo leitor do tipo (financeiro, SISPAG, Razão ou extrato
 * detalhado), confere e incorpora ao snapshot, e guarda o original. Recusado se a versão mudou, se o
 * arquivo já está na análise, se passar dos limites ou em qualquer conferência do tipo; a versão só
 * sobe quando tudo passa.
 */
export async function adicionarDocumento(
  tenantId: string,
  userId: string,
  empresaId: string,
  analiseId: string,
  e: { tipo: TipoDocumentoFinanceiro; conteudo: Uint8Array; nomeArquivo: string; mediaType: string; versao: number; confirmarEmpresa: boolean },
): Promise<ResultadoFinanceiro<EscritaDoFinanceiro>> {
  const versao = versaoSchema.safeParse(e.versao);
  if (!versao.success) return entradaInvalida(versao.error);
  if (!(["FINANCEIRO", "SISPAG", "RAZAO", "EXTRATO_DETALHADO"] as string[]).includes(e.tipo)) {
    return { ok: false, erro: "Tipo de documento não suportado." };
  }
  const empresa = await empresaDoTenant(tenantId, empresaId);
  if (!empresa) return empresaNaoEncontrada();
  const prisma = getPrisma();
  const a = await lerAnalise(prisma, tenantId, empresaId, analiseId);
  if (!a) return analiseNaoEncontrada();
  if (a.versao !== versao.data) return { ok: false, erro: ANALISE_MUDOU, codigo: "VERSAO_DESATUALIZADA" };
  const agencia = await lerAgenciaAtiva(prisma, tenantId, empresaId, a.agenciaId);
  if (!agencia) return contaNaoEncontrada();
  const nome = nomeDoArquivo(e.nomeArquivo);
  try {
    await validarConteudo(e.conteudo, nome);
  } catch (erro) {
    if (ehErroDeLeitura(erro)) return { ok: false, erro: erro.message };
    throw erro;
  }
  const hashArquivo = sha256(e.conteudo);
  const [repetido, soma] = await Promise.all([
    prisma.coreFinanceiroDocumento.findFirst({ where: { analiseId: a.id, tenantId, empresaId, deletedAt: null, hashArquivo }, select: { id: true } }),
    prisma.coreFinanceiroDocumento.aggregate({ where: { analiseId: a.id, tenantId, empresaId, deletedAt: null }, _sum: { tamanho: true } }),
  ]);
  const original = conferirOriginal({ jaExiste: !!repetido, tamanhoAtual: soma._sum.tamanho ?? 0, tamanho: e.conteudo.length });
  if (original) return original;
  const fonteId = randomUUID();
  const antes = antesDaLeitura(e.tipo, agencia.bancoSigla);
  if (antes) return antes;
  let leitura: LeituraDoDocumento;
  try {
    leitura = await lerDocumento(e.tipo, e.conteudo, nome);
  } catch (erro) {
    if (ehErroDeLeitura(erro)) return { ok: false, erro: erro.message };
    throw erro;
  }
  // Como no original (`db.get`), a conta vinculada é lida mesmo se apagada; aqui, só desta empresa.
  const conta =
    e.tipo === "RAZAO" && agencia.contaContabilId
      ? await prisma.corePlanoConta.findFirst({ where: { id: agencia.contaContabilId, tenantId, empresaId }, select: { codigo: true, contaNumero: true } })
      : null;
  const incorporado = incorporarDocumento({
    analise: { periodoInicio: dia(a.periodoInicio), periodoFim: dia(a.periodoFim), snapshot: a.snapshot as unknown as SnapshotFinanceiroPy },
    leitura,
    nome,
    agencia: { ...agencia, descricao: descricaoDaAgencia(agencia), temContaContabil: !!agencia.contaContabilId },
    contaContabil: conta,
    empresa,
    confirmarEmpresa: e.confirmarEmpresa,
    fonteId,
    novoId: randomUUID,
  });
  if (!incorporado.ok) return incorporado;

  const storageKey = chaveDoOriginal(tenantId, fonteId, nome);
  let gravou = false;
  try {
    const feito = await prisma.$transaction(async (tx): Promise<ResultadoFinanceiro<AuditoriaDoFinanceiro>> => {
      // CAS antes de gravar o original, na mesma transação.
      if (!(await avancar(tx, tenantId, empresaId, a.id, versao.data, { snapshot: json(incorporado.valor.snapshot) }))) return versaoDesatualizada();
      await gravarOriginal(tenantId, storageKey, e.conteudo);
      gravou = true;
      await tx.coreFinanceiroDocumento.create({
        data: {
          id: fonteId,
          tenantId,
          empresaId,
          analiseId: a.id,
          tipo: e.tipo,
          nomeArquivo: nome,
          hashArquivo,
          mediaType: mediaTypeDoNome(nome) ?? corta(e.mediaType || "application/octet-stream", 100),
          tamanho: e.conteudo.length,
          storageKey,
        },
      });
      return {
        ok: true,
        valor: { acao: ACOES_DO_FINANCEIRO.documento, dados: { fonte_id: fonteId, hash: hashArquivo, tipo: e.tipo, linhas: incorporado.valor.linhas } },
      };
    }, OPCOES_DA_TRANSACAO);
    if (!feito.ok) return feito;
    return depois(tenantId, empresaId, analiseId, feito.valor);
  } catch (erro) {
    if (gravou) await apagarOriginal(tenantId, storageKey);
    // O mesmo arquivo entrou em outra aba nesse meio-tempo (a coluna única recusou).
    if (ehDuplicado(erro)) return { ok: false, erro: ARQUIVO_REPETIDO, codigo: "CONFLITO" };
    throw erro;
  }
}

// ─── Vínculos ───────────────────────────────────────────────────────────────

/** `_gravar_vinculo`: a conferência como ATIVA, com quem confirmou. */
async function gravarVinculo(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
  empresaId: string,
  analiseId: string,
  v: VinculoValidado,
  observacao: string,
  nome: string,
): Promise<string> {
  const criado = await tx.coreFinanceiroVinculo.create({
    data: {
      tenantId,
      empresaId,
      analiseId,
      tipoComparacao: v.tipo,
      financeiroIds: json(v.financeiroIds),
      comparacaoIds: json(v.comparacaoIds),
      totalFinanceiro: paraBanco(v.totalFinanceiro),
      totalComparacao: paraBanco(v.totalComparacao),
      diferenca: paraBanco(v.diferenca),
      observacao,
      estado: "ATIVO",
      confirmadoPorId: userId,
      responsavel: nome,
    },
    select: { id: true },
  });
  return criado.id;
}

/** O que `validarVinculo` lê do banco: o snapshot, o período, a validade do extrato, os vínculos e as sugestões. */
async function contextoDoVinculo(tx: Prisma.TransactionClient, tenantId: string, empresaId: string, a: LinhaDaAnalise) {
  const valido = await extratoValido(tx, tenantId, empresaId, a);
  const vinculos = (await lerVinculos(tx, tenantId, empresaId, a.id)).map(vinculoPy);
  return {
    snapshot: a.snapshot as unknown as SnapshotFinanceiroPy,
    periodoInicio: dia(a.periodoInicio),
    periodoFim: dia(a.periodoFim),
    extratoValido: valido,
    vinculos,
    sugestoesDoTipo: (tipo: TipoComparacao): ResultadoFinanceiro<SugestoesPy> => {
      const r = calcularSugestoes(a, vinculos, tipo, valido);
      return r.ok ? { ok: true, valor: sugestoesParaValidar(r.valor) } : r;
    },
  };
}

/** `vincular`: a relação que a pessoa confirma entre o documento base e uma origem de comparação. */
export async function vincular(
  tenantId: string,
  userId: string,
  empresaId: string,
  analiseId: string,
  d: NovoVinculoFinanceiro,
): Promise<ResultadoFinanceiro<EscritaDoFinanceiro>> {
  const entrada = novoVinculoFinanceiroSchema.safeParse(d);
  if (!entrada.success) return entradaInvalida(entrada.error);
  const dados = entrada.data;
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const feito = await getPrisma().$transaction(async (tx): Promise<ResultadoFinanceiro<AuditoriaDoFinanceiro>> => {
    const a = await lerAnalise(tx, tenantId, empresaId, analiseId);
    if (!a) return analiseNaoEncontrada();
    const v = validarVinculo({
      ...(await contextoDoVinculo(tx, tenantId, empresaId, a)),
      financeiroIds: dados.financeiroIds,
      comparacaoIds: dados.comparacaoIds,
      observacao: dados.observacao,
      sugestaoId: dados.sugestaoId,
      versao: dados.versao,
    });
    if (!v.ok) return v;
    if (!(await avancar(tx, tenantId, empresaId, a.id, dados.versao))) return versaoDesatualizada();
    const id = await gravarVinculo(tx, tenantId, userId, empresaId, a.id, v.valor, dados.observacao, await responsavel(tx, tenantId, userId));
    return { ok: true, valor: { acao: ACOES_DO_FINANCEIRO.confirmado, dados: dadosDoVinculoCriado(id, v.valor, dados.sugestaoId) } };
  }, OPCOES_DA_TRANSACAO);
  if (!feito.ok) return feito;
  return depois(tenantId, empresaId, analiseId, feito.valor);
}

/**
 * `vincular_sugestoes`: várias sugestões conferidas de uma vez, todas ou nenhuma. O id da sugestão
 * inclui a versão da análise; registrar uma por vez mudaria a versão e invalidaria as seguintes. Aqui
 * todas são revalidadas contra a mesma versão e gravadas na mesma transação, cada uma como conferência
 * própria, com uma única mudança de versão.
 */
export async function vincularSugestoes(
  tenantId: string,
  userId: string,
  empresaId: string,
  analiseId: string,
  d: SugestoesEmLote,
): Promise<ResultadoFinanceiro<EscritaDoFinanceiro>> {
  const entrada = sugestoesEmLoteSchema.safeParse(d);
  if (!entrada.success) return entradaInvalida(entrada.error);
  const dados = entrada.data;
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const feito = await getPrisma().$transaction(async (tx): Promise<ResultadoFinanceiro<AuditoriaDoFinanceiro>> => {
    const a = await lerAnalise(tx, tenantId, empresaId, analiseId);
    if (!a) return analiseNaoEncontrada();
    const lote = validarLote({
      ...(await contextoDoVinculo(tx, tenantId, empresaId, a)),
      sugestoes: dados.sugestoes,
      observacao: dados.observacao,
      versao: dados.versao,
    });
    if (!lote.ok) return lote;
    if (!(await avancar(tx, tenantId, empresaId, a.id, dados.versao))) return versaoDesatualizada();
    const nome = await responsavel(tx, tenantId, userId);
    const vinculos: Record<string, unknown>[] = [];
    for (const { sugestaoId, validado } of lote.valor) {
      const id = await gravarVinculo(tx, tenantId, userId, empresaId, a.id, validado, dados.observacao, nome);
      vinculos.push(dadosDoVinculoCriado(id, validado, sugestaoId));
    }
    return { ok: true, valor: { acao: ACOES_DO_FINANCEIRO.confirmados, dados: { vinculos } } };
  }, OPCOES_DA_TRANSACAO);
  if (!feito.ok) return feito;
  return depois(tenantId, empresaId, analiseId, feito.valor);
}

/**
 * `desfazer`: a conferência fica, como DESFEITA, com quem desfez, quando e por quê. Vale mesmo com o
 * extrato alterado: a evidência original não se apaga.
 */
export async function desfazerVinculoFinanceiro(
  tenantId: string,
  userId: string,
  empresaId: string,
  analiseId: string,
  vinculoId: string,
  d: DesfazerVinculoFinanceiro,
): Promise<ResultadoFinanceiro<EscritaDoFinanceiro>> {
  const entrada = desfazerVinculoFinanceiroSchema.safeParse(d);
  if (!entrada.success) return entradaInvalida(entrada.error);
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const feito = await getPrisma().$transaction(async (tx): Promise<ResultadoFinanceiro<AuditoriaDoFinanceiro>> => {
    const a = await lerAnalise(tx, tenantId, empresaId, analiseId);
    if (!a) return analiseNaoEncontrada();
    const vinculo = await tx.coreFinanceiroVinculo.findFirst({
      where: { id: vinculoId, analiseId: a.id, tenantId, empresaId, deletedAt: null },
      select: { id: true, estado: true },
    });
    const recusa = conferirDesfazer(vinculo);
    if (recusa) return recusa;
    if (!(await avancar(tx, tenantId, empresaId, a.id, entrada.data.versao))) return versaoDesatualizada();
    await tx.coreFinanceiroVinculo.update({
      where: { id: vinculo!.id },
      data: { estado: "DESFEITO", desfeitoPor: await responsavel(tx, tenantId, userId), desfeitoEm: new Date(), motivoDesfazer: entrada.data.motivo },
    });
    return { ok: true, valor: { acao: ACOES_DO_FINANCEIRO.desfeito, dados: { vinculo_id: vinculo!.id, motivo: entrada.data.motivo } } };
  }, OPCOES_DA_TRANSACAO);
  if (!feito.ok) return feito;
  return depois(tenantId, empresaId, analiseId, feito.valor);
}
