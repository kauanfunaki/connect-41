// Porte de `concilpro/planilha.py` (Bloco B, 11/11/2026): o relatório "RAZÃO" do Mister Contador
// em planilha (.xlsx e .xls).
//
// Por que planilha: no PDF é preciso INFERIR o que a planilha DECLARA (a data vira texto, o valor
// vira posição x, e Débito/Crédito só sai por aritmética de posição). Na planilha a célula tem
// tipo, a coluna tem nome e o arquivo não pagina: a leitura é determinística, sem IA.
//
// A coluna é achada pelo TEXTO do cabeçalho ("Lote" num razão, "Número" noutro), nunca por índice
// fixo. O resultado tem o mesmo contrato do leitor de PDF do ConcilPro: blocos "Conta:" com os
// lançamentos, o saldo anterior em módulo + C/D e o "Total da conta" declarado (ou a soma, quando
// a planilha não traz o total).
//
// O tipo de cada célula é o que o openpyxl (xlsx) ou o xlrd (xls) dariam, porque muda o texto:
// o lote `11190.0` do xlrd vira "11190", e o `str()` de uma data é o do `datetime`.

import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { dataIso, diasNoMes } from "../extrato/comum";
import { inteiro, re, strip } from "../extrato/py";
import { compara, dec, decimal, ehZero, modulo, NAO_FINITO, reescala, somaTodos, type Dec } from "../motor/decimal";
import { strDatahora, strPy, type Celula } from "../planilha/celula";
import { lerXls, xldateComoTupla, type CelulaXls } from "../planilha/xls";
import { lerXlsx } from "../planilha/xlsx";
import { dimensoesDoXlsx } from "./razaoXlsx";
import { erroPython, type BlocoPlanilha, type CabecalhoRazao, type Colunas, type LancamentoPlanilha, type NomeColuna, type RazaoPlanilha } from "./razaoTipos";

// Rótulos aceitos por coluna, na ordem do original (o primeiro que existir no cabeçalho vale).
const ROTULOS: [NomeColuna, string[]][] = [
  ["data", ["data"]],
  ["lote", ["lote", "número", "numero", "nº", "no"]],
  ["historico", ["histórico", "historico", "descrição", "descricao"]],
  ["cta", ["cta.c.part.", "cta c part", "cta.c.part", "contrapartida", "c.part."]],
  ["debito", ["débito", "debito"]],
  ["credito", ["crédito", "credito"]],
  ["saldo", ["saldo-exercício", "saldo-exercicio", "saldo exercício", "saldo"]],
];

const ZERO = dec("0");
/** O contexto padrão do `decimal`: 28 dígitos. Passou disso, o `quantize` levanta InvalidOperation. */
const PRECISAO = 28;

// ─── Primitivas ─────────────────────────────────────────────────────────────

/** `d.quantize(Decimal("0.01"))`; `null` quando o Python levantaria `InvalidOperation`. */
export function quantizar(d: Dec): Dec | null {
  const q = reescala(d, -2);
  return q.coeficiente.toString().length > PRECISAO ? null : q;
}

/** `quantize` fora de um `try`: o `InvalidOperation` do Python escapa. */
export function quantizarOuErro(d: Dec): Dec {
  const q = quantizar(d);
  if (q === null) throw erroPython("InvalidOperation", "[<class 'decimal.InvalidOperation'>]");
  return q;
}

/** `bool(valor)` do Python para uma célula. */
export function falsoPy(c: Celula): boolean {
  if (c === null || c === "") return true;
  if (typeof c === "string") return false;
  switch (c.tipo) {
    case "int":
      return c.valor === BigInt(0);
    case "float":
      return c.valor === 0;
    case "bool":
      return !c.valor;
    case "duracao":
      return c.valor === "0:00:00";
    default:
      return false; // datetime e time são sempre verdadeiros
  }
}

/** `str(valor or "")` */
export const textoOuVazio = (c: Celula): string => (falsoPy(c) ? "" : strPy(c));

