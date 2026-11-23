import "server-only";

// Cartões de crédito (Bloco C, Fase C3, 23/11/2026): porte de `CartaoService`
// (`src/domain/cartoes/service.py`) e da rota de importação do PDF (`importar_pdf`). A validação, a
// identidade da compra importada e as recusas são as funções puras de `cartoes/servico.ts`; aqui ficam as
// leituras, as gravações, as travas e a chamada do leitor.
//
// - Toda leitura e escrita confere tenant e empresa (`empresaDoTenant`) e o cartão e a fatura DESTA
//   empresa: id de outro escritório, de outra empresa ou de outro cartão é "não encontrado".
// - O que o original fazia com `with_for_update` sobre a fatura (alterar, pagar, desvincular o pagamento,
//   lançar, importar, remover lançamento) roda aqui numa transação que trava a linha da fatura
//   (`SELECT … FOR UPDATE`): duas pessoas não lançam numa fatura enquanto outra a paga, e uma transação do
//   extrato não quita duas faturas (a coluna única da transação também barra).
// - O total da fatura é sempre a soma dos lançamentos vivos, como no original (a coluna `valorTotal` fica
//   só para a carga).
// - Auditoria: a rota registra (`logAudit`). Cada escrita devolve `auditoria` com a ação e os dados; o
//   original auditava a mudança de status da fatura e só registrava o resto em log.

import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { texto, reescala, type Dec } from "../motor/decimal";
import { decDoBanco, dia, ehDuplicado, empresaDoTenant, NAO_ENCONTRADA, paraBanco } from "./base";
import {
  CARTAO_NAO_ENCONTRADO,
  CONTA_NAO_ENCONTRADA,
  conferirAssociacao,
  conferirAtualizacaoDaFatura,
  conflito,
  CsvInvalido,
  FATURA_NAO_ENCONTRADA,
  importarLancamentosDoPdf,
  importarLinhasDoCsv,
  invalida,
  LANCAMENTO_NAO_ENCONTRADO,
  linhasDoCsv,
  naoEncontrado,
  somar,
  validarAtualizacaoDaFatura,
  validarAtualizacaoDoCartao,
  validarCartao,
  validarFatura,
  validarLancamento,
  type RecusaCartao,
  type ResultadoCartao,
  type ResultadoDaImportacao,
  type StatusFatura,
} from "../cartoes/servico";
import { lerFaturaPdf, LeituraRecusada } from "../cartoes/leitor";
import type { CartaoDaTela, FaturaDaTela, LancamentoDaTela, ListaDeLancamentos, PagamentoPossivel, ResultadoDaImportacaoNaTela } from "../cartoes/telaDosCartoes";
import { iaLiberadaParaDocumentos } from "./notas";
import { descricaoDaAgencia } from "./cadastros";

export type Tx = Prisma.TransactionClient;

/** O que a rota passa ao `logAudit`: a entidade (o cartão ou a fatura), a ação e os dados. */
export type AuditoriaDoCartao = { entidade: "CoreCartaoCredito" | "CoreFaturaCartao" | "CoreTransacao"; entidadeId: string; acao: string; dados: Record<string, unknown> };
export type Escrita<T> = { valor: T; auditoria: AuditoriaDoCartao[] };

/** As ações registradas. Entre parênteses, o que o original auditava (`registrar_auditoria`) ou só logava. */
export const ACOES_DOS_CARTOES = {
  cartaoCriado: "contabil.core.cartao.criado", // log cartao.criado
  cartaoAlterado: "contabil.core.cartao.alterado",
  cartaoRemovido: "contabil.core.cartao.removido",
  faturaCriada: "contabil.core.fatura.criada", // log fatura.criada
  faturaAlterada: "contabil.core.fatura.alterada", // fatura.status_atualizado (quando o status muda)
  faturaPaga: "contabil.core.fatura.paga", // fatura.paga
  pagamentoDesassociado: "contabil.core.fatura.pagamento_desassociado", // fatura.pagamento_desassociado
  lancamentoCriado: "contabil.core.fatura.lancamento.criado",
  lancamentoRemovido: "contabil.core.fatura.lancamento.removido",
  lancamentosImportados: "contabil.core.fatura.lancamentos.importados", // log fatura.csv_importado / fatura.pdf_importado
} as const;

const empresaNaoEncontrada = (): RecusaCartao => naoEncontrado(NAO_ENCONTRADA);
const dinheiro = (v: Prisma.Decimal | string) => texto(reescala(decDoBanco(v), -2));
const TEMPO_DA_TRANSACAO = { timeout: 30_000 };

