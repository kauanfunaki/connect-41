// Porte de `conciliacao_bancaria/apoio.py` (Bloco B, 11/11/2026): o Razão de OUTRAS contas, lido e
// conferido para a revisão manual.
//
// O resultado é só evidência documental: não classifica, não concilia por FIFO, não cria
// fornecedor nem grava lançamento. Débito e crédito mantêm a natureza declarada na conta de origem,
// inclusive em contas de impostos e provisões.
//
// - Planilha (.xlsx/.xls): todas as folhas, várias contas, e CADA conta precisa declarar o seu
//   "Total da conta" e fechar com ele. Documento e favorecido só saem de coluna explícita.
// - PDF: o leitor conferido de uma conta (`razao.ts`).
// - Limites por arquivo (linhas, células, colunas, folhas, tamanho descompactado), conferidos nas
//   coordenadas REAIS do XML antes de abrir o .xlsx: uma dimensão declarada errada não esconde uma
//   área enorme nem produz leitura parcial.

import { strFromU8, unzipSync } from "fflate";
import { re, split, strip } from "../extrato/py";
import { combinante } from "../motor/unicodePy";
import { compara, dec, decimal, ehZero, modulo, NAO_FINITO, oposto, somaTodos, subtrai, texto as textoDec, type Dec } from "../motor/decimal";
import { ehVazia, strPy, type Celula } from "../planilha/celula";
import { lerXls } from "../planilha/xls";
import { lerXlsx } from "../planilha/xlsx";
import { ehOle, ehPdf, ehZip, lerRazao, TOLERANCIA, type TextoDoPdf } from "./razao";
import {
  celulaDaColuna,
  decimalDaCelula,
  ehData,
  extrairCabecalho,
  inteiroComoTexto,
  localizarColunas,
  nomeDoFornecedor,
  quantizar,
  strptimeDMY,
  textoOuVazio,
  valorCelulaXls,
} from "./razaoPlanilha";
import { coordenada, eventosXml, intPy, limitesDoIntervalo } from "./razaoXlsx";
import { RazaoApoioInvalido, RazaoInvalido, type Colunas, type ContaApoio, type LinhaApoio, type RazaoApoio } from "./razaoTipos";

// Limites globais por arquivo, incluindo cabeçalhos e células vazias dentro da área declarada.
export const MAX_LINHAS_APOIO = 20_000;
export const MAX_CELULAS_APOIO = 500_000;
export const MAX_COLUNAS_APOIO = 128;
export const MAX_FOLHAS_APOIO = 32;
export const MAX_BYTES_EXPANDIDOS_APOIO = 64 * 1024 * 1024;

export type LimitesApoio = {
  linhas: number;
  celulas: number;
  colunas: number;
  folhas: number;
  bytesExpandidos: number;
};

export const LIMITES_APOIO: LimitesApoio = {
  linhas: MAX_LINHAS_APOIO,
  celulas: MAX_CELULAS_APOIO,
  colunas: MAX_COLUNAS_APOIO,
  folhas: MAX_FOLHAS_APOIO,
  bytesExpandidos: MAX_BYTES_EXPANDIDOS_APOIO,
};

export type OpcoesApoio = {
  /** O texto de cada página do PDF (`razaoPdf.ts`). Sem ele, o PDF é recusado. */
  textoDoPdf?: TextoDoPdf;
  /** Limites diferentes dos do original (os testes do original trocam as constantes). */
  limites?: Partial<LimitesApoio>;
};

const ROTULOS_OPCIONAIS: ["documento" | "favorecido", string[]][] = [
  ["documento", ["documento", "numero do documento", "numero documento", "no documento", "nota fiscal", "numero da nota fiscal", "nf"]],
  ["favorecido", ["favorecido", "fornecedor", "cliente", "fornecedor/cliente", "contraparte", "nome do fornecedor", "nome do cliente"]],
];
const NUMERO = re("(?:\\d+(?:[.,]\\d{1,2})?|\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?" + "|\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?)");
const ZERO = dec("0");
const ZERO_CENTAVOS = dec("0.00");

