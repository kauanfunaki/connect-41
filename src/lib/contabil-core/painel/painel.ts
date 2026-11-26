// O painel do Contábil Core (Bloco D, Fase D1, 26/11/2026), sem banco: as divergências da sombra do NEO
// ("Conflitos e qualidade", porte de `consultar_divergencias` em `src/domain/neo/consultas.py`), as estatísticas
// da empresa (`StatsService`, `src/domain/stats/service.py`) e a carteira do escritório (`listar_carteira`,
// `src/domain/carteira/service.py`). O servidor (`servidor/painel.ts`) lê e conta; aqui se monta a resposta.
//
// Fidelidade conferida pelo gabarito (`painel/gabarito/`, gerado por `scripts/contabil-core/gabarito_painel.py`).
// As divergências deliberadas (a ordem dos empates, o mês corrente no fuso do escritório) estão em
// docs/CONTABIL-CORE.md ("Fase D1") e são contadas no teste.

import { compara, dec, ehZero, fixo, soma, type Dec } from "../motor/decimal";

// ─── O `round` do Python ──────────────────────────────────────────────────

/**
 * `round(x, casas)` do Python para `float`: arredonda o valor EXATO do double, meio para par (o `toFixed`
 * arredonda meio para cima: 0,125 vira 0,13, e o Python dá 0,12).
 */
export function arredondaPy(x: number, casas: number): number {
  if (!Number.isFinite(x)) return x;
  const exato = Math.abs(x).toFixed(100).replace(/0+$/, "");
  const [inteira, fracao = ""] = exato.split(".");
  if (fracao.length <= casas) return x;
  const mantida = fracao.slice(0, casas);
  const resto = fracao.slice(casas);
  let n = BigInt(inteira + mantida);
  const metade = resto[0] > "5" || (resto[0] === "5" && /[1-9]/.test(resto.slice(1)));
  const empate = resto[0] === "5" && !/[1-9]/.test(resto.slice(1));
  if (metade || (empate && n % BigInt(2) === BigInt(1))) n += BigInt(1);
  const t = n.toString().padStart(casas + 1, "0");
  const r = Number(`${t.slice(0, t.length - casas)}.${t.slice(t.length - casas)}`);
  return x < 0 ? -r : r;
}

const dinheiro = (d: Dec) => fixo(d, 2);
const ZERO = dec("0.00");

// ─── Conflitos e qualidade ────────────────────────────────────────────────

/** Quantas divergências vão na amostra (`LIMITE_AMOSTRA_DIVERGENCIAS`). */
export const LIMITE_DA_AMOSTRA = 10;

export type ContaDaDivergencia = { id: string; codigo: string; descricao: string };

/** Uma decisão do NEO com a medição da sombra feita (`contaDivergente` não nulo), com a transação dela. */
export type DecisaoMedida = {
  id: string;
  contaDivergente: boolean;
  contraparteId: string | null;
  origemEvidencia: string | null;
  contaRegra: ContaDaDivergencia | null;
  contaContraparte: ContaDaDivergencia | null;
  transacao: { id: string; historico: string; valor: Dec };
};

export type DivergenciaPorConta = {
  contaRegraId: string; contaRegraCodigo: string; contaRegraDescricao: string;
  contaContraparteId: string; contaContraparteCodigo: string; contaContraparteDescricao: string;
  quantidade: number;
  /** Texto do decimal, duas casas. */
  valorTotal: string;
};
export type DivergenciaDaAmostra = {
  decisaoId: string; transacaoId: string; historico: string; valor: string; origemEvidencia: string | null; contraparteId: string | null;
  contaRegraId: string; contaRegraCodigo: string; contaRegraDescricao: string;
  contaContraparteId: string; contaContraparteCodigo: string; contaContraparteDescricao: string;
};
export type Divergencias = {
  totalAvaliadas: number;
  totalDivergentes: number;
  percentualDivergentes: number;
  valorTotalDivergente: string;
  porConta: DivergenciaPorConta[];
  amostra: DivergenciaDaAmostra[];
};

const cmpTexto = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * `consultar_divergencias` depois da leitura: `decisoes` são as medidas (verdadeiro E falso entram no total
 * avaliado; nulo é "não medido" e não chega aqui), já recortadas pelo mês e pela conta bancária da transação.
 * Os pares de contas e a amostra só levam a divergência com as duas contas (o `JOIN` do original).
 */
