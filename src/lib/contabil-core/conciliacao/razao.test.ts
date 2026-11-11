// Teste-gabarito dos leitores de Razão (Fase 5): repete as chamadas gravadas da suíte Python do
// Contábil Core original e dos arquivos inventados (`scripts/contabil-core/gabarito_razao.py`) e
// exige a mesma saída, inclusive o tipo e o texto dos erros.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { dec, texto as textoDec, type Dec } from "../motor/decimal";
import type { Celula } from "../planilha/celula";
import * as apoio from "./apoio";
import * as razao from "./razao";
import { textoDasPaginas } from "./razaoPdf";
import * as planilha from "./razaoPlanilha";
import type { RazaoConta } from "./razaoTipos";

type Registro = {
  fn: string;
  args: unknown[];
  kwargs: Record<string, unknown>;
  result?: unknown;
  error?: { tipo: string; mensagem: string };
  limites?: Record<string, number>;
  linhas_pdf?: string[];
  pdf_real?: boolean;
  abre_pdf_falhou?: boolean;
};

const pasta = join(__dirname, "gabarito");
const registros: Registro[] = JSON.parse(readFileSync(join(pasta, "razao-chamadas.json"), "utf8"));
const arquivos: Record<string, string> = JSON.parse(readFileSync(join(pasta, "razao-arquivos.json"), "utf8"));

// ─── Entrada do Python ──────────────────────────────────────────────────────

const PULAR = Symbol("pular");

function floatPy(t: string): number {
  if (t === "inf") return Infinity;
  if (t === "-inf") return -Infinity;
  if (t === "nan") return NaN;
  return Number(t);
}

/** Uma célula como o openpyxl/xlrd daria, a partir da codificação do gabarito. */
function celula(v: unknown): Celula {
  if (v === null || typeof v === "string") return v;
  if (typeof v === "boolean") return { tipo: "bool", valor: v };
  if (typeof v === "number") return { tipo: "int", valor: BigInt(v) };
  const o = v as Record<string, string>;
  if ("$int" in o) return { tipo: "int", valor: BigInt(o.$int) };
  if ("$f" in o) return { tipo: "float", valor: floatPy(o.$f) };
  if ("$dt" in o) return { tipo: "datahora", valor: o.$dt };
  if ("$date" in o) return { tipo: "datahora", valor: o.$date };
  if ("$time" in o) return { tipo: "hora", valor: o.$time };
  if ("$td" in o) return { tipo: "duracao", valor: o.$td };
  // `Decimal` não sai de planilha: a chamada da suíte com Decimal não tem equivalente.
  throw PULAR;
}

const linhasDe = (v: unknown) => (v as unknown[][]).map((l) => l.map(celula));
const bytes = (v: unknown) => new Uint8Array(Buffer.from(arquivos[(v as { $arquivo: string }).$arquivo], "base64"));
const decDe = (v: unknown) => (typeof v === "number" ? dec(String(v)) : dec((v as { $dec: string }).$dec));

/** O `RazaoConta` do Python (dataclass codificada) como o tipo do porte. */
function razaoContaDe(v: unknown): RazaoConta {
  const o = v as Record<string, unknown>;
  const data = (x: unknown) => (x === null ? null : (x as { $date: string }).$date);
  return {
    empresa: o.empresa as string,
    cnpj: o.cnpj as string,
    periodoInicio: data(o.periodo_inicio),
    periodoFim: data(o.periodo_fim),
    contaCodigo: o.conta_codigo as string,
    contaClassificacao: o.conta_classificacao as string,
    contaDescricao: o.conta_descricao as string,
    lancamentos: (o.lancamentos as Record<string, unknown>[]).map((l) => ({
      data: data(l.data)!,
      lote: l.lote as string,
      historico: l.historico as string,
      contrapartida: l.contrapartida as string,
      valor: decDe(l.valor),
    })),
    totalDebito: decDe(o.total_debito),
    totalCredito: decDe(o.total_credito),
  };
}

// ─── Saída do TypeScript no formato do Python ───────────────────────────────

const ehDec = (v: unknown): v is Dec => !!v && typeof v === "object" && "coeficiente" in v && "expoente" in v;
const snake = (k: string) => k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const DATAHORA = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

function py(v: unknown, chave?: string): unknown {
  if (v === undefined) return null;
  if (ehDec(v)) return { $dec: textoDec(v) };
  if (typeof v === "string" && chave && ["data_lancamento", "periodo_inicio", "periodo_fim"].includes(chave) && DATAHORA.test(v)) return { $dt: v };
  if (typeof v === "string" && chave && ["data", "periodo_inicio", "periodo_fim"].includes(chave) && DATA.test(v)) return { $date: v };
  if (Array.isArray(v)) return v.map((x) => py(x));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [snake(k), py(x, snake(k))]));
  return v;
}

/** O Python soma com `sum()` (começa em `int` 0): sem lançamento, o total é `0`, não `Decimal`. */
function esperado(v: unknown, chave?: string): unknown {
  if (typeof v === "number" && (chave === "total_debito" || chave === "total_credito")) return { $dec: String(v) };
  if (Array.isArray(v)) return v.map((x) => esperado(x));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, esperado(x, k)]));
  return v;
}

// ─── As funções do TypeScript, pelo nome do Python ──────────────────────────

