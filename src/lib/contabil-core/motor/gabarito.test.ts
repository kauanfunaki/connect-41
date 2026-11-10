// Testes-gabarito dos motores do Contábil Core, Fase 1 (09/11/2026).
//
// `gabarito/nucleo.json` foi gerado por `scripts/contabil-core/gerar-gabarito.py`, que roda as funções
// do original (dev41tech/contabil-core, `e074176`) sobre entradas inventadas e grava cada chamada com a
// entrada e a saída exatas. Aqui cada chamada é repetida no porte. Se um gabarito falhar, o porte está
// errado, e não o gabarito.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { conferirFechamento } from "./conferencia";
import { casarPorNome, nucleoDoNome, nucleoUtilizavel } from "./contrapartePorNome";
import { dec, texto as decTexto, type Dec } from "./decimal";
import { hashDedup } from "./dedup";
import { documentosNoHistorico } from "./documentoNoHistorico";
import { COLUNAS_LANCAMENTOS_IMPORTACAO, celulaSegura, formatarValorBr, historicoParaDominio, linhasParaCsv, linhasParaTxt, type Linha } from "./dominio";
import { prefixoComumDePalavras } from "./fila";
import { lerData, lerOfx, montarHistorico, valorMonetario } from "./ofx";
import { desambiguarTiposPorDocumento, estrategiaDeMatch, gerarHistoricoSugerido, motivoParaNaoContabilizar, type Dc } from "./regras";
import { chaveAgrupamentoHistorico, normalizarHistoricoContabil, normalizarParaMatch, removerAcentos, tokensParaMatch } from "./texto";
import { historicoPareceLinhaCrua, motivoValorNaoConfiavel, reais, valoresNaLinha } from "./valorConfiavel";

type Chamada = { fn: string; args: unknown[]; kwargs: Record<string, unknown>; result?: unknown; error?: string };
const gabarito = JSON.parse(readFileSync(path.join(__dirname, "gabarito", "nucleo.json"), "utf8")) as { chamadas: Chamada[] };

/** Entrada do gabarito → valor do porte: `$dec` vira Dec, `$date` vira "AAAA-MM-DD". */
function entrada(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(entrada);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("$dec" in o) return dec(o.$dec as string);
    if ("$date" in o) return o.$date;
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, entrada(x)]));
  }
  return v;
}

/** Saída do porte → forma do gabarito. */
function saida(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(saida);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("coeficiente" in o && "expoente" in o) return { $dec: decTexto(o as unknown as Dec) };
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, saida(x)]));
  }
  return v;
}

const data = (d: unknown) => (d === null ? null : { $date: d });
const hex = (texto: string) => ({ $bytes: Buffer.from(texto, "utf8").toString("hex") });

const ofxComoPython = (r: ReturnType<typeof lerOfx>) => ({
  transacoes: r.transacoes.map((t) => ({
    fitid: t.fitid,
    data: data(t.data),
    valor: saida(t.valor),
    historico: t.historico,
    tipo_ofx: t.tipoOfx,
    saldo_apos: t.saldoApos === null ? null : saida(t.saldoApos),
    ordem: t.ordem,
  })),
  total_blocos: r.totalBlocos,
  erros: r.erros,
  saldo_declarado: r.saldoDeclarado === null ? null : saida(r.saldoDeclarado),
  data_saldo: data(r.dataSaldo),
});

