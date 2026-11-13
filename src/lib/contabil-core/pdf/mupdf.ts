// O texto de uma página como o PyMuPDF o entrega (Bloco B, Fase B4, 12/11/2026): `page.get_text("words")`
// e `page.get_text()`, com os sinalizadores padrão (ligaduras e espaços preservados, recorte na
// MediaBox). O leitor do relatório Omie do Contábil Core (`financeiro_omie.py`) lê o PDF pelo PyMuPDF,
// e não pelo pdfplumber: as palavras saem cortadas em outros lugares (o MuPDF separa com um espaço
// qualquer vão maior que 0,15 do tamanho da fonte, e quebra a linha num vão maior que 0,8) e a caixa
// de cada palavra vai da subida à descida da fonte, não do tamanho.
//
// Os caracteres vêm do mesmo intérprete do pdfminer (`caracteres.ts`), que guarda para cada glifo a
// matriz no espaço do MuPDF (`GlifoMupdf`). Daqui em diante é o `fz_add_stext_char_imp` do MuPDF
// (`source/fitz/stext-device.c`), passo a passo, e o `extractWORDS` e o
// `JM_print_stext_page_as_text` do PyMuPDF.
//
// Conferido no relatório Omie real de 85 páginas: todas as palavras (texto e caixa, até 0,02 ponto) e
// todo o texto iguais aos do PyMuPDF. Diferenças conhecidas, fora desse layout: texto vertical (o
// MuPDF tem um modo próprio), escrita da direita para a esquerda (o MuPDF reordena a linha), glifo sem
// Unicode (o MuPDF usa o CID; o pdfminer, "(cid:N)") e a métrica de fonte embutida, que vem do pdf.js.

import type { Caractere } from "./plumber";

/** Uma palavra de `get_text("words")`: (x0, y0, x1, y1, texto). */
export type PalavraMupdf = { text: string; x0: number; top: number; x1: number; bottom: number };

type Ponto = { x: number; y: number };
type CaractereDaLinha = { c: string; caixa: [number, number, number, number] | null };
type Linha = { dir: Ponto; caracteres: CaractereDaLinha[] };

const SPACE_DIST = 0.15;
const SPACE_MAX_DIST = 0.8;
const BASE_MAX_DIST = 0.8;
const FAKE_BOLD_MAX_DIST = 0.1;

/** `may_add_space` */
function podeEspacar(ultimo: number): boolean {
  return ultimo !== 0x20 && (ultimo < 0x700 || (ultimo >= 0x2000 && ultimo <= 0x20cf));
}

/** `JM_rects_overlap` */
const sobrepoe = (a: [number, number, number, number], b: [number, number, number, number]) =>
  !(a[0] >= b[2] || a[1] >= b[3] || a[2] <= b[0] || a[3] <= b[1]);

