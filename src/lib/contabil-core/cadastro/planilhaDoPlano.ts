// Leitura da planilha de plano de contas (Fase 3b, 10/11/2026): porte de `_parse_planilha` e do que
// ele chama em `src/api/v1/plano_contas.py` do Contábil Core original.
//
// - Nome terminado em ".xlsx" ou ".xls" vai para o caminho do openpyxl (inclusive um .xls de verdade,
//   que falha na conferência do zip com "XLSX inválido: File is not a zip file", como no original);
//   qualquer outro nome é lido como CSV.
// - O cabeçalho é procurado nas 30 primeiras linhas: relatórios de razão trazem empresa, CNPJ e
//   página antes dele.
// - O xlsx é a folha ATIVA (`wb.active`) sem `reset_dimensions()`: a dimensão declarada no arquivo
//   corta as linhas e colunas e alarga as linhas curtas, como no openpyxl em modo read_only.
// - O CSV é lido de `StringIO(text)`, que NÃO tem `newline=""`: só "\n" quebra linha. Um "\r" solto
//   fora de aspas é erro do módulo csv (no original, um erro 500) ou parte do fim de linha.

import { unzipSync, strFromU8 } from "fflate";
import { strip } from "../extrato/py";
import { strPy, type Celula } from "../planilha/celula";
import { ErroCsv, farejar, lerCsvTexto, type Dialeto } from "../planilha/csv";
import { ErroDeRelatorio, validarXlsxCompactado } from "../planilha/excel";
import { lerXlsx } from "../planilha/xlsx";

export class ErroPlanilhaDoPlano extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroPlanilhaDoPlano";
  }
}

/** Uma linha de dados, como o dict de `_rows_to_dicts` (só as chaves que a importação lê). */
export type LinhaDoPlano = {
  linha: number;
  codigo: string;
  descricao: string;
  tipo: string;
  tipo_sa: string;
  conta_numero?: string;
};

export const MAX_LINHAS_BUSCA_CABECALHO = 30;
const MAX_XLSX_LINHAS = 50_000;
const MAX_XLSX_COLUNAS = 100;
const MAX_XLSX_CELULAS = 500_000;

const ALIAS_COLUNA: Record<string, string> = {
  classificacao: "codigo",
  "classificação": "codigo",
  code: "codigo",
  cod: "codigo",
  description: "descricao",
  "descrição": "descricao",
  nome: "descricao",
  type: "tipo",
  sa: "tipo_sa",
  "s/a": "tipo_sa",
  id: "conta_numero",
  conta: "conta_numero",
};

/** Verdade do Python (`if c`) para o valor de uma célula. */
function verdadeira(c: Celula): boolean {
  if (c === null || c === "") return false;
  if (typeof c === "string") return true;
  switch (c.tipo) {
    case "int":
      return c.valor !== BigInt(0);
    case "float":
      return c.valor !== 0; // NaN é verdadeiro no Python, e NaN !== 0
    case "bool":
      return c.valor;
    case "duracao":
      return c.valor !== "0:00:00"; // timedelta(0) é falso; time e datetime são sempre verdadeiros
    default:
      return true;
  }
}

/**
 * `_normaliza_linha_cabecalho`: "Código" é o número da conta (conta_numero) quando a mesma linha
 * tem "Classificação" (planilha do MrContador); sem ela, "Código" é o próprio código hierárquico.
 */
export function normalizarCabecalho(linha: readonly Celula[]): string[] {
  const brutos = linha.map((c) => (verdadeira(c) ? strip(strPy(c)).toLowerCase() : ""));
  const temClassificacao = brutos.some((v) => v === "classificacao" || v === "classificação");
  return brutos.map((v) => (v === "código" ? (temClassificacao ? "conta_numero" : "codigo") : (ALIAS_COLUNA[v] ?? v)));
}

/** `_parece_cabecalho` */
const pareceCabecalho = (cabecalho: readonly string[]) => cabecalho.includes("codigo") && cabecalho.includes("descricao");

/** `_parse_planilha`: o nome (já em minúsculas no original) decide o leitor. */
export function lerPlanilhaDoPlano(bytes: Uint8Array, nomeArquivo: string): LinhaDoPlano[] {
  const nome = nomeArquivo.toLowerCase();
  if (nome.endsWith(".xlsx") || nome.endsWith(".xls")) return lerXlsxDoPlano(bytes);
  return lerCsvDoPlano(bytes);
}