/** `_texto`: `str(valor).strip()`, e "" para `None`. */
export const textoDaCelula = (c: Celula): string => (c === null ? "" : strip(strPy(c)));

/** A célula é `datetime`/`date` (o `isinstance(v, (datetime, date))`). */
export const ehData = (c: Celula): c is { tipo: "datahora"; valor: string } => c !== null && typeof c === "object" && c.tipo === "datahora";

/** `datetime(d.year, d.month, d.day)` de um `date`; o `datetime` fica como está. */
export const comoDatahora = (c: { valor: string }): string => (c.valor.length === 10 ? `${c.valor} 00:00:00` : c.valor);

const NAO_NUMERICO = re("[^\\d,().+-]");

/** `_decimal`: a célula numérica (ou texto "1.234,56", "(1.234,56)", "1,234.56") em Decimal de 2 casas. */
export function decimalDaCelula(valor: Celula): Dec {
  if (valor === null || valor === "") return ZERO;
  if (typeof valor === "string") {
    let limpo = NAO_NUMERICO.sub("", strip(valor));
    const negativoParenteses = limpo.startsWith("(") && limpo.endsWith(")");
    limpo = strip(limpo, "()");
    if (limpo.includes(",") && limpo.includes(".")) {
      // O separador mais à direita é o decimal; o outro é milhar.
      limpo = limpo.lastIndexOf(",") > limpo.lastIndexOf(".") ? limpo.replaceAll(".", "").replaceAll(",", ".") : limpo.replaceAll(",", "");
    } else if (limpo.includes(",")) {
      const partes = limpo.split(",");
      limpo = partes.length === 2 && casas(partes[1]) ? partes.join(".") : partes.join("");
    } else if (limpo.includes(".")) {
      const partes = limpo.split(".");
      if (!(partes.length === 2 && casas(partes[1]))) limpo = partes.join("");
    }
    if (negativoParenteses && !limpo.startsWith("-")) limpo = "-" + limpo;
    const d = decimal(limpo);
    if (d === null || d === NAO_FINITO) return ZERO;
    return quantizar(d) ?? ZERO;
  }
  // `Decimal(str(valor))`: bool ("True"), data e hora não são número e dão zero. NaN de .xls também
  // (no Python ele passaria adiante como Decimal('NaN'); ver o relatório do porte).
  const d = decimal(strPy(valor));
  if (d === null || d === NAO_FINITO) return ZERO;
  return quantizar(d) ?? ZERO;
}

/** `1 <= len(parte) <= 2` */
function casas(parte: string): boolean {
  const n = [...parte].length;
  return n >= 1 && n <= 2;
}

/** `_inteiro_como_texto`: "11190.0" → "11190"; texto fica como veio (sem espaços nas pontas). */
export function inteiroComoTexto(valor: Celula): string {
  if (valor === null) return "";
  if (typeof valor !== "string") {
    if (valor.tipo === "float" && Number.isInteger(valor.valor)) return BigInt(valor.valor).toString();
    // `isinstance(True, int)` é verdadeiro no Python: bool sai "True"/"False", sem strip.
    if (valor.tipo === "int" || valor.tipo === "bool") return strPy(valor);
  }
  return strip(strPy(valor));
}

/** `_celula`: a célula da coluna, ou `None` se a coluna não existe ou a linha é curta. */
export function celulaDaColuna(linha: readonly Celula[], colunas: Colunas, nome: keyof Colunas): Celula {
  const i = colunas[nome];
  return i === undefined || i >= linha.length ? null : linha[i];
}

// ─── strptime("%d/%m/%Y") ───────────────────────────────────────────────────

// A regex que o `_strptime` do Python monta para "%d/%m/%Y" (com IGNORECASE).
const FORMATO_DMY = re("(?P<d>3[01]|[12]\\d|0[1-9]|[1-9]| [1-9])/(?P<m>1[0-2]|0[1-9]|[1-9])/(?P<Y>\\d\\d\\d\\d)", "i");

