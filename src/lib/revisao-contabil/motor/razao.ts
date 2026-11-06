// Regras sobre os lançamentos do razão (blocos 2a e 2b do original): saldos diários contrários à
// natureza, lançamentos mensais, parcelamentos, tributos × receita, depreciação, baixas da folha,
// saldos antigos e ajustes de exercícios anteriores; e a soma por prefixo que confirma grupos.
// Portado de `dist/engine.py` (AudTool R_12 provisório, commit 92658a2). Cópia fiel: não altere
// padrões, prazos, mensagens ou a ordem das verificações; os testes-gabarito comparam com o original.

import {
  brl,
  businessDay,
  data,
  dateBr,
  dias,
  inPrefix,
  monthEnd,
  monthLabel,
  nextMonth,
  norm,
  periodMonths,
  somaDias,
  under,
} from "./base";
import { cmp, maxPor, ordenados, padrao, re, soma, split as pySplit, strip, unicos, verdade } from "./py";
import type { ContaBalancete, ContaRazao, EstadoDaParte, Fatos, Lado, Lancamento, RegistraAchado, RegistraTeste } from "./tipos";

export type Divisao = [ContaRazao, Lancamento[]][];

/** Grupos do razão confirmados pelo balancete; `result` são os primeiros dígitos dos grupos de resultado. */
export type Grupos = {
  asset: boolean;
  liability: boolean;
  current: boolean;
  noncurrent: boolean;
  equity: boolean;
  result: Set<string>;
  suppliers?: [string, string[]] | null;
};

/** Contexto de receita do razão para as conferências fiscais (bloco 3). */
export type ContextoDeReceita = {
  source: string;
  revenueMonths: Map<string, number>;
  revenueTotal: number;
  serviceTotal: number | null;
  taxMonths: Set<string> | null;
};

/** Lançamentos por conta, na ordem do razão; `null` (com motivo) quando a ordem não é confiável. */
export function ledgerSplit(facts: Pick<Fatos, "ledger" | "ledgerEntries">): [Divisao | null, string] {
  const accounts = facts.ledger?.accounts ?? [];
  const entries = facts.ledgerEntries;
  if (entries === undefined || entries === null) return [null, "Lançamentos do razão indisponíveis; reprocessar o documento."];
  if (soma(accounts.map((a) => a.entryCount)) !== entries.length)
    return [null, "Quantidade de lançamentos não confere com o resumo das contas; reprocessar o documento."];
  if (accounts.some((a) => a.issues.some((i) => i.startsWith("Conta repetida"))))
    return [null, "Conta repetida fora de sequência no razão; ordem dos lançamentos não confiável."];
  const out: Divisao = [];
  let i = 0;
  for (const a of accounts) {
    out.push([a, entries.slice(i, i + a.entryCount)]);
    i += a.entryCount;
  }
  return [out, ""];
}

/** Débitos e créditos do razão; com balancete anterior ao encerramento, os lançamentos de encerramento do fim do período ficam de fora, sem ajuste. */
export function ledgerMovement(a: ContaRazao, separate: boolean, end: string): [number, number, number] {
  if (separate && a.closingCount && a.closingDates.length === 1 && a.closingDates[0] === end)
    return [a.debit - a.closingDebit, a.credit - a.closingCredit, a.closingCount];
  return [a.debit, a.credit, 0];
}

/** Contas de sócios costumam levar o nome da pessoa: nos achados, só o código. */
export const PARTNER = re(String.raw`\bSOCI[OA]S?\b`);

export function accountLabel(r: { code: string; name: string }): string {
  return PARTNER.search(norm(r.name)) ? r.code : r.code + " " + r.name;
}

/** Débitos, créditos e texto dos lançamentos (quantidade, datas e contrapartidas por código e nome da conta; conta de sócio só pelo código), nunca o histórico. */
export function describeEntries(live: Lancamento[], byid: Map<string, ContaRazao> | Record<string, ContaRazao>): [number, number, string] {
  const get = (x: string) => (byid instanceof Map ? byid.get(x) : Object.prototype.hasOwnProperty.call(byid, x) ? byid[x] : undefined);
  const d = soma(live.filter((e) => e[6] === "D").map((e) => e[5]));
  const c = soma(live.filter((e) => e[6] === "C").map((e) => e[5]));
  const cps = unicos(live.map((e) => e[4]).filter((x): x is string => verdade(x)));
  const parts =
    cps.map((x) => (get(x) !== undefined && !PARTNER.search(norm((get(x) as ContaRazao).name)) ? x + " " + (get(x) as ContaRazao).name : x)).join(", ") +
    (live.some((e) => e[4] === null) ? "; lotes com várias partidas" : "");
  return [
    d,
    c,
    `${live.length} lançamento(s) (débitos ${brl(d)}, créditos ${brl(c)}) em ${unicos(live.map((e) => dateBr(e[2]))).join(", ")}; contrapartidas: ${parts || "não informadas"}.`,
  ];
}

export function entryMonths(es: Lancamento[], side: Lado): Set<string> {
  return new Set(es.filter((e) => e[6] === side && !e[8]).map((e) => e[2].slice(0, 7)));
}

function monthEndBalances(a: ContaRazao, es: Lancamento[], months: string[]): Map<string, number> {
  const out = new Map<string, number>();
  let b = a.opening ?? 0;
  let i = 0;
  for (const m of months) {
    while (i < es.length && es[i][2].slice(0, 7) <= m) {
      b = es[i][7];
      i += 1;
    }
    out.set(m, b);
  }
  return out;
}

export type PeriodoContrario = { start: string; end: string | null; peak: number; peakDate: string; page: number; line: number };

