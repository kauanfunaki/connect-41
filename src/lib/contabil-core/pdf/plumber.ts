// Porte do pdfplumber 0.11 (utils/text.py e utils/clustering.py): de caracteres com posição para
// palavras (`extract_words`) e para o texto da página (`extract_text`), com os padrões que o
// Contábil Core usa (tolerâncias de 3 pontos, de cima para baixo e da esquerda para a direita, sem
// `keep_blank_chars` nem `use_text_flow`). Os leitores de extrato dependem do texto exato: um espaço
// a mais ou uma linha juntada muda o que a regex encontra. Por isso o algoritmo é o mesmo, passo a
// passo, e o teste-gabarito compara com o Python.

export type Caractere = {
  text: string;
  x0: number;
  x1: number;
  top: number;
  bottom: number;
  upright: boolean;
  size: number;
  fontname: string;
};

export type Palavra = {
  text: string;
  x0: number;
  x1: number;
  top: number;
  bottom: number;
  upright: boolean;
  /** Só quando pedido (`return_chars=True` no Python). */
  chars?: Caractere[];
};

const TOLERANCIA_X = 3;
const TOLERANCIA_Y = 3;

// As ligaduras que o pdfplumber expande (LIGATURES).
const LIGADURAS: Record<string, string> = {
  "ﬀ": "ff",
  "ﬃ": "ffi",
  "ﬄ": "ffl",
  "ﬁ": "fi",
  "ﬂ": "fl",
  "ﬆ": "st",
  "ﬅ": "st",
};
const expandir = (t: string) => LIGADURAS[t] ?? t;

/** `str.isspace()` do Python: não vazio e só espaços em branco (na definição do Python). */
export function ehEspacoPython(t: string): boolean {
  if (!t) return false;
  for (const c of t) {
    const n = c.codePointAt(0)!;
    const branco =
      (n >= 0x09 && n <= 0x0d) ||
      (n >= 0x1c && n <= 0x20) ||
      n === 0x85 ||
      n === 0xa0 ||
      n === 0x1680 ||
      (n >= 0x2000 && n <= 0x200a) ||
      n === 0x2028 ||
      n === 0x2029 ||
      n === 0x202f ||
      n === 0x205f ||
      n === 0x3000;
    if (!branco) return false;
  }
  return true;
}

/** `cluster_list`: ordena, e cada valor entra no grupo do anterior se estiver a até `tolerancia` dele. */
function agruparValores(valores: number[], tolerancia: number): number[][] {
  const xs = [...valores].sort((a, b) => a - b);
  if (tolerancia === 0 || xs.length < 2) return xs.map((x) => [x]);
  const grupos: number[][] = [];
  let atual = [xs[0]];
  let ultimo = xs[0];
  for (const x of xs.slice(1)) {
    if (x <= ultimo + tolerancia) atual.push(x);
    else {
      grupos.push(atual);
      atual = [x];
    }
    ultimo = x;
  }
  grupos.push(atual);
  return grupos;
}

/**
 * `cluster_objects`: o grupo de cada objeto vem do agrupamento dos valores DISTINTOS da chave. Sem
 * `preservarOrdem`, os objetos saem ordenados pelo número do grupo (ordenação estável); com ela,
 * ficam na ordem recebida e só os vizinhos do mesmo grupo se juntam (`itertools.groupby`).
 */
export function agruparObjetos<T>(xs: T[], chave: (x: T) => number, tolerancia: number, preservarOrdem = false): T[][] {
  const distintos = [...new Set(xs.map(chave))];
  const grupoDe = new Map<number, number>();
  agruparValores(distintos, tolerancia).forEach((g, i) => g.forEach((v) => grupoDe.set(v, i)));
  const pares = xs.map((x) => ({ x, g: grupoDe.get(chave(x))! }));
  if (!preservarOrdem) pares.sort((a, b) => a.g - b.g);
  const saida: T[][] = [];
  let anterior: number | null = null;
  for (const p of pares) {
    if (anterior === p.g && saida.length) saida[saida.length - 1].push(p.x);
    else saida.push([p.x]);
    anterior = p.g;
  }
  return saida;
}

