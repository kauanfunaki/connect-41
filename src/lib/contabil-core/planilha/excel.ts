// Leitura limitada de planilha Excel para as importações de cadastro (Fase 3b, 10/11/2026): porte
// de `ler_planilhas_excel` (`contrapartes/relatorio.py`), que as relações fiscais de clientes e
// fornecedores e o modelo de regras compartilham.
//
// - .xlsx: todas as folhas, com a conferência do zip (entradas, tamanho descompactado e taxa de
//   compressão), no máximo 20 folhas, 10.000 linhas, 100 colunas e 500.000 células;
// - .xls: os mesmos limites, e uma correção estrita para o defeito dos relatórios do sistema
//   fiscal: o BOUNDSHEET aponta para registros BLANK logo antes do BOF da folha. O Excel ignora
//   esse preâmbulo; o xlrd recusa. A correção só avança sobre BLANK de 6 bytes e exige achar,
//   logo depois, o BOF de uma worksheet.
// As células vazias no fim de cada linha saem, como no original.

import { unzipSync } from "fflate";
import { strDatahora, type Celula } from "./celula";
import { lerXls, streamDoLivro, xldateComoTupla, type LivroXls } from "./xls";
import { lerXlsx } from "./xlsx";

export class ErroDeRelatorio extends Error {
  constructor(
    readonly motivo: string,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroDeRelatorio";
  }
}

export type PlanilhaExcel = { nome: string; linhas: Celula[][] };

const MAX_ARQUIVO = 25 * 1024 * 1024;
export const MAX_PLANILHAS = 20;
export const MAX_LINHAS = 10_000;
export const MAX_COLUNAS = 100;
export const MAX_CELULAS = 500_000;
const MAX_ENTRADAS_XLSX = 1_000;
const MAX_XLSX_DESCOMPACTADO = 100 * 1024 * 1024;
const MAX_RAZAO_COMPRESSAO = 200;

const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const comeca = (b: Uint8Array, a: readonly number[]) => a.every((x, i) => b[i] === x);

/** `ler_planilhas_excel` */
export function lerPlanilhasExcel(bytes: Uint8Array, nomeArquivo: string): PlanilhaExcel[] {
  const nome = nomeArquivo.trim().toLowerCase();
  if (!nome.endsWith(".xlsx") && !nome.endsWith(".xls")) {
    throw new ErroDeRelatorio("extensao_nao_suportada", "Envie uma planilha com extensão XLSX ou XLS.");
  }
  if (!bytes.length) throw new ErroDeRelatorio("arquivo_vazio", "O arquivo enviado está vazio.");
  if (bytes.length > MAX_ARQUIVO) throw new ErroDeRelatorio("arquivo_excede_limite", "A relação excede o limite de 25 MB.");
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return lerComoXlsx(bytes);
  if (comeca(bytes, OLE)) return lerComoXls(bytes);
  throw new ErroDeRelatorio("formato_nao_suportado", "Envie uma planilha Excel nos formatos XLSX ou XLS.");
}

/** `_validar_xlsx_compactado`: confere o zip antes de abrir (bomba de zip). */
export function validarXlsxCompactado(bytes: Uint8Array): void {
  const entradas: { tamanho: number; compactado: number }[] = [];
  try {
    unzipSync(bytes, {
      filter: (f) => {
        entradas.push({ tamanho: f.originalSize, compactado: f.size });
        return false;
      },
    });
  } catch {
    throw new ErroDeRelatorio("xlsx_invalido", "O arquivo XLSX está corrompido.");
  }
  if (entradas.length > MAX_ENTRADAS_XLSX) throw new ErroDeRelatorio("xlsx_inseguro", "O arquivo XLSX possui entradas internas demais.");
  if (entradas.reduce((s, e) => s + e.tamanho, 0) > MAX_XLSX_DESCOMPACTADO) {
    throw new ErroDeRelatorio("xlsx_inseguro", "O arquivo XLSX excede o limite descompactado de 100 MB.");
  }
  for (const e of entradas) {
    if (!e.tamanho) continue;
    if (e.compactado === 0) throw new ErroDeRelatorio("xlsx_inseguro", "O arquivo XLSX possui uma entrada interna inválida.");
    if (e.tamanho / e.compactado > MAX_RAZAO_COMPRESSAO) throw new ErroDeRelatorio("xlsx_inseguro", "O arquivo XLSX possui taxa de compressão insegura.");
  }
}

