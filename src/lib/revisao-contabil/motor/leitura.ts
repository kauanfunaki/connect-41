// Leitores do motor: razão, declaração de faturamento, relatórios de serviços e de entradas,
// comprovantes do e-CAC e balancete/DRE/balanço a partir do texto de cada página.
// Portado de `dist/engine.py` (AudTool R_12 provisório, commit 92658a2), funções `parse_ledger`,
// `parse_fiscal`, `parse_payments`, `parse_pages` e `csv_accounts`. Cópia fiel: não altere padrões,
// mensagens ou a ordem das verificações; os testes-gabarito comparam com o original.

import { MONEY, MONTH_PT, MONTHS_PT, identifier, monthEnd, norm, number, trialHeader, valor } from "./base";
import { lerCsv, farejar } from "./csvPython";
import { corta, d2, len, ordenados, re, split, splitlines, strip, verdade } from "./py";
import type { ContaBalancete, ContaRazao, Fatos, Fiscal, Guia, Lancamento, Rubrica } from "./tipos";

const LEDGER_ACCOUNT = re(String.raw`CONTA:\s*(\d+)\s*-\s*([1-9](?:\.\d+)*)\s+(.+)`);
const LEDGER_ENTRY = re(String.raw`(\d{2})/(\d{2})/(\d{4})\s+(\d+)(?:\s+(\d+))?\s+(` + MONEY + String.raw`)\s+(` + MONEY + ")");
const LEDGER_OPENING = re(String.raw`SALDO ANTERIOR\s+(` + MONEY + ")");
const LEDGER_TOTAL = re(String.raw`TOTAL DA CONTA:\s*(` + MONEY + String.raw`)\s+(` + MONEY + ")");
export const LEDGER_SKIP = ["EMPRESA:", "C.N.P.J", "CNPJ", "PERIODO:", "RAZAO", "DATA LOTE", "SISTEMA LICENCIADO"];
export const MAX_LEDGER_ENTRIES = 300000;
export const MAX_LEDGER_ACCOUNTS = 20000;
/** Limites de leitura do razão; um objeto para os testes poderem baixar o limite, como os do original fazem. */
export const LIMITES = { lancamentos: MAX_LEDGER_ENTRIES, contas: MAX_LEDGER_ACCOUNTS };

type ContaEmLeitura = Omit<ContaRazao, "closing"> & { balance: number | null; entries: Lancamento[]; closing?: number | null };

export type RazaoLido = { accounts: ContaRazao[]; entries: Lancamento[]; warnings: string[]; clearing: string[] };