export function resumirDivergencias(decisoes: readonly DecisaoMedida[]): Divergencias {
  const divergentes = decisoes.filter((d) => d.contaDivergente);
  const valorTotal = divergentes.reduce((s, d) => soma(s, d.transacao.valor), ZERO);
  const comContas = divergentes.filter((d) => d.contaRegra && d.contaContraparte);

  const pares = new Map<string, DivergenciaPorConta & { soma: Dec }>();
  for (const d of comContas) {
    const r = d.contaRegra!;
    const c = d.contaContraparte!;
    const chave = `${r.id}|${c.id}`;
    const p = pares.get(chave) ?? {
      contaRegraId: r.id, contaRegraCodigo: r.codigo, contaRegraDescricao: r.descricao,
      contaContraparteId: c.id, contaContraparteCodigo: c.codigo, contaContraparteDescricao: c.descricao,
      quantidade: 0, valorTotal: "", soma: ZERO,
    };
    p.quantidade += 1;
    p.soma = soma(p.soma, d.transacao.valor);
    pares.set(chave, p);
  }
  // O original ordena só pela soma; no empate, aqui o par sai pelos códigos e ids das contas.
  const porConta = [...pares.values()]
    .sort((a, b) => compara(b.soma, a.soma) || cmpTexto(a.contaRegraCodigo, b.contaRegraCodigo) || cmpTexto(a.contaContraparteCodigo, b.contaContraparteCodigo) || cmpTexto(a.contaRegraId, b.contaRegraId) || cmpTexto(a.contaContraparteId, b.contaContraparteId))
    .map(({ soma: s, ...p }) => ({ ...p, valorTotal: dinheiro(s) }));

  // Os maiores valores primeiro (os casos mais úteis para a decisão); o id da decisão desempata.
  const amostra = [...comContas]
    .sort((a, b) => compara(b.transacao.valor, a.transacao.valor) || cmpTexto(a.id, b.id))
    .slice(0, LIMITE_DA_AMOSTRA)
    .map((d) => ({
      decisaoId: d.id, transacaoId: d.transacao.id, historico: d.transacao.historico, valor: dinheiro(d.transacao.valor),
      origemEvidencia: d.origemEvidencia, contraparteId: d.contraparteId,
      contaRegraId: d.contaRegra!.id, contaRegraCodigo: d.contaRegra!.codigo, contaRegraDescricao: d.contaRegra!.descricao,
      contaContraparteId: d.contaContraparte!.id, contaContraparteCodigo: d.contaContraparte!.codigo, contaContraparteDescricao: d.contaContraparte!.descricao,
    }));

  return {
    totalAvaliadas: decisoes.length,
    totalDivergentes: divergentes.length,
    percentualDivergentes: decisoes.length ? arredondaPy((divergentes.length * 100) / decisoes.length, 2) : 0,
    valorTotalDivergente: ehZero(valorTotal) ? "0.00" : dinheiro(valorTotal),
    porConta,
    amostra,
  };
}

// ─── Estatísticas da empresa ──────────────────────────────────────────────