// ─── XLSX ───────────────────────────────────────────────────────────────────

/** `_validar_xlsx_compactado` do plano: a mesma conferência do zip, com as mensagens do plano. */
function validarZip(bytes: Uint8Array): void {
  try {
    validarXlsxCompactado(bytes);
  } catch (e) {
    if (!(e instanceof ErroDeRelatorio)) throw e;
    // A mensagem do `zipfile` muda com o defeito; "File is not a zip file" é a de um arquivo que nem é zip.
    if (e.motivo === "xlsx_invalido") throw new ErroPlanilhaDoPlano("XLSX inválido: File is not a zip file");
    if (e.message.includes("entradas internas demais")) throw new ErroPlanilhaDoPlano("XLSX contém entradas internas demais.");
    if (e.message.includes("descompactado")) throw new ErroPlanilhaDoPlano("XLSX excede o limite descompactado de 100 MiB.");
    throw new ErroPlanilhaDoPlano("XLSX possui razão de compressão insegura.");
  }
}

/** `column_index_from_string` do openpyxl. */
function indiceDaColuna(letras: string): number {
  let n = 0;
  for (const c of letras.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n;
}

/** O openpyxl embrulha qualquer falha ao abrir as folhas (como a dimensão inválida) nesta mensagem. */
const folhasIlegiveis = () =>
  new ErroPlanilhaDoPlano(
    "Erro ao ler XLSX: Unable to read workbook: could not read worksheets from None.\n" +
      "This is most probably because the workbook source files contain some invalid XML.\n" +
      "Please see the exception for more details.",
  );

/** `range_boundaries(ref)`: só os máximos importam para `iter_rows`, que começa sempre em A1. */
function limitesDaDimensao(ref: string): { maxLinha?: number; maxColuna?: number } {
  const m = /^\$?([A-Za-z]{1,3})?\$?(\d+)?(:\$?([A-Za-z]{1,3})?\$?(\d+)?)?$/.exec(ref);
  const invalida = folhasIlegiveis;
  if (!m) throw invalida();
  const [, minCol, minRow, sep, maxCol, maxRow] = m;
  if (sep) {
    const cols = [minCol, maxCol];
    const rows = [minRow, maxRow];
    const todos = (xs: (string | undefined)[]) => xs.every(Boolean);
    const algum = (xs: (string | undefined)[]) => xs.some(Boolean);
    if (!(todos([...cols, ...rows]) || (todos(cols) && !algum(rows)) || (todos(rows) && !algum(cols)))) throw invalida();
  }
  const colunaFinal = maxCol ?? minCol;
  const linhaFinal = maxRow ?? minRow;
  return {
    maxColuna: colunaFinal ? indiceDaColuna(colunaFinal) || undefined : undefined,
    maxLinha: linhaFinal ? Number(linhaFinal) : undefined,
  };
}

function atributos(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const nome = m[1].includes(":") && !m[1].startsWith("xmlns") ? m[1].slice(m[1].indexOf(":") + 1) : m[1];
    out[nome] ??= m[2] ?? m[3] ?? "";
  }
  return out;
}

/** `posixpath.normpath(join("xl", alvo))`, ou o alvo absoluto sem a barra. */
function caminhoDoAlvo(alvo: string): string {
  const partes = alvo.startsWith("/") ? [] : ["xl"];
  for (const p of alvo.replace(/^\/+/, "").split("/")) {
    if (p === "..") partes.pop();
    else if (p && p !== ".") partes.push(p);
  }
  return partes.join("/");
}

/**
 * A dimensão declarada da folha ativa (`ReadOnlyWorksheet._get_size`): a tag `<dimension>` antes de
 * `<sheetData>`. Sem ela (ou sem achar a folha), não há limite, como no `reset_dimensions()`.
 */