/** Períodos em que o saldo de fim de dia contraria a natureza; `null` se as datas estiverem fora de ordem. */
export function contraryPeriods(a: ContaRazao, es: Lancamento[], side: Lado, start: string, tolerance: number): PeriodoContrario[] | null {
  const bad = side === "D" ? (b: number) => b < -tolerance : (b: number) => b > tolerance;
  const eod: [string, number | null, number, number][] = [];
  for (const e of es) {
    if (eod.length && e[2] < eod[eod.length - 1][0]) return null;
    // O último lançamento do dia define o saldo de fim de dia e a linha de origem.
    if (eod.length && e[2] === eod[eod.length - 1][0]) eod[eod.length - 1] = [e[2], e[7], e[0], e[1]];
    else eod.push([e[2], e[7], e[0], e[1]]);
  }
  if (!eod.length || eod[0][0] > start) eod.unshift([start, a.opening, a.page, a.line]);
  const periods: PeriodoContrario[] = [];
  let cur: PeriodoContrario | null = null;
  for (const [d, b, pn, ln] of eod) {
    if (bad(b as number)) {
      if (cur === null) cur = { start: d, end: null, peak: Math.abs(b as number), peakDate: d, page: pn, line: ln };
      else if (Math.abs(b as number) > cur.peak) {
        cur.peak = Math.abs(b as number);
        cur.peakDate = d;
      }
    } else if (cur !== null) {
      cur.end = d;
      periods.push(cur);
      cur = null;
    }
  }
  if (cur !== null) periods.push(cur);
  return periods;
}

export type Lote = { date: string | null; amount: number; left: number; page: number; line: number; paid: string | null };

/** Valores lançados no lado `side`, abatidos pelas baixas na ordem de data (FIFO na conta); o saldo anterior é o lote com date=null. `null` se as datas estiverem fora de ordem. */
export function fifoLots(a: ContaRazao, es: Lancamento[], side: Lado): Lote[] | null {
  const lots: Lote[] = [];
  let i = 0;
  let extra = 0;
  let last = "";
  const op = (a.opening ?? 0) * (side === "D" ? 1 : -1);
  if (op > 0) lots.push({ date: null, amount: op, left: op, page: a.page, line: a.line, paid: null });
  else extra = -op;
  for (const e of es) {
    if (e[8] || e[6] === null) continue;
    if (e[2] < last) return null;
    last = e[2];
    if (e[6] === side) {
      // Baixa anterior ao lançamento (saldo contrário) abate o novo valor na mesma data.
      const t = Math.min(extra, e[5]);
      extra -= t;
      lots.push({ date: e[2], amount: e[5], left: e[5] - t, page: e[0], line: e[1], paid: t === e[5] ? e[2] : null });
    } else {
      let v = e[5];
      while (v && i < lots.length) {
        const l = lots[i];
        const t = Math.min(v, l.left);
        l.left -= t;
        v -= t;
        if (!l.left) {
          l.paid = l.paid || e[2];
          i += 1;
        }
      }
      extra += v;
    }
  }
  return lots;
}

/** Prazo de baixa de um valor da folha; o saldo anterior é tratado como competência anterior ao início do fechamento. */
export function payrollDue(kind: string, lotDate: string | null, start: string): string {
  if (lotDate === null) {
    const m = start.slice(0, 7);
    if (kind === "salary") return businessDay(m, 5);
    if (kind === "prolabore" || kind === "vacation") return monthEnd(m);
    return somaDias(start, 10);
  }
  dias(lotDate);
  const ano = parseInt(lotDate.slice(0, 4), 10);
  const m = lotDate.slice(0, 7);
  if (kind === "salary") return businessDay(nextMonth(m), 5);
  if (kind === "prolabore") return monthEnd(nextMonth(m));
  if (kind === "vacation") return monthEnd(m);
  if (kind === "thirteenth") return lotDate.slice(5) <= "12-20" ? data(ano, 12, 20) : somaDias(lotDate, 10);
  if (kind === "advance13") return data(lotDate.slice(5) <= "12-20" ? ano : ano + 1, 12, 20);
  return somaDias(lotDate, 10);
}

type Grupo = "asset" | "liability" | "result";

