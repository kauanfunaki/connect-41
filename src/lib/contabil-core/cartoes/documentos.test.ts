// Gabarito do documento revisável da fatura (scripts/contabil-core/gabarito_cartoes.py): `_dinheiro` e
// `validar_itens` chamada a chamada, o `_vision` com a resposta simulada e a leitura inteira
// (`ler_documento`: composição, texto e imagem) em cenários com a IA simulada — os da suíte do original e os
// inventados. As divergências deliberadas são contadas uma a uma.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai", () => ({ gerarTexto: vi.fn(), isAiConfigured: vi.fn() }));

import type { DependenciasDaIa } from "../ia/leituraPorIa";
import { jsonPython } from "../notas/visual";
import { texto as textoDec } from "../motor/decimal";
import { arquivo, codificado, registros, type Json, type Registro } from "./gabarito/ler";
import { caracteresDoPdf } from "../pdf/caracteres";
import { extrairTabelas } from "../pdf/tabelas";
import {
  dinheiro,
  FALHA_DA_LEITURA,
  FalhaDaLeitura,
  IMAGEM_DESLIGADA,
  IMAGEM_SEM_PROVEDOR,
  lerDocumentoFatura,
  mensagemDaFalha,
  RecusaDoDocumento,
  sistemaDaImagem,
  transcreverPagina,
  validarItens,
  VALOR_ILEGIVEL,
  type ItemParaValidar,
} from "./documentos";

const divergencias = { pdfSemPaginas: 0 };

/** O que a pessoa vê: a frase da recusa (`ValidationError`) ou a genérica de `processar_documento`. */
function visto(e: unknown): { erro: string; generico: boolean } {
  if (e instanceof RecusaDoDocumento) return { erro: e.message, generico: false };
  if (e instanceof FalhaDaLeitura) return { erro: mensagemDaFalha(e), generico: true };
  throw e;
}

/** A frase do original → a do porte: a IA desligada diz o que ligar no Connect. */
function fraseDoPorte(r: Registro, c?: { openai_enabled: boolean; allow: boolean }): { erro: string; generico: boolean } {
  const e = r.error!;
  if (e.tipo !== "ValidationError") return { erro: FALHA_DA_LEITURA, generico: true };
  if (e.mensagem.startsWith("Leitura por imagem não autorizada")) return { erro: !c!.allow ? IMAGEM_DESLIGADA : IMAGEM_SEM_PROVEDOR, generico: false };
  return { erro: e.mensagem, generico: false };
}

describe("dinheiro e itens da revisão (gabarito)", () => {
  it.each(registros("documentos._dinheiro").map((r) => [JSON.stringify(r.args[0]), r] as const))("_dinheiro(%s)", (_n, r) => {
    let obtido: string;
    try {
      obtido = textoDec(dinheiro(r.args[0] as string));
    } catch (e) {
      obtido = visto(e).erro;
    }
    expect(obtido).toBe(r.error ? VALOR_ILEGIVEL : (r.result as { $dec: string }).$dec);
  });

  it.each(registros("documentos._dinheiro_json").map((r) => [r.args[0] as string, r] as const))("_dinheiro(json.loads(%s))", (_n, r) => {
    let obtido: string;
    try {
      obtido = textoDec(dinheiro(jsonPython(r.args[0] as string)));
    } catch (e) {
      obtido = visto(e).erro;
    }
    expect(obtido).toBe(r.error ? VALOR_ILEGIVEL : (r.result as { $dec: string }).$dec);
  });

  it.each(registros("documentos.validar_itens").map((r, k) => [k, r] as const))("validar_itens #%s", (_k, r) => {
    let obtido: unknown;
    try {
      obtido = validarItens(r.args[0] as ItemParaValidar[], r.args[1] as string);
    } catch (e) {
      obtido = visto(e);
    }
    expect(obtido).toEqual(r.error ? fraseDoPorte(r) : r.result);
  });
});

type Resposta = { content: string | null; finish_reason: string };
type Chamada = { tipo: string; sistema: string; max_completion_tokens?: number; texto?: string };

/** A fundação simulada: a resposta da fila; a cortada (`finish_reason` que não é "stop") é a `RespostaIncompletaDaIa`. */
function iaSimulada(respostas: Resposta[], c: { openai_enabled: boolean; falha: boolean }, feitas: (Chamada & { maxTokens: number; mime: string; exigirFim: boolean })[]): DependenciasDaIa {
  const fila = [...respostas];
  return {
    isAiConfigured: async () => c.openai_enabled,
    gerarTexto: async (p) => {
      feitas.push({ tipo: "visao", sistema: p.sistema, maxTokens: p.maxTokens, mime: p.anexos![0].mime, exigirFim: (p as { exigirFim?: boolean }).exigirFim === true });
      if (c.falha) throw new Error("falha simulada do provedor");
      const r = fila.length > 1 ? fila.shift()! : (fila[0] ?? { content: "", finish_reason: "stop" });
      if (r.finish_reason !== "stop") throw Object.assign(new Error("A resposta da IA veio incompleta."), { name: "RespostaIncompletaDaIa" });
      return r.content ?? "";
    },
  };
}

