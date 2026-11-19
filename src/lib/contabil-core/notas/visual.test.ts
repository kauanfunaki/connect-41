// Gabarito do leitor visual de notas (scripts/contabil-core/gabarito_notas.py): as funções puras do
// original (`_parse_ai_response`, `_nota_from_item`, `_cnpj_valido_formatado`, `_parse_data_str`)
// chamada a chamada, e a leitura inteira (`parse_pdf`/`parse_imagem`) em cenários com a IA simulada —
// as mesmas respostas, as mesmas chamadas (texto ou imagem, o texto enviado), o mesmo resultado.

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai", () => ({ gerarTexto: vi.fn(), isAiConfigured: vi.fn() }));

import { decimal, NAO_FINITO, type Dec } from "../motor/decimal";
import { LEITURA_DESLIGADA, type DependenciasDaIa } from "../ia/leituraPorIa";
import { arquivo, notaEsperada, notaObtida, registros, type Json } from "./gabarito/ler";
import {
  AGENTE_TEXTO,
  analisarRespostaIa,
  cnpjValidoFormatado,
  itemParaNota,
  lerDataBr,
  lerNotaImagem,
  lerNotaPdf,
  PROMPT,
  SISTEMA,
  type ItemPy,
  type ValorPy,
} from "./visual";
import { NotaInvalida } from "./xml";

/** O valor do Python gravado no gabarito → `ValorPy`. */
function py(j: Json): ValorPy {
  if (j === null || typeof j === "boolean" || typeof j === "string") return j;
  if (typeof j === "number") return { py: "int", texto: String(j) };
  if (Array.isArray(j)) return j.map(py);
  if ("$dec" in j) return { py: "dec", valor: decimal(j.$dec as string) as Dec | typeof NAO_FINITO, texto: j.$dec as string };
  if ("$int" in j) return { py: "int", texto: j.$int as string };
  if ("$f" in j) return { py: "float", texto: j.$f as "nan" | "inf" | "-inf" };
  if ("$dict" in j) return new Map((j.$dict as [string, Json][]).map(([k, v]) => [k, py(v)]));
  throw new Error(`valor sem conversão: ${JSON.stringify(j)}`);
}