/** Manual de conferência: lançamento esperado em todos os meses do fechamento. (linha, conceito, [(grupo, lado)], padrão do nome normalizado) */
export const RECURRING: [string, string, [Grupo, Lado][], string][] = [
  ["C06-C11", "Provisão de férias", [["liability", "C"]], String.raw`^(?!.*\b(FGTS|INSS)\b)(?=.*\bPROVIS)(?=.*\bFERIAS\b)`],
  ["C06-C11", "FGTS sobre provisão de férias", [["liability", "C"]], String.raw`^(?=.*\bFGTS\b)(?=.*\bPROVIS)(?=.*\bFERIAS\b)`],
  ["C06-C11", "INSS sobre provisão de férias", [["liability", "C"]], String.raw`^(?=.*\bINSS\b)(?=.*\bPROVIS)(?=.*\bFERIAS\b)`],
  ["C06-C11", "Provisão de 13º salário", [["liability", "C"]], String.raw`^(?!.*\b(FGTS|INSS)\b)(?=.*\bPROVIS)(?=.*\b13)`],
  ["C06-C11", "FGTS sobre provisão de 13º", [["liability", "C"]], String.raw`^(?=.*\bFGTS\b)(?=.*\bPROVIS)(?=.*\b13)`],
  ["C06-C11", "INSS sobre provisão de 13º", [["liability", "C"]], String.raw`^(?=.*\bINSS\b)(?=.*\bPROVIS)(?=.*\b13)`],
  ["C12-C15", "Água e esgoto", [["result", "D"]], String.raw`\bAGUA\b`],
  ["C12-C15", "Aluguel", [["result", "D"]], String.raw`\bALUGUE`],
  ["C12-C15", "Energia elétrica", [["result", "D"]], String.raw`\bENERGIA\b`],
  ["C12-C15", "Telefone", [["result", "D"]], String.raw`\bTELEFON`],
  ["C12-C15", "Internet", [["result", "D"]], String.raw`\bINTERNET\b`],
  ["C12-C15", "Assistência médica", [["result", "D"]], String.raw`\bASSISTENCIA MEDICA\b|\bPLANO DE SAUDE\b`],
  ["C12-C15", "Vale-transporte", [["result", "D"]], String.raw`\bVALE.TRANSPORTE\b`],
  ["C12-C15", "Honorários contábeis", [["result", "D"]], String.raw`\bHONORARIOS CONTABEIS\b`],
  ["C12-C15", "Cotas de cooperativa", [["asset", "D"]], String.raw`\b[CQ]U?OTAS?\b`],
  ["C12-C15", "Consórcio", [["asset", "D"]], String.raw`\bCONSORCIO`],
  ["C25", "Depreciação", [["result", "D"], ["asset", "C"]], String.raw`\bDEPRECIA`],
];
export const NATURE_SKIP = re(String.raw`\b(LUCROS?|PREJUIZOS?|RESULTADOS?|EXERCICIOS ANTERIORES)\b`);
export const PRINCIPAL = re(String.raw`\b(PARCELAMENTOS?|FINANCIAMENTOS?)\b`);
const TERM = re(String.raw`\b(LP|CP|LONGO PRAZO|CURTO PRAZO)\b|-`);
const TAX = re(String.raw`\b(SIMPLES NACIONAL|ISS|ISSQN|ICMS|PIS|COFINS)\b`);
const NOT_REVENUE = re(String.raw`\b(FINANCEIR\w*|RENDIMENTOS?|JUROS|DESCONTOS?|RECUPERAC\w*|REVERS\w*)\b`);
const PRIOR_ADJUST = re(String.raw`\bAJUSTES? (DE )?EXERCICIOS ANTERIORES\b`);
// Baixas da folha (bloco 2b): (conceito, grupo, lado do valor a baixar, prazo, padrão do nome, descrição do prazo). Fontes consultadas em 28/10/2026.
export const THIRTEENTH = String.raw`\b(13O?|DECIMO TERCEIRO)\b`;
export const PAYROLL: [string, Grupo, Lado, string, string, string][] = [
  ["Salários a pagar", "liability", "C", "salary", String.raw`^(?!.*\b(PROVIS\w*|FGTS|INSS|IRRF|FERIAS|ADIANTAMENTOS?|CONTRIBUIC\w*)\b)(?!.*` + THIRTEENTH + String.raw`)(?=.*\b(SALARIOS?|ORDENADOS?)\b)`, "5º dia útil do mês seguinte (CLT, art. 459, § 1º)"],
  ["Pró-labore a pagar", "liability", "C", "prolabore", String.raw`^(?!.*\b(FGTS|INSS|IRRF)\b)(?=.*\bPRO.?LABORE\b)`, "fim do mês seguinte (critério interno; prazo legal não localizado)"],
  ["Férias a pagar", "liability", "C", "vacation", String.raw`^(?!.*\b(PROVIS\w*|FGTS|INSS|IRRF|ADIANTAMENTOS?)\b)(?=.*\bFERIAS\b)`, "fim do mês do crédito (CLT, art. 145: até 2 dias antes do início; o razão não traz a data de início)"],
  ["13º salário a pagar", "liability", "C", "thirteenth", String.raw`^(?!.*\b(PROVIS\w*|FGTS|INSS|IRRF|ADIANTAMENTOS?)\b)(?=.*` + THIRTEENTH + ")", "20/12 (Lei 4.749/1965, art. 1º); após 20/12, 10 dias (CLT, art. 477, § 6º)"],
  ["Adiantamento de 13º salário", "asset", "D", "advance13", String.raw`^(?=.*\bADIANTAMENTOS?\b)(?=.*` + THIRTEENTH + ")", "compensação até 20/12 (Lei 4.749/1965, art. 1º)"],
  ["Rescisões a pagar", "liability", "C", "termination", String.raw`^(?!.*\b(FGTS|INSS|IRRF|MULTA)\b)(?=.*\bRESCIS)`, "10 dias (CLT, art. 477, § 6º)"],
];
// Saldos antigos: critério interno (sem prazo legal), FIFO por conta.
export const AGED_DAYS = 90;
export const AGED: [Grupo, Lado, string][] = [
  ["liability", "C", String.raw`^(?!.*\bADIANTAMENT)(?=.*\bFORNECEDOR)`],
  ["liability", "C", String.raw`\bADIANTAMENT`],
  ["asset", "D", String.raw`\bADIANTAMENT`],
];
// Partes da C29 para o manual (itens 4.1, 6.1 e 7.4): grupos de contas pelo nome; fornecedores também pelo grupo do balancete.
export const NATURE_PARTS: [string, string][] = [
  ["Caixa e bancos", String.raw`\b(CAIXA|BANCOS?|APLICAC\w*)\b`],
  ["Clientes", String.raw`^(?!.*\bADIANTAMENT)(?=.*\b(CLIENTES?|DUPLICATAS?)\b)`],
  ["Fornecedores", String.raw`^(?!.*\bADIANTAMENT)(?=.*\bFORNECEDOR)`],
  ["Tributos", String.raw`\b(RECOLHER|IMPOSTOS?|TRIBUT\w*|SIMPLES|IRRF|IRPJ|CSLL|PIS|COFINS|INSS|FGTS|ISS|ISSQN|ICMS|PARCELAMENT\w*)\b`],
];
export const PART_ORDER: Record<string, number> = { "Não localizado": 0, "Confere no escopo": 1, Pendente: 2, Divergência: 3 };

export type Partes = Record<string, EstadoDaParte>;

/** Estado de uma parte de linha (pior caso), para o relatório por item do manual. */
export function mark(parts: Partes, key: string, status: EstadoDaParte) {
  const atual = Object.prototype.hasOwnProperty.call(parts, key) ? PART_ORDER[parts[key]] : undefined;
  if (PART_ORDER[status] > (atual ?? -1)) parts[key] = status;
}