/** Razão por conta: cada lançamento traz um único valor; D/C sai da variação do saldo, nunca presumido. */
export function parseLedger(pages: string[]): RazaoLido | null {
  const cleans = pages.map((p) => splitlines(p).map((l) => norm(strip(l))));
  if (
    !cleans.some((p) => p.some((c) => c.startsWith("RAZAO"))) ||
    !cleans.some((p) => p.some((c) => ["DATA", "LOTE", "HISTORICO", "SALDO"].every((x) => c.includes(x))))
  )
    return null;
  const accounts = new Map<string, ContaEmLeitura>();
  const entries: Lancamento[] = [];
  let cur: ContaEmLeitura | null = null;
  let last: Lancamento | null = null;
  let pending: string[] = [];
  let unread = 0;
  const warnings: string[] = [];
  const issue = (a: ContaEmLeitura, text: string) => {
    // Uma mensagem por tipo de problema; o primeiro local basta para começar a revisão.
    if (!a.issues.some((i) => i.split(" (p.")[0] === text.split(" (p.")[0])) a.issues.push(text);
  };
  const attach = (e: Lancamento | null, lines: string[]) => {
    if (e !== null && lines.length) e[9] = corta(strip(e[9] + " " + lines.join(" ")), 500);
  };
  cleans.forEach((page, pi) => {
    const pn = pi + 1;
    page.forEach((c, li) => {
      const ln = li + 1;
      if (!c || LEDGER_SKIP.some((s) => c.startsWith(s))) return;
      let m = LEDGER_ACCOUNT.fullmatch(c);
      if (m) {
        // O sistema repete o cabeçalho da conta a cada página; repetição em outro lugar é apontada.
        let a = accounts.get(m[1] as string);
        if (a !== undefined && cur === a) return;
        attach(last, pending);
        pending = [];
        last = null;
        if (a === undefined) {
          if (accounts.size >= LIMITES.contas) throw new Error(`Razão ultrapassa ${LIMITES.contas} contas.`);
          a = {
            id: m[1] as string,
            code: m[2] as string,
            name: strip(m[3] as string),
            opening: null,
            balance: null,
            debit: 0,
            credit: 0,
            totalDebit: null,
            totalCredit: null,
            closingDebit: 0,
            closingCredit: 0,
            closingCount: 0,
            closingDates: [],
            entryCount: 0,
            page: pn,
            line: ln,
            issues: [],
            entries: [],
          };
          accounts.set(m[1] as string, a);
        } else issue(a, `Conta repetida fora de sequência (p. ${pn}, linha ${ln}).`);
        cur = a;
        return;
      }
      if (cur === null) return;
      const conta: ContaEmLeitura = cur;
      m = LEDGER_OPENING.fullmatch(c);
      if (m) {
        if (conta.opening !== null) issue(conta, `Saldo anterior repetido (p. ${pn}, linha ${ln}).`);
        conta.opening = conta.balance = valor(m[1]);
        return;
      }
      m = LEDGER_ENTRY.fullmatch(c);
      if (m) {
        if (entries.length >= LIMITES.lancamentos) throw new Error(`Razão ultrapassa ${LIMITES.lancamentos} lançamentos.`);
        const amount = Math.abs(valor(m[6]));
        const balance = valor(m[7]);
        const prev = conta.balance;
        let side: "D" | "C" | null = null;
        if (prev === null) issue(conta, `Lançamento sem saldo anterior identificado (p. ${pn}, linha ${ln}).`);
        else if (balance === prev + amount && amount) side = "D";
        else if (balance === prev - amount && amount) side = "C";
        else if (amount || balance !== prev) issue(conta, `Cadeia de saldo rompida: débito/crédito não determinado (p. ${pn}, linha ${ln}).`);
        if (side) {
          if (side === "D") conta.debit += amount;
          else conta.credit += amount;
        }
        // O histórico envolve a linha do lançamento: a linha logo acima o abre; as anteriores fecham o lançamento anterior.
        attach(last, pending.slice(0, -1));
        const e: Lancamento = [pn, ln, `${m[3]}-${m[2]}-${m[1]}`, m[4] as string, m[5], amount, side, balance, false, corta(pending.slice(-1).join(" "), 500)];
        entries.push(e);
        conta.entries.push(e);
        conta.entryCount += 1;
        conta.balance = balance;
        last = e;
        pending = [];
        return;
      }
      m = LEDGER_TOTAL.fullmatch(c);
      if (m) {
        attach(last, pending);
        pending = [];
        conta.totalDebit = Math.abs(valor(m[1]));
        conta.totalCredit = Math.abs(valor(m[2]));
        return;
      }
      // Valor solto depois do lançamento é a coluna de saldo do exercício do sistema; o significado não é validado.
      if (re(MONEY).fullmatch(c)) return;
      if (re(String.raw`\d{2}/\d{2}/\d{4}`).match(c)) {
        unread += 1;
        issue(conta, `Linha de lançamento não estruturada (p. ${pn}, linha ${ln}).`);
        return;
      }
      pending.push(c);
    });
  });
  attach(last, pending);
  // Lançamentos de encerramento contra a conta de apuração do resultado são marcados, nunca retirados.
  const clearing = new Set([...accounts.values()].filter((a) => a.name.includes("APURACAO DO RESULTADO")).map((a) => a.id));
  const out: ContaRazao[] = [];
  for (const a of accounts.values()) {
    for (const e of a.entries) {
      if (e[4] !== null && clearing.has(e[4]) && !clearing.has(a.id) && e[6]) {
        e[8] = true;
        if (e[6] === "D") a.closingDebit += e[5];
        else a.closingCredit += e[5];
        a.closingCount += 1;
        if (!a.closingDates.includes(e[2])) a.closingDates.push(e[2]);
      }
    }
    const { balance, entries: _lancamentos, ...resto } = a;
    void _lancamentos;
    const conta: ContaRazao = { ...resto, closing: balance };
    if (conta.opening === null) issueFinal(conta, "Saldo anterior não identificado.");
    if (conta.totalDebit === null) issueFinal(conta, "Total da conta não identificado.");
    out.push(conta);
  }
  const bad = out.filter((a) => a.issues.length).map((a) => a.id);
  if (!out.length) warnings.push("Cabeçalho de razão encontrado, mas nenhuma conta foi estruturada. Análise deste documento bloqueada; conferir layout.");
  if (bad.length)
    warnings.push(`${bad.length} contas do razão com leitura incompleta (${bad.slice(0, 20).join(", ") + (bad.length > 20 ? "…" : "")}); conferir leitura.`);
  if (unread) warnings.push(`${unread} linhas de lançamento do razão não foram estruturadas; conferir leitura.`);
  return { accounts: out, entries, warnings, clearing: ordenados(clearing) };
}

