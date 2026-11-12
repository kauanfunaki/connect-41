import "server-only";

// Os documentos do financeiro (Bloco B, Fase B4, 12/11/2026): leitura conferida, sem escrever
// lançamento. Porte de `conciliacao_bancaria/financeiro_documentos.py`.
//
// O layout é reconhecido pela estrutura, nunca pelo cliente nem pelo nome do arquivo:
// - planilha de pagamentos ou recebimentos (.xlsx/.xls): cabeçalho com nota, data, valor, categoria,
//   razão social e CNPJ/CPF da contraparte, e UM total declarado acima dele, que a soma tem de fechar;
// - visões de títulos (contas a pagar e a receber), em `financeiroTitulos.ts`;
// - PDF "Saldo em Conta Conciliado por Banco", lido pela posição de cada caractere: datas no formato
//   MM.DD.AA, saldo de cada movimento conferido com o anterior, total de cada dia e resumo final
//   (saldo inicial, créditos, débitos, saldo final) conferidos;
// - PDF de conta corrente do Omie, em `financeiroOmie.ts`.
//
// Crédito no relatório significa entrada; débito, saída. Nenhuma categoria vira conta contábil, o
// banco não é inferido do nome de nada e o CNPJ/CPF das linhas é da contraparte, nunca o da empresa.
// Linhas repetidas são mantidas (com aviso). PDF desconhecido é recusado, nunca aproveitado em parte.
//
// O PDF é lido pelos portes do pdfminer e do pdfplumber (`pdf/caracteres.ts`, `pdf/plumber.ts`), por
// isso este arquivo é só do servidor. O tempo-limite do original (30 s desde o começo da leitura do
// PDF, conferido no começo de cada página) inclui aqui a interpretação do PDF pelo pdf.js.

import { compara, dec, ehZero, modulo, oposto, soma, subtrai, texto as textoDec, type Dec } from "../motor/decimal";
import { ehVazia, type Celula } from "../planilha/celula";
import { caracteresDoPdf, contarPaginas, LimiteDePaginas, type PaginaComCaracteres } from "../pdf/caracteres";
import { extrairPalavras, extrairTexto, type Caractere, type Palavra } from "../pdf/plumber";
import { casefold } from "../motor/unicodePy";
import { inteiro, re, split, strip } from "../extrato/py";
import { LIMITES_APOIO, lerFolhas, validarXlsx, type LimitesApoio } from "./apoio";
import { TOLERANCIA } from "./razao";
import { RazaoApoioInvalido } from "./razaoTipos";
import type { DocumentoFinanceiro, LinhaFinanceiro } from "./financeiroTipos";
import {
  DINHEIRO,
  FinanceiroInvalido,
  MAX_BYTES_FINANCEIRO,
  MAX_CARACTERES_PAGINA,
  MAX_LINHAS_FINANCEIRO,
  MAX_PAGINAS_FINANCEIRO,
  MAX_SEGUNDOS_PDF,
  normalizarFinanceiro,
  textoFinanceiro,
  valorFinanceiro,
  dataFinanceiro,
} from "./financeiroComum";
import { lerOmie, reconheceOmie } from "./financeiroOmie";
import { lerFolhaTitulos, reconheceTitulos } from "./financeiroTitulos";
import { strptimeDmy } from "./folhas";

export { FinanceiroInvalido } from "./financeiroComum";

/** Os limites do original; os testes dele trocam algumas constantes, e o gabarito repete a troca. */
export type LimitesFinanceiro = { bytes: number; paginas: number; caracteresPagina: number; linhas: number };

export type OpcoesFinanceiro = {
  limites?: Partial<LimitesFinanceiro>;
  /** Os limites da leitura das planilhas (`apoio.py`). */
  limitesApoio?: Partial<LimitesApoio>;
  /** O `time.monotonic` do original, em segundos. */
  relogio?: () => number;
};

type Contexto = { limites: LimitesFinanceiro; limitesApoio: LimitesApoio; relogio: () => number };

