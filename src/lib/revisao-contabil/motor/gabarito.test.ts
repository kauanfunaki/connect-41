// Testes-gabarito do motor da Revisão contábil (05/11/2026).
//
// `gabarito/sinteticos.json.gz` foi gerado por `scripts/revisao-contabil/gerar-gabarito.py`, que roda a
// suíte de testes do original (AudTool, Python, commit 92658a2) e grava cada chamada ao motor com a entrada
// e a saída exatas, mais casos sintéticos de CSV, Excel e ZIP. Aqui cada chamada é repetida no porte e o
// resultado tem de ser igual, campo a campo. Se um gabarito falhar, o porte está errado, e não o gabarito.
// Só dados sintéticos: nenhum documento real.

import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync, strFromU8 } from "fflate";
import { describe, expect, test } from "vitest";
import { analyse } from "./analise";
import { extractFile, unpack } from "./arquivo";
import * as base from "./base";
import { ADVANCES, CAPITAL, CAPITAL_ROWS, GROUP_NAMES, resultNature, THIRTEENTH_PROVISIONS, TRIAL_LINES } from "./balancete";
import { executar } from "./execucao";
import { FISCAL_DOCS, FISCAL_LINES, REGIME_NOTE } from "./fiscal";
import * as leitura from "./leitura";
import { interpreted, MANUAL, MANUAL_SECTIONS, manualMatrix, manualStatus } from "./manual";
import { PAYMENT_LINES, PAYMENT_WINDOW, TAX_FAMILIES } from "./pagamentos";
import * as razao from "./razao";

type Registro = { fn: string; args: unknown[]; kwargs: Record<string, unknown>; result?: unknown; error?: string };
const gabarito = JSON.parse(strFromU8(gunzipSync(readFileSync(path.join(__dirname, "gabarito", "sinteticos.json.gz"))))) as {
  constantes: Record<string, unknown>;
  chamadas: Registro[];
};

/** Entrada do gravador → valor JS: tupla vira array, data vira ISO, bytes viram Uint8Array, conjunto vira Set. */
function decodificar(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(decodificar);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("$tuple" in o) return (o.$tuple as unknown[]).map(decodificar);
    if ("$date" in o) return o.$date;
    if ("$bytes" in o) return new Uint8Array(Buffer.from(o.$bytes as string, "base64"));
    if ("$set" in o) return new Set((o.$set as unknown[]).map(decodificar));
    if ("$dict" in o) return new Map((o.$dict as [unknown, unknown][]).map(([k, x]) => [decodificar(k), decodificar(x)]));
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, decodificar(x)]));
  }
  return v;
}

/** Forma canônica para comparar: sem `undefined`, sem -0, bytes em base64, conjunto ordenado. */
function canonico(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === "number") return Object.is(v, -0) ? 0 : v;
  if (v instanceof Uint8Array) return { $bytes: Buffer.from(v).toString("base64") };
  if (v instanceof Set) return { $set: [...v].map(canonico).sort() };
  if (v instanceof Map) return { $dict: [...v.entries()].map(([k, x]) => [canonico(k), canonico(x)]) };
  if (Array.isArray(v)) return v.map(canonico);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v)
        .filter(([, x]) => x !== undefined)
        .map(([k, x]) => [k, canonico(x)]),
    );
  return v;
}

/** O esperado na mesma forma: tupla vira array, data vira ISO; bytes e conjuntos ficam marcados. */
function esperado(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(esperado);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("$tuple" in o) return (o.$tuple as unknown[]).map(esperado);
    if ("$date" in o) return o.$date;
    if ("$bytes" in o) return { $bytes: o.$bytes };
    if ("$set" in o) return { $set: (o.$set as unknown[]).map(esperado).sort() };
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, esperado(x)]));
  }
  return typeof v === "number" && Object.is(v, -0) ? 0 : v;
}

type Fn = (...a: unknown[]) => unknown;
const a = (f: unknown) => f as Fn;

/** Cada função gravada do original → a do porte, com os argumentos na ordem do Python. */
const PORTE: Record<string, { fn: Fn; kwargs?: string[] }> = {
  analyse: { fn: a(analyse), kwargs: ["company", "closing", "documents", "tolerance"] },
  parse_pages: { fn: a(leitura.parsePages) },
  parse_ledger: { fn: a(leitura.parseLedger) },
  parse_fiscal: { fn: a(leitura.parseFiscal) },
  parse_payments: { fn: a(leitura.parsePayments) },
  csv_accounts: { fn: a(leitura.csvAccounts) },
  extract_file: { fn: a((name: string, raw: Uint8Array) => extractFile(name, raw)) },
  unpack: { fn: a(unpack) },
  interpreted: { fn: a(interpreted) },
  result_nature: { fn: a(resultNature) },
  business_day: { fn: a(base.businessDay) },
  balance_group: { fn: a(razao.balanceGroup) },
  ledger_split: { fn: a(razao.ledgerSplit) },
  holiday: { fn: a(base.holiday) },
  fifo_lots: { fn: a(razao.fifoLots) },
  account_label: { fn: a(razao.accountLabel) },
  under: { fn: a(base.under) },
  period_months: { fn: a(base.periodMonths) },
  payroll_due: { fn: a(razao.payrollDue) },
  month_label: { fn: a(base.monthLabel) },
  manual_status: { fn: a(manualStatus), kwargs: ["statuses", "gap"] },
  manual_matrix: { fn: a(manualMatrix) },
  describe_entries: { fn: a(razao.describeEntries) },
  contrary_periods: { fn: a(razao.contraryPeriods) },
  brl: { fn: a(base.brl) },
  number: { fn: a(base.number) },
  norm: { fn: a(base.norm) },
  identifier: { fn: a(base.identifier) },
};