/**
 * `ler_razao_apoio`: XLS/XLSX com várias contas ou PDF conferido de uma única conta. Todas as contas
 * precisam declarar o seu "Total da conta". Lança `RazaoApoioInvalido`.
 */
export async function lerRazaoApoio(conteudo: Uint8Array, nome = "", opcoes: OpcoesApoio = {}): Promise<RazaoApoio> {
  if (ehPdf(conteudo)) return lerPdfApoio(conteudo, nome, opcoes.textoDoPdf);
  if (!ehZip(conteudo) && !ehOle(conteudo)) throw new RazaoApoioInvalido("Formato não reconhecido. Envie o Razão em XLSX, XLS ou PDF.");
  const limites = { ...LIMITES_APOIO, ...opcoes.limites };

  const resultado: RazaoApoio = { empresa: "", cnpj: "", periodoInicio: null, periodoFim: null, contas: [], linhas: [] };
  const blocosVistos = new Set<string>();
  // As folhas são lidas uma a uma, como o gerador do original: o erro de uma conta da primeira
  // folha aparece antes do limite estourado na segunda.
  for (const [nomeFolha, linhas] of lerFolhas(conteudo, limites)) {
    if (!linhas.some((linha) => linha.some((v) => v !== null && v !== ""))) continue;
    incorporarCabecalho(resultado, linhas, nomeFolha);
    const [contas, registros] = lerContas(linhas, nomeFolha, blocosVistos);
    resultado.contas.push(...contas);
    resultado.linhas.push(...registros);
  }
  if (!resultado.linhas.length) throw new RazaoApoioInvalido("O Razão auxiliar não contém lançamentos no período.");
  return resultado;
}

/** `max(a, b)` do Python: no empate, fica o primeiro (e o expoente dele). */
const maior = (a: Dec, b: Dec) => (compara(b, a) > 0 ? b : a);

async function lerPdfApoio(conteudo: Uint8Array, nome: string, textoDoPdf: TextoDoPdf | undefined): Promise<RazaoApoio> {
  let razao;
  try {
    razao = await lerRazao(conteudo, nome, textoDoPdf);
  } catch (e) {
    if (e instanceof RazaoInvalido) {
      throw new RazaoApoioInvalido(
        "Não foi possível conferir o PDF auxiliar. Para várias contas ou outro layout, " + `envie o Razão em XLSX ou XLS. ${e.message}`,
      );
    }
    throw e;
  }
  const conta: ContaApoio = {
    contaCodigo: razao.contaCodigo,
    contaClassificacao: razao.contaClassificacao,
    contaDescricao: razao.contaDescricao,
    totalDebito: razao.totalDebito,
    totalCredito: razao.totalCredito,
  };
  return {
    empresa: razao.empresa,
    cnpj: razao.cnpj,
    periodoInicio: razao.periodoInicio,
    periodoFim: razao.periodoFim,
    contas: [conta],
    linhas: razao.lancamentos.map((lanc) => ({
      data: lanc.data,
      contaCodigo: conta.contaCodigo,
      contaClassificacao: conta.contaClassificacao,
      contaDescricao: conta.contaDescricao,
      lote: lanc.lote,
      contrapartida: lanc.contrapartida,
      historico: lanc.historico,
      valorDebito: maior(lanc.valor, ZERO),
      valorCredito: maior(oposto(lanc.valor), ZERO),
      documento: null,
      favorecido: null,
    })),
  };
}

// ─── Orçamento de linhas e células ──────────────────────────────────────────

/** `_OrcamentoPlanilha` */
class Orcamento {
  linhas = 0;
  celulas = 0;
  constructor(private readonly limites: LimitesApoio) {}