function issueFinal(a: ContaRazao, text: string) {
  if (!a.issues.some((i) => i.split(" (p.")[0] === text.split(" (p.")[0])) a.issues.push(text);
}

// Acompanhamento de serviços/entradas: valor contábil, tipo (opcional), base, imposto, isentas, outras; o sistema intercala a quantidade no início.
const FISCAL_ROW = re(
  String.raw`(?:\d+\s+)?(` + MONEY + String.raw`)\s+(?:([A-Z]{2,8})\s+)?(` + MONEY + String.raw`)\s+(` + MONEY + String.raw`)\s+(` + MONEY + String.raw`)\s+(` + MONEY + ")",
);

export type FiscalLido = { kind: string; cnpjs: string[]; periods: string[][]; warnings: string[]; fiscal: Fiscal };

/** Declaração de faturamento e relatórios de acompanhamento de serviços e de entradas. Guarda só valores e CFOPs; nomes de clientes e signatários não são lidos. */
export function parseFiscal(pages: string[]): FiscalLido | null {
  const lines: [number, number, string][] = [];
  pages.forEach((p, pi) => splitlines(p).forEach((l, li) => lines.push([pi + 1, li + 1, split(norm(l)).join(" ")])));
  const text = lines.map(([, , c]) => c).join(" ");
  const warnings: string[] = [];
  const months: [string, number, number, number][] = [];
  let total: Fiscal["total"] = null;
  for (const [pn, ln, c] of lines) {
    let m = re("(" + MONTH_PT + String.raw`)/(\d{4})\s+(?:R\$\s*)?(` + MONEY + ")").fullmatch(c);
    if (m) {
      months.push([`${m[2]}-${d2(MONTHS_PT.indexOf(m[1] as string) + 1)}`, valor(m[3]), pn, ln]);
      continue;
    }
    m = re(String.raw`TOTAL\s+(?:R\$\s*)?(` + MONEY + ")").fullmatch(c);
    if (m && months.length && total === null) total = { value: valor(m[1]), base: null, tax: null, page: pn, line: ln };
  }
  if (months.length && text.includes("FATURAMENTO")) {
    // Texto da declaração: CNPJ abaixo do rótulo e período por extenso ("Janeiro de 2025 a Dezembro de 2025").
    const cnpjs = ordenados(new Set(re(String.raw`\b\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}\b`).findall(text).map((x) => identifier(x))));
    let periods: string[][] = [];
    const p = re("PERIODO DE (" + MONTH_PT + String.raw`) DE (\d{4}) A (` + MONTH_PT + String.raw`) DE (\d{4})`).search(text);
    if (p)
      periods = [[`${p[2]}-${d2(MONTHS_PT.indexOf(p[1] as string) + 1)}-01`, monthEnd(`${p[4]}-${d2(MONTHS_PT.indexOf(p[3] as string) + 1)}`)]];
    if (total === null) warnings.push("Total da declaração de faturamento não identificado; conferir leitura.");
    if (new Set(months.map((x) => x[0])).size !== months.length) warnings.push("Mês repetido na declaração de faturamento; conferir leitura.");
    return {
      kind: "Faturamento",
      cnpjs,
      periods,
      warnings,
      fiscal: { report: "Faturamento", total, items: months.length, itemsTotal: months.reduce((s, x) => s + x[1], 0), months, groups: [] },
    };
  }
  for (const [report, label] of [
    ["Serviços", "ACOMPANHAMENTO DE SERVICOS"],
    ["Entradas", "ACOMPANHAMENTO DE ENTRADAS"],
  ] as const) {
    if (!lines.some(([, , c]) => c.startsWith(label))) continue;
    const rows: NonNullable<Fiscal["total"]>[] = [];
    let total: Fiscal["total"] = null;
    let closing = false;
    let cfop: string | null = null;
    const groups = new Map<string, number>();
    for (const [pn, ln, c] of lines) {
      if (re(String.raw`T\d*OTAL GERAL`).search(c)) {
        closing = true;
        continue;
      }
      const g = re(String.raw`\d*CFOP:\s*(\d{4})\b`).match(c);
      if (g) {
        cfop = g[1];
        continue;
      }
      const m = FISCAL_ROW.fullmatch(c);
      if (!m) continue;
      const vals = { value: valor(m[1]), base: number(m[3]), tax: number(m[4]), page: pn, line: ln };
      if (closing) {
        total = total ?? vals;
        continue;
      }
      rows.push(vals);
      if (report === "Entradas" && cfop) groups.set(cfop, (groups.get(cfop) ?? 0) + vals.value);
    }
    if (total === null) warnings.push(`Total Geral do relatório de ${report.toLowerCase()} não identificado; conferir leitura.`);
    return {
      kind: "Relatório de " + report.toLowerCase(),
      cnpjs: [],
      periods: [],
      warnings,
      fiscal: {
        report,
        total,
        items: rows.length,
        itemsTotal: rows.reduce((s, r) => s + r.value, 0),
        months: [],
        groups: ordenados(groups.keys()).map((k) => [k, groups.get(k) as number]),
      },
    };
  }
  return null;
}

