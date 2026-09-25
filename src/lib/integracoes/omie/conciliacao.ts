// A conciliação do Omie → Connect (Fase 1, 25/09). Funções puras.
//
// ─── Onde a conciliação mora no Omie ─────────────────────────────────────────
//
// Visto numa resposta real em 25/09 (ER Dias, Multi, BLD): a listagem padrão
// de `financas/mf` `ListarMovimentos` traz **só os títulos**, sem baixa nem
// conciliação. Com `cTpLancamento: "CC"` ela traz as linhas de conta corrente:
//
// - a **baixa** de cada título (`cOrigem` BAXP/BAXR): `nCodTitulo`,
//   `nCodBaixa`, `nCodCC` (a conta), `nCodMovCC`, `nValorMovCC` (o que passou
//   pela conta, com juro e desconto), `dDtPagamento`, `dDtCredito` e
//   `dDtConcilia` + `cHrConcilia` — vazios enquanto o BPO não conciliou;
// - os **lançamentos sem título**, com `nCodMovCC` e categoria: as
//   transferências entre contas da empresa (`cOrigem` TRAP/TRAR, em pares
//   saída/entrada) e o que o BPO lança a partir do extrato ao conciliar
//   (EXTP/EXTR — tarifa, juro, rendimento; 17 numa página da BLD). Esses
//   contam na DRE e não aparecem na listagem de títulos.
//
// Título com mais de uma baixa é raro (14 de 831 na Multi) e é pagamento
// parcial.

import { instanteDoOmie } from "./notas";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const texto = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());
const digitos = (v: unknown): string => texto(v).replace(/\D/g, "");
const semZeroAEsquerda = (s: string) => s.replace(/^0+(?=\d)/, "");

function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = texto(v);
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
}

const id = (v: unknown): string | null => {
  const t = texto(v);
  return t && t !== "0" ? t.slice(0, 20) : null;
};

// ─── Linhas de conta corrente ───────────────────────────────────────────────

export type BaixaDoOmie = {
  tipo: "baixa";
  omieTitleId: string;
  baixaId: string | null;
  contaId: string | null;
  /** O que passou pela conta, sempre positivo. */
  valor: number;
  pagamento: Date | null;
  conciliadoEm: Date | null;
};

export type LancamentoDeContaDoOmie = {
  tipo: "avulso";
  /** Transferência entre contas da empresa: fora do resultado. */
  transferencia: boolean;
  movimentoId: string;
  kind: "PAGAR" | "RECEBER";
  contaId: string | null;
  valor: number;
  pagamento: Date;
  competencia: string;
  conciliadoEm: Date | null;
  categoriaCodigo: string | null;
  contraparteCodigo: string | null;
  contraparteDocumento: string | null;
};

export type MotivoDaLinhaFora = "sem_valor" | "sem_natureza" | "sem_data" | "sem_movimento";

export const MOTIVO_DA_LINHA: Record<MotivoDaLinhaFora, string> = {
  sem_valor: "linhas de conta sem valor",
  sem_natureza: "linhas de conta sem natureza",
  sem_data: "lançamentos de conta sem data",
  sem_movimento: "lançamentos de conta sem título nem código de movimento",
};

export function mapearLinhaDeConta(item: unknown): BaixaDoOmie | LancamentoDeContaDoOmie | { fora: MotivoDaLinhaFora } {
  const d = obj(obj(item).detalhes);
  const valorBruto = numero(d.nValorMovCC) ?? numero(obj(obj(item).resumo).nValPago);
  if (valorBruto === null || valorBruto === 0) return { fora: "sem_valor" };
  const valor = Math.round(Math.abs(valorBruto) * 100) / 100;
  const conciliadoEm = instanteDoOmie(d.dDtConcilia, d.cHrConcilia);
  const contaId = id(d.nCodCC);
  const pagamento = instanteDoOmie(d.dDtPagamento, null) ?? instanteDoOmie(d.dDtCredito, null);

  const titulo = id(d.nCodTitulo);
  if (titulo) {
    return { tipo: "baixa", omieTitleId: titulo, baixaId: id(d.nCodBaixa), contaId, valor, pagamento, conciliadoEm };
  }

  const origem = texto(d.cOrigem).toUpperCase();
  const movimento = id(d.nCodMovCC);
  if (!movimento) return { fora: "sem_movimento" };
  const documento = digitos(d.cCPFCNPJCliente);
  const natureza = texto(d.cNatureza).toUpperCase();
  const kind = natureza === "P" ? "PAGAR" : natureza === "R" ? "RECEBER" : null;
  if (!kind) return { fora: "sem_natureza" };
  if (!pagamento) return { fora: "sem_data" };
  const [, mes, ano] = texto(instanteDoOmie(d.dDtPagamento, null) ? d.dDtPagamento : d.dDtCredito).split("/");
  return {
    tipo: "avulso",
    transferencia: origem.startsWith("TRA"),
    movimentoId: movimento,
    kind,
    contaId,
    valor,
    pagamento,
    competencia: `${ano}-${mes}`,
    conciliadoEm,
    categoriaCodigo: texto(d.cCodCateg) || null,
    contraparteCodigo: id(d.nCodCliente),
    contraparteDocumento: documento.length === 11 || documento.length === 14 ? documento : null,
  };
}