function lerComoXlsx(bytes: Uint8Array): PlanilhaExcel[] {
  validarXlsxCompactado(bytes);
  let folhas;
  try {
    folhas = lerXlsx(bytes, { folhas: "todas", maxLinha: MAX_LINHAS + 1, maxColuna: MAX_COLUNAS + 1 });
  } catch {
    throw new ErroDeRelatorio("xlsx_invalido", "Não foi possível abrir o arquivo XLSX.");
  }
  if (folhas.length > MAX_PLANILHAS) throw new ErroDeRelatorio("planilhas_excedem_limite", `O arquivo possui mais de ${MAX_PLANILHAS} planilhas.`);
  return folhas.map((f) => {
    const linhas: Celula[][] = [];
    let celulas = 0;
    f.linhas.forEach((linha, i) => {
      const valores = [...linha];
      while (valores.length && valores[valores.length - 1] === null) valores.pop();
      if (valores.length > MAX_COLUNAS) throw new ErroDeRelatorio("colunas_excedem_limite", `A planilha possui mais de ${MAX_COLUNAS} colunas.`);
      if (i + 1 > MAX_LINHAS) throw new ErroDeRelatorio("linhas_excedem_limite", `A planilha possui mais de ${MAX_LINHAS} linhas.`);
      celulas += valores.length;
      if (celulas > MAX_CELULAS) throw new ErroDeRelatorio("celulas_excedem_limite", `A planilha possui mais de ${MAX_CELULAS} células.`);
      linhas.push(valores);
    });
    return { nome: f.nome, linhas };
  });
}

function lerComoXls(bytes: Uint8Array): PlanilhaExcel[] {
  let livro: LivroXls;
  try {
    livro = lerXls(bytes);
  } catch (e) {
    const erro = e as Error;
    if (!(erro.name === "XLRDError" && erro.message.includes("Expected BOF record"))) {
      throw new ErroDeRelatorio("xls_invalido", "Não foi possível abrir o arquivo XLS.");
    }
    try {
      livro = lerXls(corrigirBoundsheetsComBlanks(bytes));
    } catch {
      throw new ErroDeRelatorio("xls_boundsheet_invalido", "O arquivo XLS possui uma estrutura de planilha incompatível.");
    }
  }
  if (livro.folhas.length > MAX_PLANILHAS) throw new ErroDeRelatorio("planilhas_excedem_limite", `O arquivo possui mais de ${MAX_PLANILHAS} planilhas.`);
  let total = 0;
  return livro.folhas.map((folha) => {
    const nrows = folha.linhas.length;
    const ncols = nrows ? folha.linhas[0].length : 0;
    if (nrows > MAX_LINHAS) throw new ErroDeRelatorio("linhas_excedem_limite", `A planilha possui mais de ${MAX_LINHAS} linhas.`);
    if (ncols > MAX_COLUNAS) throw new ErroDeRelatorio("colunas_excedem_limite", `A planilha possui mais de ${MAX_COLUNAS} colunas.`);
    total += nrows * ncols;
    if (total > MAX_CELULAS) throw new ErroDeRelatorio("celulas_excedem_limite", `O arquivo possui mais de ${MAX_CELULAS} células.`);
    const linhas = folha.linhas.map((linha) => {
      const valores: Celula[] = linha.map((c): Celula => {
        if (c.tipo === "data") {
          const [a, m, d, h, mi, s] = xldateComoTupla(Number(c.valor), livro.datemode);
          return { tipo: "datahora", valor: strDatahora(a, m, d, h, mi, s) };
        }
        if (c.tipo === "texto") return String(c.valor);
        if (c.tipo === "numero") return { tipo: "float", valor: Number(c.valor) };
        if (c.tipo === "booleano" || c.tipo === "erro") return { tipo: "int", valor: BigInt(Number(c.valor)) };
        return "";
      });
      while (valores.length && (valores[valores.length - 1] === null || valores[valores.length - 1] === "")) valores.pop();
      return valores;
    });
    return { nome: folha.nome, linhas };
  });
}

