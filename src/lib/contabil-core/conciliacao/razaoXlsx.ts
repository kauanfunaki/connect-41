// O que o Razão precisa do .xlsx além das células (Bloco B, 11/11/2026): as coordenadas e a
// dimensão declarada, lidas do XML como o openpyxl 3.1 e o `iterparse` do original leem.
//
// - `apoio.py` confere as coordenadas REAIS de cada folha antes de abrir a planilha;
// - `concilpro/planilha.py` abre sem `reset_dimensions()`: a dimensão declarada (`<dimension
//   ref="A1:M40"/>`) corta as linhas e fixa a largura de cada uma, e uma dimensão inválida faz o
//   `load_workbook` falhar.

import { strFromU8, unzipSync } from "fflate";
import { inteiro, re, strip } from "../extrato/py";
import { erroPython } from "./razaoTipos";

// ─── Números e coordenadas (openpyxl/utils/cell.py) ─────────────────────────

/** `int(texto)` do Python: espaço nas pontas, sinal, `_` entre dígitos e dígito de qualquer escrita. */
export function intPy(texto: string): number {
  const m = /^([+-]?)(\p{Nd}+(?:_\p{Nd}+)*)$/u.exec(strip(texto));
  if (!m) throw erroPython("ValueError", `invalid literal for int() with base 10: '${texto}'`);
  const n = inteiro(m[2].replaceAll("_", ""));
  return m[1] === "-" ? -n : n;
}

/** `column_index_from_string`: "A" = 1 … "ZZZ" = 18278. */
export function indiceDaColuna(coluna: string): number {
  const c = coluna.toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(c)) throw erroPython("ValueError", `${coluna} is not a valid column name`);
  let n = 0;
  for (const letra of c) n = n * 26 + letra.charCodeAt(0) - 64;
  return n;
}

const INTERVALO = re("^[$]?(?P<min_col>[A-Za-z]{1,3})?[$]?(?P<min_row>\\d+)?(:[$]?(?P<max_col>[A-Za-z]{1,3})?[$]?(?P<max_row>\\d+)?)?$");

/** `range_boundaries`: (coluna mínima, linha mínima, coluna máxima, linha máxima). */
export function limitesDoIntervalo(ref: string): [number | null, number | null, number | null, number | null] {
  const invalido = () => erroPython("ValueError", `${ref} is not a valid coordinate or range`);
  const m = INTERVALO.match(ref);
  if (!m) throw invalido();
  const [minCol, minRow, sep, maxCol, maxRow] = [m.grupo(1), m.grupo(2), m.grupo(3), m.grupo(4), m.grupo(5)];
  if (sep) {
    const todos = (xs: (string | null)[]) => xs.every((x) => x);
    const algum = (xs: (string | null)[]) => xs.some((x) => x);
    const cols = [minCol, maxCol];
    const rows = [minRow, maxRow];
    if (!(todos([...cols, ...rows]) || (todos(cols) && !algum(rows)) || (todos(rows) && !algum(cols)))) throw invalido();
  }
  const c0 = minCol !== null ? indiceDaColuna(minCol) : null;
  const r0 = minRow !== null ? intPy(minRow) : null;
  return [c0, r0, maxCol !== null ? indiceDaColuna(maxCol) : c0, maxRow !== null ? intPy(maxRow) : r0];
}

/** `coordinate_to_tuple` do openpyxl 3.1: (linha, coluna), cortando no primeiro dígito ASCII. */
export function coordenada(endereco: string): [number, number] {
  const cs = Array.from(endereco);
  let idx = cs.findIndex((c) => c >= "0" && c <= "9");
  if (idx < 0) idx = cs.length - 1;
  return [intPy(cs.slice(idx).join("")), indiceDaColuna(cs.slice(0, idx).join(""))];
}

// ─── XML em eventos ─────────────────────────────────────────────────────────

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function decodificar(t: string): string {
  return t.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (m, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTIDADES[e] ?? m;
  });
}

export type EventoXml = {
  tipo: "inicio" | "fim";
  /** O nome local (sem namespace), como `tag.rsplit("}", 1)[-1]`. */
  nome: string;
  /** Atributos sem prefixo (`elemento.get("r")`). */
  atributos: Map<string, string>;
  /** Todos os atributos pelo nome local, inclusive os com prefixo (`r:id`). */
  locais: Map<string, string>;
};

