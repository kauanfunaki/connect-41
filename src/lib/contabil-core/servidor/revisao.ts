import "server-only";

// A revisão manual da conciliação Razão × extrato (Bloco B, Fase B3, 12/11/2026): porte de
// `RevisaoService` (`src/domain/conciliacao_bancaria/revisao.py`). As conferências e a montagem do
// snapshot são as funções puras de `conciliacao/revisao.ts`; aqui ficam as leituras, as gravações e a
// versão otimista.
//
// - Nada dos módulos de origem é escrito: extrato, lançamentos e NEO só são lidos.
// - `snapshot` e `relatorio` são gravados com as chaves e os valores do original (snake_case), para a
//   carga copiar as revisões sem conversão. A tela recebe a forma de `revisaoTipos.ts` (camelCase).
// - Versão otimista: toda alteração é um `updateMany` que exige a versão que a tela viu e a revisão
//   viva; se outra pessoa mudou antes, nada é gravado e a recusa é VERSAO_DESATUALIZADA.
// - Auditoria: a rota registra (`logAudit`). Cada escrita devolve `auditoria` com a ação e os mesmos
//   dados do `_auditar` do original, ou `null` quando `criar` devolve uma revisão que já existia.
// - O extrato da revisão é lido na ordem de `ordenar_como_o_extrato` (data, lote, `ordem`, id), que
//   inclui o lote; a conciliação da B2 (`servidor/conciliacao.ts`) lê sem o lote, como
//   `conciliar_razao_extrato` faz no original.

import { randomUUID } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { corta } from "@/lib/revisao-contabil/motor/py";
import { revisaoChaveAtiva } from "../motor/chaves";
import { reescala, texto } from "../motor/decimal";
import type { RazaoApoio, RazaoConta } from "../conciliacao/razaoTipos";
import { relatorioParaJson } from "../conciliacao/relatorio";
import { CONTA_BANCARIA_NAO_ENCONTRADA } from "../conciliacao/servico";
import type { ConsultaSispag } from "../conciliacao/sispag";
import {
  conferirDesfazer,
  conferirEmpresa,
  conferirExtratoDaRevisao,
  conferirRazaoDoBanco,
  evidenciaDoExtrato,
  exigirFontes,
  hashesDaRevisao,
  hashJson,
  incorporarApoio,
  ordemComoOExtrato,
  relatorioParaPython,
  RESPONSAVEL_PADRAO,
  REVISAO_NAO_ENCONTRADA,
  revisaoParaTela,
  snapshotDaRevisao,
  validarVinculo,
  VERSAO_DESATUALIZADA,
  type ItemVinculoPy,
  type RecusaRevisao,
  type RelatorioPy,
  type ResultadoRevisao,
  type SnapshotPy,
  type TransacaoDaRevisao,
  type VinculoParaTela,
} from "../conciliacao/revisao";
import type {
  DesfazerVinculo,
  EstadoVinculo,
  ListaRevisoes,
  NovoVinculo,
  RenomearRevisao,
  ResumoRevisao,
  Revisao,
} from "../conciliacao/revisaoTipos";
import { desfazerVinculoSchema, novoVinculoSchema, renomearRevisaoSchema, versaoSchema } from "../entradasRevisao";
import { conciliarRazaoExtrato } from "./conciliacao";
import { dataDoDia, decDoBanco, dia, ehDuplicado, empresaDoTenant, NAO_ENCONTRADA, paraBanco } from "./base";

export type { ResultadoRevisao } from "../conciliacao/revisao";

/** O que a rota passa ao `logAudit` (entidade: a revisão). */
export type AuditoriaDaRevisao = { acao: string; dados: Record<string, unknown> };
/** O resultado de toda escrita: a revisão como a tela a mostra e a auditoria. */
export type EscritaDaRevisao = { revisao: Revisao; auditoria: AuditoriaDaRevisao | null };