// ─── Leituras comuns ────────────────────────────────────────────────────────

const COLUNAS_DO_CARTAO = {
  id: true, nome: true, bandeira: true, ultimosDigitos: true, diaFechamento: true, diaVencimento: true, limite: true, ativo: true,
} satisfies Prisma.CoreCartaoCreditoSelect;

/** `_get_cartao_or_404`: o cartão vivo desta empresa. */
function lerCartao(db: Tx | ReturnType<typeof getPrisma>, tenantId: string, empresaId: string, cartaoId: string) {
  return db.coreCartaoCredito.findFirst({ where: { id: cartaoId, tenantId, empresaId, deletedAt: null }, select: COLUNAS_DO_CARTAO });
}

const COLUNAS_DA_FATURA = {
  id: true, cartaoId: true, competencia: true, dataFechamento: true, dataVencimento: true, status: true, transacaoId: true, observacao: true,
  cartao: { select: { nome: true, bandeira: true, ultimosDigitos: true } },
  transacao: { select: { historico: true, valor: true, data: true, status: true, deletedAt: true, empresaId: true } },
} satisfies Prisma.CoreFaturaCartaoSelect;

type LinhaDaFatura = Prisma.CoreFaturaCartaoGetPayload<{ select: typeof COLUNAS_DA_FATURA }>;

/**
 * `_get_fatura_or_404`: a fatura viva desta empresa e deste cartão. Com `travar`, a linha fica presa até o
 * fim da transação (o `with_for_update(of=FaturaCartao)` do original). O cartão não precisa estar vivo,
 * como lá: a fatura de um cartão removido continua acessível pelo id.
 */
export async function lerFatura(db: Tx, tenantId: string, empresaId: string, cartaoId: string, faturaId: string, travar: boolean): Promise<LinhaDaFatura | null> {
  if (travar) await db.$queryRaw`SELECT id FROM core_faturas_cartao WHERE id = ${faturaId} FOR UPDATE`;
  return db.coreFaturaCartao.findFirst({ where: { id: faturaId, cartaoId, tenantId, empresaId, deletedAt: null }, select: COLUNAS_DA_FATURA });
}

/** `_totais_fatura`: a quantidade e a soma dos lançamentos vivos. */
async function totais(db: Tx | ReturnType<typeof getPrisma>, faturaId: string): Promise<{ quantidade: number; soma: Dec }> {
  const r = await db.coreLancamentoCartao.aggregate({ where: { faturaId, deletedAt: null }, _count: { _all: true }, _sum: { valor: true } });
  return { quantidade: r._count._all, soma: r._sum.valor ? decDoBanco(r._sum.valor) : decDoBanco("0") };
}

function faturaParaTela(f: LinhaDaFatura, empresaId: string, quantidade: number, soma: Dec): FaturaDaTela {
  const t = f.transacao && f.transacao.empresaId === empresaId ? f.transacao : null;
  return {
    id: f.id,
    cartaoId: f.cartaoId,
    cartaoNome: f.cartao.nome,
    cartaoBandeira: f.cartao.bandeira,
    cartaoDigitos: f.cartao.ultimosDigitos,
    competencia: f.competencia,
    dataFechamento: f.dataFechamento ? f.dataFechamento.toISOString() : null,
    dataVencimento: f.dataVencimento ? f.dataVencimento.toISOString() : null,
    valorTotal: texto(reescala(soma, -2)),
    status: f.status as StatusFatura,
    transacaoId: f.transacaoId,
    transacao: t ? { historico: t.historico, valor: dinheiro(t.valor), data: dia(t.data), status: t.status, desfeita: t.deletedAt !== null } : null,
    observacao: f.observacao,
    totalLancamentos: quantidade,
  };
}

function cartaoParaTela(c: Prisma.CoreCartaoCreditoGetPayload<{ select: typeof COLUNAS_DO_CARTAO }>, totalFaturas = 0, faturaAbertaValor: Dec | null = null): CartaoDaTela {
  return {
    id: c.id,
    nome: c.nome,
    bandeira: c.bandeira,
    ultimosDigitos: c.ultimosDigitos,
    diaFechamento: c.diaFechamento,
    diaVencimento: c.diaVencimento,
    limite: c.limite === null ? null : dinheiro(c.limite),
    ativo: c.ativo,
    totalFaturas,
    faturaAbertaValor: faturaAbertaValor ? texto(reescala(faturaAbertaValor, -2)) : null,
  };
}

