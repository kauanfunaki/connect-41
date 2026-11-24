// As tabelas de uma página como o pdfplumber as acha e lê (`page.extract_tables()` com a configuração
// padrão, estratégia "lines"), Bloco C, Fase C3 (23/11/2026). A composição da fatura de cartão
// (`cartoes/documentos.ts`) lê as compras pelas linhas das tabelas: a descrição quebrada em duas linhas
// dentro da célula volta numa só.
//
// Porte de `pdfplumber/table.py` (o `TableFinder` e o `Table.extract`) e das partes de
// `pdfplumber/utils/geometry.py` que ele usa: as bordas vêm dos traços da página (`page.edges`: as linhas,
// os quatro lados de cada retângulo e os segmentos de cada curva, que `pdf/caracteres.ts` monta como o
// `paint_path` do pdfminer), são alinhadas (`snap`, 3 pontos) e emendadas (`join`, 3 pontos), as curtas
// saem (menos de 3 pontos), os cruzamentos (3 pontos) viram os cantos das células, e as células que se
// tocam viram uma tabela. O texto de cada célula é o `extract_text` dos caracteres com o meio dentro dela.
//
// Diferença conhecida: o pdf.js guarda os pontos do caminho em `Float32Array` (o pdfminer usa `float`), e
// as coordenadas diferem do original na sexta casa decimal; só um caractere com o meio exatamente na
// borda da célula poderia mudar de célula.

import { agruparObjetos, extrairTexto, type Caractere } from "./plumber";
import type { PaginaComCaracteres, Traco } from "./caracteres";

type Borda = { orientacao: "h" | "v" | null; x0: number; x1: number; top: number; bottom: number; width: number; height: number };
type Caixa = [number, number, number, number];

const SNAP = 3;
const JOIN = 3;
const MINIMO = 3;
const PREFILTRO = 1;
const CRUZAMENTO = 3;

// ─── page.edges ─────────────────────────────────────────────────────────────

function bordas(tracos: readonly Traco[]): Borda[] {
  const caixa = (t: Traco) => ({ x0: t.x0, x1: t.x1, top: t.top, bottom: t.bottom, width: t.x1 - t.x0, height: t.bottom - t.top });
  // `line_to_edge`: "h" quando top == bottom; senão "v" (inclusive a diagonal, como lá).
  const linhas: Borda[] = tracos.filter((t) => t.tipo === "line").map((t) => ({ ...caixa(t), orientacao: t.top === t.bottom ? "h" : "v" }));
  // `rect_to_edges`: os quatro lados.
  const retangulos: Borda[] = tracos
    .filter((t) => t.tipo === "rect")
    .flatMap((t) => {
      const r = caixa(t);
      return [
        { ...r, height: 0, bottom: r.top, orientacao: "h" as const },
        { ...r, height: 0, top: r.top + r.height, orientacao: "h" as const },
        { ...r, width: 0, x1: r.x0, orientacao: "v" as const },
        { ...r, width: 0, x0: r.x1, orientacao: "v" as const },
      ];
    });
  // `curve_to_edges`: cada par de pontos seguidos.
  const curvas: Borda[] = tracos
    .filter((t) => t.tipo === "curve")
    .flatMap((t) =>
      t.pts.slice(1).map((p1, i) => {
        const p0 = t.pts[i];
        return {
          x0: Math.min(p0[0], p1[0]),
          x1: Math.max(p0[0], p1[0]),
          top: Math.min(p0[1], p1[1]),
          bottom: Math.max(p0[1], p1[1]),
          width: Math.abs(p0[0] - p1[0]),
          height: Math.abs(p0[1] - p1[1]),
          orientacao: p0[0] === p1[0] ? ("v" as const) : p0[1] === p1[1] ? ("h" as const) : null,
        };
      }),
    );
  return [...linhas, ...retangulos, ...curvas];
}

/** `filter_edges` */
function filtrar(bs: readonly Borda[], orientacao: "h" | "v" | null, minimo: number): Borda[] {
  return bs.filter((e) => (orientacao === null || e.orientacao === orientacao) && (e.orientacao === "v" ? e.height : e.width) >= minimo);
}

// ─── merge_edges ────────────────────────────────────────────────────────────

/** `snap_objects`: cada grupo (pela tolerância) vai para a média. */
function alinhar(bs: Borda[], atributo: "x0" | "top"): Borda[] {
  return agruparObjetos(bs, (e) => e[atributo], SNAP).flatMap((grupo) => {
    const media = grupo.reduce((s, e) => s + e[atributo], 0) / grupo.length;
    return grupo.map((e) => {
      const d = media - e[atributo];
      return atributo === "x0" ? { ...e, x0: e.x0 + d, x1: e.x1 + d } : { ...e, top: e.top + d, bottom: e.bottom + d };
    });
  });
}

