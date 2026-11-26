// Gabarito do texto das páginas do Razão de fornecedores (scripts/contabil-core/gabarito_concilpro.py): os runs, as
// linhas reconstruídas, a pontuação e a escolha da estratégia chamada a chamada (as da suíte do original e as
// inventadas), e o texto de cada página dos PDFs inventados nas três estratégias (`layout`, `palavras` e `chars`)
// contra o pdfplumber.

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { caracteresDoPdf } from "../pdf/caracteres";
import { arquivo, numero, registros, type Json, type Objeto } from "./gabarito/ler";
import {
  construirRuns,
  escolherEstrategia,
  extrairCandidatos,
  extrairPaginaPorChars,
  montarLinhasDeRuns,
  pontuarExtracao,
  textosDasPaginas,
  type CaractereDoRun,
  type Candidatos,
  type Run,
} from "./texto";

const caracteres = (j: Json): CaractereDoRun[] =>
  (j as Objeto[]).map((c) => ({ text: c.text as string, x0: numero(c.x0), x1: numero(c.x1), top: numero(c.top) }));
const runs = (j: Json): Run[] => (j as Objeto[]).map((r) => ({ texto: r.texto as string, x0: numero(r.x0), x1: numero(r.x1), top: numero(r.top) }));
const comoPy = (rs: Run[]) => rs.map((r) => ({ texto: r.texto, x0: r.x0, x1: r.x1, top: r.top }));

describe("runs e linhas (gabarito)", () => {
  it.each(registros("parser._construir_runs").map((r, k) => [k, r] as const))("_construir_runs #%s", (_k, r) => {
    expect(comoPy(construirRuns(caracteres(r.args[0])))).toEqual(comoPy(runs(r.result!)));
  });

  it.each(registros("parser._montar_linhas_de_runs").map((r, k) => [k, r] as const))("_montar_linhas_de_runs #%s", (_k, r) => {
    const largura = r.args.length > 1 ? numero(r.args[1]) : undefined;
    expect(montarLinhasDeRuns(runs(r.args[0]), largura)).toEqual(r.result);
  });

  it.each(registros("parser._extrair_pagina_por_chars").map((r, k) => [k, r] as const))("_extrair_pagina_por_chars #%s", (_k, r) => {
    expect(extrairPaginaPorChars(caracteres(r.args[0]))).toBe(r.result);
  });

  it.each(registros("parser._pontuar_extracao").map((r) => [JSON.stringify(r.args[0]).slice(0, 60), r] as const))("_pontuar_extracao(%s)", (_n, r) => {
    expect(pontuarExtracao(r.args[0] as string)).toEqual((r.result as { $tupla: number[] }).$tupla);
  });

  it.each(registros("parser._escolher_estrategia").map((r, k) => [k, r] as const))("_escolher_estrategia #%s", (_k, r) => {
    expect(escolherEstrategia(r.args[0] as Candidatos[])).toBe(r.result);
  });

  it("a suíte do original está no gabarito", () => {
    const daSuite = ["parser._construir_runs", "parser._montar_linhas_de_runs", "parser._pontuar_extracao", "parser._escolher_estrategia"].map(
      (fn) => registros(fn).filter((r) => r.suite).length,
    );
    expect(daSuite.every((n) => n > 0)).toBe(true);
  });
});

describe("texto das páginas dos PDFs inventados, como o pdfplumber", () => {
  it.each(registros("parser.pdf_candidatos").map((r, k) => [k, r] as const))("PDF #%s", async (_k, r) => {
    const esperado = r.result as { candidatos: Candidatos[]; estrategia: string; paginas: string[] };
    const paginas = await caracteresDoPdf(arquivo(r.args[0]));
    const candidatos = paginas.map(extrairCandidatos);
    expect(candidatos).toEqual(esperado.candidatos);
    expect(escolherEstrategia(candidatos)).toBe(esperado.estrategia);
    expect(textosDasPaginas(candidatos)).toEqual(esperado.paginas);
  });

  it("os PDFs exercitam as estratégias de layout e de caracteres", () => {
    const escolhidas = registros("parser.pdf_candidatos").map((r) => (r.result as { estrategia: string }).estrategia);
    expect(new Set(escolhidas)).toEqual(new Set(["layout", "chars"]));
  });
});