const lancamentoParaTela = (l: { id: string; dataCompra: Date; descricao: string; valor: Prisma.Decimal; contaId: string | null; parcelaAtual: number | null; parcelaTotal: number | null }): LancamentoDaTela => ({
  id: l.id,
  dataCompra: l.dataCompra.toISOString(),
  descricao: l.descricao,
  valor: dinheiro(l.valor),
  contaId: l.contaId,
  parcelaAtual: l.parcelaAtual,
  parcelaTotal: l.parcelaTotal,
});

// ─── Cartões ────────────────────────────────────────────────────────────────

/** `listar_cartoes`: por nome (empate pelo id), com o total de faturas e o valor da fatura aberta mais recente. */
export async function listarCartoes(tenantId: string, empresaId: string): Promise<ResultadoCartao<CartaoDaTela[]>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const prisma = getPrisma();
  const cartoes = await prisma.coreCartaoCredito.findMany({ where: { tenantId, empresaId, deletedAt: null }, select: COLUNAS_DO_CARTAO, orderBy: [{ nome: "asc" }, { id: "asc" }] });
  if (!cartoes.length) return { ok: true, valor: [] };
  const faturas = await prisma.coreFaturaCartao.findMany({
    where: { cartaoId: { in: cartoes.map((c) => c.id) }, deletedAt: null },
    select: { id: true, cartaoId: true, competencia: true, status: true },
    orderBy: [{ competencia: "desc" }, { id: "asc" }],
  });
  const somas = new Map<string, Dec>();
  if (faturas.length) {
    const grupos = await prisma.coreLancamentoCartao.groupBy({ by: ["faturaId"], where: { faturaId: { in: faturas.map((f) => f.id) }, deletedAt: null }, _sum: { valor: true } });
    for (const g of grupos) if (g._sum.valor) somas.set(g.faturaId, decDoBanco(g._sum.valor));
  }
  return {
    ok: true,
    valor: cartoes.map((c) => {
      const doCartao = faturas.filter((f) => f.cartaoId === c.id);
      const aberta = doCartao.find((f) => f.status === "aberta");
      return cartaoParaTela(c, doCartao.length, aberta ? (somas.get(aberta.id) ?? decDoBanco("0")) : null);
    }),
  };
}

/** `criar_cartao` */
export async function criarCartao(tenantId: string, empresaId: string, corpo: Record<string, unknown>): Promise<ResultadoCartao<Escrita<CartaoDaTela>>> {
  const v = validarCartao(corpo);
  if (!v.ok) return invalida(v.erro);
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const d = v.valor;
  const c = await getPrisma().coreCartaoCredito.create({
    data: {
      tenantId, empresaId, nome: d.nome, bandeira: d.bandeira, ultimosDigitos: d.ultimosDigitos, diaFechamento: d.diaFechamento, diaVencimento: d.diaVencimento,
      limite: d.limite ? paraBanco(d.limite) : null,
    },
    select: COLUNAS_DO_CARTAO,
  });
  return { ok: true, valor: { valor: cartaoParaTela(c), auditoria: [{ entidade: "CoreCartaoCredito", entidadeId: c.id, acao: ACOES_DOS_CARTOES.cartaoCriado, dados: { nome: c.nome, cartao_id: c.id, bandeira: c.bandeira } }] } };
}

/** `atualizar_cartao`: só o que veio muda. */
export async function atualizarCartao(tenantId: string, empresaId: string, cartaoId: string, corpo: Record<string, unknown>): Promise<ResultadoCartao<Escrita<CartaoDaTela>>> {
  const v = validarAtualizacaoDoCartao(corpo);
  if (!v.ok) return invalida(v.erro);
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const prisma = getPrisma();
  const atual = await lerCartao(prisma, tenantId, empresaId, cartaoId);
  if (!atual) return naoEncontrado(CARTAO_NAO_ENCONTRADO);
  const d = v.valor;
  const r = await prisma.coreCartaoCredito.updateMany({
    where: { id: cartaoId, tenantId, empresaId, deletedAt: null },
    data: { nome: d.nome, diaFechamento: d.diaFechamento, diaVencimento: d.diaVencimento, limite: d.limite ? paraBanco(d.limite) : undefined, ativo: d.ativo },
  });
  if (r.count !== 1) return naoEncontrado(CARTAO_NAO_ENCONTRADO);
  const c = (await lerCartao(prisma, tenantId, empresaId, cartaoId))!;
  const mudou = Object.fromEntries(Object.entries({ nome: d.nome, dia_fechamento: d.diaFechamento, dia_vencimento: d.diaVencimento, limite: d.limite ? dinheiro(paraBanco(d.limite)) : undefined, ativo: d.ativo }).filter(([, x]) => x !== undefined));
  return { ok: true, valor: { valor: cartaoParaTela(c), auditoria: [{ entidade: "CoreCartaoCredito", entidadeId: c.id, acao: ACOES_DOS_CARTOES.cartaoAlterado, dados: { nome: c.nome, cartao_id: c.id, ...mudou } }] } };
}

