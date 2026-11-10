// Teste-gabarito dos leitores de extrato (Fase 4): repete as chamadas gravadas da suíte Python do
// Contábil Core original (`scripts/contabil-core/gabarito_extrato.py`) e exige a mesma saída.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dec, texto as textoDec, type Dec } from "../motor/decimal";
import * as comum from "./comum";
import * as leitura from "./leitura";
import * as periodo from "./periodo";
import type { Bloco, Transacao } from "./comum";
import type { Leitor } from "./leitores/tipos";

type Registro = { fn: string; args: unknown[]; kwargs: Record<string, unknown>; result?: unknown; error?: { tipo: string; mensagem: string } };
const registros: Registro[] = JSON.parse(readFileSync(join(__dirname, "gabarito", "extrato.json"), "utf8"));

// ─── Decodificar a entrada do Python ───────────────────────────────────────

function decodificar(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(decodificar);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("$dec" in o) return dec(o.$dec as string);
    if ("$date" in o) return o.$date;
    if ("$f" in o) return Number(o.$f);
    if ("$set" in o) return new Set((o.$set as unknown[]).map(decodificar));
    if ("fitid" in o && "tipo_ofx" in o) {
      return {
        fitid: o.fitid, data: decodificar(o.data), valor: decodificar(o.valor), historico: o.historico,
        tipoOfx: o.tipo_ofx, saldoApos: decodificar(o.saldo_apos) ?? null, ordem: o.ordem ?? null,
      } as Transacao;
    }
    if ("transacoes" in o && "saldo_anterior" in o) {
      return { transacoes: decodificar(o.transacoes), saldoAnterior: decodificar(o.saldo_anterior) ?? null, saldoFinal: decodificar(o.saldo_final) ?? null } as Bloco;
    }
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, decodificar(x)]));
  }
  return v;
}

// ─── Codificar a saída do TypeScript no formato do Python ───────────────────

const ehDec = (v: unknown): v is Dec => !!v && typeof v === "object" && "coeficiente" in v && "expoente" in v;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function codificar(v: unknown, chave?: string): unknown {
  if (v === undefined) return null;
  if (ehDec(v)) return { $dec: textoDec(v) };
  if (typeof v === "string" && chave === "data" && ISO.test(v)) return { $date: v };
  if (Array.isArray(v)) return v.map((x) => codificar(x));
  if (v instanceof Set) return { $set: [...v].map((x) => codificar(x)).sort() };
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("fitid" in o && "tipoOfx" in o) {
      return {
        fitid: o.fitid, data: { $date: o.data }, valor: codificar(o.valor), historico: o.historico,
        tipo_ofx: o.tipoOfx, saldo_apos: codificar(o.saldoApos), ordem: o.ordem ?? null,
      };
    }
    if ("transacoes" in o && "saldoAnterior" in o) {
      return { transacoes: codificar(o.transacoes), saldo_anterior: codificar(o.saldoAnterior), saldo_final: codificar(o.saldoFinal) };
    }
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, codificar(x, k)]));
  }
  return v;
}

// O resultado do Python pode trazer `{"$date": ...}` fora de uma transação (ex.: `parse_data`).
function codificarResultado(fn: string, v: unknown): unknown {
  if (typeof v === "string" && ISO.test(v) && /parse_data|fim_do_periodo/.test(fn)) return { $date: v };
  return codificar(v);
}

// ─── As funções do TypeScript, pelo nome do Python ─────────────────────────

const leitores = new Map<string, Leitor | null>();
async function leitor(nome: string): Promise<Leitor | null> {
  if (!leitores.has(nome)) {
    const arquivo = join(__dirname, "leitores", `${nome}.ts`);
    leitores.set(nome, existsSync(arquivo) ? ((await import(`./leitores/${nome}.ts`)) as Record<string, Leitor>)[nome] : null);
  }
  return leitores.get(nome)!;
}