/** Os eventos "start" e "end" do `iterparse`, em ordem. Elemento vazio dá os dois. */
export function* eventosXml(xml: string): Generator<EventoXml> {
  const tag = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<(\/?)([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  for (let m = tag.exec(xml); m; m = tag.exec(xml)) {
    if (!m[2]) continue;
    const nome = m[2].slice(m[2].indexOf(":") + 1);
    const atributos = new Map<string, string>();
    const locais = new Map<string, string>();
    if (m[1] === "/") {
      yield { tipo: "fim", nome, atributos, locais };
      continue;
    }
    for (const a of m[3].matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      // Normalização do valor de atributo do XML: quebra e tabulação literais viram espaço.
      const valor = decodificar((a[2] ?? a[3]).replace(/\r\n|[\t\n\r]/g, " "));
      if (!a[1].includes(":")) atributos.set(a[1], valor);
      if (!a[1].startsWith("xmlns")) locais.set(a[1].slice(a[1].indexOf(":") + 1), valor);
    }
    yield { tipo: "inicio", nome, atributos, locais };
    if (m[4] === "/") yield { tipo: "fim", nome, atributos, locais };
  }
}

// ─── Dimensão declarada (read_only sem reset_dimensions) ────────────────────

export type Dimensao = { maxColuna: number | null; maxLinha: number | null };

/** `ReadOnlyWorksheet._get_size`: a `<dimension>` que aparece antes do fim de `<sheetData>`. */
function dimensaoDaFolha(xml: string): Dimensao {
  for (const e of eventosXml(xml)) {
    if (e.tipo !== "fim") continue;
    if (e.nome === "dimension") {
      const ref = e.atributos.get("ref");
      if (ref === undefined) {
        throw erroPython("TypeError", "<class 'openpyxl.worksheet.dimensions.SheetDimension'>.ref should be <class 'str'> but value is <class 'NoneType'>");
      }
      const [, , maxColuna, maxLinha] = limitesDoIntervalo(ref);
      return { maxColuna, maxLinha };
    }
    if (e.nome === "sheetData") break;
  }
  return { maxColuna: null, maxLinha: null };
}

/** O caminho de um alvo de relacionamento a partir do arquivo que o declara. */
function caminho(base: string, alvo: string): string {
  if (alvo.startsWith("/")) return alvo.slice(1);
  const partes = base.split("/").slice(0, -1);
  for (const p of alvo.split("/")) {
    if (p === "..") partes.pop();
    else if (p !== ".") partes.push(p);
  }
  return partes.join("/");
}

/**
 * A dimensão declarada de cada folha de dados, na ordem do livro, como o `load_workbook(read_only=True)`
 * lê ao abrir: uma dimensão inválida em QUALQUER folha derruba a abertura com o `ValueError` do
 * openpyxl. Arquivo que não abre aqui é deixado para o leitor de células, que dá o erro dele.
 */
export function dimensoesDoXlsx(bytes: Uint8Array): Dimensao[] {
  let arquivos: Record<string, Uint8Array>;
  try {
    arquivos = unzipSync(bytes, { filter: (f) => /\.(xml|rels)$/i.test(f.name) });
  } catch {
    return [];
  }
  const ler = (nome: string) => (arquivos[nome] ? strFromU8(arquivos[nome]) : null);
  const workbook = ler("xl/workbook.xml");
  if (workbook === null) return [];
  const alvos = new Map<string, { tipo: string; alvo: string }>();
  for (const e of eventosXml(ler("xl/_rels/workbook.xml.rels") ?? "")) {
    if (e.tipo === "inicio" && e.nome === "Relationship") alvos.set(e.atributos.get("Id") ?? "", { tipo: e.atributos.get("Type") ?? "", alvo: e.atributos.get("Target") ?? "" });
  }
  const dimensoes: Dimensao[] = [];
  for (const e of eventosXml(workbook)) {
    if (e.tipo !== "inicio" || e.nome !== "sheet") continue;
    const rel = alvos.get(e.locais.get("id") ?? "");
    if (!rel) continue;
    const xml = ler(caminho("xl/workbook.xml", rel.alvo));
    if (xml === null || rel.tipo.includes("chartsheet")) continue;
    let dimensao: Dimensao;
    try {
      dimensao = dimensaoDaFolha(xml);
    } catch (erro) {
      if (erro instanceof Error && erro.name === "ValueError") {
        throw erroPython(
          "ValueError",
          "Unable to read workbook: could not read worksheets from None.\n" +
            "This is most probably because the workbook source files contain some invalid XML.\n" +
            "Please see the exception for more details.",
        );
      }
      throw erro;
    }
    if (rel.tipo.endsWith("/worksheet")) dimensoes.push(dimensao);
  }
  return dimensoes;
}