// Comprovante de Arrecadação (e-CAC): código, descrição, principal, multa, juros e total por item; totais em linha própria.
const PAY_ITEM = re(String.raw`(\d{4})\s+(\S.*?)\s+(` + MONEY + String.raw`)\s+(` + MONEY + String.raw`)\s+(` + MONEY + String.raw`)\s+(` + MONEY + ")");
const PAY_TOTAL = re("(" + MONEY + String.raw`)\s+(` + MONEY + String.raw`)\s+(` + MONEY + String.raw`)\s+(` + MONEY + ")");
const PAY_HEADER = re(String.raw`(\d{2})/(\d{2})/(\d{4})\s+(\d{2})/(\d{2})/(\d{4})\s+(\d{8,30})`);
export const MAX_PAYMENT_GUIDES = 5000;
export const MAX_PAYMENT_ITEMS = 50;
const ROTULOS: [string, string][] = [
  ["cnpj", "CNPJ RAZAO SOCIAL"],
  ["header", "PERIODO APURACAO"],
  ["items", "CODIGO DESCRICAO"],
  ["paid", "BANCO DATA DE ARRECADACAO"],
  ["reference", "AGENCIA ESTABELECIMENTO"],
];

export type PagamentosLidos = { kind: string; cnpjs: string[]; warnings: string[]; payments: { guides: Guia[] } };