function dimensaoDaFolhaAtiva(bytes: Uint8Array): { maxLinha?: number; maxColuna?: number } {
  let arquivos: Record<string, Uint8Array>;
  try {
    arquivos = unzipSync(bytes, { filter: (f) => /\.(xml|rels)$/i.test(f.name) });
  } catch {
    return {};
  }
  const ler = (nome: string) => {
    const chave = Object.keys(arquivos).find((k) => k.toLowerCase() === nome.toLowerCase());
    return chave ? strFromU8(arquivos[chave]) : null;
  };
  const workbook = ler("xl/workbook.xml");
  const rels = ler("xl/_rels/workbook.xml.rels");
  if (!workbook || !rels) return {};
  const alvos = new Map<string, string>();
  for (const m of rels.matchAll(/<(?:[\w.-]+:)?Relationship\b([^>]*)>/g)) {
    const a = atributos(m[1]);
    if (a.Id) alvos.set(a.Id, a.Target ?? "");
  }
  const folhas = [...workbook.matchAll(/<(?:[\w.-]+:)?sheet\b([^>]*)>/g)].map((m) => atributos(m[1]));
  const vista = /<(?:[\w.-]+:)?workbookView\b([^>]*)>/.exec(workbook);
  const ativa = folhas[Number((vista && atributos(vista[1]).activeTab) ?? 0)] ?? folhas[0];
  const alvo = ativa && alvos.get(ativa.id);
  if (!alvo) return {};
  const folha = ler(caminhoDoAlvo(alvo));
  if (!folha) return {};
  const dimensao = /<(?:[\w.-]+:)?dimension\b([^>]*)>/.exec(folha);
  const dados = /<(?:[\w.-]+:)?sheetData\b/.exec(folha);
  if (!dimensao || (dados && dados.index < dimensao.index)) return {};
  const ref = atributos(dimensao[1]).ref;
  if (ref === undefined) throw folhasIlegiveis();
  return limitesDaDimensao(ref);
}

function lerXlsxDoPlano(bytes: Uint8Array): LinhaDoPlano[] {
  validarZip(bytes);
  const dimensao = dimensaoDaFolhaAtiva(bytes);
  // O original para de ler ao estourar um limite; ler além disso não muda o resultado e evita montar
  // milhões de linhas vazias quando a dimensão declarada é enorme.
  let maxLinha = Math.min(dimensao.maxLinha ?? Infinity, MAX_LINHAS_BUSCA_CABECALHO + MAX_XLSX_LINHAS + 1);
  if ((dimensao.maxColuna ?? 0) > MAX_XLSX_COLUNAS) maxLinha = Math.min(maxLinha, MAX_LINHAS_BUSCA_CABECALHO);
  let linhas: Celula[][];
  try {
    const folha = lerXlsx(bytes, { folhas: "ativa", maxLinha, maxColuna: dimensao.maxColuna })[0];
    linhas = folha?.linhas ?? [];
  } catch (e) {
    throw new ErroPlanilhaDoPlano(`Erro ao ler XLSX: ${e instanceof Error ? e.message : String(e)}`);
  }

  for (let i = 0; i < Math.min(linhas.length, MAX_LINHAS_BUSCA_CABECALHO); i++) {
    if (!linhas[i].length) continue;
    const cabecalho = normalizarCabecalho(linhas[i]);
    if (!pareceCabecalho(cabecalho)) continue;
    if (cabecalho.length > MAX_XLSX_COLUNAS) {
      throw new ErroPlanilhaDoPlano(`Planilha excede o limite de ${MAX_XLSX_COLUNAS} colunas.`);
    }
    return linhasEmDicionarios(cabecalho, linhas.slice(i + 1), i + 2, MAX_XLSX_LINHAS, MAX_XLSX_CELULAS);
  }
  throw new ErroPlanilhaDoPlano(
    `Cabeçalho não encontrado nas primeiras ${MAX_LINHAS_BUSCA_CABECALHO} linhas — a planilha precisa ter uma linha com as colunas "Código"/"Classificação" e "Descrição".`,
  );
}

// ─── CSV ────────────────────────────────────────────────────────────────────

/** `csv.excel`: o dialeto do original quando o Sniffer não decide (vírgula). */
const EXCEL: Dialeto = { delimitador: ",", aspas: '"', aspasDuplas: true, pularEspacoInicial: false };

const LIMITE_DO_CAMPO = 131072;

/**
 * `list(csv.reader(StringIO(texto), dialeto))` com o `newline="\n"` padrão do `StringIO`: as linhas
 * só quebram em "\n". Sem "\r" solto, isso é o mesmo que o `newline=""` de `lerCsvTexto`, que fica
 * com o caso comum. Com "\r" solto, a máquina de estados do `_csv.c` roda aqui sobre essas linhas:
 * fora de aspas, o "\r" vira fim de linha e qualquer coisa depois dele na mesma linha é erro.
 */