function contexto(opcoes: OpcoesFinanceiro): Contexto {
  return {
    limites: { bytes: MAX_BYTES_FINANCEIRO, paginas: MAX_PAGINAS_FINANCEIRO, caracteresPagina: MAX_CARACTERES_PAGINA, linhas: MAX_LINHAS_FINANCEIRO, ...opcoes.limites },
    limitesApoio: { ...LIMITES_APOIO, ...opcoes.limitesApoio },
    relogio: opcoes.relogio ?? (() => performance.now() / 1000),
  };
}

const comeca = (b: Uint8Array, assinatura: number[]) => assinatura.every((x, i) => b[i] === x);
const ehZip = (b: Uint8Array) => comeca(b, [0x50, 0x4b]);
const ehOle = (b: Uint8Array) => comeca(b, [0xd0, 0xcf, 0x11, 0xe0]);
const ehPdf = (b: Uint8Array) => comeca(b, [0x25, 0x50, 0x44, 0x46]);

/** `PurePath(nome).suffix.casefold()` */
export function extensao(nome: string): string {
  const partes = nome.split("/").filter((p) => p && p !== ".");
  const ultimo = partes.length ? partes[partes.length - 1] : "";
  const i = ultimo.lastIndexOf(".");
  if (i <= 0 || i === ultimo.length - 1) return "";
  return casefold(ultimo.slice(i));
}

const FORMATO = "Formato não reconhecido. Envie XLS, XLSX ou PDF compatível.";
const PAGINAS = "O PDF deve conter entre 1 e 100 páginas.";

/**
 * `validar_conteudo`: tipo, tamanho e orçamento do arquivo, antes de qualquer leitor (também os do
 * SISPAG e do Razão). Não confere o layout. Assíncrona por causa do PDF.
 */
export async function validarConteudo(conteudo: Uint8Array, nomeArquivo: string, opcoes: OpcoesFinanceiro = {}): Promise<void> {
  const { limites, limitesApoio } = contexto(opcoes);
  if (!conteudo.length || conteudo.length > limites.bytes) throw new FinanceiroInvalido("Envie um documento de até 25 MB, não vazio.");
  const ext = extensao(nomeArquivo);
  try {
    if ((ext === ".xlsx" || ext === ".xls") && ehZip(conteudo)) {
      validarXlsx(conteudo, limitesApoio);
    } else if (ext === ".xls" && ehOle(conteudo)) {
      for (const folha of lerFolhas(conteudo, limitesApoio)) void folha;
    } else if (ext === ".pdf" && ehPdf(conteudo)) {
      const n = await contarPaginas(conteudo);
      if (!(n >= 1 && n <= limites.paginas)) throw new FinanceiroInvalido(PAGINAS);
    } else {
      throw new FinanceiroInvalido(FORMATO);
    }
  } catch (e) {
    if (e instanceof FinanceiroInvalido) throw e;
    throw new FinanceiroInvalido("Não foi possível abrir o documento ou seus limites de segurança foram excedidos.");
  }
}

/** A chave de um Decimal pelo valor (`Decimal("10.0") == Decimal("10.00")`). */
function chaveDec(d: Dec): string {
  if (ehZero(d)) return "0";
  let c = d.coeficiente;
  let e = d.expoente;
  while (c % BigInt(10) === BigInt(0)) {
    c /= BigInt(10);
    e += 1;
  }
  return `${d.negativo ? "-" : ""}${c}e${e}`;
}

/**
 * `ler_financeiro`: confere a planilha de pagamentos/recebimentos (ou de títulos) ou o PDF de saldo
 * conciliado (ou do Omie). Lança `FinanceiroInvalido` com a frase do original.
 */