/** Comprovantes de arrecadação do e-CAC. Guarda CNPJ, datas, número, referência e valores; razão social, banco, agência e código de controle não são lidos. */
export function parsePayments(pages: string[]): PagamentosLidos | null {
  let guides: Guia[] = [];
  const warnings: string[] = [];
  let x: Guia | null = null;
  let expect: string | null = null;
  paginas: for (let pi = 0; pi < pages.length; pi++) {
    const pn = pi + 1;
    const linhas = splitlines(pages[pi]);
    for (let li = 0; li < linhas.length; li++) {
      const ln = li + 1;
      const s = split(linhas[li]).join(" ");
      const c = norm(s);
      if (c.startsWith("COMPROVANTE DE ARRECADACAO")) {
        if (guides.length >= MAX_PAYMENT_GUIDES) {
          warnings.push(`Mais de ${MAX_PAYMENT_GUIDES} comprovantes; os seguintes não foram lidos.`);
          x = null;
          break paginas;
        }
        x = { type: null, number: null, cnpj: null, period: null, due: null, paid: null, reference: null, items: [], principal: null, fine: null, interest: null, total: null, page: pn, line: ln };
        guides.push(x);
        expect = null;
        continue;
      }
      if (x === null) continue;
      const t = re(String.raw`REGISTRO DE ARRECADACAO DE ([A-Z]{2,10})\b`).search(c);
      if (t) {
        x.type = t[1];
        continue;
      }
      // Os valores vêm na linha seguinte a cada rótulo; a razão social ao lado do CNPJ é descartada.
      const label = ROTULOS.find(([, v]) => c.startsWith(v))?.[0] ?? null;
      if (label) {
        expect = label;
        continue;
      }
      if (expect === "cnpj") {
        const m = re(String.raw`(\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2})\b`).match(c);
        expect = null;
        if (m) x.cnpj = identifier(m[1]);
      } else if (expect === "header") {
        const m = PAY_HEADER.fullmatch(c);
        expect = null;
        if (m) {
          x.period = `${m[3]}-${m[2]}-${m[1]}`;
          x.due = `${m[6]}-${m[5]}-${m[4]}`;
          x.number = m[7];
        }
      } else if (expect === "items") {
        let m = PAY_TOTAL.fullmatch(c);
        if (m) {
          [x.principal, x.fine, x.interest, x.total] = [1, 2, 3, 4].map((i) => number(m![i]));
          expect = null;
          continue;
        }
        m = PAY_ITEM.fullmatch(s);
        if (!m) continue;
        if (x.items.length >= MAX_PAYMENT_ITEMS) {
          warnings.push(`Comprovante p. ${pn} com mais de ${MAX_PAYMENT_ITEMS} itens; os seguintes não foram lidos.`);
          continue;
        }
        x.items.push([m[1] as string, corta(m[2] as string, 200), valor(m[3]), valor(m[4]), valor(m[5]), valor(m[6])]);
      } else if (expect === "paid") {
        const ds = re(String.raw`(\d{2})/(\d{2})/(\d{4})`).findall(c) as string[][];
        expect = null;
        if (ds.length) {
          const [d, mo, y] = ds[ds.length - 1];
          x.paid = `${y}-${mo}-${d}`;
        }
      } else if (expect === "reference") {
        const m = re("(" + MONEY + String.raw`)(?:\s+(\d{1,30}))?$`).search(c);
        expect = null;
        if (m) x.reference = m[2];
      }
    }
  }
  guides = guides.filter((g) => g.type);
  if (!guides.length) return null;
  for (const g of guides) {
    const gaps = (
      [
        ["número", g.number],
        ["data de arrecadação", g.paid],
        ["total", g.total],
      ] as const
    )
      .filter(([, v]) => v === null)
      .map(([k]) => k);
    if (gaps.length) warnings.push(`Comprovante p. ${g.page}: ${gaps.join(", ")} não identificado(s); conferir leitura.`);
  }
  return { kind: "Comprovantes de arrecadação", cnpjs: ordenados(new Set(guides.filter((g) => g.cnpj).map((g) => g.cnpj as string))), warnings, payments: { guides } };
}

