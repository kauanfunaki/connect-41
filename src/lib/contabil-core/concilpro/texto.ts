// O texto de cada página do Razão de fornecedores em PDF (ConcilPro, Bloco D, Fase D3a, 26/11/2026).
// Porte da extração de `src/domain/concilpro/parser.py` do Contábil Core: três estratégias por página
// e UMA escolhida para o documento inteiro, pela qualidade somada de todas as páginas.
//
// - "layout": o `page.extract_text(layout=True)` do pdfplumber (`extrairTextoEmLayout` em `pdf/plumber.ts`),
//   que preserva o alinhamento horizontal em colunas de 7,25 pontos;
// - "palavras": as palavras do pdfplumber agrupadas em faixas de 5 pontos de `top`, separadas por dois espaços;
// - "chars": os caracteres crus reagrupados em "runs" (sequências contíguas no conteúdo da página, na mesma
//   linha de base), sem as cópias sobrepostas do histórico (o "Formato 6": o histórico desenhado várias vezes
//   numa linha de base a menos de 1 ponto da dos dados, que o pdfplumber funde e ENTRELAÇA, como
//   "2V8A/L0O2R/2 A02 R6ECUPERA1R1"), com o alinhamento das colunas preservado por espaços.
//
// A posição horizontal importa: é ela que distingue a coluna Débito da Crédito na leitura pelas colunas
// (`leitor.ts`). Comprimento não serve de critério de escolha: o entrelaçamento duplica o texto.
//
// Os caracteres são os do porte do pdfminer (`pdf/caracteres.ts`), na ordem do conteúdo da página, como o
// `page.chars` do pdfplumber. As contas de ponto flutuante são as do Python (`round` meio para par, `//`).

import type { PaginaComCaracteres } from "../pdf/caracteres";
import { arredondaPy, extrairPalavras, extrairTextoEmLayout, type Caractere } from "../pdf/plumber";
import { len, re, split, strip } from "../extrato/py";

// ─── Por palavras ────────────────────────────────────────────────────────────

/** `a // b` do Python para `float` (`float_floor_div`, com o `fmod` do C). */
export function divisaoInteiraPy(a: number, b: number): number {
  let resto = a % b;
  let div = (a - resto) / b;
  if (resto) {
    if (b < 0 !== resto < 0) {
      resto += b;
      div -= 1;
    }
  }
  if (div) {
    let piso = Math.floor(div);
    if (div - piso > 0.5) piso += 1;
    return piso;
  }
  return 0;
}

/**
 * `_extrair_pagina_por_palavras`: as palavras (`extract_words` com tolerâncias de 3 pontos) em faixas de 5
 * pontos de `top` (`int(top // 5) * 5`), cada faixa da esquerda para a direita, unidas por dois espaços.
 */
export function extrairPaginaPorPalavras(chars: Caractere[]): string {
  const palavras = extrairPalavras(chars);
  if (!palavras.length) return "";
  const faixas = new Map<number, typeof palavras>();
  for (const p of palavras) {
    const chave = Math.trunc(divisaoInteiraPy(p.top, 5)) * 5;
    const faixa = faixas.get(chave);
    if (faixa) faixa.push(p);
    else faixas.set(chave, [p]);
  }
  return [...faixas.keys()]
    .sort((a, b) => a - b)
    .map((k) =>
      [...faixas.get(k)!]
        .sort((a, b) => a.x0 - b.x0)
        .map((p) => p.text)
        .join("  "),
    )
    .join("\n");
}

// ─── Por caracteres (Formato 6) ──────────────────────────────────────────────

const RUN_GAP_MAX = 2.0; // vão horizontal máximo (pt) entre caracteres de um mesmo run
const RUN_BASELINE = 0.3; // variação de `top` tolerada dentro de um run
const LINHA_TOL = 2.5; // variação de `top` para runs da mesma linha visual

/** O que um run precisa de cada caractere. */
export type CaractereDoRun = Pick<Caractere, "text" | "x0" | "x1" | "top">;

/** Um campo atômico ("28/02/2026", "11192", "VALOR A RECUPERAR DE IPI DO PERÍODO"). */
export type Run = { texto: string; x0: number; x1: number; top: number };

/**
 * `_construir_runs`: os caracteres em sequências contíguas no conteúdo da página, na mesma linha de base
 * (menos de 0,3 ponto) e com x avançando (até 0,5 ponto para trás e vão menor que 2 pontos).
 */