export const LEDGER_LINES: [string, string][] = [
  ["C29", "Saldos diários contrários à natureza"],
  ["C06-C11", "Provisões mensais de férias e 13º"],
  ["C06-C11", "Folha: baixa de salários, pró-labore, férias e 13º"],
  ["C12-C15", "Lançamentos mensais recorrentes"],
  ["C16-C20", "Parcelamentos: juros e LP→CP"],
  ["C16-C20", "Tributos sobre receita × meses com receita"],
  ["C25", "Depreciação mensal"],
  ["R16", "Saldos antigos em aberto (fornecedores e adiantamentos)"],
  ["R06", "Ajustes de exercícios anteriores"],
];

/** Conta do razão no grupo confirmado pelo balancete: ativo, passivo ou resultado (sem a conta de apuração). */
export function inGroup(g: Grupos, clearing: Set<string>, a: ContaRazao, grp: Grupo): boolean {
  if (grp === "asset") return g.asset && inPrefix(a, "1");
  if (grp === "liability") return g.liability && inPrefix(a, "2");
  return g.result.has(a.code.split(".")[0]) && !clearing.has(a.id);
}

const unir = (conjuntos: Iterable<Set<string>>) => {
  const out = new Set<string>();
  for (const s of conjuntos) for (const x of s) out.add(x);
  return out;
};

