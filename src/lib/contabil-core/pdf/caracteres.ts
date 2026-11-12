import "server-only";

// Os caracteres de cada página com a posição, como o pdfminer (por baixo do pdfplumber) os
// entrega. O pdf.js (pacote `unpdf`) lê o arquivo; aqui os operadores de texto da página são
// interpretados com as mesmas contas do `PDFTextDevice.render_string` e do `LTChar` do pdfminer:
// matriz do texto × CTM, avanço = largura × tamanho × escala horizontal, espaçamento de caractere
// e de palavra, deslocamentos do TJ, `q`/`Q` guardando também o estado do texto, e formulários
// (Form XObject) com estado novo. O `textContent` do pdf.js não serve: ele entrega pedaços já
// juntados, e o leitor do BB, que trabalha caractere a caractere, perdia metade das linhas.
//
// Diferenças conhecidas, raras em extrato: a página usa a área visível do pdf.js (CropBox) em vez da
// MediaBox; fontes Type3 e verticais seguem a matriz da fonte do pdf.js; o operador `"` anda uma
// linha (no pdfminer ele não anda).

import { getDocumentProxy, getResolvedPDFJS } from "unpdf";
import type { Caractere, GlifoMupdf } from "./plumber";

type Matriz = [number, number, number, number, number, number];
const IDENTIDADE: Matriz = [1, 0, 0, 1, 0, 0];

// mult_matrix(m1, m0) do pdfminer, na mesma ordem das contas.
function multiplicar(m1: Matriz, m0: Matriz): Matriz {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a0, b0, c0, d0, e0, f0] = m0;
  return [a0 * a1 + c0 * b1, b0 * a1 + d0 * b1, a0 * c1 + c0 * d1, b0 * c1 + d0 * d1, a0 * e1 + c0 * f1 + e0, b0 * e1 + d0 * f1 + f0];
}

function transladar(m: Matriz, x: number, y: number): Matriz {
  const [a, b, c, d, e, f] = m;
  return [a, b, c, d, x * a + y * c + e, x * b + y * d + f];
}

function aplicarNoRetangulo(m: Matriz, x0: number, y0: number, x1: number, y1: number): [number, number, number, number] {
  const [a, b, c, d, e, f] = m;
  const pt = (x: number, y: number) => [a * x + c * y + e, b * x + d * y + f];
  const [l1, b1] = pt(x0, y0);
  const [r1, b2] = pt(x1, y0);
  const [r2, t1] = pt(x1, y1);
  const [l2, t2] = pt(x0, y1);
  return [Math.min(l1, l2, r1, r2), Math.min(b1, b2, t1, t2), Math.max(l1, l2, r1, r2), Math.max(b1, b2, t1, t2)];
}

type Fonte = { nome: string; descida: number; matriz: number[]; vertical: boolean; mupdf: [number, number] };

type EstadoDoTexto = {
  fonte: Fonte | null;
  tamanho: number;
  espacoCaractere: number;
  espacoPalavra: number;
  escala: number;
  entrelinha: number;
  elevacao: number;
  matriz: Matriz;
  linha: [number, number];
};

const estadoNovo = (): EstadoDoTexto => ({
  fonte: null,
  tamanho: 0,
  espacoCaractere: 0,
  espacoPalavra: 0,
  escala: 100,
  entrelinha: 0,
  elevacao: 0,
  matriz: IDENTIDADE,
  linha: [0, 0],
});

type Glifo = { unicode?: string; width?: number; isSpace?: boolean; originalCharCode?: number } | number | null;

export type PaginaComCaracteres = { largura: number; altura: number; caracteres: Caractere[] };

const num = (v: unknown, padrao = 0) => (typeof v === "number" && Number.isFinite(v) ? v : padrao);
function comoMatriz(args: unknown[]): Matriz | null {
  const v = args.length === 1 && args[0] && typeof args[0] === "object" ? Array.from(args[0] as ArrayLike<number>) : (args as number[]);
  return v.length >= 6 && v.slice(0, 6).every((x) => typeof x === "number" && Number.isFinite(x)) ? (v.slice(0, 6) as Matriz) : null;
}