export function construirRuns(chars: readonly CaractereDoRun[]): Run[] {
  const runs: CaractereDoRun[][] = [];
  let atual: CaractereDoRun[] = [];
  for (const c of chars) {
    if (!atual.length) {
      atual = [c];
      continue;
    }
    const anterior = atual[atual.length - 1];
    const mesmaLinhaDeBase = Math.abs(c.top - anterior.top) < RUN_BASELINE;
    const avanca = c.x0 >= anterior.x0 - 0.5;
    const vaoPequeno = c.x0 - anterior.x1 < RUN_GAP_MAX;
    if (mesmaLinhaDeBase && avanca && vaoPequeno) atual.push(c);
    else {
      runs.push(atual);
      atual = [c];
    }
  }
  if (atual.length) runs.push(atual);
  return runs.map((run) => ({
    texto: run.map((c) => c.text).join(""),
    x0: Math.min(...run.map((c) => c.x0)),
    x1: Math.max(...run.map((c) => c.x1)),
    top: Math.min(...run.map((c) => c.top)),
  }));
}

const SO_NUMERO = re("[\\d.,]+[CD]?");

/** `_runs_sobrepostos`: as faixas horizontais dos dois runs se cruzam. */
export function runsSobrepostos(a: Run, b: Run): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1;
}

/** O primeiro de menor chave (o `min(..., key=...)` do Python), com a chave (colisões, x0). */
function menor(runs: readonly Run[], chave: (r: Run) => [number, number]): Run {
  let melhor = runs[0];
  let k = chave(melhor);
  for (const r of runs.slice(1)) {
    const c = chave(r);
    if (c[0] < k[0] || (c[0] === k[0] && c[1] < k[1])) {
      melhor = r;
      k = c;
    }
  }
  return melhor;
}

/**
 * `_montar_linhas_de_runs`: agrupa os runs em linhas visuais (`top` a menos de 2,5 pontos do primeiro run da
 * linha) e tira as cópias de renderização:
 * - 3 ou mais cópias do mesmo texto na linha: fica só a que menos colide com os campos únicos (e, no empate,
 *   a mais à esquerda);
 * - 2 cópias sobrepostas: a mesma regra;
 * - 2 cópias que não se sobrepõem são colunas legítimas ("Total da conta: 40.679,43 40.679,43"), a não ser
 *   que uma seja TEXTO pousado sobre um número: essa sai.
 * O alinhamento é preservado: cada run começa na coluna `round(x0 / largura)`; se a coluna já foi ocupada,
 * entra um espaço só (colar criaria tokens falsos como "2.758,20VALOR").
 */
export function montarLinhasDeRuns(runs: readonly Run[], larguraChar = 3.7): string[] {
  const linhas: Run[][] = [];
  for (const run of [...runs].sort((a, b) => a.top - b.top)) {
    const ultima = linhas[linhas.length - 1];
    if (ultima && Math.abs(run.top - ultima[0].top) < LINHA_TOL) ultima.push(run);
    else linhas.push([run]);
  }

  const resultado: string[] = [];
  for (const grupo of linhas) {
    const porTexto = new Map<string, Run[]>();
    for (const run of grupo) {
      const copias = porTexto.get(run.texto);
      if (copias) copias.push(run);
      else porTexto.set(run.texto, [run]);
    }
    const mantidos: Run[] = [];
    for (const [texto, copias] of porTexto) {
      if (copias.length === 1) {
        mantidos.push(copias[0]);
        continue;
      }
      const unicos = grupo.filter((r) => porTexto.get(r.texto)!.length === 1);
      const colisoes = (run: Run) => unicos.filter((o) => runsSobrepostos(run, o)).length;
      const chave = (c: Run): [number, number] => [colisoes(c), c.x0];
      if (copias.length >= 3) {
        mantidos.push(menor(copias, chave));
        continue;
      }
      const [a, b] = [...copias].sort((x, y) => x.x0 - y.x0);
      if (runsSobrepostos(a, b)) {
        mantidos.push(menor([a, b], chave));
        continue;
      }
      const numericos = grupo.filter((r) => SO_NUMERO.fullmatch(r.texto));
      if (!SO_NUMERO.fullmatch(texto)) {
        const sobreNumero = [a, b].filter((c) => numericos.some((n) => runsSobrepostos(c, n)));
        if (sobreNumero.length && sobreNumero.length < 2) {
          mantidos.push(sobreNumero[0] === b ? a : b);
          continue;
        }
      }
      mantidos.push(a, b);
    }
    mantidos.sort((a, b) => a.x0 - b.x0);

    let linha = "";
    let tamanho = 0; // `len(linha)`, em caracteres
    for (const run of mantidos) {
      const coluna = Math.trunc(arredondaPy(run.x0 / larguraChar));
      if (linha && tamanho >= coluna) {
        linha += " ";
        tamanho += 1;
      } else if (tamanho < coluna) {
        linha += " ".repeat(coluna - tamanho);
        tamanho = coluna;
      }
      linha += run.texto;
      tamanho += len(run.texto);
    }
    resultado.push(rstripPy(linha));
  }
  return resultado;
}