export async function lerFinanceiro(conteudo: Uint8Array, nomeArquivo: string, opcoes: OpcoesFinanceiro = {}): Promise<DocumentoFinanceiro> {
  await validarConteudo(conteudo, nomeArquivo, opcoes);
  const ctx = contexto(opcoes);
  const ext = extensao(nomeArquivo);
  let documento: DocumentoFinanceiro;
  if (ext === ".pdf" && ehPdf(conteudo)) documento = await lerPdf(conteudo, ctx);
  else if ((ext === ".xls" || ext === ".xlsx") && (ehZip(conteudo) || ehOle(conteudo))) documento = lerPlanilha(conteudo, ctx);
  else throw new FinanceiroInvalido(FORMATO);
  if (!documento.linhas.length && !documento.titulosAbertos.length) {
    throw new FinanceiroInvalido("O documento do financeiro não contém movimentos conferidos.");
  }
  // A referência distingue ocorrências iguais; não é parte da assinatura.
  const assinaturas = new Map<string, number>();
  for (const l of documento.linhas) {
    const chave = JSON.stringify([l.data, chaveDec(l.valor), l.historico, l.favorecido, l.documento, l.categoria, l.parcela, l.banco, l.observacao, l.documentoFavorecido]);
    assinaturas.set(chave, (assinaturas.get(chave) ?? 0) + 1);
  }
  const repetidas = [...assinaturas.values()].filter((n) => n > 1).reduce((s, n) => s + n, 0);
  if (repetidas) {
    documento.avisos.push(`${repetidas} linhas têm os mesmos dados de outras linhas. ` + "Foram preservadas; confira se são movimentos distintos.");
  }
  return documento;
}

/** `ler_omie` com o PDF inteiro, como o gabarito o chama (`inicio_tempo` = agora). */
export async function lerOmieDoArquivo(conteudo: Uint8Array, opcoes: OpcoesFinanceiro = {}): Promise<DocumentoFinanceiro> {
  const { relogio } = contexto(opcoes);
  const inicio = relogio();
  return comoRecusaDoPdf(async () => lerOmie(await caracteresDoPdf(conteudo), inicio, relogio), false);
}

// ─── Planilhas ──────────────────────────────────────────────────────────────

type TipoPlanilha = "pagamentos" | "recebimentos";
const CABECALHOS: [TipoPlanilha, string[]][] = [
  ["pagamentos", ["nota fiscal", "pagamento", "valor pago", "categoria", "fornecedor (razao social)", "fornecedor (cnpj/cpf)"]],
  ["recebimentos", ["nota fiscal", "recebimento", "valor recebido", "categoria", "cliente (razao social)", "cliente (cnpj/cpf)"]],
];
const contar = (xs: readonly string[], x: string) => xs.filter((y) => y === x).length;