/** Regras sobre os lançamentos (blocos 2a e 2b). g: grupos confirmados pelo balancete, ou null. Devolve o contexto de receita do bloco 3 e as contas conferidas pela C29. */
export function ledgerChecks(
  split: Divisao,
  g: Grupos | null,
  closing: { start: string; end: string },
  tolerance: number,
  src: string,
  clearing: Set<string>,
  test: RegistraTeste,
  finding: RegistraAchado,
): [ContextoDeReceita | null, Set<string>] {
  const usable = split.filter(([a]) => !a.issues.length && a.opening !== null);
  const byid = new Map(split.map(([a]) => [a.id, a] as const));
  let ctx: ContextoDeReceita | null = null;
  const nature = new Set<string>();
  const months = periodMonths(closing.start, closing.end);
  const span = `${monthLabel(months[0])} a ${monthLabel(months[months.length - 1])}`;
  const nm = (a: ContaRazao) => strip(norm(a.name));
  const where = (a: ContaRazao) => src + ` p. ${a.page} linha ${a.line} conta ${a.id}`;
  const incomplete = split.length - usable.length;
  const note = incomplete ? ` ${incomplete} contas com leitura incompleta não conferidas.` : "";
  if (g === null || !(g.asset || g.liability || g.result.size)) {
    for (const [id, title] of LEDGER_LINES.slice(0, -1))
      test(id, title, "Não executado", src, null, "", "Grupos do razão não confirmados pelo balancete (ativo, passivo e resultado); natureza e grupo das contas não são presumidos.");
  } else {
    const unconfirmed = (
      [
        ["ativo", g.asset],
        ["passivo", g.liability],
        ["resultado", g.result.size > 0],
      ] as const
    )
      .filter(([, ok]) => !ok)
      .map(([x]) => x)
      .join(", ");
    const unote = unconfirmed ? ` Grupos não confirmados pelo balancete: ${unconfirmed}.` : "";
    const member = (a: ContaRazao, grp: Grupo) => inGroup(g, clearing, a, grp);
    // Fornecedores mantidos em contas com o nome de cada um são localizados pelo grupo do balancete, nunca pelo nome.
    const sup = g.suppliers ?? null;
    const supIds = new Set(sup ? sup[1] : []);
    // C29: saldo de fim de dia × natureza da conta; PL e resultados acumulados ficam fora.
    {
      let checked = 0;
      let flagged = 0;
      let skipped = 0;
      let reducers = 0;
      let peakTotal = 0;
      const disorder: string[] = [];
      const parts: Partes = {};
      for (const [a, es] of usable) {
        const n = nm(a);
        let side: Lado | null = member(a, "asset") ? "D" : member(a, "liability") ? "C" : null;
        if (side === null) continue;
        if ((g.equity && inPrefix(a, "2.3")) || NATURE_SKIP.search(n)) {
          skipped += 1;
          continue;
        }
        if (n.startsWith("(-)")) {
          side = side === "D" ? "C" : "D";
          reducers += 1;
        }
        const per = contraryPeriods(a, es, side, closing.start, tolerance);
        if (per === null) {
          disorder.push(a.id);
          continue;
        }
        checked += 1;
        nature.add(a.id);
        const cat = NATURE_PARTS.find(([, p]) => re(p).search(n))?.[0] ?? (supIds.has(a.id) ? "Fornecedores" : null);
        for (const k of cat ? [cat, "Saldo final"] : ["Saldo final"]) mark(parts, k, "Confere no escopo");
        if (!per.length) continue;
        if (cat) mark(parts, cat, "Divergência");
        if (per[per.length - 1].end === null) mark(parts, "Saldo final", "Divergência");
        let days = 0;
        for (const p of per) {
          const stop = p.end ? dias(p.end) : dias(closing.end) + 1;
          days += stop - dias(p.start);
        }
        const fim = per[per.length - 1].end;
        const last = fim ? somaDias(fim, -1) : closing.end;
        const top = maxPor(per, (p) => p.peak);
        flagged += 1;
        peakTotal += top.peak;
        finding(
          "Saldo diário contrário à natureza: " + a.code + " " + a.name,
          "Razão",
          top.peak,
          "Indício para revisão",
          src + ` p. ${per[0].page} linha ${per[0].line} conta ${a.id}`,
          `Saldo ${side === "D" ? "credor" : "devedor"} numa conta de natureza ${side === "D" ? "devedora" : "credora"} em ${days} dia(s), entre ${dateBr(per[0].start)} e ${dateBr(last)}; maior saldo contrário em ${dateBr(top.peakDate)}.`,
          "Conferir datas e ordem de recebimentos, pagamentos e transferências no original; não ajustar o saldo sem documento.",
        );
      }
      let reason = `${checked} contas patrimoniais conferidas, ${flagged} com saldo de fim de dia contrário à natureza; ${skipped} do PL ou de resultados acumulados fora do teste; ${reducers} redutoras (-) com natureza invertida.`;
      if (disorder.length) reason += ` ${disorder.length} contas com datas fora de ordem não conferidas (${disorder.slice(0, 10).join(", ")}).`;
      test(
        "C29",
        "Saldos diários contrários à natureza",
        flagged ? "Divergência" : checked ? "Confere no escopo" : "Não executado",
        src,
        flagged ? peakTotal : null,
        "Saldo de fim de dia × natureza (ativo devedora, passivo credora, redutora invertida)",
        reason + note + unote,
        checked ? parts : null,
      );
    }
    // Recorrências mensais: mês faltante é pendência a confirmar, nunca erro ou ajuste.
    for (const [line, title] of [
      ["C06-C11", "Provisões mensais de férias e 13º"],
      ["C12-C15", "Lançamentos mensais recorrentes"],
    ] as const) {
      const found: string[] = [];
      const absent: string[] = [];
      let flagged = 0;
      const parts: Partes = {};
      for (const [l, label, groups, pattern] of RECURRING) {
        if (l !== line) continue;
        const hits: [ContaRazao, Lancamento[], Lado][] = [];
        for (const [a, es] of usable) for (const [grp, side] of groups) if (member(a, grp) && re(pattern).search(nm(a))) hits.push([a, es, side]);
        if (!hits.length) {
          absent.push(label);
          mark(parts, label, "Não localizado");
          continue;
        }
        const seen = unir(hits.map(([, es, side]) => entryMonths(es, side)));
        const missing = months.filter((m) => !seen.has(m));
        found.push(label);
        mark(parts, label, missing.length ? "Pendente" : "Confere no escopo");
        if (missing.length) {
          flagged += 1;
          finding(
            "Lançamento mensal ausente: " + label,
            "Razão",
            null,
            "Evidência insuficiente",
            where(hits[0][0]),
            `Sem lançamento em ${missing.map(monthLabel).join(", ")}. Contas: ${hits
              .slice(0, 5)
              .map(([a]) => a.code + " " + a.name)
              .join(", ")}.`,
            "Confirmar se houve a despesa ou a provisão no mês e obter o documento; não lançar sem comprovação.",
            "Média",
          );
        }
      }
      const reason =
        (found.length ? `${found.length} conceitos conferidos, ${flagged} com mês sem lançamento.` : "Nenhum conceito localizado no razão.") +
        (absent.length ? ` Não localizados no razão (conferir se aplicável): ${absent.join(", ")}.` : "");
      test(line, title, flagged ? "Pendente" : found.length ? "Confere no escopo" : "Não executado", src, null, "Lançamento em cada mês de " + span, reason + note + unote, parts);
    }
    // Principal de parcelamentos e financiamentos: apropriação de juros e LP→CP em cada mês com saldo.
    {
      const idx = new Map(split.map(([a], i) => [a.id, i] as const));
      const principals = usable.filter(([a]) => member(a, "liability") && PRINCIPAL.search(nm(a)) && !nm(a).startsWith("(-)"));
      const key = (a: ContaRazao) => pySplit(TERM.sub(" ", nm(a))).join(" ");
      const cps = new Set(principals.filter(([a]) => inPrefix(a, "2.1")).map(([a]) => key(a)));
      let checked = 0;
      let flagged = 0;
      const nojuros: string[] = [];
      const nolp: string[] = [];
      const parts: Partes = {};
      for (const [a, es] of principals) {
        const bal = monthEndBalances(a, es, months);
        const expected = months.filter((m) => Math.abs(bal.get(m) as number) > tolerance);
        if (!expected.length) continue;
        checked += 1;
        const i = idx.get(a.id) as number;
        const nxt = i + 1 < split.length ? split[i + 1][0] : null;
        if (nxt && rsplitPai(nxt.code) === rsplitPai(a.code) && nm(nxt).startsWith("(-)") && nm(nxt).includes("JUROS") && !nxt.issues.length) {
          const meses = entryMonths(split[i + 1][1], "C");
          const missing = expected.filter((m) => !meses.has(m));
          mark(parts, "Juros", missing.length ? "Pendente" : "Confere no escopo");
          if (missing.length) {
            flagged += 1;
            finding(
              "Juros não apropriados: " + a.code + " " + a.name,
              "Razão",
              null,
              "Evidência insuficiente",
              where(nxt),
              "Mês com saldo de principal e sem apropriação de juros em " + nxt.code + ": " + missing.map(monthLabel).join(", ") + ".",
              "Confirmar se a parcela foi paga em outro mês e se os juros foram apropriados; não lançar sem documento.",
              "Média",
            );
          }
        } else nojuros.push(a.code);
        if (g.current && g.noncurrent && inPrefix(a, "2.2")) {
          if (!cps.has(key(a))) {
            nolp.push(a.code);
            continue;
          }
          const meses = entryMonths(es, "D");
          const missing = expected.filter((m) => !meses.has(m));
          mark(parts, "LP→CP", missing.length ? "Pendente" : "Confere no escopo");
          if (missing.length) {
            flagged += 1;
            finding(
              "Transferência LP→CP ausente: " + a.code + " " + a.name,
              "Razão",
              null,
              "Evidência insuficiente",
              where(a),
              "Mês com saldo no longo prazo e sem transferência para o curto prazo: " + missing.map(monthLabel).join(", ") + ".",
              "Confirmar o cronograma do parcelamento e a apropriação do LP para o CP; não lançar sem documento.",
              "Média",
            );
          }
        }
      }
      let reason = `${checked} parcelamentos/financiamentos com saldo conferidos, ${flagged} apontamentos.`;
      if (nojuros.length) reason += ` Sem conta de juros a apropriar logo após o principal: ${nojuros.join(", ")}.`;
      if (nolp.length) reason += ` Longo prazo sem conta de curto prazo de mesmo nome: ${nolp.join(", ")}.`;
      if (!(g.current && g.noncurrent)) reason += " PC/PNC não confirmados pelo balancete: transferência LP→CP não conferida.";
      for (const k of ["Juros", "LP→CP"]) mark(parts, k, "Não localizado");
      if (!(g.current && g.noncurrent)) parts["LP→CP"] = "Não executado";
      test(
        "C16-C20",
        "Parcelamentos: juros e LP→CP",
        flagged ? "Pendente" : checked ? "Confere no escopo" : "Não executado",
        src,
        null,
        "Apropriação de juros e LP→CP em cada mês com saldo do principal",
        checked ? reason + note + unote : "Nenhum parcelamento ou financiamento com saldo no razão." + unote,
        checked ? parts : null,
      );
    }
    // Só tributos sobre receita: a periodicidade de IRPJ/CSLL depende do regime, que não é presumido.
    {
      const naoEnc = (es: Lancamento[], lado: Lado) => soma(es.filter((e) => e[6] === lado && !e[8]).map((e) => e[5]));
      const revenue = usable.filter(
        ([a, es]) => member(a, "result") && !nm(a).startsWith("(-)") && !TAX.search(nm(a)) && !NOT_REVENUE.search(nm(a)) && naoEnc(es, "C") > naoEnc(es, "D"),
      );
      const taxes = usable.filter(([a]) => member(a, "result") && TAX.search(nm(a)));
      if (revenue.length) {
        // Receita mensal para o bloco 3: créditos menos débitos fora do encerramento.
        const rm = new Map<string, number>();
        const signed = (es: Lancamento[]): [string, number][] => es.filter((e) => !e[8] && e[6]).map((e) => [e[2].slice(0, 7), e[6] === "C" ? e[5] : -e[5]]);
        for (const [, es] of revenue) for (const [m, v] of signed(es)) rm.set(m, (rm.get(m) ?? 0) + v);
        const svc = revenue.filter(([a]) => re(String.raw`\bSERVIC`).search(nm(a))).map(([, es]) => es);
        ctx = {
          source: src,
          revenueMonths: rm,
          revenueTotal: soma(months.map((m) => rm.get(m) ?? 0)),
          serviceTotal: svc.length ? soma(svc.flatMap((es) => signed(es).filter(([m]) => months.includes(m)).map(([, v]) => v))) : null,
          taxMonths: taxes.length ? unir(taxes.map(([, es]) => entryMonths(es, "D"))) : null,
        };
      }
      if (!revenue.length || !taxes.length)
        test(
          "C16-C20",
          "Tributos sobre receita × meses com receita",
          "Não executado",
          src,
          null,
          "",
          (!revenue.length ? "Contas de receita" : "Contas de tributo sobre receita (Simples, ISS, ICMS, PIS, COFINS)") + " não localizadas no razão." + unote,
        );
      else {
        const doFechamento = new Set(months);
        const rev = new Set([...unir(revenue.map(([, es]) => entryMonths(es, "C")))].filter((m) => doFechamento.has(m)));
        const tax = new Set<string>();
        let flagged = 0;
        for (const [a, es] of taxes) {
          const own = [...entryMonths(es, "D")].filter((m) => doFechamento.has(m));
          own.forEach((m) => tax.add(m));
          const extra = ordenados(own.filter((m) => !rev.has(m)));
          if (extra.length) {
            flagged += 1;
            finding(
              "Tributo sem receita no mês: " + a.code + " " + a.name,
              "Razão",
              null,
              "Evidência insuficiente",
              where(a),
              "Tributo lançado em mês sem receita no razão: " + extra.map(monthLabel).join(", ") + ".",
              "Confirmar a competência do tributo (regime de caixa ou competência) e o faturamento do mês.",
              "Média",
            );
          }
        }
        const lacking = ordenados([...rev].filter((m) => !tax.has(m)));
        if (lacking.length) {
          flagged += 1;
          finding(
            "Receita sem tributo provisionado no mês",
            "Razão",
            null,
            "Evidência insuficiente",
            where(revenue[0][0]),
            "Receita no razão sem tributo sobre receita lançado em: " +
              lacking.map(monthLabel).join(", ") +
              ". Contas de receita: " +
              revenue
                .slice(0, 10)
                .map(([a]) => a.code)
                .join(", ") +
              ".",
            "Confirmar se o tributo do mês foi provisionado (ou se o regime é de caixa).",
            "Média",
          );
        }
        test(
          "C16-C20",
          "Tributos sobre receita × meses com receita",
          flagged ? "Pendente" : "Confere no escopo",
          src,
          null,
          "Meses com tributo sobre receita = meses com receita",
          `${rev.size} meses com receita (${ordenados(rev).map(monthLabel).join(", ")}); ${revenue.length} contas de receita e ${taxes.length} de tributo. IRPJ/CSLL não conferidos: periodicidade depende do regime.` +
            note +
            unote,
        );
      }
    }
    // C25 usa a mesma regra mensal; sem contas, fica explicitamente não executada.
    {
      const hits: [ContaRazao, Lancamento[], Lado][] = [];
      for (const [l, , groups, pattern] of RECURRING) {
        if (l !== "C25") continue;
        for (const [a, es] of usable) for (const [grp, side] of groups) if (member(a, grp) && re(pattern).search(nm(a))) hits.push([a, es, side]);
      }
      if (!hits.length) test("C25", "Depreciação mensal", "Não executado", src, null, "", "Nenhuma conta de depreciação no razão; conferir se há imobilizado." + unote);
      else {
        const seen = unir(hits.map(([, es, side]) => entryMonths(es, side)));
        const missing = months.filter((m) => !seen.has(m));
        if (missing.length)
          finding(
            "Lançamento mensal ausente: Depreciação",
            "Razão",
            null,
            "Evidência insuficiente",
            where(hits[0][0]),
            `Sem lançamento em ${missing.map(monthLabel).join(", ")}. Contas: ${hits
              .slice(0, 5)
              .map(([a]) => a.code + " " + a.name)
              .join(", ")}.`,
            "Confirmar a depreciação do mês e o cadastro dos bens; não lançar sem memória de cálculo.",
            "Média",
          );
        test(
          "C25",
          "Depreciação mensal",
          missing.length ? "Pendente" : "Confere no escopo",
          src,
          null,
          "Lançamento em cada mês de " + span,
          `${hits.length} contas de depreciação; ${missing.length} meses sem lançamento. Cadastro dos bens não conferido.` + note + unote,
        );
      }
    }
    // Baixas da folha (bloco 2b): cada valor a pagar é abatido em FIFO e tem de ser baixado no prazo.
    const end = closing.end;
    dias(end);
    const claimed = new Set<string>();
    {
      const found: string[] = [];
      const absent: string[] = [];
      let flagged = 0;
      let checked = 0;
      let ahead = 0;
      const disorder: string[] = [];
      const parts: Partes = {};
      for (const [label, grp, side, kind, pattern, rule] of PAYROLL) {
        const hits = usable.filter(([a]) => !claimed.has(a.id) && member(a, grp) && re(pattern).search(nm(a)) && !nm(a).startsWith("(-)"));
        if (!hits.length) {
          absent.push(label);
          mark(parts, label, "Não localizado");
          continue;
        }
        found.push(label);
        for (const [a, es] of hits) {
          claimed.add(a.id);
          const lots = fifoLots(a, es, side);
          if (lots === null) {
            disorder.push(a.id);
            continue;
          }
          checked += 1;
          const late: [Lote, string][] = [];
          mark(parts, label, "Confere no escopo");
          for (const l of lots) {
            const due = payrollDue(kind, l.date, closing.start);
            const paid = l.paid ? l.paid : null;
            if (paid !== null) dias(paid);
            if ((paid && paid > due) || (!paid && due <= end)) late.push([l, due]);
            else if (!paid) ahead += 1;
          }
          if (!late.length) continue;
          flagged += 1;
          mark(parts, label, "Pendente");
          const items = late.map(
            ([l, due]) => `${l.date ? "crédito de " + dateBr(l.date) : "saldo anterior"} (vencimento ${dateBr(due)}, ${l.paid ? "baixado em " + dateBr(l.paid) : "em aberto " + brl(l.left)})`,
          );
          finding(
            "Baixa após o prazo: " + a.code + " " + a.name,
            "Razão",
            soma(late.map(([l]) => (l.paid ? l.amount : l.left))),
            "Indício para revisão",
            src + ` p. ${late[0][0].page} linha ${late[0][0].line} conta ${a.id}`,
            `${late.length} valor(es) baixado(s) após o prazo ou vencido(s) em aberto: ${items.slice(0, 6).join("; ")}${items.length > 6 ? `; e mais ${items.length - 6}` : ""}. Prazo: ${rule}.`,
            "Confirmar a data do pagamento no extrato e no recibo; atraso pode gerar multa e correção. Não ajustar sem documento.",
            "Média",
          );
        }
      }
      if (!found.length)
        test("C06-C11", "Folha: baixa de salários, pró-labore, férias e 13º", "Não executado", src, null, "", "Nenhuma conta de salários, pró-labore, férias, 13º ou rescisão a pagar no razão." + unote);
      else {
        let reason = `${checked} contas conferidas, ${flagged} com baixa após o prazo; ${ahead} valor(es) com vencimento depois de ${dateBr(closing.end)} (a vencer).`;
        if (absent.length) reason += ` Não localizados no razão (conferir se aplicável): ${absent.join(", ")}.`;
        if (disorder.length) reason += ` ${disorder.length} contas com datas fora de ordem não conferidas (${disorder.slice(0, 10).join(", ")}).`;
        test(
          "C06-C11",
          "Folha: baixa de salários, pró-labore, férias e 13º",
          flagged ? "Pendente" : checked ? "Confere no escopo" : "Não executado",
          src,
          null,
          "Baixa FIFO de cada valor a pagar até o prazo (dias úteis de segunda a sexta, sem feriados locais)",
          reason + note + unote,
          parts,
        );
      }
    }
    // Saldos antigos: FIFO por conta, critério interno; o saldo anterior só conta quando o próprio período passa do limite.
    {
      const spanDays = dias(end) - dias(closing.start) + 1;
      let checked = 0;
      let flagged = 0;
      const unknown: string[] = [];
      const disorder: string[] = [];
      let suppliers = false;
      const parts: Partes = {};
      for (const [a, es] of usable) {
        let k: number | null = null;
        for (let j = 0; j < AGED.length; j++) {
          const [grp, , pattern] = AGED[j];
          if (member(a, grp) && re(pattern).search(nm(a))) {
            k = j;
            break;
          }
        }
        if (k === null && supIds.has(a.id) && member(a, "liability")) k = 0;
        if (k === null || claimed.has(a.id) || nm(a).startsWith("(-)")) continue;
        const side = AGED[k][1];
        suppliers = suppliers || k === 0;
        const lots = fifoLots(a, es, side);
        if (lots === null) {
          disorder.push(a.id);
          continue;
        }
        checked += 1;
        const open = lots.filter((l) => l.left);
        const part = k === 0 ? "Fornecedores" : "Adiantamentos";
        mark(parts, part, "Confere no escopo");
        const old = open.filter((l) => (l.date === null && spanDays > AGED_DAYS) || (l.date && dias(end) - dias(l.date) > AGED_DAYS));
        if (open.some((l) => l.date === null) && spanDays <= AGED_DAYS) unknown.push(a.id);
        if (!old.length) continue;
        flagged += 1;
        mark(parts, part, "Pendente");
        const first = old[0];
        const oldest = first.date === null ? "saldo anterior a " + dateBr(closing.start) : dateBr(first.date);
        const total = soma(old.map((l) => l.left));
        finding(
          "Saldo antigo em aberto: " + a.code + " " + a.name,
          "Razão",
          total,
          "Evidência insuficiente",
          src + ` p. ${first.page} linha ${first.line} conta ${a.id}`,
          `${old.length} valor(es) em aberto em ${dateBr(closing.end)} há mais de ${AGED_DAYS} dias, total ${brl(total)}; mais antigo: ${oldest}.`,
          "Obter a composição por título, fornecedor ou cliente e confirmar a baixa ou a realização; não baixar sem documento. Método FIFO na conta: não identifica o título.",
          "Média",
        );
      }
      if (!checked && !disorder.length)
        test("R16", "Saldos antigos em aberto (fornecedores e adiantamentos)", "Não executado", src, null, "", "Nenhuma conta de fornecedores ou adiantamentos no razão." + unote);
      else {
        let reason = `${checked} contas conferidas, ${flagged} com valores em aberto há mais de ${AGED_DAYS} dias (critério interno). Método FIFO por conta, sem identificar título, fornecedor ou cliente.`;
        if (sup) reason += ` Fornecedores localizados pelo grupo do balancete: prefixo ${sup[0]} (${sup[1].length} contas).`;
        else if (!suppliers) reason += " Conta de fornecedores não localizada no razão (conferir se aplicável).";
        if (unknown.length) reason += ` Saldo anterior de idade desconhecida (período menor que o limite): ${unknown.slice(0, 10).join(", ")}.`;
        if (disorder.length) reason += ` ${disorder.length} contas com datas fora de ordem não conferidas (${disorder.slice(0, 10).join(", ")}).`;
        test(
          "R16",
          "Saldos antigos em aberto (fornecedores e adiantamentos)",
          flagged ? "Pendente" : checked ? "Confere no escopo" : "Não executado",
          src,
          null,
          `Valores em aberto em ${dateBr(closing.end)} há mais de ${AGED_DAYS} dias, abatidos por ordem de data`,
          reason + note + unote,
          checked ? parts : null,
        );
      }
    }
  }
  // Ajustes de exercícios anteriores: a origem tem de ser identificada; o histórico fica fora dos achados.
  const found = usable.filter(([a]) => PRIOR_ADJUST.search(nm(a)));
  let flagged = 0;
  for (const [a, es] of found) {
    const live = es.filter((e) => !e[8]);
    if (!live.length) continue;
    flagged += 1;
    const [d, c, text] = describeEntries(live, byid);
    finding(
      "Lançamentos em ajustes de exercícios anteriores: " + a.code,
      "Patrimônio líquido",
      Math.max(d, c),
      "Evidência insuficiente",
      src + ` p. ${live[0][0]} linha ${live[0][1]} conta ${a.id}`,
      text,
      "Identificar a origem de cada lançamento (ajuste de provisão de tributos, falta de documento). Se envolver saldos de clientes, fornecedores ou outros ativos e passivos, avaliar a correção na própria conta, sem impacto indevido no PL.",
      "Média",
    );
  }
  test(
    "R06",
    "Ajustes de exercícios anteriores",
    flagged ? "Pendente" : found.length ? "Confere no escopo" : "Não executado",
    src,
    null,
    "Lançamentos na conta de ajustes de exercícios anteriores",
    found.length ? (flagged ? `${flagged} conta(s) com lançamentos no período; origem a identificar.` : "Sem lançamentos no período.") : "Conta de ajustes de exercícios anteriores não localizada no razão.",
  );
  return [ctx, nature];
}