/** `remover_cartao`: recusa com distribuição aplicada ou fatura aberta/fechada; exclusão lógica. */
export async function removerCartao(tenantId: string, empresaId: string, cartaoId: string): Promise<ResultadoCartao<Escrita<null>>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const prisma = getPrisma();
  const cartao = await lerCartao(prisma, tenantId, empresaId, cartaoId);
  if (!cartao) return naoEncontrado(CARTAO_NAO_ENCONTRADO);
  // Como no original: a distribuição aplicada (`aplicacao IS NOT NULL`) conta mesmo em fatura excluída.
  const aplicadas = await prisma.coreFaturaDistribuicao.count({ where: { fatura: { cartaoId }, aplicacao: { not: Prisma.DbNull } } });
  if (aplicadas) return conflito("Desfaça as distribuições contábeis antes de remover o cartão.");
  const abertas = await prisma.coreFaturaCartao.count({ where: { cartaoId, status: { in: ["aberta", "fechada"] }, deletedAt: null } });
  if (abertas > 0) return conflito(`Cartão possui ${abertas} fatura(s) em aberto. Quite-as antes de remover.`);
  const r = await prisma.coreCartaoCredito.updateMany({ where: { id: cartaoId, tenantId, empresaId, deletedAt: null }, data: { deletedAt: new Date() } });
  if (r.count !== 1) return naoEncontrado(CARTAO_NAO_ENCONTRADO);
  return { ok: true, valor: { valor: null, auditoria: [{ entidade: "CoreCartaoCredito", entidadeId: cartaoId, acao: ACOES_DOS_CARTOES.cartaoRemovido, dados: { nome: cartao.nome, cartao_id: cartaoId } }] } };
}


// ─── Faturas ────────────────────────────────────────────────────────────────

/** `listar_faturas`: da competência mais recente para a mais antiga. */
export async function listarFaturas(tenantId: string, empresaId: string, cartaoId: string): Promise<ResultadoCartao<FaturaDaTela[]>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const prisma = getPrisma();
  if (!(await lerCartao(prisma, tenantId, empresaId, cartaoId))) return naoEncontrado(CARTAO_NAO_ENCONTRADO);
  const faturas = await prisma.coreFaturaCartao.findMany({ where: { cartaoId, deletedAt: null }, select: COLUNAS_DA_FATURA, orderBy: [{ competencia: "desc" }, { id: "asc" }] });
  const grupos = faturas.length
    ? await prisma.coreLancamentoCartao.groupBy({ by: ["faturaId"], where: { faturaId: { in: faturas.map((f) => f.id) }, deletedAt: null }, _count: { _all: true }, _sum: { valor: true } })
    : [];
  const porFatura = new Map(grupos.map((g) => [g.faturaId, g]));
  return {
    ok: true,
    valor: faturas.map((f) => {
      const g = porFatura.get(f.id);
      return faturaParaTela(f, empresaId, g?._count._all ?? 0, g?._sum.valor ? decDoBanco(g._sum.valor) : decDoBanco("0"));
    }),
  };
}

/** Uma fatura (o cabeçalho da tela da fatura). */
export async function obterFatura(tenantId: string, empresaId: string, cartaoId: string, faturaId: string): Promise<ResultadoCartao<FaturaDaTela>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const prisma = getPrisma();
  const f = await lerFatura(prisma as unknown as Tx, tenantId, empresaId, cartaoId, faturaId, false);
  if (!f) return naoEncontrado(FATURA_NAO_ENCONTRADA);
  const t = await totais(prisma, faturaId);
  return { ok: true, valor: faturaParaTela(f, empresaId, t.quantidade, t.soma) };
}

const ehCompetenciaRepetida = (competencia: string) => conflito(`Já existe fatura para a competência ${competencia} neste cartão.`);

