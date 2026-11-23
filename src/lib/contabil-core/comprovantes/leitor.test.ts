// Gabarito do leitor de comprovantes (scripts/contabil-core/gabarito_comprovantes.py): as funções puras
// do original (`_parse_valor`, `_parse_data`, `_parse_por_regex`, `_parece_nota_fiscal`,
// `_comprovante_from_item`) chamada a chamada, o texto do PDF (`_extrair_linhas`) e a leitura inteira
// (`parse_pdf`/`parse_imagem`) em cenários com a IA simulada — os da suíte do original, repetidos com
// a entrada sanitizada, e os inventados: as mesmas chamadas à IA (texto ou imagem, o texto enviado) e o
// mesmo resultado. As divergências deliberadas são contadas uma a uma (`divergencias`).

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai", () => ({ gerarTexto: vi.fn(), isAiConfigured: vi.fn() }));

import { decimal, NAO_FINITO, type Dec } from "../motor/decimal";
import { LEITURA_DESLIGADA, SEM_PROVEDOR, type DependenciasDaIa } from "../ia/leituraPorIa";
import type { ItemPy, ValorPy } from "../notas/visual";
import { arquivo, comprovanteEsperado, registros, type Json, type Registro } from "./gabarito/ler";
import {
  AGENTE_TEXTO,
  DICA_DESLIGADA,
  DICA_SEM_PROVEDOR,
  DOCUMENTO_NAO_E_COMPROVANTE,
  formatoDoComprovante,
  itemParaComprovante,
  LeituraRecusada,
  lerComprovanteDoTexto,
  lerComprovanteImagem,
  lerComprovantePdf,
  lerData,
  lerPorRotulos,
  lerValor,
  linhasDoPdf,
  orcamentoDoComprovante,
  pareceNotaFiscal,
  PDF_ILEGIVEL,
  PROMPT,
  SISTEMA,
} from "./leitor";

const divergencias = { pdfIlegivel: 0, falhaDaVisao: 0 };

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

const dec = (r: Json | undefined) => (r === null || r === undefined ? null : (r as { $dec: string }).$dec);
const dt = (r: Json | undefined) => (r === null || r === undefined ? null : (r as { $dt: string }).$dt);

describe("funções puras do leitor de comprovantes (gabarito)", () => {
  it.each(registros("leitor._parse_valor").map((r) => [JSON.stringify(r.args[0]), r] as const))("_parse_valor(%s)", (_n, r) => {
    expect(lerValor(r.args[0] as string)).toBe(dec(r.result));
  });

  it.each(registros("leitor._parse_data").map((r) => [JSON.stringify(r.args[0]), r] as const))("_parse_data(%s)", (_n, r) => {
    expect(lerData(r.args[0] as string)).toBe(dt(r.result));
  });

  it.each(registros("leitor._parse_por_regex").map((r, k) => [k, r] as const))("_parse_por_regex #%s", (_k, r) => {
    expect(lerPorRotulos(r.args[0] as string[])).toEqual(comprovanteEsperado(r.result!));
  });

  it.each(registros("leitor._parece_nota_fiscal").map((r, k) => [k, r] as const))("_parece_nota_fiscal #%s", (_k, r) => {
    expect(pareceNotaFiscal(r.args[0] as string[])).toBe(r.result);
  });

  it.each(registros("leitor._comprovante_from_item").map((r, k) => [k, r] as const))("_comprovante_from_item #%s", (_k, r) => {
    const obtido = itemParaComprovante(py(r.args[0]) as ItemPy, "ia");
    expect(obtido).toEqual(r.result === null ? null : comprovanteEsperado(r.result!));
  });

  it.each(registros("leitor._extrair_linhas").map((r, k) => [k, r] as const))("_extrair_linhas #%s (o texto do pdfplumber)", async (_k, r) => {
    const [linhas, total] = r.result as [string[], number];
    expect(await linhasDoPdf(arquivo(r.args[0]), orcamentoDoComprovante())).toEqual({ linhas, total });
  });
});

type Chamada = { tipo: string; modelo: string; texto?: string; sistema: string; mime?: string; prompt?: string };
type Config = {
  tipo: "pdf" | "imagem";
  mime: string;
  openai_enabled: boolean;
  allow: boolean;
  max_pages: number;
  max_ai_calls: number;
  respostas: Record<string, string[]>;
  falha_texto: boolean;
  falha_visao: boolean;
  linhas: string[] | null;
  total: number | null;
};

/** A frase do original → a do porte: as frases da IA desligada dizem o que ligar no Connect. */
function fraseDoPorte(mensagem: string, c: Config): string {
  if (mensagem.startsWith("OCR externo desabilitado")) return !c.allow ? LEITURA_DESLIGADA : SEM_PROVEDOR;
  return mensagem
    .replace(" (a leitura assistida por IA está desligada neste ambiente: OPENAI_API_KEY não configurada)", DICA_SEM_PROVEDOR)
    .replace(" (a leitura assistida por IA está desligada neste ambiente: ALLOW_FINANCIAL_DATA_TO_OPENAI=false)", DICA_DESLIGADA);
}