describe("as tabelas da página (`page.extract_tables()` do pdfplumber, gabarito)", () => {
  it.each(registros("plumber.extract_tables").map((r, k) => [k, r] as const))("extract_tables #%s", async (_k, r) => {
    const paginas = await caracteresDoPdf(arquivo(r.args[0]));
    expect(paginas.map((p) => extrairTabelas(p))).toEqual(r.result);
  });

  it("o gabarito traz a grade quebrada e a composição lida por ela", () => {
    const quebrada = registros("documentos.cenario").find((c) => c.nome === "doc-composicao-grade-quebrada")!;
    expect((quebrada.result as { itens: { descricao: string }[] }).itens[0].descricao).toBe("UBER TRIP CENTRO 1/1");
  });
});

describe("a página à IA de imagem (`_vision`, gabarito)", () => {
  it.each(registros("documentos._vision").map((r) => [r.nome!, r] as const))("%s", async (_n, r) => {
    const [competencia, resposta, falha] = r.args as [string, Resposta, boolean];
    const feitas: (Chamada & { maxTokens: number; mime: string; exigirFim: boolean })[] = [];
    const ia = iaSimulada([resposta], { openai_enabled: true, falha }, feitas);
    let obtido: unknown;
    try {
      const t = await transcreverPagina(new Uint8Array([37, 80, 68, 70]), competencia, 1000, { tenantId: "t", documentosFinanceirosLiberados: true }, ia);
      obtido = codificado(t, true);
    } catch (e) {
      obtido = visto(e);
    }
    expect(obtido).toEqual(r.error ? fraseDoPorte(r) : r.result);
    expect(feitas).toHaveLength(1);
    expect(feitas[0]).toMatchObject({ sistema: (r.chamadas_ia![0] as Chamada).sistema, maxTokens: 12_000, mime: "application/pdf", exigirFim: true });
  });
});

type Config = {
  openai_enabled: boolean;
  allow: boolean;
  max_pages: number;
  max_ai_calls: number;
  parse_timeout: number;
  vision_timeout: number;
  call_timeout: number;
  respostas: Resposta[];
  falha: boolean;
};

describe("leitura inteira do documento da fatura, com a IA simulada (cenários do gabarito)", () => {
  const cenarios = registros("documentos.cenario");

  it("o gabarito traz os cenários da suíte do original e os de cada ramo", () => {
    expect(cenarios.filter((c) => c.nome!.startsWith("suite-")).length).toBe(4);
    expect(cenarios.map((c) => c.nome)).toEqual(expect.arrayContaining(["doc-composicao", "doc-texto", "doc-imagem-chave-liberada", "doc-imagem-incompleta"]));
  });

  it.each(cenarios.map((c) => [c.nome!, c] as const))("%s", async (_nome, r) => {
    const c = r.args[2] as unknown as Config;
    const feitas: (Chamada & { maxTokens: number; mime: string; exigirFim: boolean })[] = [];
    const ia = iaSimulada(c.respostas, c, feitas);
    let obtido: unknown;
    try {
      obtido = await lerDocumentoFatura(arquivo(r.args[0]), r.args[1] as string, { tenantId: "t", documentosFinanceirosLiberados: c.allow }, {
        ia,
        limites: { maxPaginas: c.max_pages, maxChamadas: c.max_ai_calls, segundosDoTexto: c.parse_timeout, segundosDaImagem: c.vision_timeout, segundosPorChamada: c.call_timeout },
      });
    } catch (e) {
      obtido = visto(e);
    }
    const esperado = r.error ? fraseDoPorte(r, c) : (r.result as Json);
    if (r.nome === "doc-pdf-quebrado") {
      // O PyMuPDF "conserta" o PDF sem páginas e recusa pela quantidade de páginas; o pdf.js não o abre, e a
      // leitura cai na falha genérica. As duas são recusa, com frases diferentes.
      divergencias.pdfSemPaginas++;
      expect(esperado).toEqual({ erro: "Quantidade de páginas acima do limite permitido.", generico: false });
      expect(obtido).toEqual({ erro: FALHA_DA_LEITURA, generico: true });
    } else expect(obtido).toEqual(esperado);

    const doOriginal = (r.chamadas_ia ?? []) as unknown as Chamada[];
    expect(feitas.length).toBe(doOriginal.length);
    for (const [k, f] of feitas.entries()) {
      expect(f.sistema).toBe(doOriginal[k].sistema);
      expect(f.sistema).toBe(sistemaDaImagem(r.args[1] as string));
      expect(f).toMatchObject({ maxTokens: doOriginal[k].max_completion_tokens, mime: "application/pdf", exigirFim: true });
    }
  });

  afterAll(() => {
    // Cada divergência deliberada, contada: o PDF sem páginas que só o PyMuPDF abre.
    expect(divergencias).toEqual({ pdfSemPaginas: 1 });
  });
});