/** `repr(str)` para o texto da mensagem do `strptime`. */
function reprTexto(t: string): string {
  const aspas = t.includes("'") && !t.includes('"') ? '"' : "'";
  return aspas + t.replaceAll("\\", "\\\\").replaceAll(aspas, "\\" + aspas) + aspas;
}

/** `datetime.strptime(texto, "%d/%m/%Y").date()` como "AAAA-MM-DD", com o `ValueError` do Python. */
export function strptimeDMY(texto: string): string {
  const m = FORMATO_DMY.match(texto);
  if (!m) throw erroPython("ValueError", `time data ${reprTexto(texto)} does not match format '%d/%m/%Y'`);
  if (m.fim !== texto.length) throw erroPython("ValueError", `unconverted data remains: ${texto.slice(m.fim)}`);
  const ano = inteiro(m.grupo("Y")!);
  const mes = inteiro(m.grupo("m")!);
  const dia = inteiro(m.grupo("d")!);
  // As mensagens do `date()` do Python 3.14 (o do original).
  if (ano < 1) throw erroPython("ValueError", `year must be in 1..9999, not ${ano}`);
  const dias = diasNoMes(ano, mes);
  if (dia > dias) throw erroPython("ValueError", `day ${dia} must be in range 1..${dias} for month ${mes} in year ${ano}`);
  return dataIso(ano, mes, dia)!;
}

// ─── Cabeçalho e colunas ────────────────────────────────────────────────────

/** `localizar_colunas`: o índice de cada coluna pelo rótulo, na primeira linha com Débito e Crédito. */
export function localizarColunas(linhas: readonly (readonly Celula[])[]): Colunas | null {
  for (const linha of linhas.slice(0, 60)) {
    if (!linha.length) continue;
    // Rótulo repetido: vale o índice da última ocorrência (como no dict do Python).
    const rotulos = new Map<string, number>();
    linha.forEach((v, i) => {
      if (typeof v === "string" && strip(v)) rotulos.set(textoDaCelula(v).toLowerCase(), i);
    });
    const tem = (nome: NomeColuna) => ROTULOS.find(([n]) => n === nome)![1].some((r) => rotulos.has(r));
    if (!tem("debito") || !tem("credito")) continue;

    const colunas: Colunas = {};
    for (const [nome, aceitos] of ROTULOS) {
      const rotulo = aceitos.find((r) => rotulos.has(r));
      if (rotulo !== undefined) colunas[nome] = rotulos.get(rotulo)!;
    }
    return colunas;
  }
  return null;
}

const CNPJ_CABECALHO = re("[\\d.]{2,}[\\d./-]+");
const PERIODO_CABECALHO = re("(\\d{2}/\\d{2}/\\d{4})\\s*-\\s*(\\d{2}/\\d{2}/\\d{4})");

/** `_extrair_cabecalho`: empresa, CNPJ e período, nas primeiras 15 linhas. */
export function extrairCabecalho(linhas: readonly (readonly Celula[])[]): CabecalhoRazao {
  const info: CabecalhoRazao = { empresa: "", cnpj: "", periodoInicio: null, periodoFim: null };
  for (const linha of linhas.slice(0, 15)) {
    if (!linha.length) continue;
    const celulas = linha.map(textoDaCelula);
    const junto = celulas.filter((c) => c).join(" ");
    if (!junto) continue;
    if (junto.startsWith("Empresa:") && !info.empresa) {
      info.empresa = celulas.slice(1).find((c) => c && !c.startsWith("Folha")) ?? "";
    } else if (junto.includes("C.N.P.J.") && !info.cnpj) {
      const i = junto.indexOf(":");
      const m = CNPJ_CABECALHO.search(i < 0 ? junto : junto.slice(i + 1));
      if (m) info.cnpj = strip(m[0]!);
    } else if (junto.startsWith("Período:")) {
      const m = PERIODO_CABECALHO.search(junto);
      if (m) {
        info.periodoInicio = `${strptimeDMY(m[1]!)} 00:00:00`;
        info.periodoFim = `${strptimeDMY(m[2]!)} 00:00:00`;
      }
    }
  }
  return info;
}

