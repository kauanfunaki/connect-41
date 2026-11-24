// Gabarito do leitor de fatura de cartão (scripts/contabil-core/gabarito_cartoes.py): as funções puras do
// original (`_parse_valor`, `_parse_data`, `_referencia_fatura`, `_parse_por_regex`,
// `_validar_total_declarado`, `_parse_ai_response`, `_lancamento_from_ai`) chamada a chamada, o texto do PDF
// (`_extrair_linhas`) e a leitura inteira (`parse_pdf`) em cenários com a IA simulada: as mesmas chamadas à
// IA (o texto enviado e o sistema) e o mesmo resultado. As divergências deliberadas são contadas uma a uma.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai", () => ({ gerarTexto: vi.fn(), isAiConfigured: vi.fn() }));

import type { DependenciasDaIa } from "../ia/leituraPorIa";
import { jsonPython } from "../notas/visual";
import { arquivo, codificado, lancamentoEsperado, registros, relogio, type Json, type Registro } from "./gabarito/ler";
import {
  analisarResposta,
  ForaDoFormato,
  lancamentoDaIa,
  LeituraRecusada,
  lerData,
  lerFaturaDoTexto,
  lerFaturaPdf,
  lerPorRegex,
  lerValor,
  linhasDoPdf,
  orcamentoDaFatura,
  PROMPT,
  referenciaDaFatura,
  RESPOSTA_FORA_DO_FORMATO,
  SISTEMA,
  validarTotalDeclarado,
} from "./leitor";

const divergencias = { foraDoFormato: 0 };
/** As exceções cruas do original que aqui são `ForaDoFormato` (erro 500 lá). */
const CRUAS = ["AttributeError", "OverflowError", "InvalidOperation"];

const ref = (j: Json) => (j === null ? null : (j as [number, number]));
const dec = (r: Json | undefined) => (r === null || r === undefined ? null : (r as { $dec: string }).$dec);

describe("funções puras do leitor de fatura (gabarito)", () => {
  it.each(registros("leitor._parse_valor").map((r) => [JSON.stringify(r.args[0]), r] as const))("_parse_valor(%s)", (_n, r) => {
    expect(lerValor(r.args[0] as string)).toBe(dec(r.result));
  });

  it.each(registros("leitor._parse_data").map((r) => [JSON.stringify(r.args), r] as const))("_parse_data(%s)", (_n, r) => {
    const esperado = r.result === null ? null : (r.result as { $dt: string }).$dt.slice(0, 10);
    expect(lerData(r.args[0] as string, ref(r.args[1] ?? null), relogio)).toBe(esperado);
  });

  it.each(registros("leitor._referencia_fatura").map((r, k) => [k, r] as const))("_referencia_fatura #%s", (_k, r) => {
    expect(referenciaDaFatura(r.args[0] as string[])).toEqual(r.result);
  });

  it.each(registros("leitor._parse_por_regex").map((r, k) => [k, r] as const))("_parse_por_regex #%s", (_k, r) => {
    expect(lerPorRegex(r.args[0] as string[], ref(r.args[1] ?? null), relogio)).toEqual((r.result as Json[]).map(lancamentoEsperado));
  });

  it.each(registros("leitor._validar_total_declarado").map((r, k) => [k, r] as const))("_validar_total_declarado #%s", (_k, r) => {
    const lancamentos = (r.args[1] as Json[]).map(lancamentoEsperado);
    let obtido: { ok: true } | { erro: string; cru?: string };
    try {
      validarTotalDeclarado(r.args[0] as string[], lancamentos);
      obtido = { ok: true };
    } catch (e) {
      if (e instanceof ForaDoFormato) obtido = { erro: e.message, cru: e.tipoNoOriginal };
      else if (e instanceof LeituraRecusada) obtido = { erro: e.message };
      else throw e;
    }
    if (!r.error) expect(obtido).toEqual({ ok: true });
    else if (r.error.tipo === "PDFParseError") expect(obtido).toEqual({ erro: r.error.mensagem });
    else expect(obtido).toEqual({ erro: RESPOSTA_FORA_DO_FORMATO, cru: r.error.tipo });
  });

  it.each(registros("leitor._parse_ai_response").map((r) => [JSON.stringify(r.args[0]), r] as const))("_parse_ai_response(%s)", (_n, r) => {
    expect(analisarResposta(r.args[0] as string).map((v) => codificado(v))).toEqual(r.result);
  });

  it.each(registros("leitor._lancamento_from_ai").map((r) => [r.args[0] as string, r] as const))("_lancamento_from_ai(%s)", (_n, r) => {
    const item = jsonPython(r.args[0] as string);
    if (r.error) {
      expect(CRUAS).toContain(r.error.tipo);
      let cru: string | null = null;
      try {
        lancamentoDaIa(item, relogio);
      } catch (e) {
        if (!(e instanceof ForaDoFormato)) throw e;
        cru = e.tipoNoOriginal;
      }
      expect(cru).toBe(r.error.tipo);
    } else expect(lancamentoDaIa(item, relogio)).toEqual(r.result === null ? null : lancamentoEsperado(r.result!));
  });

  it.each(registros("leitor._extrair_linhas").map((r, k) => [k, r] as const))("_extrair_linhas #%s (o texto do pdfplumber)", async (_k, r) => {
    const [linhas, total] = r.result as [string[], number];
    expect(await linhasDoPdf(arquivo(r.args[0]), orcamentoDaFatura())).toEqual({ linhas, total });
  });
});