export type BaixaDoTitulo = {
  omieTitleId: string;
  baixaId: string | null;
  contaId: string | null;
  valor: number;
  /** Só quando **toda** baixa do título está conciliada: a mais recente. */
  conciliadoEm: Date | null;
};

/**
 * Uma linha por título. Com mais de uma baixa (parcial), soma o valor, fica
 * com a conta e o código da última, e só dá o título como conciliado se todas
 * estiverem — conciliado pela metade ainda tem o que conferir.
 */
export function juntarBaixas(baixas: BaixaDoOmie[]): BaixaDoTitulo[] {
  const porTitulo = new Map<string, BaixaDoOmie[]>();
  for (const b of baixas) porTitulo.set(b.omieTitleId, [...(porTitulo.get(b.omieTitleId) ?? []), b]);
  return [...porTitulo].map(([omieTitleId, lista]) => {
    const ordenadas = [...lista].sort((a, b) => (a.pagamento?.getTime() ?? 0) - (b.pagamento?.getTime() ?? 0));
    const ultima = ordenadas[ordenadas.length - 1];
    const todas = ordenadas.every((b) => b.conciliadoEm);
    return {
      omieTitleId,
      baixaId: ultima.baixaId,
      contaId: ultima.contaId,
      valor: Math.round(ordenadas.reduce((s, b) => s + b.valor, 0) * 100) / 100,
      conciliadoEm: todas ? new Date(Math.max(...ordenadas.map((b) => b.conciliadoEm!.getTime()))) : null,
    };
  });
}

// ─── Contas correntes ───────────────────────────────────────────────────────

export type ContaCorrenteDoOmie = {
  id: string;
  rotulo: string;
  /** Como o Omie escreve, para a conta criada no Connect mostrar igual. */
  agencia: string | null;
  numero: string;
  /** Código COMPE com três dígitos, como o Connect guarda. */
  banco: string;
  /** Só dígitos, sem zero à esquerda — como `BankAccount.accountDigits`. */
  conta: string;
  inativa: boolean;
};

/**
 * As contas bancárias (`tipo_conta_corrente` CC) de `geral/contacorrente`
 * `ListarContasCorrentes`. Caixa, cartão e aplicação ficam de fora: não têm
 * extrato bancário a conferir.
 */
export function lerContasCorrentes(itens: unknown[]): ContaCorrenteDoOmie[] {
  const saida: ContaCorrenteDoOmie[] = [];
  for (const l of itens.map(obj)) {
    const conta = semZeroAEsquerda(digitos(l.numero_conta_corrente));
    const idConta = id(l.nCodCC);
    if (texto(l.tipo_conta_corrente).toUpperCase() !== "CC" || !idConta || !conta) continue;
    saida.push({
      id: idConta,
      rotulo: (texto(l.descricao) || `Banco ${texto(l.codigo_banco)} · ${texto(l.numero_conta_corrente)}`).slice(0, 120),
      agencia: texto(l.codigo_agencia).slice(0, 10) || null,
      numero: texto(l.numero_conta_corrente).slice(0, 30),
      banco: digitos(l.codigo_banco).padStart(3, "0").slice(-3),
      conta,
      inativa: texto(l.inativo).toUpperCase() === "S",
    });
  }
  return saida;
}

export function paginaDeContasCorrentes(corpo: unknown): { itens: unknown[]; totalDePaginas: number } {
  const o = obj(corpo);
  const lista = Array.isArray(o.ListarContasCorrentes) ? o.ListarContasCorrentes : Object.values(o).find(Array.isArray) ?? [];
  const total = Number(o.total_de_paginas);
  return { itens: lista as unknown[], totalDePaginas: Number.isFinite(total) && total > 0 ? total : 1 };
}

/** Os números conferem? Iguais, ou um é o outro com o dígito verificador. */
export function mesmoNumero(a: string, b: string): boolean {
  if (a === b) return true;
  const [curto, longo] = a.length < b.length ? [a, b] : [b, a];
  return longo.length === curto.length + 1 && longo.startsWith(curto);
}

/**
 * Qual conta do Omie é cada conta do Connect: mesmo banco e mesmo número (com
 * ou sem o dígito). Só liga quando **uma** conta confere de cada lado — duas
 * candidatas é dúvida, e ligar errado faria a conciliação de uma conta aparecer
 * na outra. Conta inativa no Omie só entra se for a única que confere.
 */
export function ligarContas(
  doConnect: { id: string; bankCode: string; accountDigits: string }[],
  doOmie: ContaCorrenteDoOmie[]
): Map<string, ContaCorrenteDoOmie> {
  const candidatas = new Map<string, ContaCorrenteDoOmie[]>();
  for (const c of doConnect) {
    const numero = semZeroAEsquerda(c.accountDigits);
    const todas = doOmie.filter((o) => o.banco === c.bankCode && mesmoNumero(o.conta, numero));
    const ativas = todas.filter((o) => !o.inativa);
    candidatas.set(c.id, ativas.length ? ativas : todas);
  }
  const usos = new Map<string, number>();
  for (const lista of candidatas.values()) if (lista.length === 1) usos.set(lista[0].id, (usos.get(lista[0].id) ?? 0) + 1);
  const ligadas = new Map<string, ContaCorrenteDoOmie>();
  for (const [connectId, lista] of candidatas) {
    if (lista.length === 1 && usos.get(lista[0].id) === 1) ligadas.set(connectId, lista[0]);
  }
  return ligadas;
}