function lerCsvComoStringIO(texto: string, d: Dialeto): string[][] {
  if (!/\r(?!\n)/.test(texto)) return lerCsvTexto(texto, d);

  type Estado = "inicioRegistro" | "inicioCampo" | "campo" | "aspas" | "aspaNasAspas" | "comerFimDeLinha";
  const FIM = null;
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
  const fimDeCampo = (c: string | null) => {
    salvar();
    estado = c === FIM ? "inicioRegistro" : "comerFimDeLinha";
  };
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
        if (c === "\n" || c === "\r" || c === FIM) fimDeCampo(c);
        else if (c === d.aspas) estado = "aspas";
        else if (c === " " && d.pularEspacoInicial) {
          /* espaço no começo do campo é ignorado */
        } else if (c === d.delimitador) salvar();
        else {
          juntar(c);
          estado = "campo";
        }
        return;
      case "campo":
        if (c === "\n" || c === "\r" || c === FIM) fimDeCampo(c);
        else if (c === d.delimitador) {
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
        } else if (c === "\n" || c === "\r" || c === FIM) fimDeCampo(c);
        else {
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

  const linhas = texto.match(/[^\n]*\n|[^\n]+$/g) ?? [];
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

function lerCsvDoPlano(bytes: Uint8Array): LinhaDoPlano[] {
  let texto: string;
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes); // utf-8-sig: o TextDecoder tira o BOM
  } catch {
    texto = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  }
  // `texto[:4096]` conta caractere (code point), não unidade UTF-16; o Sniffer vê o texto cru, com "\r".
  let amostra = "";
  let n = 0;
  for (const c of texto) {
    if (n++ >= 4096) break;
    amostra += c;
  }
  const dialeto = farejar(amostra, ",;\t") ?? EXCEL;
  let linhas: string[][];
  try {
    linhas = lerCsvComoStringIO(texto, dialeto);
  } catch (e) {
    // No original, o `csv.Error` não era tratado e a tela recebia um erro 500.
    if (e instanceof ErroCsv) throw new ErroPlanilhaDoPlano(`Não foi possível ler o CSV: ${e.message}`);
    throw e;
  }
  if (!linhas.length) throw new ErroPlanilhaDoPlano("CSV vazio.");

  for (let i = 0; i < Math.min(linhas.length, MAX_LINHAS_BUSCA_CABECALHO); i++) {
    if (!linhas[i].some((c) => strip(c))) continue;
    const cabecalho = normalizarCabecalho(linhas[i]);
    if (pareceCabecalho(cabecalho)) return linhasEmDicionarios(cabecalho, linhas.slice(i + 1), i + 2);
  }
  throw new ErroPlanilhaDoPlano(
    `Cabeçalho não encontrado nas primeiras ${MAX_LINHAS_BUSCA_CABECALHO} linhas — o CSV precisa ter uma linha com as colunas "Código"/"Classificação" e "Descrição".`,
  );
}

// ─── Linhas → registros ───────────────────────────────────────────────────

/** `_rows_to_dicts`: os limites contam também as linhas vazias, e a coluna repetida fica com a última. */
function linhasEmDicionarios(
  cabecalho: readonly string[],
  linhas: readonly (readonly Celula[])[],
  primeiraLinha: number,
  maxLinhas?: number,
  maxCelulas?: number,
): LinhaDoPlano[] {
  const resultado: LinhaDoPlano[] = [];
  linhas.forEach((linha, k) => {
    if (maxLinhas !== undefined && k >= maxLinhas) throw new ErroPlanilhaDoPlano(`Planilha excede o limite de ${maxLinhas} linhas.`);
    if (maxCelulas !== undefined && (k + 1) * cabecalho.length > maxCelulas) {
      throw new ErroPlanilhaDoPlano(`Planilha excede o limite de ${maxCelulas} células.`);
    }
    const d = new Map<string, string>();
    for (let j = 0; j < Math.min(cabecalho.length, linha.length); j++) {
      const c = linha[j];
      d.set(cabecalho[j], c === null ? "" : strip(strPy(c)));
    }
    const codigo = d.get("codigo") ?? "";
    const descricao = d.get("descricao") ?? "";
    if (!codigo && !descricao) return; // linha vazia
    const registro: LinhaDoPlano = {
      linha: primeiraLinha + k,
      codigo,
      descricao,
      tipo: d.get("tipo") ?? "",
      tipo_sa: d.get("tipo_sa") ?? "A",
    };
    const contaNumero = d.get("conta_numero");
    if (contaNumero !== undefined) registro.conta_numero = contaNumero;
    resultado.push(registro);
  });
  return resultado;
}