async function rodar(r: Registro) {
  const c = r.args[1] as unknown as Config;
  const filas = Object.fromEntries(Object.entries(c.respostas).map(([k, v]) => [k, [...v]]));
  const feitas: Chamada[] = [];
  const ia: DependenciasDaIa = {
    isAiConfigured: async () => c.openai_enabled,
    gerarTexto: async (p) => {
      const texto = p.agentCode === AGENTE_TEXTO;
      const modelo = texto ? "gpt-4o-mini" : "gpt-4o";
      feitas.push(texto ? { tipo: "texto", modelo, texto: p.texto, sistema: p.sistema! } : { tipo: "visao", modelo, mime: p.anexos![0].mime, prompt: p.texto, sistema: p.sistema! });
      if ((texto && c.falha_texto) || (!texto && c.falha_visao)) throw new Error("falha simulada do provedor");
      const fila = filas[modelo] ?? [""];
      return fila.length > 1 ? fila.shift()! : (fila[0] ?? "");
    },
  };
  const quem = { tenantId: "escritorio-teste", documentosFinanceirosLiberados: c.allow };
  const orcamento = orcamentoDoComprovante({ maxPaginas: c.max_pages, maxChamadas: c.max_ai_calls });
  const conteudo = arquivo(r.args[0]);
  let obtido: { result?: unknown; mensagem?: string; codigo?: string | null };
  try {
    const lido =
      c.tipo === "imagem"
        ? await lerComprovanteImagem(conteudo, c.mime, quem, { ia, orcamento })
        : c.linhas !== null
          ? await lerComprovanteDoTexto(conteudo, { linhas: c.linhas, total: c.total! }, quem, orcamento, { ia })
          : await lerComprovantePdf(conteudo, quem, { ia, orcamento });
    obtido = { result: lido };
  } catch (e) {
    if (!(e instanceof LeituraRecusada)) throw e;
    obtido = { mensagem: e.message, codigo: e.codigo };
  }
  return { c, obtido, feitas };
}

describe("leitura inteira, com a IA simulada (cenários do gabarito)", () => {
  const cenarios = registros("leitor.cenario");

  it("o gabarito traz os cenários da suíte do original e os daqui", () => {
    expect(cenarios.filter((c) => c.nome!.startsWith("suite-")).length).toBeGreaterThanOrEqual(16);
    expect(cenarios.map((c) => c.nome)).toEqual(expect.arrayContaining(["pdf-pix", "pdf-em-branco-chamadas-esgotadas", "imagem-nota", "pdf-vazio-ligada"]));
  });

  it.each(cenarios.map((c) => [c.nome!, c] as const))("%s", async (_nome, r) => {
    const { c, obtido, feitas } = await rodar(r);
    if (r.error) {
      if (["FileDataError", "EmptyFileError"].includes(r.error.tipo)) {
        // O PDF que nem o PyMuPDF abre derrubava o original (erro 500); aqui é recusa com frase.
        divergencias.pdfIlegivel++;
        expect(obtido).toEqual({ mensagem: PDF_ILEGIVEL, codigo: null });
      } else if (r.error.tipo === "RuntimeError") {
        // A falha do provedor na camada de imagem escapava crua (erro 500); aqui é a frase da fundação.
        divergencias.falhaDaVisao++;
        expect(obtido).toEqual({ mensagem: "falha simulada do provedor", codigo: null });
      } else {
        const codigo = r.error.tipo === "DocumentoNaoEComprovanteError" ? DOCUMENTO_NAO_E_COMPROVANTE : null;
        expect(["PDFParseError", "DocumentoNaoEComprovanteError"]).toContain(r.error.tipo);
        expect(obtido).toEqual({ mensagem: fraseDoPorte(r.error.mensagem, c), codigo });
      }
    } else expect(obtido).toEqual({ result: comprovanteEsperado(r.result!) });

    const doOriginal = r.chamadas_ia as unknown as Chamada[];
    expect(feitas.map((f) => [f.tipo, f.modelo])).toEqual(doOriginal.map((f) => [f.tipo, f.modelo]));
    for (const [k, f] of feitas.entries()) {
      expect(f.sistema).toBe(doOriginal[k].sistema);
      if (f.tipo === "texto") expect(f.texto).toBe(doOriginal[k].texto);
      else {
        expect(f.prompt).toBe(doOriginal[k].prompt);
        // A página do PDF vai como PDF de uma página (o original a desenhava em PNG).
        expect(f.mime).toBe(c.tipo === "pdf" ? "application/pdf" : doOriginal[k].mime);
      }
    }
  });

  it("o prompt e o sistema são os do original", () => {
    const visao = cenarios.flatMap((c) => c.chamadas_ia as unknown as Chamada[]).find((f) => f.tipo === "visao");
    expect(PROMPT).toBe(visao!.prompt);
    expect(SISTEMA).toBe(visao!.sistema);
  });

  afterAll(() => {
    // Cada divergência deliberada, contada: os 4 PDFs que não abrem e as 2 falhas do provedor na imagem.
    expect(divergencias).toEqual({ pdfIlegivel: 4, falhaDaVisao: 2 });
  });
});

describe("formato do arquivo (a rota `extrair_dados_pdf`)", () => {
  const pdf = new TextEncoder().encode("%PDF-1.4 x");
  const outro = new TextEncoder().encode("GIF89a");
  it.each([
    ["comprovante.PDF", "", outro, { pdf: true }],
    ["blob", "application/pdf; charset=binary", outro, { pdf: true }],
    ["foto.png", "", outro, { pdf: false, tipoMime: "image/png" }],
    ["foto", "IMAGE/JPG", outro, { pdf: false, tipoMime: "image/jpeg" }],
    ["foto.jpeg", "", outro, { pdf: false, tipoMime: "image/jpeg" }],
    ["sem-nome", "", pdf, { pdf: true }],
    ["planilha.xlsx", "application/octet-stream", outro, null],
  ] as const)("%s (%s)", (nome, tipo, conteudo, esperado) => {
    expect(formatoDoComprovante(nome, tipo, conteudo)).toEqual(esperado);
  });
});