/** `join_edge_group`: as bordas na mesma reta, emendadas quando o vão é de até 3 pontos. */
function emendar(bs: Borda[], orientacao: "h" | "v"): Borda[] {
  const [menor, maior] = orientacao === "h" ? (["x0", "x1"] as const) : (["top", "bottom"] as const);
  const ordenadas = [...bs].sort((a, b) => a[menor] - b[menor]);
  const juntas = [ordenadas[0]];
  for (const e of ordenadas.slice(1)) {
    const ultima = juntas[juntas.length - 1];
    if (e[menor] <= ultima[maior] + JOIN) {
      if (e[maior] > ultima[maior]) {
        juntas[juntas.length - 1] =
          orientacao === "h" ? { ...ultima, x1: e.x1, width: e.x1 - ultima.x0 } : { ...ultima, bottom: e.bottom, height: ultima.height + (e.bottom - ultima.bottom) };
      }
    } else juntas.push(e);
  }
  return juntas;
}

function mesclar(bs: Borda[]): Borda[] {
  const alinhadas = [...alinhar(bs.filter((e) => e.orientacao === "v"), "x0"), ...alinhar(bs.filter((e) => e.orientacao === "h"), "top")];
  const grupo = (e: Borda): [string, number] => (e.orientacao === "h" ? ["h", e.top] : ["v", e.x0]);
  const ordenadas = alinhadas
    .map((e, i) => ({ e, i, g: grupo(e) }))
    .sort((a, b) => (a.g[0] < b.g[0] ? -1 : a.g[0] > b.g[0] ? 1 : a.g[1] - b.g[1] || a.i - b.i));
  const saida: Borda[] = [];
  for (let i = 0; i < ordenadas.length; ) {
    let j = i;
    while (j < ordenadas.length && ordenadas[j].g[0] === ordenadas[i].g[0] && ordenadas[j].g[1] === ordenadas[i].g[1]) j++;
    saida.push(...emendar(ordenadas.slice(i, j).map((x) => x.e), ordenadas[i].g[0] as "h" | "v"));
    i = j;
  }
  return saida;
}

// ─── Cruzamentos, células e tabelas ─────────────────────────────────────────

const chaveDaCaixa = (e: Borda) => `${e.x0}|${e.top}|${e.x1}|${e.bottom}`;
const chaveDoPonto = (p: [number, number]) => `${p[0]}|${p[1]}`;

type Cruzamento = { ponto: [number, number]; v: Set<string>; h: Set<string> };

/** `edges_to_intersections` */
function cruzamentos(bs: readonly Borda[]): Map<string, Cruzamento> {
  const porChave = new Map<string, Cruzamento>();
  const vs = bs.filter((e) => e.orientacao === "v").sort((a, b) => a.x0 - b.x0 || a.top - b.top);
  const hs = bs.filter((e) => e.orientacao === "h").sort((a, b) => a.top - b.top || a.x0 - b.x0);
  for (const v of vs) {
    for (const h of hs) {
      if (v.top <= h.top + CRUZAMENTO && v.bottom >= h.top - CRUZAMENTO && v.x0 >= h.x0 - CRUZAMENTO && v.x0 <= h.x1 + CRUZAMENTO) {
        const ponto: [number, number] = [v.x0, h.top];
        const k = chaveDoPonto(ponto);
        let c = porChave.get(k);
        if (!c) porChave.set(k, (c = { ponto, v: new Set(), h: new Set() }));
        c.v.add(chaveDaCaixa(v));
        c.h.add(chaveDaCaixa(h));
      }
    }
  }
  return porChave;
}