/** `ValorPy` → o formato do gabarito. */
function codificar(v: ValorPy): Json {
  if (v === null || typeof v === "boolean" || typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(codificar);
  if (v instanceof Map) return { $dict: [...v].map(([k, x]) => [k, codificar(x)]) };
  if (v.py === "int") return Math.abs(Number(v.texto)) > 2 ** 53 ? { $int: v.texto } : Number(v.texto);
  if (v.py === "dec") return { $dec: v.texto };
  return { $f: v.texto };
}

function resultadoDaNota(fn: () => ReturnType<typeof itemParaNota>) {
  try {
    return { result: notaObtida(fn()) };
  } catch (e) {
    if (e instanceof NotaInvalida) return { mensagem: e.message };
    throw e;
  }
}

describe("funções puras do leitor visual (gabarito)", () => {
  it.each(registros("visual._parse_ai_response").map((r) => [JSON.stringify(r.args[0]).slice(0, 50), r] as const))(
    "_parse_ai_response(%s)",
    (_n, r) => {
      expect(codificar(analisarRespostaIa(r.args[0] as string))).toEqual(r.result);
    },
  );

  it.each(registros("visual._nota_from_item").map((r, k) => [k, r] as const))("_nota_from_item #%s", (_k, r) => {
    const obtido = resultadoDaNota(() => itemParaNota(py(r.args[0]) as ItemPy));
    if (r.error) expect(obtido).toEqual({ mensagem: r.error.mensagem });
    else expect(obtido).toEqual({ result: notaEsperada(r.result!) });
  });

  it.each(registros("visual._cnpj_valido_formatado").map((r) => [JSON.stringify(r.args[0]), r] as const))("_cnpj_valido_formatado(%s)", (_n, r) => {
    expect(cnpjValidoFormatado(py(r.args[0]))).toBe(r.result);
  });

  it.each(registros("visual._parse_data_str").map((r) => [JSON.stringify(r.args[0]), r] as const))("_parse_data_str(%s)", (_n, r) => {
    expect(lerDataBr(py(r.args[0]))).toBe(r.result === null ? null : (r.result as { $dt: string }).$dt);
  });
});

type Chamada = { tipo: string; modelo: string; texto?: string; sistema: string; mime?: string; prompt?: string };

describe("leitura visual inteira, com a IA simulada (cenários do gabarito)", () => {
  const cenarios = registros("visual.cenario");

  it("o gabarito traz os cenários da suíte do original e os daqui", () => {
    expect(cenarios.map((c) => c.nome)).toEqual(expect.arrayContaining(["imagem-visao", "imagem-desligada", "pdf-texto", "pdf-em-branco", "pdf-texto-incompleto", "pdf-desligado", "pdf-chamadas-esgotadas"]));
  });

  it.each(cenarios.map((c) => [c.nome!, c] as const))("%s", async (_nome, c) => {
    const config = Object.fromEntries((c.args[1] as { $dict: [string, Json][] }).$dict) as Record<string, Json>;
    const respostas = Object.fromEntries((config.respostas as { $dict: [string, Json][] }).$dict) as Record<string, string[]>;
    const filas = Object.fromEntries(Object.entries(respostas).map(([k, v]) => [k, [...v]]));
    const feitas: Chamada[] = [];
    const ia: DependenciasDaIa = {
      isAiConfigured: async () => true,
      gerarTexto: async (p) => {
        const texto = p.agentCode === AGENTE_TEXTO;
        const modelo = texto ? "gpt-4o-mini" : "gpt-4o";
        feitas.push(texto ? { tipo: "texto", modelo, texto: p.texto, sistema: p.sistema } : { tipo: "visao", modelo, mime: p.anexos![0].mime, prompt: p.texto, sistema: p.sistema });
        if (texto && config.falha_texto) throw new Error("falha simulada do provedor");
        const fila = filas[modelo] ?? [""];
        return fila.length > 1 ? fila.shift()! : (fila[0] ?? "");
      },
    };
    const quem = { tenantId: "escritorio-teste", documentosFinanceirosLiberados: config.ia_ligada as boolean };
    const conteudo = arquivo(c.args[0]);
    let obtido: { result?: unknown; mensagem?: string };
    try {
      const nota = config.tipo === "pdf" ? await lerNotaPdf(conteudo, quem, { ia }) : await lerNotaImagem(conteudo, config.mime as string, quem, { ia });
      obtido = { result: notaObtida(nota) };
    } catch (e) {
      if (!(e instanceof NotaInvalida)) throw e;
      obtido = { mensagem: e.message };
    }

    if (c.error) {
      // A frase da chave desligada foi adaptada: diz o que ligar no Connect. O PDF que o PyMuPDF não
      // abre derrubava o original (FileDataError); aqui é a frase do PDF de que nada sai.
      const esperada = c.error.mensagem.startsWith("OCR externo desabilitado")
        ? LEITURA_DESLIGADA
        : ["FileDataError", "EmptyFileError"].includes(c.error.tipo)
          ? "Não foi possível extrair os dados da nota fiscal deste PDF."
          : c.error.mensagem;
      expect(obtido).toEqual({ mensagem: esperada });
    } else expect(obtido).toEqual({ result: notaEsperada(c.result!) });

    const doOriginal = c.chamadas_ia as unknown as Chamada[];
    expect(feitas.map((f) => [f.tipo, f.modelo])).toEqual(doOriginal.map((f) => [f.tipo, f.modelo]));
    for (const [k, f] of feitas.entries()) {
      expect(f.sistema).toBe(doOriginal[k].sistema);
      if (f.tipo === "texto") expect(f.texto).toBe(doOriginal[k].texto);
      else {
        expect(f.prompt).toBe(doOriginal[k].prompt);
        // A página do PDF vai como PDF de uma página (o original a desenhava em PNG).
        expect(f.mime).toBe(config.tipo === "pdf" ? "application/pdf" : doOriginal[k].mime);
      }
    }
  });

  it("o prompt é o do original", () => {
    const qualquer = registros("visual.cenario").flatMap((c) => c.chamadas_ia as unknown as Chamada[]).find((f) => f.tipo === "visao");
    expect(PROMPT).toBe(qualquer!.prompt);
    expect(SISTEMA).toBe(qualquer!.sistema);
  });

  it.each([
    ["sem objetos", "%PDF-1.4\n%%EOF"],
    ["vazio", ""],
    ["que não é PDF", "não é pdf"],
  ])("PDF %s: recusa com a frase do original, antes de conferir a chave (no original, a exceção do PyMuPDF escapava)", async (_n, bytes) => {
    const conteudo = new TextEncoder().encode(bytes);
    const ia: DependenciasDaIa = { isAiConfigured: async () => true, gerarTexto: async () => "" };
    for (const liberada of [true, false]) {
      await expect(lerNotaPdf(conteudo, { tenantId: "t", documentosFinanceirosLiberados: liberada }, { ia })).rejects.toThrow(
        new NotaInvalida("Não foi possível extrair os dados da nota fiscal deste PDF."),
      );
    }
  });
});