/** `code.rsplit('.', 1)[0]` */
function rsplitPai(code: string): string {
  const i = code.lastIndexOf(".");
  return i < 0 ? code : code.slice(0, i);
}

export const SUPPLIER_ROWS = ["FORNECEDORES", "FORNECEDOR", "FORNECEDORES A PAGAR", "FORNECEDORES NACIONAIS"];

/** SI, D e C de cada prefixo de classificação do razão: prefixo → [SI, D, C, ids, leitura incompleta, é prefixo de outra conta]. */
export type TotalDoPrefixo = [number, number, number, string[], boolean, boolean];

export function prefixTotals(accounts: ContaRazao[], separate: boolean, end: string): Map<string, TotalDoPrefixo> {
  const out = new Map<string, TotalDoPrefixo>();
  for (const a of accounts) {
    const parts = a.code.split(".");
    const bad = Boolean(a.issues.length) || a.opening === null;
    const [d, c] = bad ? [0, 0] : ledgerMovement(a, separate, end);
    for (let k = 1; k <= parts.length; k++) {
      const t = padrao(out, parts.slice(0, k).join("."), (): TotalDoPrefixo => [0, 0, 0, [], false, false]);
      t[0] += bad ? 0 : (a.opening as number);
      t[1] += d;
      t[2] += c;
      t[3].push(a.id);
      t[4] = t[4] || bad;
      t[5] = t[5] || k < parts.length;
    }
  }
  return out;
}