/** `intersections_to_cells`: para cada ponto, a menor célula que começa nele. */
function celulas(cs: Map<string, Cruzamento>): Caixa[] {
  const conecta = (p1: [number, number], p2: [number, number]) => {
    const a = cs.get(chaveDoPonto(p1))!;
    const b = cs.get(chaveDoPonto(p2))!;
    if (p1[0] === p2[0] && [...a.v].some((x) => b.v.has(x))) return true;
    if (p1[1] === p2[1] && [...a.h].some((x) => b.h.has(x))) return true;
    return false;
  };
  const pontos = [...cs.values()].map((c) => c.ponto).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const saida: Caixa[] = [];
  for (let i = 0; i < pontos.length - 1; i++) {
    const pt = pontos[i];
    const resto = pontos.slice(i + 1);
    const abaixo = resto.filter((x) => x[0] === pt[0]);
    const direita = resto.filter((x) => x[1] === pt[1]);
    let achada: Caixa | null = null;
    procura: for (const b of abaixo) {
      if (!conecta(pt, b)) continue;
      for (const d of direita) {
        if (!conecta(pt, d)) continue;
        const canto: [number, number] = [d[0], b[1]];
        if (cs.has(chaveDoPonto(canto)) && conecta(canto, d) && conecta(canto, b)) {
          achada = [pt[0], pt[1], canto[0], canto[1]];
          break procura;
        }
      }
    }
    if (achada) saida.push(achada);
  }
  return saida;
}

/** `cells_to_tables`: as células que se tocam por um canto viram uma tabela; a tabela de uma célula só sai. */
function tabelas(cels: Caixa[]): Caixa[][] {
  const cantos = (c: Caixa) => [`${c[0]}|${c[1]}`, `${c[0]}|${c[3]}`, `${c[2]}|${c[1]}`, `${c[2]}|${c[3]}`];
  let restantes = [...cels];
  const atuais: Caixa[] = [];
  const cantosAtuais = new Set<string>();
  const saida: Caixa[][] = [];
  while (restantes.length) {
    const antes = atuais.length;
    for (const c of [...restantes]) {
      const cc = cantos(c);
      if (atuais.length === 0 || cc.some((x) => cantosAtuais.has(x))) {
        cc.forEach((x) => cantosAtuais.add(x));
        atuais.push(c);
        restantes = restantes.filter((r) => r !== c);
      }
    }
    if (atuais.length === antes) {
      saida.push([...atuais]);
      cantosAtuais.clear();
      atuais.length = 0;
    }
  }
  if (atuais.length) saida.push([...atuais]);
  const menor = (t: Caixa[]) => t.map((c) => [c[1], c[0]] as const).reduce((m, x) => (x[0] < m[0] || (x[0] === m[0] && x[1] < m[1]) ? x : m));
  return saida
    .map((t, i) => ({ t, i, m: menor(t) }))
    .sort((a, b) => a.m[0] - b.m[0] || a.m[1] - b.m[1] || a.i - b.i)
    .map((x) => x.t)
    .filter((t) => t.length > 1);
}

// ─── Table.extract ──────────────────────────────────────────────────────────

/** `Table.rows`: as células agrupadas pelo `top`, cada linha com uma posição por `x0` da tabela. */
function linhasDaTabela(cels: Caixa[]): (Caixa | null)[][] {
  const ordenadas = cels.map((c, i) => ({ c, i })).sort((a, b) => a.c[1] - b.c[1] || a.c[0] - b.c[0] || a.i - b.i).map((x) => x.c);
  const xs = [...new Set(cels.map((c) => c[0]))].sort((a, b) => a - b);
  const linhas: (Caixa | null)[][] = [];
  for (let i = 0; i < ordenadas.length; ) {
    let j = i;
    const porX = new Map<number, Caixa>();
    while (j < ordenadas.length && ordenadas[j][1] === ordenadas[i][1]) porX.set(ordenadas[j][0], ordenadas[j++]);
    linhas.push(xs.map((x) => porX.get(x) ?? null));
    i = j;
  }
  return linhas;
}

const dentro = (c: Caractere, caixa: Caixa) => {
  const v = (c.top + c.bottom) / 2;
  const h = (c.x0 + c.x1) / 2;
  return h >= caixa[0] && h < caixa[2] && v >= caixa[1] && v < caixa[3];
};

/** `page.extract_tables()`: cada tabela da página, linha a linha, com o texto de cada célula (`null` onde não há célula). */
export function extrairTabelas(pagina: Pick<PaginaComCaracteres, "caracteres" | "tracos">): (string | null)[][][] {
  const todas = bordas(pagina.tracos);
  const base = [...filtrar(todas, "v", PREFILTRO), ...filtrar(todas, "h", PREFILTRO)];
  const finais = filtrar(mesclar(base), null, MINIMO);
  return tabelas(celulas(cruzamentos(finais))).map((t) =>
    linhasDaTabela(t).map((linha) =>
      linha.map((c) => {
        if (c === null) return null;
        const chars = pagina.caracteres.filter((x) => dentro(x, c));
        return chars.length ? extrairTexto(chars) : "";
      }),
    ),
  );
}