type Chamada = { tipo: string; modelo: string; texto?: string; sistema: string; max_tokens?: number };
type Config = {
  openai_enabled: boolean;
  allow: boolean;
  max_pages: number;
  max_ai_calls: number;
  respostas: { content: string; finish_reason: string }[];
  falha: boolean;
  linhas: string[] | null;
  total: number | null;
};

async function rodar(r: Registro) {
  const c = r.args[2] as unknown as Config;
  const fila = [...c.respostas];
  const feitas: (Chamada & { maxTokens: number })[] = [];
  const ia: DependenciasDaIa = {
    isAiConfigured: async () => c.openai_enabled,
    gerarTexto: async (p) => {
      feitas.push({ tipo: "texto", modelo: p.agentCode, texto: p.texto, sistema: p.sistema, maxTokens: p.maxTokens });
      if (c.falha) throw new Error("falha simulada do provedor");
      const resposta = fila.length > 1 ? fila.shift()! : (fila[0] ?? { content: "" });
      return resposta.content ?? "";
    },
  };
  const quem = { tenantId: "escritorio-teste", documentosFinanceirosLiberados: c.allow };
  const orcamento = orcamentoDaFatura({ maxPaginas: c.max_pages, maxChamadas: c.max_ai_calls });
  let obtido: { result?: unknown; mensagem?: string };
  try {
    const lido =
      c.linhas !== null
        ? await lerFaturaDoTexto({ linhas: c.linhas, total: c.total! }, quem, orcamento, { ia, agora: relogio })
        : await lerFaturaPdf(arquivo(r.args[0]), quem, { ia, orcamento, agora: relogio });
    obtido = { result: lido };
  } catch (e) {
    if (!(e instanceof LeituraRecusada)) throw e;
    obtido = { mensagem: e.message };
  }
  return { obtido, feitas };
}

describe("leitura inteira da fatura em PDF, com a IA simulada (cenários do gabarito)", () => {
  const cenarios = registros("leitor.cenario");

  it("o gabarito traz os cenários de cada ramo", () => {
    expect(cenarios.map((c) => c.nome)).toEqual(
      expect.arrayContaining(["pdf-generica", "pdf-sem-layout-chave-liberada", "pdf-sem-layout-sem-chamadas", "pdf-em-branco", "texto-longo"]),
    );
  });

  it.each(cenarios.map((c) => [c.nome!, c] as const))("%s", async (_nome, r) => {
    const { obtido, feitas } = await rodar(r);
    if (r.error) {
      if (CRUAS.includes(r.error.tipo)) {
        // A resposta da IA fora do formato derrubava o original (erro 500); aqui é recusa com frase.
        divergencias.foraDoFormato++;
        expect(obtido).toEqual({ mensagem: RESPOSTA_FORA_DO_FORMATO });
      } else {
        expect(r.error.tipo).toBe("PDFParseError");
        expect(obtido).toEqual({ mensagem: r.error.mensagem });
      }
    } else expect(obtido).toEqual({ result: (r.result as Json[]).map(lancamentoEsperado) });

    const doOriginal = r.chamadas_ia as unknown as Chamada[];
    expect(feitas.length).toBe(doOriginal.length);
    for (const [k, f] of feitas.entries()) {
      expect(f.modelo).toBe("leitor_de_fatura_texto");
      expect(f.texto).toBe(doOriginal[k].texto);
      expect(f.sistema).toBe(doOriginal[k].sistema);
      expect(f.maxTokens).toBe(doOriginal[k].max_tokens);
    }
  });

  it("o prompt e o sistema são os do original", () => {
    const texto = cenarios.flatMap((c) => c.chamadas_ia as unknown as Chamada[]).find((f) => f.tipo === "texto");
    expect(texto!.texto!.endsWith(`\n\n${PROMPT}`)).toBe(true);
    expect(SISTEMA).toBe(texto!.sistema);
  });

  afterAll(() => {
    // Cada divergência deliberada, contada: o item que não é objeto, a parcela infinita e o NaN com total.
    expect(divergencias).toEqual({ foraDoFormato: 3 });
  });
});