  conferirDimensoes(linhas: number, colunas: number, folha: string): void {
    const l = this.limites;
    if (colunas > l.colunas) {
      throw new RazaoApoioInvalido(`A folha "${folha}" excede o limite de ${l.colunas} colunas. ` + "Remova áreas vazias formatadas ou divida o Razão.");
    }
    if (this.linhas + linhas > l.linhas) {
      throw new RazaoApoioInvalido(`O arquivo excede o limite de ${l.linhas} linhas entre todas as folhas. ` + "Divida o Razão por período ou conta.");
    }
    if (this.celulas + linhas * colunas > l.celulas) {
      throw new RazaoApoioInvalido(`O arquivo excede o limite de ${l.celulas} células. ` + "Remova áreas vazias formatadas ou divida o Razão.");
    }
  }
}

// ─── Conferência do .xlsx antes de abrir ────────────────────────────────────

/** `_validar_xlsx`: inspeciona o XML de cada folha antes de materializar a planilha. */
export function validarXlsx(conteudo: Uint8Array, limites: LimitesApoio): void {
  const orcamento = new Orcamento(limites);
  const entradas: { nome: string; tamanho: number }[] = [];
  unzipSync(conteudo, {
    filter: (f) => {
      entradas.push({ nome: f.name, tamanho: f.originalSize });
      return false;
    },
  });
  if (entradas.reduce((s, e) => s + e.tamanho, 0) > limites.bytesExpandidos) {
    throw new RazaoApoioInvalido("A planilha excede o limite de tamanho descompactado. " + "Divida o Razão por período ou conta.");
  }
  const folhas = entradas.filter((e) => e.nome.startsWith("xl/worksheets/") && e.nome.endsWith(".xml"));
  if (folhas.length > limites.folhas) throw new RazaoApoioInvalido(`O arquivo excede o limite de ${limites.folhas} folhas.`);
  const nomes = new Set(folhas.map((f) => f.nome));
  const arquivos = unzipSync(conteudo, { filter: (f) => nomes.has(f.name) });
  for (const entrada of folhas) {
    let linhas = 0;
    let colunas = 0;
    let ultimaLinha = 0;
    let colunaAtual = 0;
    for (const { tipo, nome, atributos } of eventosXml(strFromU8(arquivos[entrada.nome]))) {
      if (tipo !== "inicio") continue;
      if (nome === "dimension") {
        const ref = atributos.get("ref");
        if (ref === undefined) throw new Error("KeyError: ref");
        const [, , ultima, maiorLinha] = limitesDoIntervalo(ref);
        colunas = Math.max(colunas, ultima || 0);
        linhas = Math.max(linhas, maiorLinha || 0);
      } else if (nome === "row") {
        const r = atributos.get("r");
        ultimaLinha = r === undefined ? ultimaLinha + 1 : intPy(r);
        linhas = Math.max(linhas, ultimaLinha);
        colunaAtual = 0;
      } else if (nome === "c") {
        const endereco = atributos.get("r");
        const [linha, coluna] = endereco ? coordenada(endereco) : [ultimaLinha, colunaAtual + 1];
        linhas = Math.max(linhas, linha);
        colunas = Math.max(colunas, coluna);
        colunaAtual = coluna;
      }
      orcamento.conferirDimensoes(linhas, colunas, entrada.nome);
    }
    orcamento.linhas += linhas;
    orcamento.celulas += linhas * colunas;
  }
}

/** `_coletar_linhas`: cada linha passa pelo orçamento antes de entrar. */
function coletarLinhas(fonte: Iterable<Celula[]>, folha: string, orcamento: Orcamento): Celula[][] {
  const linhas: Celula[][] = [];
  for (const linha of fonte) {
    orcamento.conferirDimensoes(1, linha.length, folha);
    orcamento.linhas += 1;
    orcamento.celulas += linha.length;
    linhas.push(linha);
  }
  return linhas;
}