type ObjetosComuns = { get(id: string): unknown; has(id: string): boolean };

/** Os caracteres de cada página. Lança se o arquivo não for um PDF legível. */
export async function caracteresDoPdf(bytes: Uint8Array, opcoes: { maxPaginas?: number } = {}): Promise<PaginaComCaracteres[]> {
  const pdfjs = (await getResolvedPDFJS()) as unknown as { OPS: Record<string, number>; AnnotationMode: Record<string, number> };
  const OPS = pdfjs.OPS;
  // O pdf.js toma posse do buffer: uma cópia, para quem chamou continuar com o dele.
  const doc = await getDocumentProxy(new Uint8Array(bytes), { isEvalSupported: false, fontExtraProperties: true } as never);
  try {
    if (opcoes.maxPaginas !== undefined && doc.numPages > opcoes.maxPaginas) {
      throw new LimiteDePaginas(doc.numPages, opcoes.maxPaginas);
    }
    const paginas: PaginaComCaracteres[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      // Sem as anotações: o pdfminer não desenha a aparência dos campos e carimbos.
      const ops = await page.getOperatorList({ annotationMode: pdfjs.AnnotationMode.DISABLE } as never);
      paginas.push(interpretar(OPS, ops.fnArray, ops.argsArray as unknown[][], page.commonObjs as unknown as ObjetosComuns, page.view, page.rotate));
      page.cleanup();
    }
    return paginas;
  } finally {
    // O proxy do documento fecha pelo `loadingTask`; `cleanup` solta as fontes e páginas.
    await doc.cleanup().catch(() => undefined);
    await (doc as unknown as { loadingTask?: { destroy(): Promise<void> } }).loadingTask?.destroy().catch(() => undefined);
  }
}

/** Só o número de páginas (`len(pdf.pages)`), sem interpretar nenhuma. Lança se o arquivo não for um PDF legível. */
export async function contarPaginas(bytes: Uint8Array): Promise<number> {
  const doc = await getDocumentProxy(new Uint8Array(bytes), { isEvalSupported: false } as never);
  try {
    return doc.numPages;
  } finally {
    await doc.cleanup().catch(() => undefined);
    await (doc as unknown as { loadingTask?: { destroy(): Promise<void> } }).loadingTask?.destroy().catch(() => undefined);
  }
}

export class LimiteDePaginas extends Error {
  constructor(
    readonly paginas: number,
    readonly limite: number,
  ) {
    super(`O PDF tem ${paginas} páginas; o limite é ${limite}.`);
  }
}

// A descida que o pdfminer usa para as fontes padrão (`pdfminer/fontmetrics.py`): pelo nome da fonte,
// ele pega a métrica AFM própria e ignora o descritor do arquivo. O pdf.js mede a Courier de outro
// jeito, e a linha subia 0,4 ponto.
const DESCIDA_PADRAO: Record<string, number> = {
  Courier: -0.194, "Courier-Bold": -0.194, "Courier-BoldOblique": -0.194, "Courier-Oblique": -0.194,
  CourierNew: -0.194, "CourierNew,Bold": -0.194, "CourierNew,BoldItalic": -0.194, "CourierNew,Italic": -0.194,
  Helvetica: -0.207, "Helvetica-Bold": -0.207, "Helvetica-BoldOblique": -0.207, "Helvetica-Oblique": -0.207,
  Arial: -0.207, "Arial,Bold": -0.207, "Arial,BoldItalic": -0.207, "Arial,Italic": -0.207,
  "Times-Roman": -0.217, "Times-Bold": -0.217, "Times-BoldItalic": -0.217, "Times-Italic": -0.217,
  TimesNewRoman: -0.217, "TimesNewRoman,Bold": -0.217, "TimesNewRoman,BoldItalic": -0.217, "TimesNewRoman,Italic": -0.217,
  Symbol: 0, ZapfDingbats: 0,
};