/** `criar_fatura`: uma por competência no cartão; nasce aberta e zerada. */
export async function criarFatura(tenantId: string, empresaId: string, cartaoId: string, corpo: Record<string, unknown>): Promise<ResultadoCartao<Escrita<FaturaDaTela>>> {
  const v = validarFatura(corpo);
  if (!v.ok) return invalida(v.erro);
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const prisma = getPrisma();
  if (!(await lerCartao(prisma, tenantId, empresaId, cartaoId))) return naoEncontrado(CARTAO_NAO_ENCONTRADO);
  const d = v.valor;
  const existe = await prisma.coreFaturaCartao.findFirst({ where: { cartaoId, competencia: d.competencia, deletedAt: null }, select: { id: true } });
  if (existe) return ehCompetenciaRepetida(d.competencia);
  let id: string;
  try {
    ({ id } = await prisma.coreFaturaCartao.create({
      data: { tenantId, empresaId, cartaoId, competencia: d.competencia, dataFechamento: d.dataFechamento, dataVencimento: d.dataVencimento, observacao: d.observacao, status: "aberta", valorTotal: "0.00" },
      select: { id: true },
    }));
  } catch (e) {
    // Outra pessoa criou a mesma competência nesse meio-tempo: a coluna única recusou.
    if (ehDuplicado(e)) return ehCompetenciaRepetida(d.competencia);
    throw e;
  }
  const f = await obterFatura(tenantId, empresaId, cartaoId, id);
  if (!f.ok) return f;
  return { ok: true, valor: { valor: f.valor, auditoria: [{ entidade: "CoreFaturaCartao", entidadeId: id, acao: ACOES_DOS_CARTOES.faturaCriada, dados: { nome: `${f.valor.cartaoNome} ${d.competencia}`, fatura_id: id, competencia: d.competencia } }] } };
}

/** O que `_auditar_status_fatura` gravava: o status e a transação, antes e depois. */
function auditoriaDoStatus(acao: string, f: { id: string; competencia: string; cartaoNome: string }, antes: { status: string; transacaoId: string | null }, depois: { status: string; transacaoId: string | null }): AuditoriaDoCartao {
  return {
    entidade: "CoreFaturaCartao",
    entidadeId: f.id,
    acao,
    dados: { nome: `${f.cartaoNome} ${f.competencia}`, fatura_id: f.id, antes: { status: antes.status, transacao_id: antes.transacaoId }, depois: { status: depois.status, transacao_id: depois.transacaoId } },
  };
}

/** Roda `passo` numa transação com a fatura travada. */
async function comFaturaTravada<T>(
  tenantId: string,
  empresaId: string,
  cartaoId: string,
  faturaId: string,
  passo: (tx: Tx, f: LinhaDaFatura) => Promise<ResultadoCartao<T>>,
): Promise<ResultadoCartao<T>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  return getPrisma().$transaction(async (tx) => {
    const f = await lerFatura(tx, tenantId, empresaId, cartaoId, faturaId, true);
    if (!f) return naoEncontrado(FATURA_NAO_ENCONTRADA);
    return passo(tx, f);
  }, TEMPO_DA_TRANSACAO);
}

async function faturaDaTx(tx: Tx, tenantId: string, empresaId: string, cartaoId: string, faturaId: string): Promise<FaturaDaTela> {
  const f = (await lerFatura(tx, tenantId, empresaId, cartaoId, faturaId, false))!;
  const t = await totais(tx, faturaId);
  return faturaParaTela(f, empresaId, t.quantidade, t.soma);
}

/** `atualizar_fatura`: status (nunca para "paga" nem de "paga"), vencimento e observação. */
export async function atualizarFatura(tenantId: string, empresaId: string, cartaoId: string, faturaId: string, corpo: Record<string, unknown>): Promise<ResultadoCartao<Escrita<FaturaDaTela>>> {
  const v = validarAtualizacaoDaFatura(corpo);
  if (!v.ok) return invalida(v.erro);
  const d = v.valor;
  return comFaturaTravada(tenantId, empresaId, cartaoId, faturaId, async (tx, f) => {
    const recusa = conferirAtualizacaoDaFatura(f.status as StatusFatura, d.status);
    if (recusa) return recusa;
    await tx.coreFaturaCartao.update({
      where: { id: faturaId },
      data: { ...(d.status !== null ? { status: d.status } : {}), ...(d.dataVencimento ? { dataVencimento: d.dataVencimento } : {}), ...(d.observacao !== null ? { observacao: d.observacao } : {}) },
    });
    const tela = await faturaDaTx(tx, tenantId, empresaId, cartaoId, faturaId);
    const auditoria = tela.status !== f.status ? [auditoriaDoStatus(ACOES_DOS_CARTOES.faturaAlterada, { id: faturaId, competencia: f.competencia, cartaoNome: f.cartao.nome }, { status: f.status, transacaoId: f.transacaoId }, { status: tela.status, transacaoId: tela.transacaoId })] : [];
    return { ok: true, valor: { valor: tela, auditoria } };
  });
}

/**
 * `associar_transacao`: a transação de débito, viva, desta empresa, com o valor exato do total, quita a
 * fatura e a deixa paga. Uma transação quita uma fatura só.
 */
