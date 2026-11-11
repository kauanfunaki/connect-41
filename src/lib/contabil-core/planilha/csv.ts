// CSV lido como o `_linhas_csv` do Contábil Core original (Fase 4b, 10/11/2026): UTF-8 (com ou sem
// BOM) e, se não for, latin-1; o separador adivinhado pelo `csv.Sniffer` do Python entre ";", ","
// e tabulação nos primeiros 4096 caracteres; e o leitor do módulo `csv` (a máquina de estados do
// `_csv.c`, com `strict=False`). Quando o Sniffer não decide, vale o dialeto `excel` com ";".
//
// O Sniffer é heurístico (frequência de cada caractere por linha, aspas em volta do separador), e a
// escolha muda as colunas: por isso ele é portado como está, com as mesmas desempatadas.

import { re as rePy } from "../extrato/py";

export class ErroCsv extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroCsv";
  }
}

export type Dialeto = { delimitador: string; aspas: string; aspasDuplas: boolean; pularEspacoInicial: boolean };

const EXCEL_PONTO_E_VIRGULA: Dialeto = { delimitador: ";", aspas: '"', aspasDuplas: true, pularEspacoInicial: false };

// ─── Sniffer ────────────────────────────────────────────────────────────────

/** `max(d, key=d.get)`: a primeira chave com o maior valor, na ordem de inserção. */
function chaveDoMaior(d: Map<string, number>): string {
  let melhor = "";
  let maior = -Infinity;
  for (const [k, v] of d) {
    if (v > maior) {
      maior = v;
      melhor = k;
    }
  }
  return melhor;
}

function escaparPy(s: string): string {
  // `re.escape` do Python 3.7+: só os caracteres especiais (inclusive espaço e controles).
  return [...s].map((c) => ("()[]{}?*+-|^$\\.&~# \t\n\r\v\f".includes(c) ? "\\" + c : c)).join("");
}

function adivinharAspasESeparador(dados: string, delimitadores: string): [string, boolean, string | null, boolean] {
  const padroes = [
    "(?P<delim>[^\\w\\n\"'])(?P<space> ?)(?P<quote>[\"']).*?(?P=quote)(?P=delim)",
    "(?:^|\\n)(?P<quote>[\"']).*?(?P=quote)(?P<delim>[^\\w\\n\"'])(?P<space> ?)",
    "(?P<delim>[^\\w\\n\"'])(?P<space> ?)(?P<quote>[\"']).*?(?P=quote)(?:$|\\n)",
    "(?:^|\\n)(?P<quote>[\"']).*?(?P=quote)(?:$|\\n)",
  ];
  let casamentos: ReturnType<ReturnType<typeof rePy>["finditer"]> = [];
  for (const p of padroes) {
    casamentos = rePy(p, "sm").finditer(dados);
    if (casamentos.length) break;
  }
  if (!casamentos.length) return ["", false, null, false];
  const aspasContadas = new Map<string, number>();
  const delims = new Map<string, number>();
  let espacos = 0;
  for (const m of casamentos) {
    const aspa = m.nomeados.quote ?? "";
    if (aspa) aspasContadas.set(aspa, (aspasContadas.get(aspa) ?? 0) + 1);
    if (!("delim" in m.nomeados)) continue;
    const d = m.nomeados.delim ?? "";
    if (d && delimitadores.includes(d)) delims.set(d, (delims.get(d) ?? 0) + 1);
    if (!("space" in m.nomeados)) continue;
    if (m.nomeados.space) espacos++;
  }
  const aspas = chaveDoMaior(aspasContadas);
  let delim: string;
  let pular: boolean;
  if (delims.size) {
    delim = chaveDoMaior(delims);
    pular = delims.get(delim) === espacos;
    if (delim === "\n") delim = "";
  } else {
    delim = "";
    pular = false;
  }
  const e = escaparPy(delim);
  const dq = rePy(`((${e})|^)\\W*${aspas}[^${e}\\n]*${aspas}[^${e}\\n]*${aspas}\\W*((${e})|$)`, "m");
  return [aspas, dq.search(dados) !== null, delim, pular];
}