/** "AAAA-MM" somado de `n` meses (negativo volta). */
export function somaMeses(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${String(Math.floor(total / 12)).padStart(4, "0")}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Os meses da série: os `meses` últimos, terminando no mês corrente (`_subtract_months` e `_add_month`). */
export function mesesDaSerie(mesAtual: string, meses: number): string[] {
  return Array.from({ length: meses }, (_, k) => somaMeses(mesAtual, k - (meses - 1)));
}

/** O que o servidor conta no banco (as mesmas consultas do `StatsService`). */
export type ContagensDaEmpresa = {
  transacoes: number;
  /** Transações vivas com pelo menos uma partida viva. */
  conciliadas: number;
  registros: number;
  notas: number;
  comprovantes: number;
  /** Por mês ("AAAA-MM", em UTC), a partir do primeiro mês da série. */
  porMes: { transacoes: ReadonlyMap<string, number>; registros: ReadonlyMap<string, number>; comprovantes: ReadonlyMap<string, number>; notas: ReadonlyMap<string, number> };
  /** As contas bancárias ativas, com as transações vivas e as que têm partida viva. */
  agencias: { id: string; bancoSigla: string; agencia: string; numero: string; total: number; conciliadas: number }[];
};

export type Estatisticas = {
  resumo: {
    totalTransacoes: number; totalConciliados: number; totalNaoConciliados: number; totalRegistros: number; totalNotas: number;
    totalComprovantes: number; percentualConciliacao: number;
  };
  mensal: { mes: string; transacoes: number; registros: number; comprovantes: number; notas: number }[];
  porAgencia: { agenciaId: string; descricao: string; conciliados: number; naoConciliados: number }[];
};

/** `StatsService.obter` depois das contagens. */
export function montarEstatisticas(c: ContagensDaEmpresa, meses: number, mesAtual: string): Estatisticas {
  return {
    resumo: {
      totalTransacoes: c.transacoes,
      totalConciliados: c.conciliadas,
      totalNaoConciliados: c.transacoes - c.conciliadas,
      totalRegistros: c.registros,
      totalNotas: c.notas,
      totalComprovantes: c.comprovantes,
      percentualConciliacao: c.transacoes ? arredondaPy((c.conciliadas / c.transacoes) * 100, 1) : 0,
    },
    mensal: mesesDaSerie(mesAtual, meses).map((mes) => ({
      mes,
      transacoes: c.porMes.transacoes.get(mes) ?? 0,
      registros: c.porMes.registros.get(mes) ?? 0,
      comprovantes: c.porMes.comprovantes.get(mes) ?? 0,
      notas: c.porMes.notas.get(mes) ?? 0,
    })),
    // O original não ordena (a ordem é a do plano do banco); aqui, banco, agência e número, a ordem do índice
    // único das contas bancárias, que é a que o SQLite da suíte devolve.
    porAgencia: [...c.agencias]
      .sort((a, b) => cmpTexto(a.bancoSigla, b.bancoSigla) || cmpTexto(a.agencia, b.agencia) || cmpTexto(a.numero, b.numero) || cmpTexto(a.id, b.id))
      .map((a) => ({
      agenciaId: a.id,
      descricao: `${a.bancoSigla} – Ag. ${a.agencia} / ${a.numero}`,
      conciliados: a.conciliadas,
      naoConciliados: a.total - a.conciliadas,
    })),
  };
}

// ─── Carteira do escritório ───────────────────────────────────────────────

export type EmpresaDaCarteira = { id: string; razaoSocial: string };
/** As transações vivas do mês de uma empresa, por situação: quantas e quanto. */
export type GrupoDaCarteira = { empresaId: string; status: string; quantidade: number; valor: Dec };

export type ItemDaCarteira = {
  empresaId: string; razaoSocial: string; transacoesImportadas: number; pendentes: number; classificadas: number; erros: number;
  haExtratoImportado: boolean;
  /** Texto do decimal, duas casas. */
  valorTotalPendente: string;
};

const ALFABETICA = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: false });

/**
 * `listar_carteira` depois da leitura: uma linha por empresa (as sem extrato no mês também, com zero), com
 * mais pendências primeiro e, no empate, em ordem alfabética (no Connect, a do português; o id desempata).
 */
export function montarCarteira(empresas: readonly EmpresaDaCarteira[], grupos: readonly GrupoDaCarteira[]): ItemDaCarteira[] {
  const porEmpresa = new Map<string, GrupoDaCarteira[]>();
  for (const g of grupos) porEmpresa.set(g.empresaId, [...(porEmpresa.get(g.empresaId) ?? []), g]);
  return empresas
    .map((e): ItemDaCarteira => {
      const gs = porEmpresa.get(e.id) ?? [];
      const de = (status: string) => gs.filter((g) => g.status === status).reduce((n, g) => n + g.quantidade, 0);
      const total = gs.reduce((n, g) => n + g.quantidade, 0);
      const valor = gs.filter((g) => g.status === "pendente").reduce((s, g) => soma(s, g.valor), ZERO);
      return {
        empresaId: e.id, razaoSocial: e.razaoSocial, transacoesImportadas: total, pendentes: de("pendente"), classificadas: de("processada"),
        erros: de("erro"), haExtratoImportado: total > 0, valorTotalPendente: dinheiro(valor),
      };
    })
    .sort((a, b) => b.pendentes - a.pendentes || ALFABETICA.compare(a.razaoSocial, b.razaoSocial) || cmpTexto(a.razaoSocial, b.razaoSocial) || cmpTexto(a.empresaId, b.empresaId));
}