/** Diferenças deliberadas do porte, com o motivo. */
const DESVIOS: Record<string, string> = {
  "extract_file antigo.xls": "o Connect não lê .xls (Excel 97-2003): recusa com aviso para enviar .xlsx ou CSV",
};

async function repetir(r: Registro): Promise<{ ok: true; valor: unknown } | { ok: false; erro: string }> {
  const p = PORTE[r.fn];
  const args = (r.args as unknown[]).map(decodificar);
  for (const [k, v] of Object.entries(r.kwargs ?? {})) {
    const i = p.kwargs?.indexOf(k) ?? -1;
    if (i < 0) throw new Error(`argumento nomeado sem posição: ${r.fn}(${k}=)`);
    args[i] = decodificar(v);
  }
  // O teste do limite de lançamentos baixa o limite do original para 2.
  const limite = /Razão ultrapassa (\d+) lançamentos/.exec(r.error ?? "");
  const antes = leitura.LIMITES.lancamentos;
  if (limite) leitura.LIMITES.lancamentos = Number(limite[1]);
  try {
    return { ok: true, valor: await p.fn(...args) };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  } finally {
    leitura.LIMITES.lancamentos = antes;
  }
}

const rotulo = (r: Registro, i: number) =>
  `${String(i).padStart(3, "0")} ${r.fn}(${typeof r.args[0] === "string" ? JSON.stringify(r.args[0]).slice(0, 40) : "…"})${r.error ? " → erro" : ""}`;

describe("gabarito: chamadas gravadas da suíte original", () => {
  const chamadas = gabarito.chamadas.filter((r) => r.fn !== "handle_json");
  test("toda função gravada tem a correspondente no porte", () => {
    expect([...new Set(chamadas.map((r) => r.fn))].filter((fn) => !(fn in PORTE))).toEqual([]);
    expect(chamadas.length).toBeGreaterThan(600);
  });
  chamadas.forEach((r, i) => {
    const chave = `${r.fn} ${typeof r.args[0] === "string" ? r.args[0] : ""}`;
    test.runIf(!(chave in DESVIOS))(rotulo(r, i), async () => {
      const saida = await repetir(r);
      if (r.error !== undefined) {
        expect(saida.ok, "o original lançou erro").toBe(false);
        if (!saida.ok) expect(saida.erro).toBe(r.error);
      } else {
        if (!saida.ok) throw new Error(`o porte lançou erro: ${saida.erro}`);
        expect(canonico(saida.valor)).toStrictEqual(esperado(r.result));
      }
    });
  });
  test("desvio deliberado: .xls é recusado com orientação", async () => {
    await expect(extractFile("antigo.xls", new Uint8Array([1, 2, 3]))).rejects.toThrow(/salve como \.xlsx ou CSV/);
  });
});

describe("gabarito: execução pelo adapter", () => {
  for (const r of gabarito.chamadas.filter((x) => x.fn === "handle_json")) {
    test("/api/analyse com correções, tolerância e metadados", () => {
      const req = JSON.parse(r.args[0] as string) as { path: string; body: Parameters<typeof executar>[0] };
      expect(req.path).toBe("/api/analyse");
      const esperadoAdapter = JSON.parse(r.result as string) as Record<string, unknown>;
      const saida = executar(req.body) as unknown as Record<string, unknown>;
      expect(typeof saida.runId).toBe("string");
      expect(typeof saida.executedAt).toBe("string");
      const sem = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== "runId" && k !== "executedAt"));
      expect(canonico(sem(saida))).toStrictEqual(esperado(sem(esperadoAdapter)));
    });
  }
});

describe("gabarito: tabelas do motor iguais às do original", () => {
  const TS: Record<string, unknown> = {
    VERSION: base.VERSION,
    MONEY: base.MONEY,
    LEDGER_SKIP: leitura.LEDGER_SKIP,
    MAX_LEDGER_ENTRIES: leitura.MAX_LEDGER_ENTRIES,
    MAX_LEDGER_ACCOUNTS: leitura.MAX_LEDGER_ACCOUNTS,
    MONTHS_PT: base.MONTHS_PT,
    MAX_PAYMENT_GUIDES: leitura.MAX_PAYMENT_GUIDES,
    MAX_PAYMENT_ITEMS: leitura.MAX_PAYMENT_ITEMS,
    MONTH_NAMES: base.MONTH_NAMES,
    HOLIDAYS: base.HOLIDAYS,
    RECURRING: razao.RECURRING,
    PAYROLL: razao.PAYROLL,
    AGED_DAYS: razao.AGED_DAYS,
    AGED: razao.AGED,
    NATURE_PARTS: razao.NATURE_PARTS,
    PART_ORDER: razao.PART_ORDER,
    LEDGER_LINES: razao.LEDGER_LINES,
    SUPPLIER_ROWS: razao.SUPPLIER_ROWS,
    FISCAL_LINES,
    FISCAL_DOCS,
    REGIME_NOTE,
    PAYMENT_LINES,
    PAYMENT_WINDOW,
    TAX_FAMILIES,
    TRIAL_LINES,
    THIRTEENTH_PROVISIONS,
    CAPITAL,
    CAPITAL_ROWS,
    ADVANCES,
    MANUAL_SECTIONS,
    MANUAL,
    GROUP_NAMES,
    THIRTEENTH: razao.THIRTEENTH,
  };
  for (const [nome, valor] of Object.entries(gabarito.constantes)) {
    test(nome, () => {
      expect(nome in TS, `${nome} não exportado pelo porte`).toBe(true);
      expect(canonico(TS[nome])).toStrictEqual(esperado(valor));
    });
  }
});