const LABELS = [
  "RECEITA BRUTA", "DEDUCOES", "RECEITA LIQUIDA", "CUSTO DA PRESTACAO DE SERVICO", "CUSTOS DAS MERCADORIAS VENDIDAS", "LUCRO BRUTO",
  "DESPESAS OPERACIONAIS", "DEPESAS FINANCEIRAS", "DESPESAS FINANCEIRAS", "RECEITAS FINANCEIRAS", "OUTRAS DESPESAS OPERACIONAIS",
  "OUTRAS RECEITAS OPERACIONAIS", "RESULTADO OPERACIONAL", "DESPESAS NAO OPERACIONAIS", "RESULTADO ANTES DO IR E CSLL",
  "PROVISOES PARA IR E CSLL", "PREJUIZO DO EXERCICIO", "LUCRO DO EXERCICIO", "PREJUIZO LIQUIDO DO EXERCICIO", "LUCRO LIQUIDO DO EXERCICIO",
];
const BP_LABELS = ["ATIVO", "PASSIVO", "ATIVO CIRCULANTE", "ATIVO NAO-CIRCULANTE", "PASSIVO CIRCULANTE", "PASSIVO NAO-CIRCULANTE", "PATRIMONIO LIQUIDO"];
const TAIL = re(String.raw`\s+(` + MONEY + String.raw`)\s+(` + MONEY + String.raw`)\s+(` + MONEY + String.raw`)\s+(` + MONEY + String.raw`)\s*$`);