/** `_ler_planilha` */
function lerPlanilha(conteudo: Uint8Array, ctx: Contexto): DocumentoFinanceiro {
  const registros: LinhaFinanceiro[] = [];
  const abertos: LinhaFinanceiro[] = [];
  let visaoTitulos = false;
  try {
    for (const [folha, linhas] of lerFolhas(conteudo, ctx.limitesApoio)) {
      if (!linhas.some((linha) => linha.some((v) => !ehVazia(v)))) continue;
      if (reconheceTitulos(linhas)) {
        visaoTitulos = true;
        const [movimentos, pendentes] = lerFolhaTitulos(folha, linhas);
        registros.push(...movimentos);
        abertos.push(...pendentes);
        if (registros.length + abertos.length > ctx.limites.linhas) throw new FinanceiroInvalido("O documento excede 20.000 itens.");
        continue;
      }
      let cabecalho: { indice: number; tipo: TipoPlanilha; colunas: number[] } | null = null;
      for (const [indice, linha] of linhas.slice(0, 20).entries()) {
        const rotulos = linha.map(normalizarFinanceiro);
        for (const [tipo, esperados] of CABECALHOS) {
          if (esperados.every((r) => contar(rotulos, r) === 1)) {
            cabecalho = { indice, tipo, colunas: esperados.map((r) => rotulos.indexOf(r)) };
            break;
          }
        }
        if (cabecalho) break;
      }
      if (!cabecalho) {
        throw new FinanceiroInvalido(
          `A folha "${folha}" não corresponde ao modelo de pagamentos/recebimentos ` + "com nota, data, valor, categoria, razão social e CNPJ/CPF.",
        );
      }
      const { indice, tipo, colunas } = cabecalho;
      const celula = (linha: readonly Celula[], coluna: number): Celula => (coluna < linha.length ? linha[coluna] : null);
      const totais = linhas
        .slice(0, indice)
        .map((linha) => celula(linha, colunas[2]))
        .filter((v) => !ehVazia(v));
      if (totais.length !== 1) throw new FinanceiroInvalido(`A folha "${folha}" precisa de um total declarado acima do cabeçalho.`);
      const total = valorFinanceiro(totais[0], `total da folha "${folha}"`);
      let somaFolha = dec("0.00");
      const inicio = registros.length;
      for (const [k, linha] of linhas.slice(indice + 1).entries()) {
        const numero = indice + 2 + k;
        if (linha.every(ehVazia)) continue;
        const campos = colunas.map((c) => celula(linha, c));
        const ctxLinha = `folha "${folha}", linha ${numero}`;
        const data = dataFinanceiro(campos[1], ctxLinha);
        const valor = valorFinanceiro(campos[2], ctxLinha);
        if (ehZero(valor)) throw new FinanceiroInvalido(`Movimento sem valor positivo em ${ctxLinha}.`);
        const categoria = textoFinanceiro(campos[3]);
        const favorecido = textoFinanceiro(campos[4]);
        if (!categoria && !favorecido) throw new FinanceiroInvalido(`Movimento sem descrição em ${ctxLinha}.`);
        somaFolha = soma(somaFolha, valor);
        const documento = textoFinanceiro(campos[0]);
        const documentoFavorecido = textoFinanceiro(campos[5]);
        registros.push({
          data,
          valor: tipo === "pagamentos" ? oposto(valor) : valor,
          historico: [categoria, favorecido].filter(Boolean).join(" · "),
          favorecido,
          documento,
          categoria,
          parcela: null,
          banco: null,
          referencia: `Folha ${folha} · linha ${numero}`,
          observacao: null,
          documentoFavorecido,
        });
        if (registros.length > ctx.limites.linhas) throw new FinanceiroInvalido("O documento excede 20.000 movimentos.");
      }
      if (registros.length === inicio || compara(modulo(subtrai(total, somaFolha)), TOLERANCIA) > 0) {
        throw new FinanceiroInvalido(
          `A leitura da folha "${folha}" não fecha com seu total declarado ` + `(${textoDec(somaFolha)} × ${textoDec(total)}). Envie o relatório completo.`,
        );
      }
    }
  } catch (e) {
    if (e instanceof RazaoApoioInvalido) {
      throw new FinanceiroInvalido(
        "Não foi possível ler a planilha do financeiro, ou seus limites de segurança " + "foram excedidos. Divida o arquivo por período.",
      );
    }
    throw e;
  }
  return {
    linhas: registros,
    banco: null,
    cnpj: null,
    titulosAbertos: abertos,
    avisos: [
      "A planilha não identifica o banco nem o CNPJ da empresa emissora. " + "Confirme a empresa; o CNPJ/CPF das linhas pertence às contrapartes.",
      ...(visaoTitulos
        ? [
            "Títulos em aberto são apenas apoio: não participam dos totais ou vínculos. " +
              "Nas visões de títulos, o realizado é um total por título na data do último " +
              "pagamento, não um detalhamento das liquidações. Títulos sem valor realizado " +
              "nem saldo em aberto não geram itens de composição.",
          ]
        : []),
    ],
  };
}

// ─── PDF de saldo conciliado por banco ─────────────────────────────────────

type Char = Pick<Caractere, "text" | "x0" | "x1" | "top">;

/** `sorted(xs, key=...)` estável por uma chave numérica (ou um par). */
function ordenar<T>(xs: readonly T[], chave: (x: T) => [number, number] | number): T[] {
  return xs
    .map((x, i) => ({ x, i, k: chave(x) }))
    .sort((a, b) => {
      const ka = typeof a.k === "number" ? [a.k, 0] : a.k;
      const kb = typeof b.k === "number" ? [b.k, 0] : b.k;
      return ka[0] - kb[0] || ka[1] - kb[1] || a.i - b.i;
    })
    .map((p) => p.x);
}