/** `_ler_folhas`: (nome, linhas) de cada folha, na ordem do arquivo. */
export function* lerFolhas(conteudo: Uint8Array, limites: LimitesApoio = LIMITES_APOIO): Generator<[string, Celula[][]]> {
  const orcamento = new Orcamento(limites);
  try {
    if (ehZip(conteudo)) {
      validarXlsx(conteudo, limites);
      const folhas = lerXlsx(conteudo, { folhas: "todas" });
      if (folhas.length > limites.folhas) throw new RazaoApoioInvalido(`O arquivo excede o limite de ${limites.folhas} folhas.`);
      for (const f of folhas) yield [f.nome, coletarLinhas(f.linhas, f.nome, orcamento)];
      return;
    }
    const livro = lerXls(conteudo);
    if (livro.folhas.length > limites.folhas) throw new RazaoApoioInvalido(`O arquivo excede o limite de ${limites.folhas} folhas.`);
    for (const f of livro.folhas) {
      const nrows = f.linhas.length;
      const ncols = nrows ? f.linhas[0].length : 0;
      orcamento.conferirDimensoes(nrows, ncols, f.nome);
      const linhas = function* () {
        for (const linha of f.linhas) yield linha.map((c) => valorCelulaXls(c, livro.datemode));
      };
      yield [f.nome, coletarLinhas(linhas(), f.nome, orcamento)];
    }
  } catch (e) {
    if (e instanceof RazaoApoioInvalido) throw e;
    throw new RazaoApoioInvalido("Não foi possível abrir a planilha do Razão auxiliar.");
  }
}

// ─── Cabeçalho, células e contas ────────────────────────────────────────────

/** `_incorporar_cabecalho`: empresa, CNPJ e período têm de ser os mesmos em todas as folhas. */
function incorporarCabecalho(razao: RazaoApoio, linhas: Celula[][], folha: string): void {
  let info;
  try {
    info = extrairCabecalho(linhas);
  } catch (e) {
    if (e instanceof Error && e.name === "ValueError") throw new RazaoApoioInvalido(`Período inválido no cabeçalho da folha "${folha}".`);
    throw e;
  }
  const novos = {
    empresa: info.empresa,
    cnpj: re("\\D").sub("", info.cnpj || ""),
    periodoInicio: info.periodoInicio?.slice(0, 10) ?? null,
    periodoFim: info.periodoFim?.slice(0, 10) ?? null,
  };
  for (const campo of ["empresa", "cnpj", "periodoInicio", "periodoFim"] as const) {
    const novo = novos[campo];
    const anterior = razao[campo];
    if (anterior && novo && anterior !== novo) {
      throw new RazaoApoioInvalido(`A folha "${folha}" informa empresa ou período diferente das demais folhas.`);
    }
    if (novo) razao[campo] = novo;
  }
}

/** `_normalizar`: sem acento, minúsculo e com um espaço só entre as palavras. */
export function normalizar(valor: Celula): string {
  const t = strip(textoOuVazio(valor)).toLowerCase().normalize("NFKD");
  return split(Array.from(t).filter((c) => !combinante(c)).join("")).join(" ");
}

/** `_valor`: débito ou crédito declarado, positivo, sem converter silenciosamente para zero. */
export function valorApoio(valor: Celula, contexto: string): Dec {
  const invalido = () => new RazaoApoioInvalido(`Valor financeiro inválido em ${contexto}.`);
  if (valor === null || valor === "") return ZERO_CENTAVOS;
  let limpo = "";
  let numero: Dec;
  if (typeof valor === "string") {
    limpo = strip(valor).replaceAll("R$", "").replaceAll(" ", "");
    if (limpo.startsWith("(") && limpo.endsWith(")")) limpo = limpo.slice(1, -1);
    else if (limpo.startsWith("+") || limpo.startsWith("-")) limpo = limpo.slice(1);
    if (!NUMERO.fullmatch(limpo)) throw invalido();
    numero = decimalDaCelula(valor);
  } else {
    // bool é `int` no Python, mas aqui é recusado antes; data, hora e o resto não são número.
    if (valor.tipo !== "int" && valor.tipo !== "float") throw invalido();
    const d = decimal(strPy(valor));
    if (d === null || d === NAO_FINITO) throw invalido();
    const q = quantizar(d);
    if (q === null) throw invalido();
    numero = q;
  }
  if (typeof valor === "string" && ehZero(numero) && Array.from(limpo).some((c) => "123456789".includes(c))) throw invalido();
  if (numero.negativo && !ehZero(numero)) throw new RazaoApoioInvalido(`Débitos e créditos devem ter valores positivos em ${contexto}.`);
  return numero;
}