/** Fatos de um documento a partir do texto de cada página. */
export function parsePages(pages: string[]): Fatos {
  const accounts: ContaBalancete[] = [];
  let statements: Record<string, Rubrica> = {};
  const cnpjs = new Set<string>();
  const periods = new Map<string, string[]>();
  const dates = new Set<string>();
  let candidates = 0;
  let layout: "classified" | "unclassified" | null = null;
  let unread = 0;
  const comeca = re(String.raw`\s*\d`);
  pages.forEach((page, pi) => {
    const pn = pi + 1;
    splitlines(page).forEach((line, li) => {
      const ln = li + 1;
      const stripped = strip(line);
      const clean = norm(stripped);
      if (re(String.raw`C\.?N\.?P\.?J`).search(clean)) {
        for (const x of re(String.raw`[A-Z0-9]{2}\.?[A-Z0-9]{3}\.?[A-Z0-9]{3}/?[A-Z0-9]{4}-?\d{2}`).findall(clean)) cnpjs.add(identifier(x));
      }
      if (clean.includes("PERIODO")) {
        const ds = re(String.raw`\d{2}/\d{2}/\d{4}`).findall(clean) as string[];
        if (ds.length >= 2) {
          const p = ds.slice(0, 2).map((x) => x.split("/").reverse().join("-"));
          periods.set(JSON.stringify(p), p);
        }
      }
      // O balanço informa uma data-base ("Balanço encerrado em"), não um período.
      const hit = re(String.raw`ENCERRADO EM:?\s*(\d{2})/(\d{2})/(\d{4})`).search(clean);
      if (hit) dates.add(`${hit[3]}-${hit[2]}-${hit[1]}`);
      layout = trialHeader(clean) ?? layout;
      // O código da conta pode vir numa linha que começa com um título repetido do PDF.
      const tail = TAIL.search(line);
      if (tail) {
        candidates += 1;
        const pre = line.slice(0, tail.inicio);
        unread += Number(Boolean(layout && comeca.match(pre)));
        let code: [string, string, string] | null;
        if (layout === "unclassified") {
          const m = re(String.raw`\s*(\d+)\s+(.+)`).match(pre);
          code = m && [m[1] as string, m[1] as string, m[2] as string];
        } else {
          const m = re(String.raw`\s*(\d+)\s+([1-9](?:\.\d+){0,6})(?![\d.])\s+(.+)`).match(pre);
          code = m && [m[1] as string, m[2] as string, m[3] as string];
        }
        if (code) {
          const vals = [1, 2, 3, 4].map((i) => number(tail[i]));
          if (vals.every((v) => v !== null)) {
            const [o, d, c, f] = vals as number[];
            unread -= Number(Boolean(layout && comeca.match(pre)));
            accounts.push({ id: code[0], code: code[1], name: strip(code[2]), opening: o, debit: Math.abs(d), credit: Math.abs(c), closing: f, page: pn, line: ln, original: stripped, classified: layout !== "unclassified" });
          }
        }
      }
      // Campos da DRE têm um só valor no fim, o que evita linhas de balancete.
      for (const label of LABELS) {
        if (clean.startsWith(label)) {
          const vals = re(MONEY).finditer(clean.slice(label.length));
          if (vals.length === 1 && !(label in statements)) statements[label] = { value: valor(vals[0][0]), page: pn, line: ln, original: stripped };
        }
      }
      // Totais do balanço, inclusive em duas colunas.
      for (const label of BP_LABELS) {
        const h = re(String.raw`(?<![A-Z])` + escaparLiteral(label) + String.raw`\s+(` + MONEY + String.raw`)(?=\s|$)`).search(clean);
        if (h && !("BP:" + label in statements)) statements["BP:" + label] = { value: valor(h[1]), page: pn, line: ln, original: stripped };
      }
    });
  });
  const warnings: string[] = [];
  const ledger = layout ? null : parseLedger(pages);
  const fiscal = layout || ledger !== null ? null : parseFiscal(pages);
  const payments = layout || ledger !== null || fiscal !== null ? null : parsePayments(pages);
  let kind: string;
  let lista = accounts;
  // Linhas de histórico do razão podem parecer rubricas; razão nunca alimenta totais de balanço/DRE.
  if (ledger !== null) {
    kind = ledger.accounts.length ? "Razão" : "Razão não reconhecido";
    statements = {};
    lista = [];
    unread = 0;
    warnings.push(...ledger.warnings);
  } else if (fiscal !== null) {
    // Relatórios fiscais alimentam só as próprias conferências, nunca totais de balanço/DRE.
    kind = fiscal.kind;
    statements = {};
    lista = [];
    unread = 0;
    warnings.push(...fiscal.warnings);
    fiscal.cnpjs.forEach((x) => cnpjs.add(x));
    fiscal.periods.forEach((p) => periods.set(JSON.stringify(p), p));
  } else if (payments !== null) {
    // Comprovantes não têm período: a R01 usa as datas de arrecadação.
    kind = payments.kind;
    statements = {};
    lista = [];
    unread = 0;
    warnings.push(...payments.warnings);
    payments.cnpjs.forEach((x) => cnpjs.add(x));
  } else if (layout && !accounts.length) {
    // Linhas com quatro valores e nenhuma conta estruturada não caem nos rótulos do balanço (saldos anteriores).
    kind = "Balancete não reconhecido";
    warnings.push("Cabeçalho de balancete encontrado, mas nenhuma conta foi estruturada. Análise deste documento bloqueada; conferir layout.");
  } else kind = accounts.length ? "Balancete" : "RECEITA BRUTA" in statements ? "DRE" : "BP:ATIVO" in statements ? "Balanço" : "Não classificado";
  // Só linhas que começam com código de conta contam; resumos de totais (ATIVO/PASSIVO/CONTAS DEVEDORAS) não têm.
  if (lista.length && unread > 0) warnings.push(`${unread} linhas com código de conta e quatro valores não foram estruturadas; conferir leitura.`);
  const facts: Fatos = {
    kind,
    layout,
    accounts: lista,
    statements,
    cnpjs: ordenados(cnpjs),
    periods: [...periods.values()].sort((a, b) => cmpLista(a, b)),
    positionDates: ordenados(dates),
    pages: pages.length,
    candidateLines: candidates,
    characters: pages.reduce((s, p) => s + len(p), 0),
    warnings: [],
    parseWarnings: warnings,
  };
  delete (facts as Partial<Fatos>).warnings;
  // O resumo das contas vai com a sessão; os lançamentos ficam com o original guardado.
  if (ledger !== null) {
    facts.ledger = { accounts: ledger.accounts, clearing: ledger.clearing, entryCount: ledger.entries.length };
    facts.ledgerEntries = ledger.entries;
  }
  if (fiscal !== null) facts.fiscal = fiscal.fiscal;
  if (payments !== null) facts.payments = payments.payments;
  return facts;
}