/** `_linhas_chars`: separa as linhas de base, sem juntar letras de linhas sobrepostas no PDF. */
export function linhasDosCaracteres(chars: readonly Char[]): [number, string][] {
  const grupos: [number, Char[]][] = [];
  for (const c of ordenar(chars, (x) => [x.top, x.x0])) {
    if (!grupos.length || Math.abs(c.top - grupos[grupos.length - 1][0]) > 0.6) grupos.push([c.top, [c]]);
    else grupos[grupos.length - 1][1].push(c);
  }
  const resultado: [number, string][] = [];
  for (const [top, grupo] of grupos) {
    let partes = "";
    let anterior: number | null = null;
    for (const c of ordenar(grupo, (x) => x.x0)) {
      if (anterior !== null && c.x0 - anterior > 1.8) partes += " ";
      partes += c.text;
      anterior = c.x1;
    }
    const texto = split(partes).join(" ");
    if (texto) resultado.push([top, texto]);
  }
  return resultado;
}

const meio = (c: Char) => (c.x0 + c.x1) / 2;

/** `_campo`: o texto de uma coluna entre duas alturas, uma linha de base por trecho (" · "). */
function campo(chars: readonly Char[], esquerda: number, direita: number, inicio: number, fim: number): string {
  const escolhidos = chars.filter((c) => esquerda <= meio(c) && meio(c) < direita && inicio <= c.top && c.top < fim);
  return linhasDosCaracteres(escolhidos)
    .map(([, t]) => t)
    .join(" · ");
}

type Geometria = {
  data: number;
  tipo: number;
  nota: number;
  parcela: number;
  razao: number;
  credito: number;
  debito: number;
  saldo: number;
  forma: number;
  referente: number;
  natureza: number;
  top: number;
};
const NECESSARIOS = ["tipo", "par", "credito", "debito", "saldo", "referente", "natureza"];

/** `_geometria`: os limites das colunas pelo cabeçalho; não pressupõe banco nem cliente. */
function geometria(words: readonly Palavra[]): Geometria {
  for (const data of words.filter((w) => normalizarFinanceiro(w.text) === "data")) {
    const cab = words.filter((w) => Math.abs(w.top - data.top) < 1);
    const encontrados = new Map(cab.map((w) => [normalizarFinanceiro(w.text), w]));
    if (!NECESSARIOS.every((k) => encontrados.has(k))) continue;
    const nota = cab.find((w) => w.text === "N.");
    const razao = encontrados.get("razao");
    const forma = cab.find((w) => normalizarFinanceiro(w.text).includes("forma"));
    if (nota && razao && forma) {
      const x = (k: string) => encontrados.get(k)!.x0;
      return {
        data: data.x0,
        tipo: x("tipo"),
        nota: nota.x0,
        parcela: x("par"),
        razao: razao.x0,
        credito: x("credito") - 12,
        debito: x("debito") - 12,
        saldo: x("saldo") - 30,
        forma: forma.x0 + (normalizarFinanceiro(forma.text).includes("(r$)") ? 18 : 0),
        referente: x("referente"),
        natureza: x("natureza"),
        top: data.top,
      };
    }
  }
  throw new FinanceiroInvalido("O PDF não corresponde ao layout de saldo conciliado por banco.");
}

/** `_dinheiro_coluna`: (altura, valor) de cada linha da coluna que é dinheiro. */
function dinheiroColuna(chars: readonly Char[], esquerda: number, direita: number): [number, Dec][] {
  const resultado: [number, Dec][] = [];
  for (const [top, texto] of linhasDosCaracteres(chars.filter((c) => esquerda <= meio(c) && meio(c) < direita))) {
    const limpo = strip(texto.startsWith("R$") ? texto.slice(2) : texto);
    if (DINHEIRO.fullmatch(limpo)) resultado.push([top, valorFinanceiro(limpo, "coluna financeira do PDF", true)]);
  }
  return resultado;
}

const TITULO = re("Saldo em Conta Conciliado por Banco:\\s*([^\\n]+)");
const DATA_PDF = re("\\d{2}\\.\\d{2}\\.\\d{2}");
// O `%m.%d.%y` do `_strptime` do Python.
const MDY = re("(?P<m>1[0-2]|0[1-9]|[1-9])\\.(?P<d>3[01]|[12]\\d|0[1-9]|[1-9]| [1-9])\\.(?P<y>\\d\\d)");
const TIPO_MOVIMENTO = re("[1-5]\\s*-");