const ANO_ATUAL = new Date().getUTCFullYear();
type Fn = (args: unknown[], kw: Record<string, unknown>) => unknown | Promise<unknown>;
const tabela: Record<string, Fn> = {
  "_comum.parse_data": ([s, ano]) => comum.parseData(s as string, (ano as number | null) ?? null, ANO_ATUAL),
  "_comum.parse_data_extenso": ([s]) => comum.parseDataExtenso(s as string),
  "_comum.parse_valor": ([s]) => comum.parseValor(s as string),
  "_comum.gerar_fitid": ([d, h, v, i]) => comum.gerarFitid(d as string, h as string, v as Dec, i as number),
  "_comum.agrupar_linhas": ([p, a], kw) => comum.agruparLinhas(p as comum.Palavra[], (a ?? kw.altura) as number | undefined),
  "_comum.colar_fragmentos": ([t, a, f, d], kw) => comum.colarFragmentos(t as Transacao[], a as [number, number][], f as [number, string][], (d ?? kw.distancia_maxima) as number | undefined),
  "_comum.ordenar_do_mais_antigo": ([t]) => comum.ordenarDoMaisAntigo(t as Transacao[]),
  "_comum.borda_direita": ([t, p, c, e], kw) => comum.bordaDireita(t as string[], p as comum.Palavra[], c as string, (e ?? kw.excluindo ?? []) as string[]),
  "periodo.fim_do_periodo": ([l]) => periodo.fimDoPeriodo(l as string[]),
  "periodo.ajustar_virada_de_ano": ([t, f]) => periodo.ajustarViradaDeAno(t as Transacao[], f as string | null),
  "pdf_parser._parse_linhas_multipagina": ([l, a]) => leitura.parseLinhasMultipagina(l as string[], a as number, ANO_ATUAL),
  "pdf_parser._fracao_legivel": ([l]) => leitura.fracaoLegivel(l as string[]),
  "pdf_parser._documento_de_outro_tipo": ([l]) => leitura.documentoDeOutroTipo(l as string[]),
  "pdf_parser._recusa_de_adaptador_vazio": async ([m, l]) => {
    const nome = (m as { $mod: string }).$mod;
    const x = await leitor(nome);
    if (!x) return PULAR;
    return leitura.recusaDeAdaptadorVazio(nome, x.reconhece(l as string[]));
  },
  "pdf_parser._validar_blocos": ([b, t]) => leitura.validarBlocos(b as Bloco[], t as Dec),
  "pdf_parser._validar_cadeia_de_saldos": ([t, tol]) => leitura.validarCadeiaDeSaldos(t as Transacao[], tol as Dec),
  "pdf_parser._validar_completude": ([l, t]) => leitura.validarCompletude(l as string[], t as Transacao[]),
  "pdf_parser._valor_declarado": ([l]) => leitura.valorDeclarado(l as string),
  "pdf_parser._fmt_reais": ([v]) => leitura.fmtReais(v as Dec),
};

const PULAR = Symbol("pular");

async function chamar(fn: string, args: unknown[], kw: Record<string, unknown>): Promise<unknown> {
  if (tabela[fn]) return tabela[fn](args, kw);
  const [modulo, metodo] = fn.split(".");
  if (modulo === "bancos") {
    if (!existsSync(join(__dirname, "leitores", "index.ts"))) return PULAR;
    const { escolher, porConteudo, porSigla } = await import("./leitores");
    const r = metodo === "escolher" ? escolher(args[0] as string | null, args[1] as string[]) : metodo === "por_sigla" ? porSigla(args[0] as string | null) : porConteudo(args[0] as string[]);
    return r ? { $mod: r.nome } : null;
  }
  const x = await leitor(modulo);
  if (!x) return PULAR;
  if (metodo === "reconhece") return x.reconhece(args[0] as string[]);
  if (metodo === "extrair") return x.extrair!(args[0] as string[], (args[1] ?? kw.referencia_ano) as number);
  if (metodo === "extrair_de_palavras") return x.extrairDePalavras!(args[0] as comum.Palavra[][], (args[1] ?? kw.referencia_ano) as number);
  if (metodo === "consolidar_blocos") return x.consolidarBlocos!(args[0] as Bloco[]);
  throw new Error(`função sem porte: ${fn}`);
}

// O float do Python vem como {"$f": repr}; o número do JavaScript é o mesmo double.
function semFloat(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(semFloat);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("$f" in o && Object.keys(o).length === 1) return Number(o.$f);
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, semFloat(x)]));
  }
  return v;
}

const ERRO_DO_PYTHON: Record<string, string> = { ErroDeLeitura: "PDFParseError" };

describe("gabarito dos leitores de extrato (Python original)", () => {
  const porFn = new Map<string, Registro[]>();
  for (const r of registros) porFn.set(r.fn, [...(porFn.get(r.fn) ?? []), r]);
  for (const [fn, lista] of porFn) {
    it(`${fn} (${lista.length})`, async () => {
      let comparados = 0;
      for (const r of lista) {
        const args = decodificar(r.args) as unknown[];
        const kw = decodificar(r.kwargs) as Record<string, unknown>;
        let obtido: unknown;
        let erro: { tipo: string; mensagem: string } | undefined;
        try {
          obtido = await chamar(fn, args, kw);
        } catch (e) {
          const err = e as Error;
          erro = { tipo: ERRO_DO_PYTHON[err.name] ?? err.name, mensagem: err.message };
        }
        if (obtido === PULAR) return; // leitor ainda não portado
        comparados++;
        if (r.error) expect(erro, `${fn} ${JSON.stringify(r.args).slice(0, 200)}`).toEqual(r.error);
        else {
          expect(erro, `${fn} lançou: ${erro?.mensagem}`).toBeUndefined();
          expect(codificarResultado(fn, obtido), `${fn} ${JSON.stringify(r.args).slice(0, 200)}`).toEqual(semFloat(r.result));
        }
      }
      expect(comparados).toBe(lista.length);
    });
  }
});