const IMPLEMENTACOES: Record<string, (args: unknown[], kw: Record<string, unknown>) => unknown> = {
  normalizar_historico_contabil: ([t]) => normalizarHistoricoContabil(t as string),
  remover_acentos: ([t]) => removerAcentos(t as string),
  normalizar_para_match: ([t]) => normalizarParaMatch(t as string),
  tokens_para_match: ([t]) => tokensParaMatch(t as string),
  chave_agrupamento_historico: ([t, n]) => chaveAgrupamentoHistorico(t as string, n as number),
  documentos_no_historico: ([t]) => documentosNoHistorico(t as string | null),
  nucleo_do_nome: ([t]) => nucleoDoNome(t as string | null),
  nucleo_utilizavel: ([t]) => nucleoUtilizavel(t as string),
  casar_por_nome: ([h, pares]) => {
    const r = casarPorNome(h as string, (pares as [string, string][]).map(([contraparteId, nucleo]) => ({ contraparteId, nucleo })));
    return [r.achada && { contraparte_id: r.achada.contraparteId, nucleo: r.achada.nucleo }, r.motivo];
  },
  valores_na_linha: ([t]) => saida(valoresNaLinha(t as string)),
  historico_parece_linha_crua: ([t]) => historicoPareceLinhaCrua(t as string),
  motivo_valor_nao_confiavel: ([t, v]) => motivoValorNaoConfiavel(t as string, v as Dec),
  reais: ([v]) => reais(v as Dec),
  conferir_fechamento: (_, kw) =>
    conferirFechamento({
      saldoAnterior: (kw.saldo_anterior as Dec | null) ?? null,
      dataAnterior: (kw.data_anterior as string | null) ?? null,
      movimento: kw.movimento as Dec,
      saldoDeclarado: (kw.saldo_declarado as Dec | null) ?? null,
      dataDeclarada: (kw.data_declarada as string | null) ?? null,
    }),
  celula_segura: ([t]) => celulaSegura(t as string),
  historico_para_dominio: ([t, dc]) => historicoParaDominio(t as string, dc as string),
  formatar_valor_br: ([v]) => formatarValorBr(v as Dec),
  dicts_to_txt: ([linhas, colunas]) => hex(linhasParaTxt(linhas as Linha[], colunas as string[])),
  dicts_to_csv: ([linhas, colunas]) => hex(linhasParaCsv(linhas as Linha[], colunas as string[])),
  colunas_lancamentos_importacao: () => [...COLUNAS_LANCAMENTOS_IMPORTACAO],
  parse_data: ([d]) => data(lerData(d as string)),
  valor_monetario: ([v]) => saida(valorMonetario(v as string)),
  montar_historico: ([m, n]) => montarHistorico(m as string | null, n as string | null),
  calcular_hash: ([e, a, f]) => hashDedup(e as string, a as string, f as string),
  estrategia_de_match: ([r, t]) => estrategiaDeMatch(r as string, t as string),
  gerar_historico_sugerido: ([dc, razao, nf]) => gerarHistoricoSugerido(dc as Dc, razao as string, nf as string | null),
  motivo_para_nao_contabilizar: ([h, v]) => motivoParaNaoContabilizar({ historico: h as string, valor: v as Dec }),
  prefixo_comum_de_palavras: ([h]) => prefixoComumDePalavras(h as string[]),
  desambiguar_tipos: ([lista, dc]) =>
    desambiguarTiposPorDocumento(
      (lista as [string, string, string, string][]).map(([id, documento, tipo, origem]) => ({ id, documento, tipo, origem })),
      dc as string,
    ).map((c) => c.id),
};

function implementacao(fn: string) {
  if (fn.startsWith("parse_ofx:")) return ([conteudo]: unknown[]) => ofxComoPython(lerOfx(conteudo as string));
  const f = IMPLEMENTACOES[fn];
  if (!f) throw new Error(`sem implementação para ${fn}`);
  return f;
}

describe("gabarito do Contábil Core (Python original)", () => {
  const porFuncao = new Map<string, Chamada[]>();
  for (const c of gabarito.chamadas) {
    const grupo = c.fn.startsWith("parse_ofx:") ? c.fn : c.fn;
    porFuncao.set(grupo, [...(porFuncao.get(grupo) ?? []), c]);
  }

  test("o gabarito tem chamadas", () => {
    expect(gabarito.chamadas.length).toBeGreaterThan(800);
  });

  for (const [fn, chamadas] of porFuncao) {
    test(`${fn} (${chamadas.length})`, () => {
      const f = implementacao(fn);
      for (const c of chamadas) {
        const args = entrada(c.args) as unknown[];
        const kw = entrada(c.kwargs) as Record<string, unknown>;
        const rotulo = `${fn}(${JSON.stringify(c.args)})`;
        if (c.error) {
          expect(() => f(args, kw), rotulo).toThrow();
          continue;
        }
        expect(saida(f(args, kw)), rotulo).toEqual(c.result);
      }
    });
  }
});