/** `datetime.strptime(texto, "%m.%d.%y").date()`, ou `null` no `ValueError`. */
function dataMdy(texto: string): string | null {
  const m = MDY.fullmatch(texto);
  if (!m) return null;
  const y = inteiro(m.grupo("y")!);
  return strptimeDmy(`${m.grupo("d")}/${m.grupo("m")}/${y < 69 ? 2000 + y : 1900 + y}`);
}

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Recusa vira recusa; qualquer outro erro do leitor vira a frase genérica do original. */
async function comoRecusaDoPdf<T>(fn: () => Promise<T>, conciliado = true): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof FinanceiroInvalido) throw e;
    if (!conciliado) throw e;
    throw new FinanceiroInvalido("Não foi possível ler o PDF conciliado do financeiro.");
  }
}

/** `_ler_pdf` */
function lerPdf(conteudo: Uint8Array, ctx: Contexto): Promise<DocumentoFinanceiro> {
  const { limites, relogio } = ctx;
  const inicioTempo = relogio();
  return comoRecusaDoPdf(async () => {
    let paginas: PaginaComCaracteres[];
    try {
      paginas = await caracteresDoPdf(conteudo, { maxPaginas: limites.paginas });
    } catch (e) {
      if (e instanceof LimiteDePaginas) throw new FinanceiroInvalido(PAGINAS);
      throw e;
    }
    if (!paginas.length) throw new FinanceiroInvalido(PAGINAS);
    const textoInicial = extrairTexto(paginas[0].caracteres);
    if (reconheceOmie(textoInicial)) return lerOmie(paginas, inicioTempo, relogio);
    return lerConciliado(paginas, textoInicial, inicioTempo, ctx);
  });
}