const ESPACOS_PY = "\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const FIM_EM_BRANCO = new RegExp(`[${ESPACOS_PY}]+$`, "u");
const INICIO_EM_BRANCO = new RegExp(`^[${ESPACOS_PY}]+`, "u");

/** `str.rstrip()` do Python. */
export const rstripPy = (t: string) => t.replace(FIM_EM_BRANCO, "");
/** `str.lstrip()` do Python. */
export const lstripPy = (t: string) => t.replace(INICIO_EM_BRANCO, "");

/**
 * `_extrair_pagina_por_chars`: as linhas reconstruídas dos caracteres crus, com a coluna do tamanho da
 * largura MEDIANA dos caracteres da página (os que não são espaço; sem nenhum, 3,7). Largura zero dá a
 * divisão por zero do original, e a estratégia sai vazia.
 */
export function extrairPaginaPorChars(chars: readonly CaractereDoRun[]): string {
  if (!chars.length) return "";
  const larguras = chars
    .filter((c) => strip(c.text))
    .map((c) => c.x1 - c.x0)
    .sort((a, b) => a - b);
  const larguraChar = larguras.length ? larguras[Math.floor(larguras.length / 2)] : 3.7;
  if (larguraChar === 0) return "";
  return montarLinhasDeRuns(construirRuns(chars), larguraChar).join("\n");
}

// ─── A escolha da estratégia ─────────────────────────────────────────────────

const LINHA_DE_LANCAMENTO = re("^\\s*\\d{2}/\\d{2}/\\d{4}\\b");
const NUMERICO_PURO = re("[\\d./,\\-]+[CD]?$");
const TEM_DIGITO = re("\\d");
const TEM_MAIUSCULA = re("[A-ZÁÉÍÓÚÂÊÔÃÕÇ]");

/**
 * `_pontuar_extracao`: (linhas que começam com data, tokens corrompidos). Corrompido é o token de 6 ou mais
 * caracteres que mistura dígito e maiúscula sem ser data, valor ou conta.
 */
export function pontuarExtracao(texto: string): [number, number] {
  const linhas = texto.split("\n");
  const lancamentos = linhas.filter((l) => LINHA_DE_LANCAMENTO.match(l)).length;
  let corrompidos = 0;
  for (const linha of linhas) {
    for (const token of split(linha)) {
      if (len(token) < 6) continue;
      if (TEM_DIGITO.search(token) && TEM_MAIUSCULA.search(token) && !NUMERICO_PURO.match(token)) corrompidos += 1;
    }
  }
  return [lancamentos, corrompidos];
}

export const ESTRATEGIAS = ["layout", "palavras", "chars"] as const;
export type Estrategia = (typeof ESTRATEGIAS)[number];
/** O texto de uma página em cada estratégia (`_extrair_candidatos`). */
export type Candidatos = Partial<Record<Estrategia, string>>;

/** `_extrair_candidatos`: as três estratégias sobre a página. */
export function extrairCandidatos(pagina: Pick<PaginaComCaracteres, "caracteres" | "largura" | "altura">): Record<Estrategia, string> {
  return {
    layout: extrairTextoEmLayout(pagina.caracteres, pagina.largura, pagina.altura),
    palavras: extrairPaginaPorPalavras(pagina.caracteres),
    chars: extrairPaginaPorChars(pagina.caracteres),
  };
}

/**
 * `_escolher_estrategia`: UMA estratégia para o documento, pela soma de todas as páginas. Só troca com ganho
 * estrito: mais linhas de lançamento, ou o empate com menos tokens corrompidos. Nenhuma com texto: "layout".
 */
export function escolherEstrategia(paginas: readonly Candidatos[]): Estrategia {
  let melhor: Estrategia | "" = "";
  let melhorLanc = -1;
  let melhorCorrompidos = 0;
  for (const nome of ESTRATEGIAS) {
    const textos = paginas.map((p) => p[nome] || "");
    if (!textos.some(Boolean)) continue;
    let lancamentos = 0;
    let corrompidos = 0;
    for (const t of textos) {
      const [l, c] = pontuarExtracao(t);
      lancamentos += l;
      corrompidos += c;
    }
    if (lancamentos > melhorLanc || (lancamentos === melhorLanc && corrompidos < melhorCorrompidos)) {
      melhor = nome;
      melhorLanc = lancamentos;
      melhorCorrompidos = corrompidos;
    }
  }
  return melhor || "layout";
}

/** `_extrair_paginas`: o texto de cada página na estratégia escolhida (vazia, cai no "layout"). */
export function textosDasPaginas(candidatas: readonly Candidatos[]): string[] {
  const estrategia = escolherEstrategia(candidatas);
  return candidatas.map((c) => c[estrategia] || c.layout || "");
}