function cmpLista(a: string[], b: string[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return a.length - b.length;
}

function escaparLiteral(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

const ALIASES: [string, string[]][] = [
  ["id", ["CODIGO", "ID"]],
  ["code", ["CLASSIFICACAO", "CONTA"]],
  ["name", ["DESCRICAO", "NOME"]],
  ["opening", ["SALDO_ANTERIOR", "SALDO INICIAL", "SALDO_INICIAL"]],
  ["debit", ["DEBITO"]],
  ["credit", ["CREDITO"]],
  ["closing", ["SALDO_ATUAL", "SALDO FINAL", "SALDO_FINAL"]],
];

/** Balancete em CSV/planilha pelo cabeçalho (código, classificação, descrição, saldos, débito e crédito); `null` sem cabeçalho reconhecido. */
export function csvAccounts(text: string): ContaBalancete[] | null {
  const dialeto = farejar(corta(text, 8000), ";,\t");
  const { campos, linhas } = lerCsv(text, dialeto);
  const heads = new Map<string, string | null>();
  for (const k of campos ?? []) heads.set(strip(norm(k)), k);
  const keys = new Map<string, string | null>(
    ALIASES.map(([k, names]) => {
      const achado = names.find((x) => heads.has(x));
      return [k, achado === undefined ? null : (heads.get(achado) ?? null)];
    }),
  );
  if (!["code", "opening", "debit", "credit", "closing"].every((k) => verdade(keys.get(k)))) return null;
  const rows: ContaBalancete[] = [];
  linhas.forEach((r, i) => {
    const ln = i + 2;
    const get = (k: string): string | null | undefined => (r.has(keys.get(k) as string) ? r.get(keys.get(k) as string) : "") as string | null | undefined;
    const vals = Object.fromEntries((["opening", "debit", "credit", "closing"] as const).map((k) => [k, number(get(k))])) as Record<string, number | null>;
    if (Object.values(vals).some((v) => v === null)) return;
    const id = keys.get("id") ? (r.has(keys.get("id") as string) ? r.get(keys.get("id") as string) : "") : String(ln);
    rows.push({
      id: id as string,
      code: r.get(keys.get("code") as string) as string,
      name: (keys.get("name") ? (r.has(keys.get("name") as string) ? r.get(keys.get("name") as string) : "") : "") as string,
      opening: vals.opening as number,
      debit: vals.debit as number,
      credit: vals.credit as number,
      closing: vals.closing as number,
      page: 1,
      line: ln,
      original: jsonDumps(r),
    });
  });
  return rows;
}

/** `json.dumps(linha, ensure_ascii=False)` de uma linha do `csv.DictReader`. */
function jsonDumps(r: Map<string | null, string | string[] | null>): string {
  const texto = (v: string) => JSON.stringify(v);
  const valorJson = (v: string | string[] | null): string => (v === null ? "null" : Array.isArray(v) ? "[" + v.map(texto).join(", ") + "]" : texto(v));
  return "{" + [...r.entries()].map(([k, v]) => (k === null ? '"null"' : texto(k)) + ": " + valorJson(v)).join(", ") + "}";
}