const PREFERIDOS = [",", "\t", ";", " ", ":"];
const ASCII = Array.from({ length: 127 }, (_, i) => String.fromCharCode(i));

function contar(linha: string, c: string): number {
  let n = 0;
  for (let i = linha.indexOf(c); i >= 0; i = linha.indexOf(c, i + 1)) n++;
  return n;
}

function adivinharSeparador(texto: string, delimitadores: string): [string, boolean] {
  const dados = texto.split("\n").filter(Boolean);
  const pular = (d: string) => contar(dados[0], d) === contar(dados[0], d + " ");
  const tamanho = Math.min(10, dados.length);
  let iteracao = 0;
  const frequencias = new Map<string, Map<number, number>>();
  const modas = new Map<string, [number, number]>();
  const delims = new Map<string, [number, number]>();
  let inicio = 0;
  let fim = tamanho;
  while (inicio < dados.length) {
    iteracao++;
    for (const linha of dados.slice(inicio, fim)) {
      for (const c of ASCII) {
        const meta = frequencias.get(c) ?? new Map<number, number>();
        const f = contar(linha, c);
        meta.set(f, (meta.get(f) ?? 0) + 1);
        frequencias.set(c, meta);
      }
    }
    for (const [c, meta] of frequencias) {
      const itens = [...meta.entries()];
      if (itens.length === 1 && itens[0][0] === 0) continue;
      if (itens.length > 1) {
        let moda = itens[0];
        for (const it of itens) if (it[1] > moda[1]) moda = it;
        const resto = itens.filter((it, i) => i !== itens.indexOf(moda));
        modas.set(c, [moda[0], moda[1] - resto.reduce((s, it) => s + it[1], 0)]);
      } else modas.set(c, itens[0]);
    }
    const total = Math.min(tamanho * iteracao, dados.length);
    let consistencia = 1.0;
    const limiar = 0.9;
    while (delims.size === 0 && consistencia >= limiar) {
      for (const [k, v] of modas) {
        if (v[0] > 0 && v[1] > 0 && v[1] / total >= consistencia && delimitadores.includes(k)) delims.set(k, v);
      }
      consistencia -= 0.01;
    }
    if (delims.size === 1) {
      const d = [...delims.keys()][0];
      return [d, pular(d)];
    }
    inicio = fim;
    fim += tamanho;
  }
  if (!delims.size) return ["", false];
  if (delims.size > 1) {
    for (const d of PREFERIDOS) if (delims.has(d)) return [d, pular(d)];
  }
  // `items.sort()` de (v, k) e o último: maior moda, depois maior caractere.
  const itens = [...delims.entries()].map(([k, v]) => ({ k, v }));
  itens.sort((a, b) => a.v[0] - b.v[0] || a.v[1] - b.v[1] || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
  const d = itens[itens.length - 1].k;
  return [d, pular(d)];
}

/** `csv.Sniffer().sniff(amostra, delimiters)`; `null` quando o Python levantaria `csv.Error`. */
export function farejar(amostra: string, delimitadores = ";,\t"): Dialeto | null {
  const [aspas, aspasDuplas, delimQ, pularQ] = adivinharAspasESeparador(amostra, delimitadores);
  let delim = delimQ;
  let pular = pularQ;
  if (!delim) [delim, pular] = adivinharSeparador(amostra, delimitadores);
  if (!delim) return null;
  return { delimitador: delim, aspas: aspas || '"', aspasDuplas, pularEspacoInicial: pular };
}

// ─── Leitor (`_csv.c`, strict=False, sem escapechar) ────────────────────────

const LIMITE_DO_CAMPO = 131072;

/** `str.splitlines(keepends=True)` do `StringIO(newline="")`: quebra em \n, \r e \r\n, mantendo-os. */
function linhasComFim(texto: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < texto.length) {
    let j = i;
    while (j < texto.length && texto[j] !== "\n" && texto[j] !== "\r") j++;
    if (j < texto.length) j += texto[j] === "\r" && texto[j + 1] === "\n" ? 2 : 1;
    out.push(texto.slice(i, j));
    i = j;
  }
  return out;
}