export const ACOES_DA_REVISAO = {
  criada: "contabil.core.conciliacao.revisao.criada",
  renomeada: "contabil.core.conciliacao.revisao.renomeada",
  excluida: "contabil.core.conciliacao.revisao.excluida",
  apoio: "contabil.core.conciliacao.apoio.adicionado",
  confirmado: "contabil.core.conciliacao.vinculo.confirmado",
  desfeito: "contabil.core.conciliacao.vinculo.desfeito",
} as const;

type Db = Prisma.TransactionClient | ReturnType<typeof getPrisma>;

/** Transações grandes (20 mil linhas no snapshot) passam do limite padrão de 5 s do Prisma. */
const OPCOES_DA_TRANSACAO = { timeout: 60_000 };

const empresaNaoEncontrada = (): RecusaRevisao => ({ ok: false, erro: NAO_ENCONTRADA, codigo: "NAO_ENCONTRADA" });
const revisaoNaoEncontrada = (): RecusaRevisao => ({ ok: false, erro: REVISAO_NAO_ENCONTRADA, codigo: "NAO_ENCONTRADA" });
const versaoDesatualizada = (): RecusaRevisao => ({ ok: false, erro: VERSAO_DESATUALIZADA, codigo: "VERSAO_DESATUALIZADA" });
const entradaInvalida = (e: { issues: { message: string }[] }): RecusaRevisao => ({ ok: false, erro: e.issues[0]?.message ?? "Dados inválidos." });

const json = (v: unknown) => v as Prisma.InputJsonValue;

// ─── Leituras ───────────────────────────────────────────────────────────────

/** `_transacoes`: o extrato vivo da conta no período, na ordem do papel do banco. */
export async function lerExtrato(db: Db, tenantId: string, empresaId: string, agenciaId: string, inicio: string, fim: string): Promise<TransacaoDaRevisao[]> {
  const lidas = await db.coreTransacao.findMany({
    where: { tenantId, empresaId, agenciaId, deletedAt: null, data: { gte: dataDoDia(inicio), lte: dataDoDia(fim) } },
    select: {
      id: true, data: true, valor: true, dc: true, historico: true, saldoApos: true, ordem: true, importacaoId: true,
      importacao: { select: { createdAt: true } },
    },
  });
  return lidas
    .map(
      (t): TransacaoDaRevisao => ({
        id: t.id,
        data: dia(t.data),
        // O MySQL devolve "1200" e o PostgreSQL "1200.00": a escala da coluna entra no snapshot ("-1200.00").
        valor: reescala(decDoBanco(t.valor), -2),
        dc: t.dc,
        historico: t.historico,
        saldoApos: t.saldoApos === null ? null : reescala(decDoBanco(t.saldoApos), -2),
        ordem: t.ordem,
        importacaoId: t.importacaoId,
        loteEm: t.importacao ? t.importacao.createdAt.toISOString() : null,
      }),
    )
    .sort(ordemComoOExtrato);
}

type LinhaDaRevisao = NonNullable<Awaited<ReturnType<typeof lerRevisao>>>;

/** `_obter`: a revisão viva desta empresa e deste tenant. */
function lerRevisao(db: Db, tenantId: string, empresaId: string, revisaoId: string) {
  return db.coreConciliacaoRevisao.findFirst({ where: { id: revisaoId, tenantId, empresaId, deletedAt: null } });
}