const LIMITES: Record<string, keyof apoio.LimitesApoio> = {
  MAX_LINHAS_APOIO: "linhas",
  MAX_CELULAS_APOIO: "celulas",
  MAX_COLUNAS_APOIO: "colunas",
  MAX_FOLHAS_APOIO: "folhas",
  MAX_BYTES_EXPANDIDOS_APOIO: "bytesExpandidos",
};

type Fn = (r: Registro, leitor: razao.TextoDoPdf | undefined) => unknown;
const tabela: Record<string, Fn> = {
  "planilha._decimal": ({ args }) => planilha.decimalDaCelula(celula(args[0])),
  "planilha._inteiro_como_texto": ({ args }) => planilha.inteiroComoTexto(celula(args[0])),
  "planilha.localizar_colunas": ({ args }) => planilha.localizarColunas(linhasDe(args[0])),
  "planilha._extrair_cabecalho": ({ args }) => planilha.extrairCabecalho(linhasDe(args[0])),
  "planilha._nome_do_fornecedor": ({ args }) => planilha.nomeDoFornecedor((args[0] as unknown[]).map(celula)),
  "planilha.e_planilha": ({ args }) => planilha.ehPlanilha(bytes(args[0])),
  "planilha.parsear_planilha_razao": ({ args }) => planilha.parsearPlanilhaRazao(bytes(args[0])),
  "planilha.parsear_xls_razao": ({ args }) => planilha.parsearXlsRazao(bytes(args[0])),
  "parser.extrair_numero_nf": ({ args }) => planilha.extrairNumeroNf(args[0] as string),
  "parser.extrair_cnpj": ({ args }) => planilha.extrairCnpj(args[0] as string),
  "razao.ler_razao": ({ args }, leitor) => razao.lerRazao(bytes(args[0]), (args[1] as string) ?? "", leitor),
  "razao._razao_das_linhas": ({ args }) => razao.razaoDasLinhas(args[0] as string[]),
  "razao._conferir_total": ({ args }) => razao.conferirTotal(razaoContaDe(args[0])) ?? null,
  "apoio.ler_razao_apoio": ({ args, limites }, leitor) =>
    apoio.lerRazaoApoio(bytes(args[0]), (args[1] as string) ?? "", {
      textoDoPdf: leitor,
      limites: Object.fromEntries(Object.entries(limites ?? {}).map(([k, v]) => [LIMITES[k], v])),
    }),
  "apoio._valor": ({ args }) => apoio.valorApoio(celula(args[0]), args[1] as string),
  "apoio._data": ({ args }) => {
    const d = apoio.dataApoio(celula(args[0]), args[1] as string);
    return d === null ? null : { $date: d };
  },
  "apoio._normalizar": ({ args }) => apoio.normalizar(celula(args[0])),
};

/** Os leitores de PDF com que a chamada é repetida: as linhas que o pdfplumber leu e, para o PDF inventado, o porte do pdfplumber. */
function leitores(r: Registro): (razao.TextoDoPdf | undefined)[] {
  const out: (razao.TextoDoPdf | undefined)[] = [];
  if (r.linhas_pdf) {
    const texto = r.linhas_pdf.join("\n");
    out.push(async () => [texto]);
  }
  if (r.pdf_real) out.push(textoDasPaginas);
  return out.length ? out : [undefined];
}

async function executar(r: Registro, leitor: razao.TextoDoPdf | undefined): Promise<{ result?: unknown; error?: { tipo: string; mensagem: string } }> {
  try {
    return { result: py(await tabela[r.fn](r, leitor)) };
  } catch (e) {
    if (e === PULAR) throw e;
    const erro = e as Error;
    return { error: { tipo: erro.name, mensagem: erro.message } };
  }
}

const porFuncao = new Map<string, Registro[]>();
for (const r of registros) porFuncao.set(r.fn, [...(porFuncao.get(r.fn) ?? []), r]);

describe("gabarito dos leitores de Razão (Python original)", () => {
  it("cobre as funções gravadas", () => {
    expect([...porFuncao.keys()].filter((fn) => !tabela[fn])).toEqual([]);
    expect(registros.length).toBeGreaterThan(500);
  });

  for (const [fn, lista] of porFuncao) {
    it(`${fn} (${lista.length} chamadas)`, async () => {
      const diferencas: unknown[] = [];
      let conferidas = 0;
      for (const [i, r] of lista.entries()) {
        for (const leitor of leitores(r)) {
          let obtido;
          try {
            obtido = await executar(r, leitor);
          } catch (e) {
            if (e === PULAR) continue;
            throw e;
          }
          conferidas++;
          if (r.abre_pdf_falhou) {
            // A mensagem é a da biblioteca de PDF (pdfminer × pdf.js): confere só a recusa.
            if (obtido.error?.tipo !== "RazaoInvalido" || !obtido.error.mensagem.startsWith("Não foi possível abrir o PDF: ")) diferencas.push({ i, obtido });
            continue;
          }
          const alvo = r.error ? { error: r.error } : { result: esperado(r.result) };
          try {
            expect(obtido).toEqual(alvo);
          } catch {
            diferencas.push({ i, args: JSON.stringify(r.args).slice(0, 300), leitor: leitor === textoDasPaginas ? "pdf" : leitor ? "linhas" : "-", esperado: alvo, obtido });
          }
        }
      }
      // Só as poucas chamadas da suíte com `Decimal` como célula ficam de fora.
      expect(conferidas).toBeGreaterThanOrEqual(lista.length - 2);
      expect(diferencas.slice(0, 3)).toEqual([]);
    });
  }
});