export async function associarPagamento(tenantId: string, empresaId: string, cartaoId: string, faturaId: string, transacaoId: string): Promise<ResultadoCartao<Escrita<FaturaDaTela>>> {
  try {
    return await comFaturaTravada(tenantId, empresaId, cartaoId, faturaId, async (tx, f) => {
      if (f.transacaoId !== null) return conferirAssociacao(f, null, false, decDoBanco("0"))!;
      await tx.$queryRaw`SELECT id FROM core_transacoes WHERE id = ${transacaoId} FOR UPDATE`;
      // A transação desfeita não vale (o original não olhava o `deleted_at`), como nas notas e nos comprovantes.
      const t = await tx.coreTransacao.findFirst({ where: { id: transacaoId, tenantId, empresaId, deletedAt: null }, select: { dc: true, valor: true } });
      const outra = t ? await tx.coreFaturaCartao.findFirst({ where: { transacaoId, id: { not: faturaId } }, select: { id: true } }) : null;
      const { soma } = await totais(tx, faturaId);
      const recusa = conferirAssociacao(f, t ? { dc: t.dc, valor: decDoBanco(t.valor) } : null, !!outra, soma);
      if (recusa) return recusa;
      await tx.coreFaturaCartao.update({ where: { id: faturaId }, data: { transacaoId, status: "paga" } });
      const tela = await faturaDaTx(tx, tenantId, empresaId, cartaoId, faturaId);
      return { ok: true, valor: { valor: tela, auditoria: [auditoriaDoStatus(ACOES_DOS_CARTOES.faturaPaga, { id: faturaId, competencia: f.competencia, cartaoNome: f.cartao.nome }, { status: f.status, transacaoId: f.transacaoId }, { status: "paga", transacaoId })] } };
    });
  } catch (e) {
    // A coluna única da transação recusou: outra fatura foi quitada por ela nesse meio-tempo.
    if (ehDuplicado(e)) return conflito("Esta transação já quitou outra fatura.");
    throw e;
  }
}

/**
 * `desassociar_transacao`: tira o pagamento e volta a fatura para "fechada". Como no original, não confere
 * se havia pagamento: numa fatura aberta, o efeito é fechá-la. Com a distribuição aplicada, recusa.
 */
export async function desassociarPagamento(tenantId: string, empresaId: string, cartaoId: string, faturaId: string): Promise<ResultadoCartao<Escrita<FaturaDaTela>>> {
  return comFaturaTravada(tenantId, empresaId, cartaoId, faturaId, async (tx, f) => {
    const d = await tx.coreFaturaDistribuicao.findFirst({ where: { faturaId, empresaId }, select: { aplicacao: true } });
    if (d && d.aplicacao !== null) {
      return conflito("Desfaça a distribuição contábil antes de desvincular o pagamento.");
    }
    await tx.coreFaturaCartao.update({ where: { id: faturaId }, data: { transacaoId: null, status: "fechada" } });
    const tela = await faturaDaTx(tx, tenantId, empresaId, cartaoId, faturaId);
    return { ok: true, valor: { valor: tela, auditoria: [auditoriaDoStatus(ACOES_DOS_CARTOES.pagamentoDesassociado, { id: faturaId, competencia: f.competencia, cartaoNome: f.cartao.nome }, { status: f.status, transacaoId: f.transacaoId }, { status: "fechada", transacaoId: null })] } };
  });
}

/**
 * Os pagamentos possíveis de uma fatura (a tela do original consultava o extrato): débitos vivos desta
 * empresa, pendentes ou classificados, com o valor exato do total, que não quitaram outra fatura.
 */
export async function pagamentosPossiveis(tenantId: string, empresaId: string, cartaoId: string, faturaId: string, busca: string | null): Promise<ResultadoCartao<PagamentoPossivel[]>> {
  const f = await obterFatura(tenantId, empresaId, cartaoId, faturaId);
  if (!f.ok) return f;
  if (f.valor.valorTotal === "0.00") return { ok: true, valor: [] };
  const linhas = await getPrisma().coreTransacao.findMany({
    where: {
      tenantId, empresaId, deletedAt: null, dc: "D", status: { in: ["pendente", "processada"] }, valor: f.valor.valorTotal, faturas: { none: {} },
      ...(busca?.trim() ? { historico: { contains: busca.trim().slice(0, 100) } } : {}),
    },
    select: { id: true, data: true, historico: true, valor: true, status: true, agencia: { select: { bancoSigla: true, agencia: true, numero: true, digito: true } } },
    orderBy: [{ data: "desc" }, { id: "asc" }],
    take: 100,
  });
  return { ok: true, valor: linhas.map((t) => ({ id: t.id, data: dia(t.data), historico: t.historico, valor: dinheiro(t.valor), status: t.status, agencia: descricaoDaAgencia(t.agencia) })) };
}