/** `list(csv.reader(io.StringIO(texto, newline=""), dialeto))` */
export function lerCsvTexto(texto: string, d: Dialeto): string[][] {
  type Estado = "inicioRegistro" | "inicioCampo" | "campo" | "aspas" | "aspaNasAspas" | "comerFimDeLinha";
  const registros: string[][] = [];
  let estado: Estado = "inicioRegistro";
  let campos: string[] = [];
  let campo = "";
  const salvar = () => {
    campos.push(campo);
    campo = "";
  };
  const juntar = (c: string) => {
    if (campo.length >= LIMITE_DO_CAMPO) throw new ErroCsv(`field larger than field limit (${LIMITE_DO_CAMPO})`);
    campo += c;
  };
  const FIM = null;
  const processar = (c: string | null) => {
    switch (estado) {
      case "inicioRegistro":
        if (c === FIM) return;
        if (c === "\n" || c === "\r") {
          estado = "comerFimDeLinha";
          return;
        }
        estado = "inicioCampo";
      // fallthrough
      case "inicioCampo":
        if (c === "\n" || c === "\r" || c === FIM) {
          salvar();
          estado = c === FIM ? "inicioRegistro" : "comerFimDeLinha";
        } else if (c === d.aspas) estado = "aspas";
        else if (c === " " && d.pularEspacoInicial) {
          /* espaço no começo do campo é ignorado */
        } else if (c === d.delimitador) salvar();
        else {
          juntar(c);
          estado = "campo";
        }
        return;
      case "campo":
        if (c === "\n" || c === "\r" || c === FIM) {
          salvar();
          estado = c === FIM ? "inicioRegistro" : "comerFimDeLinha";
        } else if (c === d.delimitador) {
          salvar();
          estado = "inicioCampo";
        } else juntar(c);
        return;
      case "aspas":
        if (c === FIM) return;
        if (c === d.aspas) estado = d.aspasDuplas ? "aspaNasAspas" : "campo";
        else juntar(c);
        return;
      case "aspaNasAspas":
        if (c === d.aspas) {
          juntar(c);
          estado = "aspas";
        } else if (c === d.delimitador) {
          salvar();
          estado = "inicioCampo";
        } else if (c === "\n" || c === "\r" || c === FIM) {
          salvar();
          estado = c === FIM ? "inicioRegistro" : "comerFimDeLinha";
        } else {
          juntar(c);
          estado = "campo";
        }
        return;
      case "comerFimDeLinha":
        if (c === "\n" || c === "\r") return;
        if (c === FIM) {
          estado = "inicioRegistro";
          return;
        }
        throw new ErroCsv("new-line character seen in unquoted field - do you need to open the file with newline=''?");
    }
  };

  // `Reader_iternext`: cada registro consome linhas até a máquina voltar ao início de registro.
  // Linha em branco dá registro vazio; no fim do arquivo dentro de aspas, o campo aberto é salvo.
  const linhas = linhasComFim(texto);
  let i = 0;
  for (;;) {
    campos = [];
    campo = "";
    estado = "inicioRegistro";
    do {
      if (i >= linhas.length) {
        // `estado` muda dentro de `processar`; o TypeScript não enxerga isso aqui.
        if (campo.length !== 0 || (estado as Estado) === "aspas") {
          salvar();
          break;
        }
        return registros;
      }
      for (const c of linhas[i++]) processar(c);
      processar(FIM);
    } while (estado !== "inicioRegistro");
    registros.push(campos);
  }
}

/** `_linhas_csv`: decodifica, fareja e lê. */
export function linhasDoCsv(bytes: Uint8Array): string[][] {
  let texto: string;
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes); // utf-8-sig: o TextDecoder tira o BOM
  } catch {
    texto = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  }
  // `texto[:4096]` conta caractere (code point), não unidade UTF-16.
  let amostra = "";
  let n = 0;
  for (const c of texto) {
    if (n++ >= 4096) break;
    amostra += c;
  }
  const dialeto = farejar(amostra) ?? EXCEL_PONTO_E_VIRGULA;
  return lerCsvTexto(texto, dialeto);
}