const DATA_TEXTO = re("\\d{2}/\\d{2}/\\d{4}");

/** `_data`: a data da célula (datetime, date ou texto "dd/mm/aaaa"); `null` quando não é data. */
export function dataApoio(valor: Celula, contexto: string): string | null {
  if (ehData(valor)) return valor.valor.slice(0, 10);
  if (typeof valor === "string" && DATA_TEXTO.fullmatch(strip(valor))) {
    try {
      return strptimeDMY(strip(valor));
    } catch (e) {
      if (e instanceof Error && e.name === "ValueError") throw new RazaoApoioInvalido(`Data inválida em ${contexto}.`);
      throw e;
    }
  }
  return null;
}

/** O valor do Decimal sem o expoente (`Decimal("120") == Decimal("120.00")`), para comparar blocos. */
function chaveDec(d: Dec): string {
  if (ehZero(d)) return "0";
  let c = d.coeficiente;
  let e = d.expoente;
  const dez = BigInt(10);
  while (c % dez === BigInt(0)) {
    c /= dez;
    e += 1;
  }
  return `${d.negativo ? "-" : ""}${c}e${e}`;
}

type Identidade = [string, string, string];

/** `_ler_contas`: as contas e os lançamentos de uma folha. */
function lerContas(linhas: Celula[][], folha: string, blocosVistos: Set<string>): [ContaApoio[], LinhaApoio[]] {
  const achadas = localizarColunas(linhas);
  if (!achadas || !(["data", "historico", "debito", "credito"] as const).every((c) => achadas[c] !== undefined)) {
    throw new RazaoApoioInvalido(`A folha "${folha}" precisa das colunas Data, Histórico, Débito e Crédito.`);
  }
  const colunas: Colunas = achadas;
  const celula = (linha: Celula[], chave: keyof Colunas) => celulaDaColuna(linha, colunas, chave);
  // As colunas opcionais vêm da primeira linha de cabeçalho (a que tem "Data" na coluna Data).
  for (const linha of linhas) {
    if (normalizar(celula(linha, "data")) !== "data") continue;
    linha.forEach((rotulo, indice) => {
      for (const [campo, aceitos] of ROTULOS_OPCIONAIS) if (aceitos.includes(normalizar(rotulo))) colunas[campo] = indice;
    });
    break;
  }

  const contas: ContaApoio[] = [];
  const registros: LinhaApoio[] = [];
  let identidade: Identidade | null = null;
  let inicio = 0;
  let fechado = true;
  for (const [i, linha] of linhas.entries()) {
    if (!linha.length) continue;
    const contexto = `folha "${folha}", linha ${i + 1}`;
    const texto = linha.filter((v): v is string => typeof v === "string").join(" ");
    if (strip(textoOuVazio(linha[0])).startsWith("Conta:")) {
      const nova: Identidade = [
        inteiroComoTexto(linha.length > 1 ? linha[1] : null),
        linha.length > 2 ? strip(textoOuVazio(linha[2])) : "",
        nomeDoFornecedor(linha),
      ];
      if (!nova.every((x) => x)) throw new RazaoApoioInvalido(`Conta sem código, classificação ou descrição em ${contexto}.`);
      // Cabeçalho da mesma conta repetido pela paginação.
      if (!fechado && identidade && nova.every((x, k) => x === identidade![k])) continue;
      if (!fechado) throw new RazaoApoioInvalido(`A conta ${identidade![0]} não informa "Total da conta".`);
      identidade = nova;
      inicio = registros.length;
      fechado = false;
      continue;
    }
    if (normalizar(texto).includes("total da conta")) {
      if (identidade === null || fechado) throw new RazaoApoioInvalido(`Total da conta sem bloco correspondente em ${contexto}.`);
      if ((["debito", "credito"] as const).some((campo) => ehVazia(celula(linha, campo)))) {
        throw new RazaoApoioInvalido(`Total da conta sem valores declarados em ${contexto}.`);
      }
      const debito = valorApoio(celula(linha, "debito"), contexto);
      const credito = valorApoio(celula(linha, "credito"), contexto);
      const doBloco = registros.slice(inicio);
      conferirConta(identidade[0], doBloco, debito, credito);
      const bloco = JSON.stringify([
        identidade,
        chaveDec(debito),
        chaveDec(credito),
        doBloco.map((r) => [
          r.data, r.contaCodigo, r.contaClassificacao, r.contaDescricao, r.lote, r.contrapartida, r.historico,
          chaveDec(r.valorDebito), chaveDec(r.valorCredito), r.documento, r.favorecido,
        ]),
      ]);
      if (blocosVistos.has(bloco)) {
        throw new RazaoApoioInvalido(
          `O arquivo repete integralmente o bloco da conta ${identidade[0]}. ` + "Remova o bloco ou a folha duplicada antes de enviar.",
        );
      }
      blocosVistos.add(bloco);
      contas.push({ contaCodigo: identidade[0], contaClassificacao: identidade[1], contaDescricao: identidade[2], totalDebito: debito, totalCredito: credito });
      fechado = true;
      continue;
    }
    const normalizado = normalizar(texto);
    if (normalizado.includes("saldo anterior") || normalizado.includes("total do mes") || normalizar(celula(linha, "data")) === "data") continue;
    const data = dataApoio(celula(linha, "data"), contexto);
    if (identidade === null) {
      if (data) throw new RazaoApoioInvalido(`Lançamento sem identificação de conta em ${contexto}.`);
      continue;
    }
    const debito = valorApoio(celula(linha, "debito"), contexto);
    const credito = valorApoio(celula(linha, "credito"), contexto);
    if (ehZero(debito) && ehZero(credito)) continue;
    if (data === null || fechado) throw new RazaoApoioInvalido(`Lançamento sem data ou fora do bloco da conta em ${contexto}.`);
    registros.push({
      data,
      contaCodigo: identidade[0],
      contaClassificacao: identidade[1],
      contaDescricao: identidade[2],
      lote: inteiroComoTexto(celula(linha, "lote")),
      contrapartida: inteiroComoTexto(celula(linha, "cta")),
      historico: strip(textoOuVazio(celula(linha, "historico"))),
      valorDebito: debito,
      valorCredito: credito,
      documento: inteiroComoTexto(celula(linha, "documento")) || null,
      favorecido: inteiroComoTexto(celula(linha, "favorecido")) || null,
    });
  }
  if (!fechado) throw new RazaoApoioInvalido(`A conta ${identidade![0]} não informa "Total da conta".`);
  if (!contas.length) throw new RazaoApoioInvalido(`Não encontrei nenhuma conta na folha "${folha}".`);
  return [contas, registros];
}

const passa = (a: Dec, b: Dec) => compara(modulo(subtrai(a, b)), TOLERANCIA) > 0;

/** `_conferir_conta`: a soma dos lançamentos da conta tem de bater com o total que ela declara. */
function conferirConta(codigo: string, linhas: readonly LinhaApoio[], debito: Dec, credito: Dec): void {
  const somaDebito = somaTodos(linhas.map((l) => l.valorDebito));
  const somaCredito = somaTodos(linhas.map((l) => l.valorCredito));
  if (passa(somaDebito, debito) || passa(somaCredito, credito)) {
    throw new RazaoApoioInvalido(
      `A leitura da conta ${codigo} não fecha com o "Total da conta" ` +
        `(débitos ${textoDec(somaDebito)} × ${textoDec(debito)}; créditos ${textoDec(somaCredito)} × ${textoDec(credito)}). ` +
        "Envie um Razão completo para conferir a composição.",
    );
  }
}