const SO_NUMERO_E_PONTO = re("[\\d.]+");

/** `_nome_do_fornecedor`: na linha "Conta:", a última célula de texto que não é só número. */
export function nomeDoFornecedor(linha: readonly Celula[]): string {
  const candidatos = linha
    .slice(2)
    .filter((v): v is string => typeof v === "string")
    .map(textoDaCelula)
    .filter((t) => t && !SO_NUMERO_E_PONTO.fullmatch(t));
  return candidatos.length ? candidatos[candidatos.length - 1] : "";
}

// ─── parser.py (as três funções que a planilha usa) ─────────────────────────

/** `calcular_hash_arquivo`: SHA-256 dos bytes, em hexadecimal. */
export function calcularHashArquivo(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const PADROES_NF = [
  "NF\\.?\\s*N[oºº°]?\\s*(\\d+)",
  "NF\\s+(\\d+)",
  "REF\\s+(?:REF\\s+)?NF\\s+(\\d+)",
  "REF\\s+(?:REF\\s+)?(\\d+)",
  "CT-E\\s*(\\d+)",
  "NOTA\\s*FISCAL\\s*(\\d+)",
  "CONFORME\\s+NF[.\\s]*(\\d+)",
  "^(\\d{5,6})\\s*-",
  "CONFORME\\s+NF\\s+N[ÚU]MERO\\s+(\\d+)",
  "CONF\\.\\s*NFS\\s*(\\d+)",
].map((p) => re(p, "i"));

/** `extrair_numero_nf`: o número de NF/CT-e do histórico (com 4 dígitos ou mais). */
export function extrairNumeroNf(historico: string): string | null {
  for (const padrao of PADROES_NF) {
    const m = padrao.search(historico);
    if (m && [...m[1]!].length >= 4) return m[1]!;
  }
  return null;
}

const CNPJ_HISTORICO = re("(\\d{2}\\.\\d{3}\\.\\d{3}/\\d{4}-\\d{2})");

/** `extrair_cnpj`: o CNPJ formatado que aparecer no histórico. */
export function extrairCnpj(historico: string): string | null {
  return CNPJ_HISTORICO.search(historico)?.[1] ?? null;
}

// ─── Leitura ────────────────────────────────────────────────────────────────

/** `e_planilha`: os bytes são um XLSX (um zip com a estrutura de pasta de trabalho do OpenXML)? */
export function ehPlanilha(bytes: Uint8Array): boolean {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false;
  try {
    const nomes = new Set<string>();
    unzipSync(bytes, {
      filter: (f) => {
        nomes.add(f.name);
        return false;
      },
    });
    return nomes.has("xl/workbook.xml") || nomes.has("[Content_Types].xml");
  } catch {
    return false;
  }
}

const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** `parsear_planilha_razao`: o Razão em .xlsx (a primeira folha). */
export function parsearPlanilhaRazao(bytes: Uint8Array): RazaoPlanilha {
  let linhas: Celula[][];
  try {
    // Sem `reset_dimensions()`: a dimensão declarada da folha corta as linhas e fixa a largura.
    const [dimensao] = dimensoesDoXlsx(bytes);
    linhas = lerXlsx(bytes, { folhas: "primeira", maxLinha: dimensao?.maxLinha ?? undefined, maxColuna: dimensao?.maxColuna ?? undefined })[0].linhas;
  } catch (e) {
    throw erroPython("ValueError", `Não foi possível abrir a planilha: ${mensagemDoOpenpyxl(bytes, e)}`);
  }
  return parsearLinhasRazao(bytes, linhas);
}

/**
 * O texto do erro do `load_workbook` para os casos comuns. O openpyxl lê o "[Content_Types].xml"
 * antes de tudo, e o `KeyError` do zipfile sai entre aspas no `str()`.
 */
function mensagemDoOpenpyxl(bytes: Uint8Array, e: unknown): string {
  const mensagem = mensagemDe(e);
  if (mensagem === "File is not a zip file") return mensagem;
  try {
    const nomes = new Set<string>();
    unzipSync(bytes, {
      filter: (f) => {
        nomes.add(f.name);
        return false;
      },
    });
    if (!nomes.has("[Content_Types].xml")) return `"There is no item named '[Content_Types].xml' in the archive"`;
  } catch {
    return "File is not a zip file";
  }
  return mensagem.startsWith("There is no item named") ? `"${mensagem}"` : mensagem;
}

/** `parsear_xls_razao`: o Razão no .xls legado (Excel 97-2003). */
export function parsearXlsRazao(bytes: Uint8Array): RazaoPlanilha {
  let livro;
  try {
    livro = lerXls(bytes);
    if (!livro.folhas.length) throw erroPython("IndexError", "list index out of range");
  } catch (e) {
    throw erroPython("ValueError", `Não foi possível abrir a planilha .xls: ${mensagemDe(e)}`);
  }
  const datemode = livro.datemode;
  const linhas = livro.folhas[0].linhas.map((linha) => linha.map((c) => valorCelulaXls(c, datemode)));
  return parsearLinhasRazao(bytes, linhas);
}

/** Os erros do `xldate_as_tuple` que são `ValueError` (o `XLDateError` herda dele). */
const ERROS_DE_DATA = new Set(["ValueError", "XLDateError", "XLDateNegative", "XLDateAmbiguous", "XLDateTooLarge", "XLDateBadDatemode", "XLDateBadTuple"]);

/**
 * `_valor_celula_xls`: a célula do xlrd no formato do openpyxl (data vira `datetime`). A data que
 * não vira `datetime` (serial 0, negativo, ano 0) fica como o número.
 */
export function valorCelulaXls(c: CelulaXls, datemode: 0 | 1): Celula {
  switch (c.tipo) {
    case "vazio":
    case "branco":
      return null;
    case "texto":
      return String(c.valor);
    case "numero":
      return { tipo: "float", valor: Number(c.valor) };
    case "booleano":
    case "erro":
      return { tipo: "int", valor: BigInt(Number(c.valor)) };
    case "data": {
      const n = Number(c.valor);
      try {
        const [a, m, d, h, mi, s] = xldateComoTupla(n, datemode);
        if (a < 1) return { tipo: "float", valor: n }; // datetime(0, ...) → "year 0 is out of range"
        return { tipo: "datahora", valor: strDatahora(a, m, d, h, mi, s) };
      } catch (e) {
        if (e instanceof Error && ERROS_DE_DATA.has(e.name)) return { tipo: "float", valor: n };
        throw e;
      }
    }
  }
}

/** O sinal da planilha (negativo = credor) em módulo + C/D, como no PDF. */
const tipoDoSaldo = (saldo: Dec): "C" | "D" | "" => (ehZero(saldo) ? "" : saldo.negativo ? "C" : "D");

/**
 * `_parsear_linhas_razao`: a lógica comum ao .xlsx e ao .xls, sobre as linhas já tipadas. O "Total
 * da conta" declarado é preservado; a conferência dele contra a soma, no original, só gera aviso
 * no log (aqui não há log), e quem confere de verdade é `razao.ts`.
 */
export function parsearLinhasRazao(bytes: Uint8Array, linhas: readonly (readonly Celula[])[]): RazaoPlanilha {
  if (!linhas.length) throw erroPython("ValueError", "Planilha vazia");
  const colunas = localizarColunas(linhas);
  if (!colunas) throw erroPython("ValueError", "Cabeçalho não encontrado: a planilha precisa ter colunas 'Débito' e 'Crédito'");

  const info = extrairCabecalho(linhas);
  type Bloco = Omit<BlocoPlanilha, "totalDebito" | "totalCredito"> & { totalDebito: Dec | null; totalCredito: Dec | null };
  const fornecedores: Bloco[] = [];
  let atual: Bloco | null = null;
  const celula = (linha: readonly Celula[], nome: NomeColuna) => celulaDaColuna(linha, colunas, nome);

  for (const linha of linhas) {
    if (!linha.length) continue;
    const primeiro = textoDaCelula(linha[0]);
    const textoLinha = linha
      .filter((v): v is string => typeof v === "string")
      .map(textoDaCelula)
      .join(" ");

    // Início de um bloco.
    if (primeiro.startsWith("Conta:")) {
      atual = {
        codigoConta: linha.length > 1 ? inteiroComoTexto(linha[1]) : "",
        contaContabil: linha.length > 2 ? textoDaCelula(linha[2]) : "",
        nomeFornecedor: nomeDoFornecedor(linha),
        saldoAnterior: ZERO,
        saldoAnteriorTipo: "",
        totalDebito: null,
        totalCredito: null,
        lancamentos: [],
        conciliacaoIa: [],
        resumoIa: {},
        validacaoIa: {},
      };
      fornecedores.push(atual);
      continue;
    }
    if (atual === null) continue;

    if (textoLinha.toUpperCase().includes("SALDO ANTERIOR")) {
      const saldo = decimalDaCelula(celula(linha, "saldo"));
      atual.saldoAnterior = modulo(saldo);
      atual.saldoAnteriorTipo = tipoDoSaldo(saldo);
      continue;
    }
    if (textoLinha.includes("Total da conta")) {
      atual.totalDebito = decimalDaCelula(celula(linha, "debito"));
      atual.totalCredito = decimalDaCelula(celula(linha, "credito"));
      continue;
    }

    // Lançamento: só linha com data de verdade na coluna Data.
    const data = celula(linha, "data");
    if (!ehData(data)) continue;
    const debito = decimalDaCelula(celula(linha, "debito"));
    const credito = decimalDaCelula(celula(linha, "credito"));
    if (ehZero(debito) && ehZero(credito)) continue;
    const historico = textoDaCelula(celula(linha, "historico"));
    const saldo = decimalDaCelula(celula(linha, "saldo"));
    const lancamento: LancamentoPlanilha = {
      dataLancamento: comoDatahora(data),
      lote: inteiroComoTexto(celula(linha, "lote")),
      historico,
      contaPartida: inteiroComoTexto(celula(linha, "cta")) || null,
      valorDebito: debito,
      valorCredito: credito,
      saldoAposLancamento: modulo(saldo),
      saldoTipo: tipoDoSaldo(saldo),
      tipoOperacao: compara(debito, ZERO) > 0 ? "PAGAMENTO" : "COMPRA",
      numeroNf: extrairNumeroNf(historico),
      cnpjHistorico: extrairCnpj(historico),
      classificacaoIncerta: false,
      classificadoPorIa: false,
    };
    atual.lancamentos.push(lancamento);
  }

  // Sem "Total da conta" na planilha: o total é a soma dos lançamentos.
  const blocos: BlocoPlanilha[] = fornecedores.map((f) => ({
    ...f,
    totalDebito: f.totalDebito ?? somaTodos(f.lancamentos.map((l) => l.valorDebito)),
    totalCredito: f.totalCredito ?? somaTodos(f.lancamentos.map((l) => l.valorCredito)),
  }));

  return {
    hashArquivo: calcularHashArquivo(bytes),
    empresa: info.empresa,
    cnpj: info.cnpj,
    periodoInicio: info.periodoInicio,
    periodoFim: info.periodoFim,
    totalFornecedores: blocos.length,
    totalLancamentos: blocos.reduce((n, f) => n + f.lancamentos.length, 0),
    fornecedores: blocos,
  };
}