// ─── A correção dos relatórios fiscais ──────────────────────────────────────

const BIFF_BOF = 0x0809;
const BIFF_BOUNDSHEET = 0x0085;
const BIFF_BLANK = 0x0201;
const BIFF_WORKSHEET = 0x0010;

/** `_corrigir_boundsheets_com_blanks`: o stream BIFF com só esse defeito corrigido. */
export function corrigirBoundsheetsComBlanks(bytes: Uint8Array): Uint8Array {
  const original = streamDoLivro(bytes);
  if (!original) throw new Error("stream Workbook ausente");
  const stream = new Uint8Array(original);
  const v = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  const boundsheets = registrosBiff(stream)
    .filter(([, registro]) => registro === BIFF_BOUNDSHEET)
    .map(([posicao]) => posicao);
  if (!boundsheets.length) throw new Error("registro BOUNDSHEET ausente");
  let alterou = false;
  const destinos = new Set<number>();
  for (const posicao of boundsheets) {
    if (v.getUint16(posicao + 2, true) < 4) throw new Error("registro BOUNDSHEET truncado");
    const declarado = v.getUint32(posicao + 4, true);
    const real = avancarBlanksAteBof(stream, v, declarado);
    if (destinos.has(real)) throw new Error("duas planilhas apontam para o mesmo BOF");
    destinos.add(real);
    if (real !== declarado) {
      v.setUint32(posicao + 4, real, true);
      alterou = true;
    }
  }
  if (!alterou) throw new Error("nenhum BOUNDSHEET com preâmbulo BLANK encontrado");
  return stream;
}

function registrosBiff(stream: Uint8Array): [number, number, number][] {
  const v = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  const resto0 = (p: number) => stream.subarray(p).every((b) => b === 0);
  const registros: [number, number, number][] = [];
  let posicao = 0;
  while (posicao < stream.length) {
    if (posicao + 4 > stream.length) {
      if (resto0(posicao)) break;
      throw new Error("cabeçalho BIFF truncado");
    }
    const registro = v.getUint16(posicao, true);
    const tamanho = v.getUint16(posicao + 2, true);
    // O stream pode terminar em zeros de preenchimento até o fim do setor.
    if (registro === 0 && tamanho === 0 && resto0(posicao)) break;
    const fim = posicao + 4 + tamanho;
    if (fim > stream.length) throw new Error("payload BIFF truncado");
    registros.push([posicao, registro, tamanho]);
    posicao = fim;
  }
  return registros;
}

function avancarBlanksAteBof(stream: Uint8Array, v: DataView, inicio: number): number {
  if (inicio < 0 || inicio + 4 > stream.length) throw new Error("offset BOUNDSHEET fora do stream");
  let posicao = inicio;
  for (;;) {
    if (posicao + 4 > stream.length) throw new Error("preâmbulo da planilha truncado");
    const registro = v.getUint16(posicao, true);
    const tamanho = v.getUint16(posicao + 2, true);
    const fim = posicao + 4 + tamanho;
    if (fim > stream.length) throw new Error("registro do preâmbulo truncado");
    if (registro === BIFF_BLANK && tamanho === 6) {
      posicao = fim;
      continue;
    }
    if (registro !== BIFF_BOF || tamanho < 4) throw new Error("BOUNDSHEET não aponta para BLANKs seguidos do BOF");
    if (v.getUint16(posicao + 6, true) !== BIFF_WORKSHEET) throw new Error("BOF encontrado não é de worksheet");
    return posicao;
  }
}