function comecaPalavraNova(anterior: Caractere, atual: Caractere): boolean {
  // Só o caso "ltr" (texto em pé). Para texto girado, o pdfplumber usa "ttb" com os eixos trocados.
  if (anterior.upright) {
    return atual.x0 < anterior.x0 || atual.x0 > anterior.x1 + TOLERANCIA_X || Math.abs(atual.top - anterior.top) > TOLERANCIA_Y;
  }
  return atual.top < anterior.top || atual.top > anterior.bottom + TOLERANCIA_Y || Math.abs(atual.x0 - anterior.x0) > TOLERANCIA_X;
}

function juntar(chars: Caractere[], comCaracteres: boolean): Palavra {
  let x0 = Infinity,
    top = Infinity,
    x1 = -Infinity,
    bottom = -Infinity;
  for (const c of chars) {
    x0 = Math.min(x0, c.x0);
    top = Math.min(top, c.top);
    x1 = Math.max(x1, c.x1);
    bottom = Math.max(bottom, c.bottom);
  }
  const p: Palavra = { text: chars.map((c) => expandir(c.text ?? "")).join(""), x0, x1, top, bottom, upright: chars[0].upright };
  if (comCaracteres) p.chars = chars;
  return p;
}

function* palavrasDaLinha(ordenados: Caractere[]): Generator<Caractere[]> {
  let atual: Caractere[] = [];
  for (const c of ordenados) {
    if (ehEspacoPython(c.text)) {
      if (atual.length) yield atual;
      atual = [];
    } else if (atual.length && comecaPalavraNova(atual[atual.length - 1], c)) {
      yield atual;
      atual = [c];
    } else atual.push(c);
  }
  if (atual.length) yield atual;
}

function* linhasDoGrupo(chars: Caractere[]): Generator<Caractere[]> {
  const emPe = chars[0].upright;
  // Linha: por `top` em pé, por `x0` girado ("ltr" como line_dir do texto girado).
  const chaveDaLinha = emPe ? (c: Caractere) => c.top : (c: Caractere) => c.x0;
  const tolerancia = emPe ? TOLERANCIA_Y : TOLERANCIA_X;
  for (const linha of agruparObjetos(chars, chaveDaLinha, tolerancia)) {
    // sorted() do Python é estável; o Array.sort do JS também.
    const ordenada = emPe
      ? [...linha].sort((a, b) => a.x0 - b.x0)
      : [...linha].sort((a, b) => a.top - b.top || a.bottom - b.bottom);
    yield ordenada;
  }
}

/** `WordExtractor.iter_extract_tuples` com os padrões: grupos consecutivos por `upright`, linhas, palavras. */
function* tuplas(chars: Caractere[], comCaracteres: boolean): Generator<Palavra> {
  let i = 0;
  while (i < chars.length) {
    let j = i;
    while (j < chars.length && chars[j].upright === chars[i].upright) j++;
    for (const linha of linhasDoGrupo(chars.slice(i, j))) {
      for (const p of palavrasDaLinha(linha)) yield juntar(p, comCaracteres);
    }
    i = j;
  }
}

/** `page.extract_words()` (ou `extract_words(return_chars=True)`). */
export function extrairPalavras(chars: Caractere[], comCaracteres = false): Palavra[] {
  return [...tuplas(chars, comCaracteres)];
}

/**
 * `page.extract_text()`: no pdfplumber 0.11 é o `chars_to_textmap` com `presorted=True` e sem
 * `layout`. As palavras ficam na ordem em que saíram, as linhas juntam palavras VIZINHAS com o
 * mesmo grupo de `top`, um espaço entre palavras e uma quebra entre linhas.
 */
export function extrairTexto(chars: Caractere[]): string {
  if (!chars.length) return "";
  const palavras = extrairPalavras(chars);
  if (!palavras.length) return "";
  const linhas = agruparObjetos(palavras, (p) => p.top, TOLERANCIA_Y, true);
  return linhas.map((l) => l.map((p) => p.text).join(" ")).join("\n");
}