/** Prefixo do razão (o mais específico) cujas contas somam SI, D, C e SF da linha do balancete; `null` quando nenhum confere. */
export function matchPrefix(
  totals: Map<string, TotalDoPrefixo>,
  r: Pick<ContaBalancete, "opening" | "debit" | "credit" | "closing">,
  tolerance: number,
  root: string | null = null,
): [string, string[]] | null {
  if (!(r.debit || r.credit)) return null;
  let best: [string, string[]] | null = null;
  const candidatos = [...totals.entries()].filter(([p, t]) => t[5] && !t[4] && (root === null || under(p, root))).map(([p]) => p);
  candidatos.sort((a, b) => a.length - b.length || cmp(a, b));
  for (const p of candidatos) {
    const [o, d, c, ids] = totals.get(p) as TotalDoPrefixo;
    const pares: [number, number][] = [
      [o, r.opening],
      [d, r.debit],
      [c, r.credit],
      [o + d - c, r.closing],
    ];
    if (pares.every(([x, y]) => Math.abs(x - y) <= tolerance)) best = [p, ids];
  }
  return best;
}

export function balanceGroup(
  split: Divisao,
  r: Pick<ContaBalancete, "opening" | "debit" | "credit" | "closing">,
  separate: boolean,
  end: string,
  tolerance: number,
  root: string | null,
): [string, string[]] | null {
  return matchPrefix(
    prefixTotals(
      split.map(([a]) => a),
      separate,
      end,
    ),
    r,
    tolerance,
    root,
  );
}