// ─── Lançamentos ────────────────────────────────────────────────────────────

const COLUNAS_DO_LANCAMENTO = { id: true, dataCompra: true, descricao: true, valor: true, contaId: true, parcelaAtual: true, parcelaTotal: true } satisfies Prisma.CoreLancamentoCartaoSelect;

/** `listar_lancamentos`: pela data da compra (empate pela criação, como o PostgreSQL devolvia, e pelo id), com a soma. */
export async function listarLancamentos(tenantId: string, empresaId: string, cartaoId: string, faturaId: string): Promise<ResultadoCartao<ListaDeLancamentos>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  const prisma = getPrisma();
  if (!(await lerFatura(prisma as unknown as Tx, tenantId, empresaId, cartaoId, faturaId, false))) return naoEncontrado(FATURA_NAO_ENCONTRADA);
  const linhas = await prisma.coreLancamentoCartao.findMany({ where: { faturaId, deletedAt: null }, select: COLUNAS_DO_LANCAMENTO, orderBy: [{ dataCompra: "asc" }, { createdAt: "asc" }, { id: "asc" }] });
  const soma = somar(linhas.map((l) => reescala(decDoBanco(l.valor), -2)));
  return { ok: true, valor: { itens: linhas.map(lancamentoParaTela), total: linhas.length, valorTotal: texto(reescala(soma, -2)) } };
}

/** `adicionar_lancamento`: na fatura não paga, com a conta contábil (opcional) desta empresa. */
export async function adicionarLancamento(tenantId: string, empresaId: string, cartaoId: string, faturaId: string, corpo: Record<string, unknown>): Promise<ResultadoCartao<Escrita<LancamentoDaTela>>> {
  const v = validarLancamento(corpo);
  if (!v.ok) return invalida(v.erro);
  const d = v.valor;
  return comFaturaTravada(tenantId, empresaId, cartaoId, faturaId, async (tx, f) => {
    if (f.status === "paga") return invalida("Não é possível adicionar lançamentos a uma fatura paga.");
    if (d.contaId) {
      const conta = await tx.corePlanoConta.findFirst({ where: { id: d.contaId, tenantId, empresaId, deletedAt: null }, select: { id: true } });
      if (!conta) return naoEncontrado(CONTA_NAO_ENCONTRADA);
    }
    const l = await tx.coreLancamentoCartao.create({
      data: { tenantId, empresaId, faturaId, dataCompra: d.dataCompra, descricao: d.descricao, valor: paraBanco(d.valor), contaId: d.contaId, parcelaAtual: d.parcelaAtual, parcelaTotal: d.parcelaTotal },
      select: COLUNAS_DO_LANCAMENTO,
    });
    const tela = lancamentoParaTela(l);
    return {
      ok: true,
      valor: { valor: tela, auditoria: [{ entidade: "CoreFaturaCartao", entidadeId: faturaId, acao: ACOES_DOS_CARTOES.lancamentoCriado, dados: { nome: `${f.cartao.nome} ${f.competencia}`, fatura_id: faturaId, lancamento_id: l.id, descricao: l.descricao, valor: tela.valor } }] },
    };
  });
}

/** Grava as compras novas de uma importação (CSV ou PDF), na fatura travada. */
async function gravarImportacao(
  tenantId: string,
  empresaId: string,
  cartaoId: string,
  faturaId: string,
  origem: "csv" | "pdf",
  importar: (existentes: Set<string>, removidos: Set<string>) => ResultadoDaImportacao,
): Promise<ResultadoCartao<Escrita<ResultadoDaImportacaoNaTela>>> {
  return comFaturaTravada(tenantId, empresaId, cartaoId, faturaId, async (tx, f) => {
    if (f.status === "paga") return invalida("Não é possível importar lançamentos em fatura paga.");
    const todos = await tx.coreLancamentoCartao.findMany({ where: { faturaId }, select: { id: true, deletedAt: true } });
    const r = importar(new Set(todos.filter((l) => !l.deletedAt).map((l) => l.id)), new Set(todos.filter((l) => l.deletedAt).map((l) => l.id)));
    if (r.novos.length) {
      await tx.coreLancamentoCartao.createMany({
        data: r.novos.map((n) => ({
          id: n.id, tenantId, empresaId, faturaId, dataCompra: n.dataCompra, descricao: n.descricao, valor: paraBanco(n.valor), parcelaAtual: n.parcelaAtual, parcelaTotal: n.parcelaTotal,
        })),
      });
    }
    const tela = { importados: r.importados, duplicados: r.duplicados, erros: r.erros };
    const auditoria: AuditoriaDoCartao[] = r.importados
      ? [{ entidade: "CoreFaturaCartao", entidadeId: faturaId, acao: ACOES_DOS_CARTOES.lancamentosImportados, dados: { nome: `${f.cartao.nome} ${f.competencia}`, fatura_id: faturaId, origem, ...tela, erros: r.erros.length } }]
      : [];
    return { ok: true, valor: { valor: tela, auditoria } };
  });
}