// A subida e a descida que o MuPDF (por baixo do PyMuPDF) dá às fontes padrão não embutidas: ele usa
// as fontes Nimbus no lugar delas. Medidas no PyMuPDF 1.26 (caixa da palavra ÷ tamanho); a
// ZapfDingbats já vem normalizada pela correção do PyMuPDF (subida − descida < 1).
const SUBSTITUTAS_MUPDF: Record<string, [number, number]> = {
  Helvetica: [1.075, -0.299],
  "Helvetica-Bold": [1.07, -0.307],
  "Helvetica-Oblique": [1.07, -0.284],
  "Helvetica-BoldOblique": [1.073, -0.309],
  "Times-Roman": [1.053, -0.281],
  "Times-Bold": [1.044, -0.341],
  "Times-Italic": [0.951, -0.27],
  "Times-BoldItalic": [0.972, -0.324],
  Courier: [0.932, -0.317],
  "Courier-Bold": [1.007, -0.393],
  "Courier-Oblique": [0.92, -0.317],
  "Courier-BoldOblique": [0.997, -0.393],
  Symbol: [1.01, -0.293],
  ZapfDingbats: [0.8504675, -0.1495325],
};
const NOMES_SUBSTITUTOS: Record<string, string> = {
  Arial: "Helvetica",
  "Arial,Bold": "Helvetica-Bold",
  "Arial,Italic": "Helvetica-Oblique",
  "Arial,BoldItalic": "Helvetica-BoldOblique",
  TimesNewRoman: "Times-Roman",
  "TimesNewRoman,Bold": "Times-Bold",
  "TimesNewRoman,Italic": "Times-Italic",
  "TimesNewRoman,BoldItalic": "Times-BoldItalic",
  CourierNew: "Courier",
  "CourierNew,Bold": "Courier-Bold",
  "CourierNew,Italic": "Courier-Oblique",
  "CourierNew,BoldItalic": "Courier-BoldOblique",
};

/**
 * A subida e a descida da caixa do caractere no MuPDF, já com a correção do `JM_char_quad` do
 * PyMuPDF. Fonte padrão não embutida: a tabela acima. Fonte embutida: a métrica que o pdf.js leu
 * dela (o MuPDF lê a do próprio arquivo da fonte; pode diferir em centésimos). Outra fonte não
 * embutida: a Helvetica, a substituta mais comum.
 */
function metricaMupdf(nome: string, f: Record<string, unknown>): [number, number] {
  const padrao = SUBSTITUTAS_MUPDF[NOMES_SUBSTITUTOS[nome] ?? nome];
  if (padrao && !nome.includes("+")) return padrao;
  if (f.missingFile === true) return SUBSTITUTAS_MUPDF.Helvetica;
  let subida = num(f.ascent, 0.8);
  let descida = num(f.descent, -0.2);
  if (descida > 0) descida = -descida;
  if (subida - descida === 0) [subida, descida] = [0.8, -0.2];
  if (subida < 1e-3) return [0.9, -0.1];
  const altura = subida - descida + 1.1920929e-7;
  return altura < 1 ? [subida / altura, descida / altura] : [subida, descida];
}

function fonteDe(objs: ObjetosComuns, id: string, cache: Map<string, Fonte>): Fonte {
  const ja = cache.get(id);
  if (ja) return ja;
  let f: Record<string, unknown> = {};
  try {
    if (objs.has(id)) f = (objs.get(id) as Record<string, unknown>) ?? {};
  } catch {
    f = {};
  }
  const matriz = Array.isArray(f.fontMatrix) || ArrayBuffer.isView(f.fontMatrix) ? Array.from(f.fontMatrix as ArrayLike<number>) : [0.001, 0, 0, 0.001, 0, 0];
  // A descida do pdf.js vem normalizada (Descent / 1000), como o `get_descent` do pdfminer.
  const nome = String(f.name ?? f.loadedName ?? id);
  let descida = nome in DESCIDA_PADRAO ? DESCIDA_PADRAO[nome] : num(f.descent);
  if (descida > 0) descida = -descida;
  const fonte: Fonte = { nome, descida, matriz, vertical: f.vertical === true, mupdf: metricaMupdf(nome, f) };
  cache.set(id, fonte);
  return fonte;
}