/** `_vinculos`: em ordem de criação. */
function lerVinculos(db: Db, tenantId: string, empresaId: string, revisaoId: string) {
  return db.coreConciliacaoVinculo.findMany({
    where: { revisaoId, tenantId, empresaId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

/** `_fontes_validas`: a conta bancária ainda existe e o extrato do período é o mesmo da criação. */
async function fontesValidas(db: Db, tenantId: string, empresaId: string, r: LinhaDaRevisao): Promise<boolean> {
  const agencia = await db.coreAgencia.findFirst({ where: { id: r.agenciaId, tenantId, empresaId, deletedAt: null }, select: { id: true } });
  if (!agencia) return false;
  const atuais = await lerExtrato(db, tenantId, empresaId, r.agenciaId, dia(r.periodoInicio), dia(r.periodoFim));
  return hashJson(evidenciaDoExtrato(atuais)) === r.extratoHash;
}

/** `_responsavel`: o nome de quem age, gravado no vínculo. */
async function responsavel(db: Db, tenantId: string, userId: string): Promise<string> {
  const u = await db.user.findFirst({ where: { id: userId, tenantId }, select: { name: true } });
  return corta(u?.name || RESPONSAVEL_PADRAO, 200);
}

/** O dinheiro de `Decimal(15,2)` como o PostgreSQL o devolvia: com as 2 casas ("350.00"). */
const dinheiro = (v: Prisma.Decimal) => texto(reescala(decDoBanco(v), -2));

function resumo(r: {
  id: string; agenciaId: string; nomeArquivo: string; titulo: string | null; contaBancaria: string;
  periodoInicio: Date; periodoFim: Date; versao: number; createdAt: Date; updatedAt: Date;
}): ResumoRevisao {
  return {
    id: r.id,
    agenciaId: r.agenciaId,
    nomeArquivo: r.nomeArquivo,
    titulo: r.titulo,
    contaBancaria: r.contaBancaria,
    periodoInicio: dia(r.periodoInicio),
    periodoFim: dia(r.periodoFim),
    versao: r.versao,
    criadaEm: r.createdAt.toISOString(),
    atualizadaEm: r.updatedAt.toISOString(),
  };
}

/** `obter`: a revisão inteira para a tela, com a validade das fontes conferida agora. */
async function montar(db: Db, tenantId: string, empresaId: string, r: LinhaDaRevisao): Promise<Revisao> {
  const validas = await fontesValidas(db, tenantId, empresaId, r);
  const vinculos = (await lerVinculos(db, tenantId, empresaId, r.id)).map(
    (v): VinculoParaTela => ({
      id: v.id,
      extratoIds: v.extratoIds as string[],
      razaoItens: v.razaoItens as ItemVinculoPy[],
      totalExtrato: dinheiro(v.totalExtrato),
      totalRazao: dinheiro(v.totalRazao),
      diferenca: dinheiro(v.diferenca),
      observacao: v.observacao,
      estado: v.estado as EstadoVinculo,
      responsavel: v.responsavel,
      criadoEm: v.createdAt.toISOString(),
      desfeitoPor: v.desfeitoPor,
      desfeitoEm: v.desfeitoEm ? v.desfeitoEm.toISOString() : null,
      motivoDesfazer: v.motivoDesfazer,
    }),
  );
  return revisaoParaTela(resumo(r), r.relatorio as RelatorioPy, r.snapshot as unknown as SnapshotPy, vinculos, validas);
}

/**
 * `_avancar`: a versão sobe só se ainda for a esperada e a revisão estiver viva, junto com o que
 * muda. `false` quando outra pessoa alterou antes (nada é gravado).
 */
async function avancar(
  db: Db,
  tenantId: string,
  empresaId: string,
  revisaoId: string,
  versao: number,
  dados: Prisma.CoreConciliacaoRevisaoUpdateManyMutationInput = {},
): Promise<boolean> {
  const r = await db.coreConciliacaoRevisao.updateMany({
    where: { id: revisaoId, tenantId, empresaId, versao, deletedAt: null },
    data: { ...dados, versao: versao + 1, updatedAt: new Date() },
  });
  return r.count === 1;
}

/** Depois da escrita: a revisão como a tela a mostra (ou "não encontrada", se outra pessoa a excluiu nesse meio-tempo). */
async function depois(tenantId: string, empresaId: string, revisaoId: string, auditoria: AuditoriaDaRevisao | null): Promise<ResultadoRevisao<EscritaDaRevisao>> {
  const prisma = getPrisma();
  const r = await lerRevisao(prisma, tenantId, empresaId, revisaoId);
  if (!r) return revisaoNaoEncontrada();
  return { ok: true, valor: { revisao: await montar(prisma, tenantId, empresaId, r), auditoria } };
}

// ─── Consultas ──────────────────────────────────────────────────────────────

export async function obterRevisao(tenantId: string, empresaId: string, revisaoId: string): Promise<ResultadoRevisao<Revisao>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const prisma = getPrisma();
  const r = await lerRevisao(prisma, tenantId, empresaId, revisaoId);
  if (!r) return revisaoNaoEncontrada();
  return { ok: true, valor: await montar(prisma, tenantId, empresaId, r) };
}

/** `listar`: só o resumo (sem snapshot nem relatório), da mais recentemente alterada para a mais antiga. */
export async function listarRevisoes(
  tenantId: string,
  empresaId: string,
  agenciaId: string | null,
  pagina: number,
  porPagina: number,
): Promise<ResultadoRevisao<ListaRevisoes>> {
  if (!Number.isInteger(pagina) || pagina < 1 || !Number.isInteger(porPagina) || porPagina < 1 || porPagina > 100) {
    return { ok: false, erro: "Página inválida." };
  }
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const prisma = getPrisma();
  const where: Prisma.CoreConciliacaoRevisaoWhereInput = { tenantId, empresaId, deletedAt: null, ...(agenciaId ? { agenciaId } : {}) };
  const [total, linhas] = await Promise.all([
    prisma.coreConciliacaoRevisao.count({ where }),
    prisma.coreConciliacaoRevisao.findMany({
      where,
      select: {
        id: true, agenciaId: true, nomeArquivo: true, titulo: true, contaBancaria: true,
        periodoInicio: true, periodoFim: true, versao: true, createdAt: true, updatedAt: true,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip: (pagina - 1) * porPagina,
      take: porPagina,
    }),
  ]);
  return { ok: true, valor: { itens: linhas.map(resumo), total, pagina, porPagina } };
}

// ─── Criação ────────────────────────────────────────────────────────────────

/**
 * `criar`: confere a empresa e o tamanho, concilia (as conferências da B2), lê o extrato e grava a
 * revisão. A mesma combinação de Razão, SISPAG e extrato, viva na mesma conta, devolve a existente
 * (sem auditoria), inclusive quando outra aba a criou no mesmo instante.
 */
export async function criarRevisao(
  tenantId: string,
  userId: string,
  empresaId: string,
  e: {
    agenciaId: string;
    razao: RazaoConta;
    nomeArquivo: string;
    hashArquivo: string;
    sispag: ConsultaSispag | null;
    hashSispag: string | null;
    confirmarEmpresa: boolean;
  },
): Promise<ResultadoRevisao<EscritaDaRevisao>> {
  const empresa = await empresaDoTenant(tenantId, empresaId);
  if (!empresa) return empresaNaoEncontrada();
  const antes = conferirEmpresa(e.razao.cnpj, empresa, e.confirmarEmpresa) ?? conferirRazaoDoBanco(e.razao);
  if (antes) return antes;

  // Reaproveita as conferências da conciliação: conta bancária, conta contábil, CNPJ e cobertura.
  const relatorio = await conciliarRazaoExtrato(tenantId, empresaId, e.agenciaId, e.razao, e.sispag);
  if (!relatorio.ok) {
    return relatorio.erro === CONTA_BANCARIA_NAO_ENCONTRADA
      ? { ok: false, erro: relatorio.erro, codigo: "NAO_ENCONTRADA" }
      : { ok: false, erro: relatorio.erro };
  }
  const { periodoInicio, periodoFim } = e.razao;
  // A conciliação já recusou o Razão sem período; isto só estreita o tipo.
  if (periodoInicio === null || periodoFim === null) return { ok: false, erro: "Não encontrei o período no cabeçalho do razão." };

  const prisma = getPrisma();
  const transacoes = await lerExtrato(prisma, tenantId, empresaId, e.agenciaId, periodoInicio, periodoFim);
  const depoisDoExtrato = conferirExtratoDaRevisao(e.razao, transacoes);
  if (depoisDoExtrato) return depoisDoExtrato;
  const { extratoHash, revisaoHash } = hashesDaRevisao(e.hashArquivo, e.hashSispag, transacoes);
  const viva = (db: Db) =>
    db.coreConciliacaoRevisao.findFirst({
      where: { tenantId, empresaId, agenciaId: e.agenciaId, revisaoHash, deletedAt: null },
      select: { id: true },
    });

  let criada: { id: string; nova: boolean };
  try {
    criada = await prisma.$transaction(async (tx) => {
      const existente = await viva(tx);
      if (existente) return { id: existente.id, nova: false };
      const snapshot = snapshotDaRevisao(e.razao, e.nomeArquivo, transacoes, randomUUID);
      const nova = await tx.coreConciliacaoRevisao.create({
        data: {
          tenantId,
          empresaId,
          agenciaId: e.agenciaId,
          criadoPorId: userId,
          nomeArquivo: corta(e.nomeArquivo, 255),
          contaBancaria: relatorio.valor.resumo.contaBancaria,
          periodoInicio: dataDoDia(periodoInicio),
          periodoFim: dataDoDia(periodoFim),
          revisaoHash,
          extratoHash,
          versao: 1,
          relatorio: json(relatorioParaPython(relatorioParaJson(relatorio.valor))),
          snapshot: json(snapshot),
          chaveAtiva: revisaoChaveAtiva({ deletedAt: null, revisaoHash }),
        },
        select: { id: true },
      });
      return { id: nova.id, nova: true };
    }, OPCOES_DA_TRANSACAO);
  } catch (erro) {
    // A coluna única recusou: a revisão idêntica foi criada em outra aba nesse meio-tempo.
    if (!ehDuplicado(erro)) throw erro;
    const outra = await viva(prisma);
    if (!outra) throw erro;
    criada = { id: outra.id, nova: false };
  }
  return depois(
    tenantId,
    empresaId,
    criada.id,
    criada.nova ? { acao: ACOES_DA_REVISAO.criada, dados: { arquivo: e.nomeArquivo, hash: revisaoHash } } : null,
  );
}

// ─── Gestão: nome e exclusão lógica ─────────────────────────────────────────

/** `renomear`: só o nome muda (fontes, período e vínculos ficam). */
export async function renomearRevisao(
  tenantId: string,
  userId: string,
  empresaId: string,
  revisaoId: string,
  d: RenomearRevisao,
): Promise<ResultadoRevisao<EscritaDaRevisao>> {
  const entrada = renomearRevisaoSchema.safeParse(d);
  if (!entrada.success) return entradaInvalida(entrada.error);
  const { versao, titulo } = entrada.data;
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const feito = await getPrisma().$transaction(async (tx): Promise<ResultadoRevisao<string>> => {
    const r = await lerRevisao(tx, tenantId, empresaId, revisaoId);
    if (!r) return revisaoNaoEncontrada();
    const anterior = r.titulo || r.nomeArquivo;
    if (!(await avancar(tx, tenantId, empresaId, r.id, versao, { titulo }))) return versaoDesatualizada();
    return { ok: true, valor: anterior };
  }, OPCOES_DA_TRANSACAO);
  if (!feito.ok) return feito;
  return depois(tenantId, empresaId, revisaoId, { acao: ACOES_DA_REVISAO.renomeada, dados: { anterior: feito.valor, titulo } });
}

/**
 * `excluir`: exclusão lógica (a revisão some da lista e da leitura; os vínculos ficam no banco). A
 * versão sobe junto e a chave de unicidade é liberada: o mesmo Razão pode abrir outra revisão.
 */
export async function excluirRevisao(
  tenantId: string,
  userId: string,
  empresaId: string,
  revisaoId: string,
  versao: number,
): Promise<ResultadoRevisao<{ revisao: null; auditoria: AuditoriaDaRevisao }>> {
  const entrada = versaoSchema.safeParse(versao);
  if (!entrada.success) return entradaInvalida(entrada.error);
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const feito = await getPrisma().$transaction(async (tx): Promise<ResultadoRevisao<null>> => {
    const r = await lerRevisao(tx, tenantId, empresaId, revisaoId);
    if (!r) return revisaoNaoEncontrada();
    const agora = new Date();
    const dados = { deletedAt: agora, chaveAtiva: revisaoChaveAtiva({ deletedAt: agora, revisaoHash: r.revisaoHash }) };
    if (!(await avancar(tx, tenantId, empresaId, r.id, entrada.data, dados))) return versaoDesatualizada();
    return { ok: true, valor: null };
  }, OPCOES_DA_TRANSACAO);
  if (!feito.ok) return feito;
  return { ok: true, valor: { revisao: null, auditoria: { acao: ACOES_DA_REVISAO.excluida, dados: { exclusao_logica: true } } } };
}

// ─── Razão de apoio ─────────────────────────────────────────────────────────

/**
 * `adicionar_apoio`: o Razão de outras contas (FGTS, impostos…) entra no snapshot como evidência.
 * Recusado se o extrato mudou, se for de outra empresa, se repetir o que já está na revisão ou se
 * passar dos limites; a versão só sobe quando tudo passa.
 */
export async function adicionarApoio(
  tenantId: string,
  userId: string,
  empresaId: string,
  revisaoId: string,
  e: { razao: RazaoApoio; nomeArquivo: string; versao: number; confirmarEmpresa: boolean },
): Promise<ResultadoRevisao<EscritaDaRevisao>> {
  const versao = versaoSchema.safeParse(e.versao);
  if (!versao.success) return entradaInvalida(versao.error);
  const empresa = await empresaDoTenant(tenantId, empresaId);
  if (!empresa) return empresaNaoEncontrada();
  const feito = await getPrisma().$transaction(async (tx): Promise<ResultadoRevisao<AuditoriaDaRevisao>> => {
    const r = await lerRevisao(tx, tenantId, empresaId, revisaoId);
    if (!r) return revisaoNaoEncontrada();
    const recusa = exigirFontes(await fontesValidas(tx, tenantId, empresaId, r)) ?? conferirEmpresa(e.razao.cnpj, empresa, e.confirmarEmpresa);
    if (recusa) return recusa;
    const apoio = incorporarApoio({
      revisao: { periodoInicio: dia(r.periodoInicio), periodoFim: dia(r.periodoFim), snapshot: r.snapshot as unknown as SnapshotPy },
      razao: e.razao,
      nomeArquivo: e.nomeArquivo,
      novoId: randomUUID,
    });
    if (!apoio.ok) return apoio;
    if (!(await avancar(tx, tenantId, empresaId, r.id, versao.data, { snapshot: json(apoio.valor.snapshot) }))) return versaoDesatualizada();
    return {
      ok: true,
      valor: { acao: ACOES_DA_REVISAO.apoio, dados: { arquivo: e.nomeArquivo, linhas: apoio.valor.linhas, hash: apoio.valor.hash } },
    };
  }, OPCOES_DA_TRANSACAO);
  if (!feito.ok) return feito;
  return depois(tenantId, empresaId, revisaoId, feito.valor);
}

// ─── Vínculos ───────────────────────────────────────────────────────────────

/** `criar_vinculo`: a relação que a pessoa confirma entre lançamentos do extrato e do razão. */
export async function criarVinculo(
  tenantId: string,
  userId: string,
  empresaId: string,
  revisaoId: string,
  d: NovoVinculo,
): Promise<ResultadoRevisao<EscritaDaRevisao>> {
  const entrada = novoVinculoSchema.safeParse(d);
  if (!entrada.success) return entradaInvalida(entrada.error);
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const feito = await getPrisma().$transaction(async (tx): Promise<ResultadoRevisao<AuditoriaDaRevisao>> => {
    const r = await lerRevisao(tx, tenantId, empresaId, revisaoId);
    if (!r) return revisaoNaoEncontrada();
    const fontes = exigirFontes(await fontesValidas(tx, tenantId, empresaId, r));
    if (fontes) return fontes;
    const gravados = await lerVinculos(tx, tenantId, empresaId, r.id);
    const v = validarVinculo({
      versaoAtual: r.versao,
      snapshot: r.snapshot as unknown as SnapshotPy,
      vinculos: gravados.map((g) => ({ estado: g.estado, extrato_ids: g.extratoIds as string[], razao_itens: g.razaoItens as ItemVinculoPy[] })),
      dados: entrada.data,
    });
    if (!v.ok) return v;
    if (!(await avancar(tx, tenantId, empresaId, r.id, entrada.data.versao))) return versaoDesatualizada();
    const criado = await tx.coreConciliacaoVinculo.create({
      data: {
        tenantId,
        empresaId,
        revisaoId: r.id,
        extratoIds: json(v.valor.extratoIds),
        razaoItens: json(v.valor.razaoItens),
        totalExtrato: paraBanco(v.valor.totalExtrato),
        totalRazao: paraBanco(v.valor.totalRazao),
        diferenca: paraBanco(v.valor.diferenca),
        observacao: v.valor.observacao,
        estado: "ATIVO",
        confirmadoPorId: userId,
        responsavel: await responsavel(tx, tenantId, userId),
      },
      select: { id: true },
    });
    return {
      ok: true,
      valor: {
        acao: ACOES_DA_REVISAO.confirmado,
        dados: {
          vinculo_id: criado.id,
          extrato_ids: v.valor.extratoIds,
          razao_itens: v.valor.razaoItens,
          diferenca: texto(v.valor.diferenca),
          observacao: v.valor.observacao,
        },
      },
    };
  }, OPCOES_DA_TRANSACAO);
  if (!feito.ok) return feito;
  return depois(tenantId, empresaId, revisaoId, feito.valor);
}

/**
 * `desfazer`: o vínculo fica, como DESFEITO, com quem desfez, quando e por quê. Vale mesmo com o
 * extrato alterado: a evidência original não se apaga.
 */
export async function desfazerVinculo(
  tenantId: string,
  userId: string,
  empresaId: string,
  revisaoId: string,
  vinculoId: string,
  d: DesfazerVinculo,
): Promise<ResultadoRevisao<EscritaDaRevisao>> {
  const entrada = desfazerVinculoSchema.safeParse(d);
  if (!entrada.success) return entradaInvalida(entrada.error);
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const feito = await getPrisma().$transaction(async (tx): Promise<ResultadoRevisao<AuditoriaDaRevisao>> => {
    const r = await lerRevisao(tx, tenantId, empresaId, revisaoId);
    if (!r) return revisaoNaoEncontrada();
    const vinculo = await tx.coreConciliacaoVinculo.findFirst({
      where: { id: vinculoId, revisaoId: r.id, tenantId, empresaId },
      select: { id: true, estado: true },
    });
    const recusa = conferirDesfazer(vinculo);
    if (recusa) return recusa;
    if (!(await avancar(tx, tenantId, empresaId, r.id, entrada.data.versao))) return versaoDesatualizada();
    await tx.coreConciliacaoVinculo.update({
      where: { id: vinculo!.id },
      data: {
        estado: "DESFEITO",
        desfeitoPor: await responsavel(tx, tenantId, userId),
        desfeitoEm: new Date(),
        motivoDesfazer: entrada.data.motivo,
      },
    });
    return { ok: true, valor: { acao: ACOES_DA_REVISAO.desfeito, dados: { vinculo_id: vinculo!.id, motivo: entrada.data.motivo } } };
  }, OPCOES_DA_TRANSACAO);
  if (!feito.ok) return feito;
  return depois(tenantId, empresaId, revisaoId, feito.valor);
}