/** `importar_csv`: o CSV em UTF-8 (com ou sem BOM; byte inválido vira "�", como `errors="replace"`). */
export async function importarCsv(tenantId: string, empresaId: string, cartaoId: string, faturaId: string, conteudo: Uint8Array): Promise<ResultadoCartao<Escrita<ResultadoDaImportacaoNaTela>>> {
  let linhas;
  try {
    linhas = linhasDoCsv(new TextDecoder("utf-8", { ignoreBOM: false }).decode(conteudo));
  } catch (e) {
    if (e instanceof CsvInvalido) return invalida(e.message);
    throw e;
  }
  return gravarImportacao(tenantId, empresaId, cartaoId, faturaId, "csv", (existentes, removidos) => importarLinhasDoCsv(linhas, faturaId, existentes, removidos));
}

/** O tempo da leitura do PDF: o do orçamento (60 s) mais 5, como a rota do original. */
const TEMPO_DO_PDF_MS = 65_000;
class TempoEsgotado extends Error {}

/**
 * A rota `importar_pdf`: lê o PDF (o texto pelos rótulos e, se preciso, a IA de texto do escritório) e
 * grava como `importar_lancamentos_pdf`. Como no original, a leitura vem antes de conferir a fatura.
 */
export async function importarPdf(tenantId: string, userId: string, empresaId: string, cartaoId: string, faturaId: string, conteudo: Uint8Array): Promise<ResultadoCartao<Escrita<ResultadoDaImportacaoNaTela>>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return empresaNaoEncontrada();
  let relogio: ReturnType<typeof setTimeout> | undefined;
  let lidos;
  try {
    const leitura = lerFaturaPdf(conteudo, {
      tenantId,
      documentosFinanceirosLiberados: await iaLiberadaParaDocumentos(tenantId),
      contexto: { userId, entityType: "empresa", entityId: empresaId },
    });
    const limite = new Promise<never>((_, rejeitar) => {
      relogio = setTimeout(() => rejeitar(new TempoEsgotado()), TEMPO_DO_PDF_MS);
    });
    lidos = await Promise.race([leitura, limite]);
  } catch (e) {
    if (e instanceof TempoEsgotado) return invalida("Processamento do PDF excedeu o tempo limite.");
    if (e instanceof LeituraRecusada) return invalida(`Arquivo PDF inválido: ${e.message}`);
    throw e;
  } finally {
    clearTimeout(relogio);
  }
  return gravarImportacao(tenantId, empresaId, cartaoId, faturaId, "pdf", (existentes, removidos) => importarLancamentosDoPdf(lidos, faturaId, existentes, removidos));
}

/** `remover_lancamento`: exclusão lógica, só na fatura não paga. */
export async function removerLancamento(tenantId: string, empresaId: string, cartaoId: string, faturaId: string, lancamentoId: string): Promise<ResultadoCartao<Escrita<null>>> {
  return comFaturaTravada(tenantId, empresaId, cartaoId, faturaId, async (tx, f) => {
    if (f.status === "paga") return invalida("Não é possível remover lançamentos de uma fatura paga.");
    const l = await tx.coreLancamentoCartao.findFirst({ where: { id: lancamentoId, faturaId, deletedAt: null }, select: { descricao: true, valor: true } });
    if (!l) return naoEncontrado(LANCAMENTO_NAO_ENCONTRADO);
    await tx.coreLancamentoCartao.update({ where: { id: lancamentoId }, data: { deletedAt: new Date() } });
    return {
      ok: true,
      valor: { valor: null, auditoria: [{ entidade: "CoreFaturaCartao", entidadeId: faturaId, acao: ACOES_DOS_CARTOES.lancamentoRemovido, dados: { nome: `${f.cartao.nome} ${f.competencia}`, fatura_id: faturaId, lancamento_id: lancamentoId, descricao: l.descricao, valor: dinheiro(l.valor) } }] },
    };
  });
}