function interpretar(
  OPS: Record<string, number>,
  fnArray: number[],
  argsArray: unknown[][],
  objs: ObjetosComuns,
  view: number[],
  rotacao: number,
): PaginaComCaracteres {
  const [x0, y0, x1, y1] = view;
  const r = ((rotacao % 360) + 360) % 360;
  // process_page do pdfminer.
  const ctmInicial: Matriz =
    r === 90 ? [0, -1, 1, 0, -y0, x1] : r === 180 ? [-1, 0, 0, -1, x1, y1] : r === 270 ? [0, 1, -1, 0, y1, -x0] : [1, 0, 0, 1, -x0, -y0];
  const largura = r === 90 || r === 270 ? y1 - y0 : x1 - x0;
  const altura = r === 90 || r === 270 ? x1 - x0 : y1 - y0;

  const dx0 = r === 0 ? x0 : 0;
  const dtopo = r === 0 ? -y0 : 0;
  // A matriz do glifo no espaço do dispositivo do MuPDF: [tamanho × escala, 0, 0, tamanho, 0, Ts] ×
  // a do pdfminer, com o y virado para baixo e a mesma origem dos caracteres.
  const glifoMupdf = (m: Matriz, tamanho: number, escala: number, elevacao: number, avanco: number, fonte: Fonte): GlifoMupdf => {
    const [a, b, c, d, e, f] = multiplicar([tamanho * escala, 0, 0, tamanho, 0, elevacao], m);
    return { trm: [a, -b, c, -d, e + dx0, altura - f + dtopo], avanco, subida: fonte.mupdf[0], descida: fonte.mupdf[1] };
  };
  const fontes = new Map<string, Fonte>();
  const caracteres: Caractere[] = [];

  // Cada formulário roda com estado novo (render_contents → init_state), e volta ao do pai no fim.
  type Quadro = { ctm: Matriz; texto: EstadoDoTexto; pilha: { ctm: Matriz; texto: EstadoDoTexto }[] };
  const quadros: Quadro[] = [];
  let q: Quadro = { ctm: ctmInicial, texto: estadoNovo(), pilha: [] };

  const mostrar = (glifos: Glifo[]) => {
    const t = q.texto;
    const fonte = t.fonte;
    if (!fonte) return;
    const matriz = multiplicar(t.matriz, q.ctm);
    const tamanho = t.tamanho;
    const escala = t.escala * 0.01;
    const espacoCaractere = t.espacoCaractere * escala;
    const espacoPalavra = t.espacoPalavra * escala;
    const elevacao = t.elevacao;
    const dx = 0.001 * tamanho * escala;
    const larguraDaFonte = fonte.matriz[0];
    let [x, y] = t.linha;
    let precisaEspaco = false;
    for (const g of glifos) {
      if (typeof g === "number") {
        if (fonte.vertical) y -= g * dx;
        else x -= g * dx;
        precisaEspaco = true;
        continue;
      }
      if (!g) continue;
      if (precisaEspaco) {
        if (fonte.vertical) y += espacoCaractere;
        else x += espacoCaractere;
      }
      const m = transladar(matriz, x, y);
      const larguraDoTexto = num(g.width) * larguraDaFonte;
      const avanco = larguraDoTexto * tamanho * escala;
      let caixa: [number, number, number, number];
      if (fonte.vertical) {
        const vx = tamanho * 0.5;
        const vy = 1000 * tamanho * 0.001;
        caixa = [-vx, vy + elevacao + avanco, -vx + tamanho, vy + elevacao];
      } else {
        const descida = fonte.descida * tamanho;
        caixa = [0, descida + elevacao, avanco, descida + elevacao + tamanho];
      }
      const [a, b, c, d] = m;
      const [cx0, cy0, cx1, cy1] = aplicarNoRetangulo(m, ...caixa);
      const texto = g.unicode ? g.unicode : `(cid:${g.originalCharCode ?? 0})`;
      caracteres.push({
        text: texto,
        // pdfplumber devolve a origem da MediaBox que o pdfminer tirou (process_object).
        x0: cx0 + dx0,
        x1: cx1 + dx0,
        top: altura - cy1 + dtopo,
        bottom: altura - cy0 + dtopo,
        upright: a * d * escala > 0 && b * c <= 0,
        size: fonte.vertical ? cx1 - cx0 : cy1 - cy0,
        fontname: fonte.nome,
        mupdf: glifoMupdf(m, tamanho, escala, elevacao, larguraDoTexto, fonte),
      });
      if (fonte.vertical) y += avanco;
      else x += avanco;
      if (g.isSpace && espacoPalavra) {
        if (fonte.vertical) y += espacoPalavra;
        else x += espacoPalavra;
      }
      precisaEspaco = true;
    }
    t.linha = [x, y];
  };

  const proximaLinha = () => {
    const t = q.texto;
    const [a, b, c, d, e, f] = t.matriz;
    t.matriz = [a, b, c, d, t.entrelinha * c + e, t.entrelinha * d + f];
    t.linha = [0, 0];
  };
  const moverTexto = (tx: number, ty: number) => {
    const t = q.texto;
    const [a, b, c, d, e, f] = t.matriz;
    t.matriz = [a, b, c, d, tx * a + ty * c + e, tx * b + ty * d + f];
    t.linha = [0, 0];
  };
  const definirFonte = (id: unknown, tamanho: unknown) => {
    q.texto.fonte = fonteDe(objs, String(id), fontes);
    q.texto.tamanho = num(tamanho);
  };

  for (let i = 0; i < fnArray.length; i++) {
    const op = fnArray[i];
    const args = argsArray[i] ?? [];
    switch (op) {
      case OPS.save:
        q.pilha.push({ ctm: q.ctm, texto: { ...q.texto } });
        break;
      case OPS.restore: {
        const s = q.pilha.pop();
        if (s) {
          q.ctm = s.ctm;
          q.texto = s.texto;
        }
        break;
      }
      case OPS.transform: {
        const m = comoMatriz(args);
        if (m) q.ctm = multiplicar(m, q.ctm);
        break;
      }
      case OPS.paintFormXObjectBegin: {
        const m = comoMatriz([args[0]]) ?? IDENTIDADE;
        quadros.push(q);
        q = { ctm: multiplicar(m, q.ctm), texto: estadoNovo(), pilha: [] };
        break;
      }
      case OPS.paintFormXObjectEnd:
        q = quadros.pop() ?? q;
        break;
      case OPS.beginText:
        q.texto.matriz = IDENTIDADE;
        q.texto.linha = [0, 0];
        break;
      case OPS.setFont:
        definirFonte(args[0], args[1]);
        break;
      case OPS.setGState:
        for (const [chave, valor] of (args[0] as [string, unknown][]) ?? []) {
          if (chave === "Font" && Array.isArray(valor)) definirFonte(valor[0], valor[1]);
        }
        break;
      case OPS.setCharSpacing:
        q.texto.espacoCaractere = num(args[0]);
        break;
      case OPS.setWordSpacing:
        q.texto.espacoPalavra = num(args[0]);
        break;
      case OPS.setHScale:
        q.texto.escala = num(args[0], 100);
        break;
      case OPS.setLeading:
        q.texto.entrelinha = -num(args[0]);
        break;
      case OPS.setTextRise:
        q.texto.elevacao = num(args[0]);
        break;
      case OPS.moveText:
        moverTexto(num(args[0]), num(args[1]));
        break;
      case OPS.setLeadingMoveText:
        q.texto.entrelinha = num(args[1]);
        moverTexto(num(args[0]), num(args[1]));
        break;
      case OPS.setTextMatrix: {
        const m = comoMatriz(args);
        if (m) {
          q.texto.matriz = m;
          q.texto.linha = [0, 0];
        }
        break;
      }
      case OPS.nextLine:
        proximaLinha();
        break;
      case OPS.showText:
      case OPS.showSpacedText:
        mostrar((args[0] as Glifo[]) ?? []);
        break;
      case OPS.nextLineShowText:
        proximaLinha();
        mostrar((args[0] as Glifo[]) ?? []);
        break;
      case OPS.nextLineSetSpacingShowText:
        q.texto.espacoPalavra = num(args[0]);
        q.texto.espacoCaractere = num(args[1]);
        mostrar((args[2] as Glifo[]) ?? []);
        break;
    }
  }
  return { largura, altura, caracteres };
}