/** As linhas do `fz_stext_page`, na ordem em que o MuPDF as cria (a mesma dos blocos). */
function linhasDaPagina(chars: readonly Caractere[], largura: number, altura: number): Linha[] {
  const pagina: [number, number, number, number] = [0, 0, largura, altura];
  const linhas: Linha[] = [];
  let caneta: Ponto | null = null;
  let ultimo = 0;
  for (const ch of chars) {
    const g = ch.mupdf;
    if (!g) continue;
    const [a, b, c, d, e, f] = g.trm;
    const n = Math.hypot(a, b);
    if (!n) continue;
    const dir = { x: a / n, y: b / n };
    const tamanho = Math.sqrt(Math.abs(a * d - b * c));
    if (!tamanho) continue;
    const p = { x: e, y: f };
    const q = { x: e + g.avanco * a, y: f + g.avanco * b };
    // A caixa do caractere: de p a q, da subida à descida da fonte.
    const sx = g.subida * c;
    const sy = g.subida * d;
    const dx = g.descida * c;
    const dy = g.descida * d;
    const xs = [p.x + sx, p.x + dx, q.x + sx, q.x + dx];
    const ys = [p.y + sy, p.y + dy, q.y + sy, q.y + dy];
    const caixa: [number, number, number, number] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    // Recorte na MediaBox: o glifo inteiramente fora nem entra, nem move a caneta.
    if (!sobrepoe(pagina, caixa)) continue;

    const codigos = Array.from(ch.text);
    if (!codigos.length) continue;
    const primeiro = codigos[0].codePointAt(0)!;
    const atual = linhas.length ? linhas[linhas.length - 1] : null;
    let novaLinha = true;
    let espaco = false;
    if (atual && caneta && dir.x * atual.dir.x + dir.y * atual.dir.y >= 0.999) {
      // Negrito falso: o mesmo caractere desenhado de novo no mesmo lugar.
      if (Math.hypot(q.x - caneta.x, q.y - caneta.y) / tamanho < FAKE_BOLD_MAX_DIST && primeiro === ultimo) continue;
      const delta = { x: p.x - caneta.x, y: p.y - caneta.y };
      const espacamento = (dir.x * delta.x + dir.y * delta.y) / tamanho;
      const fora = (-dir.y * delta.x + dir.x * delta.y) / tamanho;
      if (Math.abs(fora) < BASE_MAX_DIST) {
        if (Math.abs(espacamento) < SPACE_DIST) novaLinha = false;
        else if (espacamento < 0 && espacamento > -SPACE_MAX_DIST) novaLinha = false;
        else if (espacamento > 0 && espacamento < SPACE_MAX_DIST) {
          espaco = podeEspacar(ultimo);
          novaLinha = false;
        }
      }
    }
    let linha = atual;
    if (novaLinha || !linha) {
      linha = { dir, caracteres: [] };
      linhas.push(linha);
    }
    // O espaço sintético não entra em palavra nenhuma: só a letra importa.
    if (espaco) linha.caracteres.push({ c: " ", caixa: null });
    linha.caracteres.push({ c: codigos[0], caixa });
    // Um glifo com vários caracteres (ToUnicode "ff", por exemplo): os demais sem avanço.
    for (const resto of codigos.slice(1)) linha.caracteres.push({ c: resto, caixa });
    ultimo = codigos[codigos.length - 1].codePointAt(0)!;
    caneta = q;
  }
  return linhas;
}

/** `JM_is_word_delimiter` sem delimitadores extras. */
function delimita(cp: number): boolean {
  return cp <= 32 || cp === 160 || (cp >= 0x202a && cp <= 0x202e);
}

/** `JM_is_rtl_char` */
const daDireita = (cp: number) => cp >= 0x590 && cp <= 0x900;

/** `page.get_text("words")`: as palavras na ordem do MuPDF (bloco, linha, palavra), sem ordenar. */
export function palavrasMupdf(chars: readonly Caractere[], largura: number, altura: number): PalavraMupdf[] {
  const pagina: [number, number, number, number] = [0, 0, largura, altura];
  const palavras: PalavraMupdf[] = [];
  let direitaAnterior = false;
  for (const linha of linhasDaPagina(chars, largura, altura)) {
    let texto = "";
    let caixa: [number, number, number, number] | null = null;
    const fechar = () => {
      if (caixa) palavras.push({ text: texto, x0: caixa[0], top: caixa[1], x1: caixa[2], bottom: caixa[3] });
      texto = "";
      caixa = null;
    };
    for (const ch of linha.caracteres) {
      if (ch.caixa && !sobrepoe(pagina, ch.caixa)) continue;
      const cp = ch.c.codePointAt(0)!;
      if (!texto && cp === 0x200d) continue;
      const delimitador = delimita(cp);
      const direita = daDireita(cp);
      if (delimitador || direita !== direitaAnterior) {
        if (!texto && delimitador) continue;
        fechar();
        if (delimitador) continue;
      }
      texto += ch.c;
      direitaAnterior = direita;
      if (ch.caixa) {
        const k: [number, number, number, number] = caixa ?? [Infinity, Infinity, -Infinity, -Infinity];
        caixa = [Math.min(k[0], ch.caixa[0]), Math.min(k[1], ch.caixa[1]), Math.max(k[2], ch.caixa[2]), Math.max(k[3], ch.caixa[3])];
      }
    }
    if (texto) fechar();
  }
  return palavras;
}

/** `page.get_text()`: os caracteres de cada linha e uma quebra no fim dela. */
export function textoMupdf(chars: readonly Caractere[], largura: number, altura: number): string {
  let texto = "";
  for (const linha of linhasDaPagina(chars, largura, altura)) {
    let ultimo = 0;
    for (const ch of linha.caracteres) {
      ultimo = ch.c.codePointAt(0)!;
      texto += ch.c;
    }
    if (ultimo !== 10 && ultimo > 0) texto += "\n";
  }
  return texto;
}