function lerConciliado(paginas: PaginaComCaracteres[], textoInicial: string, inicioTempo: number, { limites, relogio }: Contexto): DocumentoFinanceiro {
  const registros: LinhaFinanceiro[] = [];
  let saldoAnterior: Dec | null = null;
  let saldoInicial: Dec | null = null;
  let dataAtual: string | null = null;
  let somaCredito = dec("0.00");
  let somaDebito = dec("0.00");
  const totaisDiarios = new Map<string, [Dec, Dec]>();
  let totalFinal: Dec[] | null = null;
  const avisos = [
    "Datas do relatório de saldo conciliado são lidas como mês.dia.ano (MM.DD.AA).",
    "O PDF pode conter descrições cortadas ou sobrepostas na origem. " + "Consulte o documento original; nenhuma palavra ausente é inferida.",
  ];

  const titulo = TITULO.search(textoInicial);
  if (!titulo) throw new FinanceiroInvalido("PDF desconhecido. Envie um relatório de saldo em conta conciliado por banco.");
  const banco = strip(titulo.grupo(1)!);
  const g = geometria(extrairPalavras(paginas[0].caracteres));

  paginas.forEach((page, i) => {
    const pagina = i + 1;
    if (relogio() - inicioTempo > MAX_SEGUNDOS_PDF) throw new FinanceiroInvalido("A leitura excedeu o tempo limite; divida o PDF.");
    const chars = page.caracteres;
    if (chars.length > limites.caracteresPagina) throw new FinanceiroInvalido("Uma página excede o limite de texto permitido.");
    const words = extrairPalavras(chars);
    const dataInicioPagina = dataAtual;
    if (words.some((w) => normalizarFinanceiro(w.text) === "data")) {
      const gp = geometria(words);
      const campos = Object.keys(g).filter((k) => k !== "top") as (keyof Geometria)[];
      if (campos.some((k) => Math.abs(g[k] - gp[k]) > 1)) {
        throw new FinanceiroInvalido("O PDF altera a posição das colunas entre páginas. " + "Envie cada relatório separadamente.");
      }
    }
    const textoPagina = extrairTexto(chars);
    if (TITULO.findallTextos(textoPagina).some((t) => strip(t) !== banco)) {
      throw new FinanceiroInvalido("O PDF mistura relatórios de bancos diferentes.");
    }
    // O resumo final usa as mesmas colunas de crédito/débito/saldo, mas a primeira coluna é Saldo
    // Inicial em lugar de Razão.
    const resumo = words.find((w) => w.text === "Inicial");
    const fimDados = resumo ? resumo.top - 2 : page.altura - 20;
    if (resumo) {
      if (totalFinal !== null || pagina !== paginas.length) throw new FinanceiroInvalido("Resumo final duplicado ou fora da última página.");
      const valores: Dec[] = [];
      for (const [esquerda, direita] of [
        [g.razao, g.credito],
        [g.credito, g.debito],
        [g.debito, g.saldo],
        [g.saldo, g.forma],
      ]) {
        const candidatos = dinheiroColuna(chars, esquerda, direita).filter(([y]) => resumo.top + 5 <= y && y <= resumo.top + 20);
        if (candidatos.length !== 1) throw new FinanceiroInvalido("Resumo final incompleto no PDF.");
        valores.push(candidatos[0][1]);
      }
      totalFinal = valores;
    }
    const saldos = dinheiroColuna(chars, g.saldo, g.forma).filter(([y]) => y < fimDados && (pagina !== 1 || y > g.top + 5));
    const creditos = dinheiroColuna(chars, g.credito, g.debito);
    const debitos = dinheiroColuna(chars, g.debito, g.saldo);
    const separadores = [
      ...words.filter((w) => normalizarFinanceiro(w.text) === "data").map((w) => w.top),
      ...words.filter((w) => w.text === "R$").map((w) => w.top),
    ];
    const datasSaldos: [number, string | null][] = [[0, dataInicioPagina]];
    const naAltura = (lista: [number, Dec][], y: number) => lista.filter(([t]) => Math.abs(t - y) < 0.8).map(([, v]) => v);

    saldos.forEach(([y, novoSaldo], indice) => {
      let limite = indice + 1 < saldos.length ? saldos[indice + 1][0] - 2.4 : fimDados;
      const posteriores = separadores.filter((t) => y + 1 < t && t < limite);
      if (posteriores.length) limite = Math.min(...posteriores) - 1;
      const top = y - 2.4;
      const ctxMov = `página ${pagina}, movimento ${indice + 1}`;
      const dataTexto = campo(chars, g.data, g.tipo, top, limite);
      if (dataTexto) {
        if (!DATA_PDF.fullmatch(dataTexto)) throw new FinanceiroInvalido(`Data desconhecida em ${ctxMov}.`);
        const novaData = dataMdy(dataTexto);
        if (novaData === null) throw new FinanceiroInvalido(`Data inválida em ${ctxMov}.`);
        if (dataAtual !== null && novaData < dataAtual) throw new FinanceiroInvalido("Datas fora de ordem no PDF conciliado.");
        dataAtual = novaData;
      }
      if (dataAtual === null) throw new FinanceiroInvalido(`Movimento sem data em ${ctxMov}.`);
      datasSaldos.push([y, dataAtual]);
      const credito = naAltura(creditos, y);
      const debito = naAltura(debitos, y);
      let tipo = campo(chars, g.tipo, g.nota, top, limite);
      // O rótulo INICIAL/CREDITO/DEBITO da linha anterior pode sobrepor fisicamente o início do
      // movimento seguinte.
      const partesTipo = tipo.split(" · ");
      if (partesTipo.some((p) => TIPO_MOVIMENTO.match(p))) tipo = partesTipo.filter((p) => TIPO_MOVIMENTO.match(p)).join(" · ");
      if (saldoAnterior === null) {
        if (credito.length || debito.length || !tipo.includes("1-SALDO")) throw new FinanceiroInvalido("O relatório não informa saldo inicial conferível.");
        saldoAnterior = saldoInicial = novoSaldo;
        return;
      }
      if (credito.length + debito.length !== 1) throw new FinanceiroInvalido(`Movimento sem valor único em ${ctxMov}.`);
      const bruto = (credito.length ? credito : debito)[0];
      if (bruto.negativo || ehZero(bruto)) throw new FinanceiroInvalido(`Valor não positivo em ${ctxMov}.`);
      const valor = credito.length ? bruto : oposto(bruto);
      if (compara(modulo(subtrai(soma(saldoAnterior, valor), novoSaldo)), TOLERANCIA) > 0) {
        throw new FinanceiroInvalido(`Os movimentos não explicam a variação do saldo em ${ctxMov}. ` + "Envie o documento completo.");
      }
      saldoAnterior = novoSaldo;
      if (credito.length) somaCredito = soma(somaCredito, bruto);
      else somaDebito = soma(somaDebito, bruto);
      const favorecido = campo(chars, g.razao, g.credito, top, limite) || null;
      const categoria = campo(chars, g.natureza, page.largura, top, limite) || null;
      const referente = campo(chars, g.referente, g.natureza, top, limite);
      const forma = campo(chars, g.forma, g.referente, top, limite);
      const observacao = [forma, referente].filter(Boolean).join(" · ") || null;
      registros.push({
        data: dataAtual,
        valor,
        historico: [tipo, favorecido, referente].filter(Boolean).join(" · "),
        favorecido,
        documento: campo(chars, g.nota, g.parcela, top, limite) || null,
        categoria,
        parcela: campo(chars, g.parcela, g.razao, top, limite) || null,
        banco,
        referencia: `Página ${pagina} · movimento ${indice + 1}`,
        observacao,
        documentoFavorecido: null,
      });
      if (registros.length > limites.linhas) throw new FinanceiroInvalido("O PDF excede 20.000 movimentos.");
    });

    const alturas = [...new Set(words.filter((w) => w.text === "R$" && w.top < fimDados).map((w) => w.top))].sort((a, b) => a - b);
    for (const y of alturas) {
      const credito = naAltura(creditos, y);
      const debito = naAltura(debitos, y);
      const dataTotal = [...datasSaldos].reverse().find(([t]) => t < y)?.[1] ?? null;
      if (credito.length !== 1 || debito.length !== 1 || dataTotal === null) throw new FinanceiroInvalido(`Total diário incompleto na página ${pagina}.`);
      if (totaisDiarios.has(dataTotal)) throw new FinanceiroInvalido("O PDF repete o total declarado de uma data.");
      totaisDiarios.set(dataTotal, [credito[0], debito[0]]);
    }
  });

  if (totalFinal === null) throw new FinanceiroInvalido("O PDF não declara o resumo final de saldos e totais.");
  const declarado: Dec[] = totalFinal;
  const lidos = [saldoInicial, somaCredito, somaDebito, saldoAnterior];
  if (lidos.some((v, i) => v === null || compara(modulo(subtrai(v, declarado[i])), TOLERANCIA) > 0)) {
    throw new FinanceiroInvalido("Os valores extraídos não fecham com o resumo final do PDF.");
  }
  const zero = dec("0");
  const totaisLidos = new Map<string, [Dec, Dec]>();
  for (const r of registros) {
    const [entrada, saida] = totaisLidos.get(r.data) ?? [zero, zero];
    const positivo = !r.valor.negativo && !ehZero(r.valor);
    totaisLidos.set(r.data, [positivo ? soma(entrada, r.valor) : entrada, !positivo && !ehZero(r.valor) ? soma(saida, oposto(r.valor)) : saida]);
  }
  const mesmasDatas = totaisLidos.size === totaisDiarios.size && [...totaisLidos.keys()].every((d) => totaisDiarios.has(d));
  if (!mesmasDatas) throw new FinanceiroInvalido("O PDF não declara os totais de todos os dias com movimentos.");
  for (const [dataMovimento, declarados] of totaisDiarios) {
    const somas = totaisLidos.get(dataMovimento)!;
    if (somas.some((lido, i) => compara(modulo(subtrai(lido, declarados[i])), TOLERANCIA) > 0)) {
      throw new FinanceiroInvalido(`Os movimentos de ${dataBr(dataMovimento)} não fecham com o total diário.`);
    }
  }
  return { linhas: registros, banco, avisos, cnpj: null, titulosAbertos: [] };
}
