// O leitor do Razão de fornecedores (ConcilPro, Bloco D, Fase D3a, 26/11/2026). Porte de
// `src/domain/concilpro/parser.py` do Contábil Core, sem o PDF e sem a IA, que chegam de fora
// (`razao.ts` e `ia.ts`): aqui ficam as funções puras e o laço dos blocos.
//
// O relatório "Razão" do sistema contábil traz um bloco por fornecedor, aberto pela linha
// "Conta: <código> - <conta contábil> <nome>", com o saldo anterior, os lançamentos (data, lote,
// histórico, contrapartida, débito, crédito e saldo) e o "Total da conta: <débito> <crédito>". Cada
// bloco passa por três tentativas, nesta ordem, e para na primeira que dá um fornecedor:
// 0. a leitura pelas colunas do cabeçalho (`parsearBlocoDeterministico`), sem IA: a posição horizontal
//    de cada número diz se é débito, crédito ou saldo, e o bloco só é aceito quando a soma fecha com o
//    "Total da conta" impresso;
// 1. o texto do bloco ao agente de texto (`ia.ts`), com os lançamentos normalizados e o débito e o
//    crédito corrigidos pela coluna quando o cabeçalho existe;
// 2. as páginas do bloco ao agente de imagem, em lotes de 3.
// O bloco que nenhuma dá é descartado. O mesmo fornecedor repetido (a conta que atravessa a página ou
// lida duas vezes) é consolidado, sem o lançamento lido duas vezes.
//
// Convenções (as da B1, `conciliacao/razaoTipos.ts`): o `datetime` é o `str()` dele ("AAAA-MM-DD
// HH:MM:SS"); dinheiro é `Dec`, com o expoente do `Decimal` (o "0.00" e o "0" continuam diferentes); a
// resposta da IA é o `json.loads(..., parse_float=Decimal)` (`ValorPy`); as exceções que escapavam do
// original são `Error` com o nome da classe Python (`erroPython`). Posições de coluna contam caracteres,
// como o Python, não unidades UTF-16.

import { createHash } from "node:crypto";
import { compara, dec, decimal, ehZero, NAO_FINITO, soma, somaTodos, subtrai, modulo, texto as textoDec, type Dec } from "../motor/decimal";
import { inteiro, len, re, split, strip } from "../extrato/py";
import { dataIso } from "../extrato/comum";
import { extrairCnpj, extrairNumeroNf, strptimeDMY, ehPlanilha, calcularHashArquivo } from "../conciliacao/razaoPlanilha";
import { erroPython } from "../conciliacao/razaoTipos";
import { str as strPy, verdadeiro, type ValorPy } from "../notas/visual";
import { lstripPy, rstripPy } from "./texto";

export { calcularHashArquivo, extrairCnpj, extrairNumeroNf };

// ─── Tipos ──────────────────────────────────────────────────────────────────

/** Um lançamento do fornecedor (o dicionário do original). */
export type LancamentoDoRazao = {
  /** `str()` do `datetime` ("AAAA-MM-DD HH:MM:SS"). */
  dataLancamento: string;
  lote: string;
  historico: string;
  contaPartida: string | null;
  valorDebito: Dec;
  valorCredito: Dec;
  saldoAposLancamento: Dec;
  saldoTipo: string;
  /** COMPRA, PAGAMENTO, DEVOLUCAO, DEBITO, CREDITO, ADIANTAMENTO ou OUTRO. */
  tipoOperacao: string;
  numeroNf: string | null;
  cnpjHistorico: string | null;
  classificacaoIncerta: boolean;
  classificadoPorIa: boolean;
  /** Só na compra consolidada (`consolidador.ts`). */
  consolidado?: true;
  lancamentosOriginais?: number;
  /** A série explícita da nota (`serie_nf`/`serie`), que o leitor não preenche; o consolidador a lê. */
  serieNf?: string | null;
  serie?: string | null;
};

/** Um fornecedor (um bloco "Conta:"). */
export type FornecedorDoRazao = {
  codigoConta: string;
  contaContabil: string;
  nomeFornecedor: string;
  saldoAnterior: Dec;
  saldoAnteriorTipo: string;
  totalDebito: Dec;
  totalCredito: Dec;
  lancamentos: LancamentoDoRazao[];
  /** O que a IA de imagem devolveu como está (no bloco lido sem IA, `[]`, `{}` e `{}`). */
  conciliacaoIa: ValorPy;
  resumoIa: ValorPy;
  validacaoIa: ValorPy;
};

/** O retorno de `parsear_arquivo_razao` (o mesmo de `parsear_planilha_razao`). */
export type RazaoDeFornecedores = {
  hashArquivo: string;
  empresa: string;
  cnpj: string;
  /** `str()` do `datetime`, ou nulo. */
  periodoInicio: string | null;
  periodoFim: string | null;
  totalFornecedores: number;
  totalLancamentos: number;
  fornecedores: FornecedorDoRazao[];
};

/**
 * O que o original só escrevia no log, para a tela e a auditoria (não existe no original): quantos blocos
 * saíram de cada caminho, quantos foram descartados e, quando a IA não estava disponível, a frase dizendo
 * onde ligá-la.
 */
export type DiagnosticoDoRazao = {
  blocos: number;
  deterministicos: number;
  porTexto: number;
  porImagem: number;
  descartados: number;
  iaIndisponivel: string | null;
};

// ─── Python: tipos, posições e textos ───────────────────────────────────────

/** O nome do tipo do Python (o da mensagem de `AttributeError` e `TypeError`). */
export function tipoPy(v: ValorPy | undefined): string {
  if (v === undefined || v === null) return "NoneType";
  if (typeof v === "boolean") return "bool";
  if (typeof v === "string") return "str";
  if (Array.isArray(v)) return "list";
  if (v instanceof Map) return "dict";
  if (v.py === "int") return "int";
  if (v.py === "float") return "float";
  return "decimal.Decimal";
}

const semAtributo = (v: ValorPy | undefined, atributo: string) => erroPython("AttributeError", `'${tipoPy(v)}' object has no attribute '${atributo}'`);

/** `d.get(chave)` de um valor do `json.loads`: o que não é dicionário não tem `get`. */
export function pegar(d: ValorPy | undefined, chave: string): ValorPy | undefined {
  if (!(d instanceof Map)) throw semAtributo(d, "get");
  return d.get(chave);
}

const SUBSTITUTO = /[\uD800-\uDFFF]/;
/** O índice do Python (em caracteres) de um índice do JavaScript (em unidades UTF-16). */
function posPy(t: string, i: number): number {
  return SUBSTITUTO.test(t) ? [...t.slice(0, i)].length : i;
}
/** `t[a:b]` do Python, com `a` e `b` em caracteres (não negativos). */
function fatiaPy(t: string, a: number, b?: number): string {
  if (!SUBSTITUTO.test(t)) return t.slice(a, b);
  return [...t].slice(a, b).join("");
}
/** `t.find(sub)` do Python, em caracteres. */
function achaPy(t: string, sub: string): number {
  const i = t.indexOf(sub);
  return i < 0 ? -1 : posPy(t, i);
}

// Os dígitos que o `str.isdigit()` aceita além dos decimais (`\p{Nd}`): sobrescritos, subscritos e
// circulados.
const DIGITO_EXTRA = /[²³¹⁰⁴-⁹₀-₉①-⑨⑴-⑼⒈-⒐⓪⓵-⓽⓿❶-❾➀-➈➊-➒፩-፱᧚]/u;
/** `str.isdigit()` */
function ehDigitosPy(t: string): boolean {
  return t.length > 0 && [...t].every((c) => /\p{Nd}/u.test(c) || DIGITO_EXTRA.test(c));
}

const ZERO = dec("0");
const UM_CENTAVO = dec("0.01");
const INVALIDA = () => erroPython("InvalidOperation", "[<class 'decimal.InvalidOperation'>]");
/** `Decimal("True")`: o texto que não é número. */
const CONVERSAO = () => erroPython("InvalidOperation", "[<class 'decimal.ConversionSyntax'>]");

/** `Decimal(texto)` que levanta como o Python. Não finito (NaN, Infinity) também levanta: o `Dec` não o representa. */
function decimalOuErro(t: string): Dec {
  const d = decimal(t);
  if (d === null || d === NAO_FINITO) throw INVALIDA();
  return d;
}

// ─── Funções unitárias ──────────────────────────────────────────────────────

/** `parse_valor`: "1.234,56" vira 1234.56; vazio ou ilegível, 0. */
export function parseValor(texto: string | null): Dec {
  if (!texto || strip(texto) === "") return ZERO;
  let t = strip(texto).replaceAll(".", "").replaceAll(",", ".");
  t = re("[^\\d.-]").sub("", t);
  const d = decimal(t);
  return d === null || d === NAO_FINITO ? ZERO : d;
}

/** `parse_data`: "31/01/2025" vira "2025-01-31 00:00:00"; o resto, nulo. */
export function parseData(texto: string | null): string | null {
  if (typeof texto !== "string") return null;
  try {
    return `${strptimeDMY(strip(texto))} 00:00:00`;
  } catch {
    return null;
  }
}

/** `classificar_tipo_operacao`: pelo histórico e pelo lado do valor. */
export function classificarTipoOperacao(historico: string, valorDebito: Dec, valorCredito: Dec): string {
  const h = historico.toUpperCase();
  if (compara(valorDebito, ZERO) > 0) {
    if (["PGTO", "PAGAMENTO", "BAIXA", "VLR REF", "VALOR REF"].some((p) => h.includes(p))) return "PAGAMENTO";
    if (h.includes("DEVOLUCAO") || h.includes("ESTORNO")) return "DEVOLUCAO";
    return "DEBITO";
  }
  if (compara(valorCredito, ZERO) > 0) {
    if (["COMPRA", "NF", "NOTA FISCAL", "SERVICO", "SERVIÇO", "CT-E", "ADQUIRIDO", "AQUISICAO", "AQUISIÇÃO", "CONFORME"].some((p) => h.includes(p))) return "COMPRA";
    if (h.includes("ADTO") || h.includes("ADIANTAMENTO")) return "ADIANTAMENTO";
    return "CREDITO";
  }
  return "OUTRO";
}

const PALAVRA_PY = "\\p{L}\\p{N}_";
const escaparRegex = (t: string) => t.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");

/**
 * `_deduplicar_historico_linha` (Formato 4): o histórico repetido N vezes na mesma linha. Com 9 palavras ou
 * mais, acha o n-grama de 7 a 3 palavras mais frequente (com 3 ou mais ocorrências) e troca da segunda
 * ocorrência em diante por espaços do mesmo tamanho: a coluna em que um valor cai distingue débito de crédito.
 */
export function deduplicarHistoricoLinha(linha: string): string {
  const palavras = split(linha);
  if (palavras.length < 9) return linha;
  let melhorFrase = "";
  let melhorContagem = 0;
  for (let n = 7; n > 2; n--) {
    if (n >= palavras.length) continue;
    const contagens = new Map<string, number>();
    for (let i = 0; i + n <= palavras.length; i++) {
      const g = palavras.slice(i, i + n).join(" ");
      contagens.set(g, (contagens.get(g) ?? 0) + 1);
    }
    // `Counter.most_common(1)`: a maior contagem; no empate, a que apareceu primeiro.
    let frase = "";
    let cnt = 0;
    for (const [g, c] of contagens) {
      if (c > cnt) {
        frase = g;
        cnt = c;
      }
    }
    if (cnt >= 3 && cnt > melhorContagem) {
      melhorFrase = frase;
      melhorContagem = cnt;
    }
  }
  if (!melhorFrase) return linha;
  const padrao = new RegExp(`(?<![${PALAVRA_PY}])${escaparRegex(melhorFrase)}(?![${PALAVRA_PY}])`, "gu");
  const ocorrencias = [...linha.matchAll(padrao)].map((m) => m.index!);
  if (ocorrencias.length < 3) return linha;
  const brancos = " ".repeat(len(melhorFrase));
  let resultado = linha;
  for (const pos of ocorrencias.slice(1).reverse()) {
    resultado = resultado.slice(0, pos) + brancos + resultado.slice(pos + melhorFrase.length);
  }
  return rstripPy(resultado);
}

/** `_preprocessar_bloco`: a limpeza do Formato 4 em cada linha do bloco. */
export function preprocessarBloco(blocoTexto: string): string {
  return blocoTexto.split("\n").map(deduplicarHistoricoLinha).join("\n");
}

// ─── Formato do arquivo ─────────────────────────────────────────────────────

const OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const comeca = (b: Uint8Array, assinatura: readonly number[]) => assinatura.every((x, i) => b[i] === x);
const u16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u32 = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

/**
 * `zipfile.is_zipfile` do Python 3.14: acha o registro final do diretório central ("PK\x05\x06") no fim do
 * arquivo (ou nos últimos 64 KiB, por causa do comentário) e confere a assinatura da primeira entrada do
 * diretório. O registro ZIP64 não é lido (não muda a resposta para o que chega aqui). Como no original (os bytes
 * num `BytesIO`), o diretório que começaria antes do arquivo levanta `ValueError`.
 */
export function ehZipPy(b: Uint8Array): boolean {
  const n = b.length;
  if (n < 22) return false;
  let inicio = -1;
  if (comeca(b.subarray(n - 22), [0x50, 0x4b, 0x05, 0x06]) && b[n - 2] === 0 && b[n - 1] === 0) inicio = n - 22;
  else {
    const de = Math.max(n - 65535 - 22, 0);
    for (let i = n - 4; i >= de; i--) {
      if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) {
        inicio = i;
        break;
      }
    }
    if (inicio < 0 || inicio + 22 > n) return false;
  }
  const [disco, discoInicio, total, tamanho, deslocamento] = [u16(b, inicio + 4), u16(b, inicio + 6), u16(b, inicio + 10), u32(b, inicio + 12), u32(b, inicio + 16)];
  if (total === 0 && tamanho === 0 && deslocamento === 0) return true;
  if (disco !== discoInicio) return false;
  const lugar = inicio - tamanho; // `sum(_handle_prepended_data(endrec))`
  // O `BytesIO.seek` negativo levanta `ValueError`, que o `is_zipfile` não captura (só `OSError`).
  if (lugar < 0) throw erroPython("ValueError", `negative seek value ${lugar}`);
  if (tamanho < 46 || lugar + 46 > n) return false;
  return comeca(b.subarray(lugar), [0x50, 0x4b, 0x01, 0x02]);
}

export type FormatoDoArquivo = "PDF" | "XLS" | "XLSX" | "ZIP";

/** `detectar_formato_arquivo`: PDF, XLS (OLE2), XLSX (o zip com a pasta de trabalho), ZIP; o resto é tratado como PDF. */
export function detectarFormatoArquivo(b: Uint8Array): FormatoDoArquivo {
  if (comeca(b, [0x25, 0x50, 0x44, 0x46])) return "PDF";
  if (b.length >= 8 && comeca(b, OLE2)) return "XLS";
  if (ehPlanilha(b)) return "XLSX";
  if (comeca(b, [0x50, 0x4b]) || ehZipPy(b)) return "ZIP";
  return "PDF";
}

// ─── Duplicados ─────────────────────────────────────────────────────────────

/** `str(Decimal(str(v or 0)))`: zero (com qualquer expoente) é "0". */
const chaveDoValor = (d: Dec) => (ehZero(d) ? "0" : textoDec(d));

/**
 * `_deduplicar_lancamentos`: o mesmo lançamento lido duas vezes (pelo texto e pela imagem, ou de duas
 * páginas). Duplicata é a mesma data com os mesmos valores e o mesmo saldo, ou o mesmo lote com os mesmos
 * valores e o mesmo saldo (a data pode ter sido lida diferente). O que fica herda a NF e o lote que só a
 * cópia trazia (o objeto que fica é alterado, como no original).
 */
export function deduplicarLancamentos(lancamentos: readonly LancamentoDoRazao[]): [LancamentoDoRazao[], number] {
  const resultado: LancamentoDoRazao[] = [];
  const porData = new Map<string, LancamentoDoRazao>();
  const porLote = new Map<string, LancamentoDoRazao>();
  let descartados = 0;
  for (const lanc of lancamentos) {
    const deb = chaveDoValor(lanc.valorDebito);
    const cred = chaveDoValor(lanc.valorCredito);
    const saldo = chaveDoValor(lanc.saldoAposLancamento);
    const lote = strip(lanc.lote || "");
    const chaveData = JSON.stringify([lanc.dataLancamento, deb, cred, saldo]);
    const chaveLote = lote ? JSON.stringify([lote, deb, cred, saldo]) : null;
    let existente = porData.get(chaveData);
    if (existente === undefined && chaveLote) existente = porLote.get(chaveLote);
    if (existente !== undefined && (deb !== "0" || cred !== "0")) {
      descartados += 1;
      if (!existente.numeroNf && lanc.numeroNf) existente.numeroNf = lanc.numeroNf;
      if (!existente.lote && lote) existente.lote = lanc.lote;
      continue;
    }
    resultado.push(lanc);
    porData.set(chaveData, lanc);
    if (chaveLote) porLote.set(chaveLote, lanc);
  }
  return [resultado, descartados];
}

/**
 * `consolidar_fornecedores_duplicados`: os blocos do mesmo código de conta viram um, na posição do
 * primeiro, com os lançamentos somados sem os duplicados, os totais do ÚLTIMO bloco e o saldo anterior do
 * primeiro. O bloco único também perde o lançamento lido duas vezes. Bloco sem código sai.
 */
export function consolidarFornecedoresDuplicados(fornecedores: readonly FornecedorDoRazao[]): FornecedorDoRazao[] {
  const porCodigo = new Map<string, FornecedorDoRazao[]>();
  for (const f of fornecedores) {
    if (!f.codigoConta) continue;
    const lista = porCodigo.get(f.codigoConta);
    if (lista) lista.push(f);
    else porCodigo.set(f.codigoConta, [f]);
  }
  const consolidados: FornecedorDoRazao[] = [];
  for (const lista of porCodigo.values()) {
    if (lista.length === 1) {
      const [limpos, descartados] = deduplicarLancamentos(lista[0].lancamentos);
      consolidados.push(descartados ? { ...lista[0], lancamentos: limpos } : lista[0]);
      continue;
    }
    const [todos] = deduplicarLancamentos(lista.flatMap((f) => f.lancamentos));
    const ultimo = lista[lista.length - 1];
    consolidados.push({
      ...lista[0],
      lancamentos: todos,
      totalDebito: ultimo.totalDebito,
      totalCredito: ultimo.totalCredito,
      saldoAnterior: lista[0].saldoAnterior,
      saldoAnteriorTipo: lista[0].saldoAnteriorTipo,
    });
  }
  return consolidados;
}

// ─── A resposta da IA ───────────────────────────────────────────────────────

/**
 * `_ia_decimal`: o número da IA como `Decimal`. Nulo é 0; texto é lido como "1234.56" e, se não der, como
 * "1.234,56"; o que não vira número, 0. Levanta (`InvalidOperation`) com `true`/`false` (o `Decimal("True")`
 * do original) e com valor não finito (NaN, Infinity), que o `Dec` não representa.
 */
export function iaDecimal(v: ValorPy | undefined): Dec {
  if (v === undefined || v === null) return dec("0");
  if (typeof v === "boolean") throw CONVERSAO();
  if (Array.isArray(v) || v instanceof Map) return dec("0");
  if (typeof v !== "string") {
    if (v.py === "float") throw INVALIDA();
    if (v.py === "int") return dec(BigInt(v.texto).toString());
    return decimalOuErro(v.texto);
  }
  const s = strip(v).replaceAll(" ", "");
  const d = decimal(s);
  if (d === NAO_FINITO) throw INVALIDA();
  if (d !== null) return d;
  const d2 = decimal(s.replaceAll(".", "").replaceAll(",", "."));
  if (d2 === NAO_FINITO) throw INVALIDA();
  return d2 ?? dec("0");
}

// As regexes do `_strptime` do Python para os três formatos (com IGNORECASE; `\d` de qualquer escrita).
const DIA = "(?P<d>3[01]|[12]\\d|0[1-9]|[1-9]| [1-9])";
const MES = "(?P<m>1[0-2]|0[1-9]|[1-9])";
const ANO = "(?P<Y>\\d\\d\\d\\d)";
const FORMATOS_DA_IA = [re(`${DIA}/${MES}/${ANO}`, "i"), re(`${ANO}-${MES}-${DIA}`, "i"), re(`${DIA}-${MES}-${ANO}`, "i")];

/** `datetime.strptime(texto, formato)` de um dos três formatos, ou nulo (o `ValueError`). */
function strptimeDaIa(texto: string, formato: (typeof FORMATOS_DA_IA)[number]): string | null {
  const m = formato.match(texto);
  if (!m || m.fim !== texto.length) return null;
  const ano = inteiro(m.grupo("Y")!);
  const mes = inteiro(m.grupo("m")!);
  const dia = inteiro(m.grupo("d")!);
  const iso = dataIso(ano, mes, dia);
  return iso ? `${iso} 00:00:00` : null;
}

/** `_ia_data`: "DD/MM/AAAA", "AAAA-MM-DD" ou "DD-MM-AAAA" (o primeiro que servir); o resto, nulo. */
export function iaData(v: ValorPy | undefined): string | null {
  if (!verdadeiro(v)) return null;
  const s = strip(strPy(v!));
  for (const formato of FORMATOS_DA_IA) {
    const d = strptimeDaIa(s, formato);
    if (d) return d;
  }
  return null;
}

const TIPOS_DA_IA = ["COMPRA", "PAGAMENTO", "DEVOLUCAO", "DEBITO", "CREDITO", "OUTRO"];

/** `(v or "").strip()` / `.upper()`: o falso vira ""; o verdadeiro que não é texto não tem o método. */
function textoOuVazio(v: ValorPy | undefined, metodo: string): string {
  if (!verdadeiro(v)) return "";
  if (typeof v !== "string") throw semAtributo(v, metodo);
  return v;
}

/**
 * `_normalizar_lancamento_ia`: o lançamento da IA no formato do leitor, ou nulo (sem data legível, ou
 * qualquer falha: o original engolia a exceção). O tipo é o da IA quando é um dos conhecidos; senão, o de
 * `classificarTipoOperacao`. DEBITO, CREDITO e OUTRO ficam marcados como incertos.
 */
export function normalizarLancamentoIa(lancIa: ValorPy): LancamentoDoRazao | null {
  try {
    const data = iaData(pegar(lancIa, "data"));
    if (!data) return null;
    const vd = iaDecimal(pegar(lancIa, "valor_debito"));
    const vc = iaDecimal(pegar(lancIa, "valor_credito"));
    const saldo = iaDecimal(pegar(lancIa, "saldo_apos"));
    const historico = strip(textoOuVazio(pegar(lancIa, "historico"), "strip"));
    const cpc = pegar(lancIa, "conta_partida");
    const contaPartida = verdadeiro(cpc) ? strip(strPy(cpc!)) : null;
    const tipoIa = textoOuVazio(pegar(lancIa, "tipo_operacao"), "upper").toUpperCase();
    const tipo = TIPOS_DA_IA.includes(tipoIa) ? tipoIa : classificarTipoOperacao(historico, vd, vc);
    const valorDoLote = pegar(lancIa, "lote");
    const saldoTipo = pegar(lancIa, "saldo_tipo");
    return {
      dataLancamento: data,
      lote: verdadeiro(valorDoLote) ? strPy(valorDoLote!) : "",
      historico,
      contaPartida,
      valorDebito: vd,
      valorCredito: vc,
      saldoAposLancamento: saldo,
      saldoTipo: verdadeiro(saldoTipo) ? strPy(saldoTipo!) : "",
      tipoOperacao: tipo,
      numeroNf: extrairNumeroNf(historico),
      cnpjHistorico: extrairCnpj(historico),
      classificacaoIncerta: ["DEBITO", "CREDITO", "OUTRO"].includes(tipo),
      classificadoPorIa: true,
    };
  } catch {
    return null;
  }
}

// ─── As colunas do cabeçalho ────────────────────────────────────────────────

const VALOR_BR = re("\\d{1,3}(?:\\.\\d{3})*,\\d{2}(?=[CD]?(?:\\s|$))");
const ROTULO_COLUNA = re("Débito|Crédito|Saldo-Exercício|Saldo");
const DATA_E_LOTE = re("^\\s*(\\d{2}/\\d{2}/\\d{4})\\s+(\\S+)");

/** O cabeçalho da tabela: a borda direita de cada coluna de valor, a folga e onde começam histórico, contrapartida e débito. */
export type ColunasDoCabecalho = {
  /** Nome ("debito", "credito", "saldo", "saldo1"…) → coluna da borda direita do rótulo, na ordem do cabeçalho. */
  valores: Map<string, number>;
  tolerancia: number;
  historico: number | null;
  cta: number | null;
  inicioDebito: number;
};

/**
 * `_colunas_do_header`: a primeira linha com "Débito" e "Crédito". As colunas de valor são pela BORDA
 * DIREITA do rótulo (número contábil é alinhado à direita), e a folga é a metade do menor vão entre colunas,
 * entre 2 e 8 caracteres.
 */
export function colunasDoHeader(linhas: readonly string[]): ColunasDoCabecalho | null {
  for (const linha of linhas) {
    if (!linha.includes("Débito") || !linha.includes("Crédito")) continue;
    const bordas: [string, number][] = [];
    for (const achado of ROTULO_COLUNA.finditer(linha)) {
      const rotulo = achado[0]!;
      let nome = rotulo === "Débito" ? "debito" : rotulo === "Crédito" ? "credito" : "saldo";
      if (nome === "saldo") nome = `saldo${bordas.filter(([n]) => n.startsWith("saldo")).length || ""}`;
      bordas.push([nome, posPy(linha, achado.fim)]);
    }
    const valores = new Map<string, number>();
    for (const [nome, fim] of bordas) valores.set(nome, fim);
    if (!valores.has("debito") || !valores.has("credito")) continue;
    const posicoes = bordas.map(([, fim]) => fim).sort((a, b) => a - b);
    let tolerancia = 8;
    if (posicoes.length > 1) {
      const menorVao = Math.min(...posicoes.slice(1).map((b, i) => b - posicoes[i]));
      tolerancia = Math.max(2, Math.min(8, Math.floor(menorVao / 2)));
    }
    const colDebito = achaPy(linha, "Débito");
    const historico = achaPy(linha, "Histórico");
    const cta = achaPy(linha, "Cta.C.Part.");
    return {
      valores,
      tolerancia,
      historico: historico >= 0 && historico < colDebito ? historico : null,
      cta: cta >= 0 && cta < colDebito ? cta : null,
      inicioDebito: colDebito,
    };
  }
  return null;
}

/** `_coluna_do_valor`: a coluna de borda direita mais próxima, dentro da folga (no empate, a primeira). */
export function colunaDoValor(fimValor: number, colunas: ColunasDoCabecalho): string | null {
  let alvo: string | null = null;
  let menorDist = colunas.tolerancia + 1;
  for (const [nome, borda] of colunas.valores) {
    const distancia = Math.abs(fimValor - borda);
    if (distancia < menorDist) {
      alvo = nome;
      menorDist = distancia;
    }
  }
  return alvo;
}

/** `_valores_por_coluna`: a data, o lote e o débito e o crédito da linha, pela coluna de cada valor; sem valor, nulo. */
export function valoresPorColuna(linha: string, colunas: ColunasDoCabecalho): { data: string; lote: string; debito: Dec; credito: Dec } | null {
  const m = DATA_E_LOTE.match(linha);
  if (!m) return null;
  let debito = dec("0");
  let credito = dec("0");
  for (const achado of VALOR_BR.finditer(linha)) {
    if (achado.inicio < m.fim) continue;
    const valor = decimal(achado[0]!.replaceAll(".", "").replaceAll(",", "."));
    if (valor === null || valor === NAO_FINITO) continue;
    const alvo = colunaDoValor(posPy(linha, achado.fim), colunas);
    if (alvo === "debito") debito = soma(debito, valor);
    else if (alvo === "credito") credito = soma(credito, valor);
  }
  if (ehZero(debito) && ehZero(credito)) return null;
  return { data: m[1]!, lote: m[2]!, debito, credito };
}

/** "AAAA-MM-DD HH:MM:SS" → "DD/MM/AAAA" (o `strftime("%d/%m/%Y")`). */
const dataBr = (dt: string) => `${dt.slice(8, 10)}/${dt.slice(5, 7)}/${dt.slice(0, 4)}`;

/**
 * `_corrigir_colunas_por_posicao`: com o cabeçalho, o débito e o crédito de cada lançamento da IA são os da
 * coluna em que o número aparece na linha de mesma data e lote (vários: o de valor mais próximo do que a IA
 * leu). A compra que vira débito passa a pagamento, e vice-versa. Altera os lançamentos recebidos.
 */
export function corrigirColunasPorPosicao(lancamentos: LancamentoDoRazao[], linhasBloco: readonly string[]): LancamentoDoRazao[] {
  const colunas = colunasDoHeader(linhasBloco);
  if (!colunas) return lancamentos;
  const disponiveis = linhasBloco.map((l) => valoresPorColuna(l, colunas)).filter((r) => r !== null);
  if (!disponiveis.length) return lancamentos;
  const usados = new Set<number>();
  for (const lanc of lancamentos) {
    const data = dataBr(lanc.dataLancamento);
    const lote = strip(lanc.lote || "");
    const candidatos = disponiveis.map((r, i) => [i, r] as const).filter(([i, r]) => !usados.has(i) && r.data === data && r.lote === lote);
    if (!candidatos.length) continue;
    if (candidatos.length > 1) {
      const atual = compara(lanc.valorCredito, lanc.valorDebito) > 0 ? lanc.valorCredito : lanc.valorDebito;
      const distancia = (r: (typeof disponiveis)[number]) => {
        const a = modulo(subtrai(r.debito, atual));
        const b = modulo(subtrai(r.credito, atual));
        return compara(b, a) < 0 ? b : a;
      };
      candidatos.sort(([, a], [, b]) => compara(distancia(a), distancia(b)));
    }
    const [indice, registro] = candidatos[0];
    usados.add(indice);
    if (compara(lanc.valorDebito, registro.debito) !== 0 || compara(lanc.valorCredito, registro.credito) !== 0) {
      lanc.valorDebito = registro.debito;
      lanc.valorCredito = registro.credito;
      if (compara(registro.debito, ZERO) > 0 && lanc.tipoOperacao === "COMPRA") lanc.tipoOperacao = "PAGAMENTO";
      else if (compara(registro.credito, ZERO) > 0 && lanc.tipoOperacao === "PAGAMENTO") lanc.tipoOperacao = "COMPRA";
    }
  }
  return lancamentos;
}

// ─── A leitura pelas colunas (sem IA) ───────────────────────────────────────

const VALOR_COM_TIPO = re("(\\d{1,3}(?:\\.\\d{3})*,\\d{2})([CD])?");
const TOTAL_DA_CONTA = re("Total da conta:\\s*(\\d{1,3}(?:\\.\\d{3})*,\\d{2})\\s+(\\d{1,3}(?:\\.\\d{3})*,\\d{2})");
const SALDO_ANTERIOR = re("SALDO ANTERIOR.*?(\\d{1,3}(?:\\.\\d{3})*,\\d{2})([CD])?", "i");
const COMECA_COM_DATA = re("^\\s*\\d{2}/\\d{2}/\\d{4}");
const ALGUM_NUMERO = re("\\d+");
const ESPACOS_REPETIDOS = re("\\s{2,}");

const decimalBr = (t: string) => decimalOuErro(t.replaceAll(".", "").replaceAll(",", "."));

/** `_ler_linha_lancamento`: o lançamento inteiro de uma linha alinhada, ou nulo. */
export function lerLinhaLancamento(linha: string, colunas: ColunasDoCabecalho): LancamentoDoRazao | null {
  const m = DATA_E_LOTE.match(linha);
  if (!m) return null;
  let data: string;
  try {
    data = strptimeDMY(m[1]!);
  } catch {
    return null;
  }
  const valores = new Map<string, Dec>();
  let saldoTipo = "";
  for (const achado of VALOR_COM_TIPO.finditer(linha)) {
    if (achado.inicio < m.fim) continue;
    const coluna = colunaDoValor(posPy(linha, achado.inicio + achado[1]!.length), colunas);
    if (!coluna) continue;
    valores.set(coluna, soma(valores.get(coluna) ?? dec("0"), decimalBr(achado[1]!)));
    if (coluna.startsWith("saldo") && achado[2]) saldoTipo = achado[2];
  }
  const debito = valores.get("debito") ?? dec("0");
  const credito = valores.get("credito") ?? dec("0");
  if (ehZero(debito) && ehZero(credito)) return null;

  const inicioHist = colunas.historico ?? posPy(linha, m.fim);
  const fimHist = colunas.cta ?? colunas.inicioDebito;
  const historico = len(linha) > inicioHist ? strip(fatiaPy(linha, inicioHist, fimHist)) : "";
  let contaPartida: string | null = null;
  if (colunas.cta !== null) {
    const achado = ALGUM_NUMERO.search(fatiaPy(linha, colunas.cta, colunas.inicioDebito));
    if (achado) contaPartida = achado[0]!;
  }
  const saldo = [...valores].find(([k]) => k.startsWith("saldo"))?.[1] ?? dec("0");
  return {
    dataLancamento: `${data} 00:00:00`,
    lote: m[2]!,
    historico,
    contaPartida,
    valorDebito: debito,
    valorCredito: credito,
    saldoAposLancamento: saldo,
    saldoTipo,
    tipoOperacao: compara(debito, ZERO) > 0 ? "PAGAMENTO" : "COMPRA",
    numeroNf: null,
    cnpjHistorico: null,
    classificacaoIncerta: false,
    classificadoPorIa: false,
  };
}

/** `_e_continuacao_de_historico`: a linha sem data, sem "Total da conta"/"Conta:" e sem valor nas colunas é sobra do histórico. */
export function eContinuacaoDeHistorico(linha: string, colunas: ColunasDoCabecalho): boolean {
  if (!strip(linha) || COMECA_COM_DATA.match(linha)) return false;
  if (linha.includes("Total da conta") || strip(linha).startsWith("Conta:")) return false;
  for (const achado of VALOR_COM_TIPO.finditer(linha)) {
    if (colunaDoValor(posPy(linha, achado.inicio + achado[1]!.length), colunas)) return false;
  }
  return true;
}

/** O resultado da leitura de um bloco (sem a identificação do fornecedor). */
export type DadosDoBloco = {
  saldoAnterior: Dec;
  saldoAnteriorTipo: string;
  totalDebito: Dec;
  totalCredito: Dec;
  lancamentos: LancamentoDoRazao[];
  /** A conta aberta no plano sem movimento no período. */
  semMovimento?: true;
};

/** O saldo anterior do bloco: o primeiro valor depois de "SALDO ANTERIOR", com o C/D. */
function saldoAnteriorDoTexto(texto: string): [Dec, string] {
  const m = SALDO_ANTERIOR.search(texto);
  return m ? [decimalBr(m[1]!), m[2] ?? ""] : [dec("0"), ""];
}

/**
 * `parsear_bloco_deterministico`: o bloco lido pelas colunas, SEM IA. Só aceita quando consegue provar: a
 * soma dos débitos e dos créditos fecha com o "Total da conta" impresso (a R$ 0,01). Sem cabeçalho, sem total
 * ou sem fechar: nulo, e o bloco vai para a IA. A conta sem movimento (totais zerados e nenhuma linha com
 * data) é resultado válido.
 */
export function parsearBlocoDeterministico(linhas: readonly string[]): DadosDoBloco | null {
  const colunas = colunasDoHeader(linhas);
  if (!colunas) return null;
  const texto = linhas.join("\n");
  const total = TOTAL_DA_CONTA.search(texto);
  if (!total) return null;
  const totalDebito = decimalBr(total[1]!);
  const totalCredito = decimalBr(total[2]!);

  const lancamentos: LancamentoDoRazao[] = [];
  for (const linha of linhas) {
    const lanc = lerLinhaLancamento(linha, colunas);
    if (lanc) lancamentos.push(lanc);
    else if (lancamentos.length && eContinuacaoDeHistorico(linha, colunas)) {
      const sobra = strip(linha);
      if (sobra && !ehDigitosPy(sobra)) {
        const ultimo = lancamentos[lancamentos.length - 1];
        ultimo.historico = strip(`${ultimo.historico} ${sobra}`);
      }
    }
  }

  if (!lancamentos.length) {
    const temLinhaDeLancamento = linhas.some((l) => COMECA_COM_DATA.match(l));
    if (ehZero(totalDebito) && ehZero(totalCredito) && !temLinhaDeLancamento) {
      const [saldoAnterior, saldoAnteriorTipo] = saldoAnteriorDoTexto(texto);
      return { saldoAnterior, saldoAnteriorTipo, totalDebito: dec("0"), totalCredito: dec("0"), lancamentos: [], semMovimento: true };
    }
    return null;
  }

  const somaDebito = somaTodos(lancamentos.map((l) => l.valorDebito));
  const somaCredito = somaTodos(lancamentos.map((l) => l.valorCredito));
  if (compara(modulo(subtrai(somaDebito, totalDebito)), UM_CENTAVO) > 0 || compara(modulo(subtrai(somaCredito, totalCredito)), UM_CENTAVO) > 0) return null;

  for (const lanc of lancamentos) {
    lanc.historico = strip(ESPACOS_REPETIDOS.sub(" ", lanc.historico));
    lanc.numeroNf = extrairNumeroNf(lanc.historico);
    lanc.cnpjHistorico = extrairCnpj(lanc.historico);
  }
  const [saldoAnterior, saldoAnteriorTipo] = saldoAnteriorDoTexto(texto);
  return { saldoAnterior, saldoAnteriorTipo, totalDebito, totalCredito, lancamentos };
}

// ─── O fornecedor ───────────────────────────────────────────────────────────

const LINHA_DA_CONTA = re("Conta:\\s*(\\d+)\\s*(?:-\\s*)?([\\d.]+)\\s+(.+)$");
const CONTA_VAZIA = re("Conta:\\s*$");
const ESPACOS = re("\\s+");
const LETRA_DIGITO = re("(?:\\d[A-Z]){3}|(?:[A-Z]\\d){3}");
const SO_NUMEROS = re("^[\\d.,/\\s]+$");

/** `_parece_nome_fornecedor`: 4 caracteres ou mais, sem dígito e letra alternados, não só número, com 4 letras ou mais. */
export function pareceNomeFornecedor(linha: string): boolean {
  const l = strip(linha);
  if (!l || len(l) < 4) return false;
  if (LETRA_DIGITO.search(l)) return false;
  if (SO_NUMEROS.match(l)) return false;
  return [...l].filter((c) => /\p{L}/u.test(c)).length >= 4;
}

/**
 * `_identificar_fornecedor`: (código, conta contábil, nome) da linha "Conta:". Com "Conta:" sem código, o
 * nome que vier nas 5 linhas seguintes, com o código gerado (os 6 primeiros hexadecimais do MD5 do nome em
 * maiúsculas) e a conta "0.0.0.00.0000".
 */
export function identificarFornecedor(linhas: readonly string[]): [string, string, string] | null {
  for (const linha of linhas) {
    const m = LINHA_DA_CONTA.match(strip(linha));
    if (m) return [m[1]!, m[2]!, strip(m[3]!)];
  }
  let nome: string | null = null;
  for (let i = 0; i < linhas.length; i++) {
    if (!CONTA_VAZIA.match(strip(linhas[i]))) continue;
    for (let j = i + 1; j < Math.min(i + 6, linhas.length); j++) {
      const candidata = ESPACOS.sub(" ", strip(linhas[j]));
      if (pareceNomeFornecedor(candidata)) {
        nome = candidata;
        break;
      }
    }
    break;
  }
  if (!nome) return null;
  const h = createHash("md5").update(nome.toUpperCase(), "utf8").digest("hex");
  return [h.slice(0, 6), "0.0.0.00.0000", nome];
}

/** `_construir_fornecedor_deterministico`: o fornecedor do bloco lido pelas colunas (sem a identificação, nulo). */
export function construirFornecedorDeterministico(dados: DadosDoBloco, linhas: readonly string[]): FornecedorDoRazao | null {
  const identidade = identificarFornecedor(linhas);
  if (!identidade) return null;
  const [codigoConta, contaContabil, nomeFornecedor] = identidade;
  return {
    codigoConta,
    contaContabil,
    nomeFornecedor,
    saldoAnterior: dados.saldoAnterior,
    saldoAnteriorTipo: dados.saldoAnteriorTipo,
    totalDebito: dados.totalDebito,
    totalCredito: dados.totalCredito,
    lancamentos: dados.lancamentos,
    conciliacaoIa: [],
    resumoIa: new Map(),
    validacaoIa: new Map(),
  };
}

/** `len(v)` do Python, ou o `TypeError` de quem não tem tamanho. */
function tamanhoPy(v: ValorPy): number {
  if (typeof v === "string") return len(v);
  if (Array.isArray(v)) return v.length;
  if (v instanceof Map) return v.size;
  throw erroPython("TypeError", `object of type '${tipoPy(v)}' has no len()`);
}

/** `for x in v` do Python (só para saber se itera): o que não é lista, texto ou dicionário levanta. */
function iteravelPy(v: ValorPy): void {
  if (typeof v === "string" || Array.isArray(v) || v instanceof Map) return;
  throw erroPython("TypeError", `'${tipoPy(v)}' object is not iterable`);
}

/**
 * `_construir_fornecedor_de_ia`: a identificação da linha "Conta:" com os números da IA. Os lançamentos
 * passam por `normalizarLancamentoIa` (nenhum: nulo) e pela correção da coluna. O que a IA devolveu fora
 * do formato na conciliação, no resumo e na validação levanta, como no original (`AttributeError`,
 * `TypeError`, `InvalidOperation`).
 */
export function construirFornecedorDeIa(dadosIa: Map<string, ValorPy>, linhas: readonly string[]): FornecedorDoRazao | null {
  const identidade = identificarFornecedor(linhas);
  if (!identidade) return null;
  const [codigoConta, contaContabil, nomeFornecedor] = identidade;
  const brutos = dadosIa.get("lancamentos");
  const lancamentos: LancamentoDoRazao[] = [];
  for (const l of Array.isArray(brutos) ? brutos : []) {
    const normalizado = normalizarLancamentoIa(l);
    if (normalizado) lancamentos.push(normalizado);
  }
  if (!lancamentos.length) return null;
  corrigirColunasPorPosicao(lancamentos, linhas);

  const ou = (v: ValorPy | undefined, padrao: ValorPy): ValorPy => (verdadeiro(v) ? v! : padrao);
  const conciliacaoIa = ou(dadosIa.get("conciliacao"), []);
  const resumoIa = ou(dadosIa.get("resumo"), new Map());
  const validacaoIa = ou(dadosIa.get("validacao"), new Map());
  const observacoes = pegar(validacaoIa, "observacoes");
  if (verdadeiro(observacoes)) iteravelPy(observacoes!);
  // A linha do log do original (as conversões e o `len` podem levantar).
  iaDecimal(dadosIa.get("total_debito"));
  iaDecimal(dadosIa.get("total_credito"));
  tamanhoPy(conciliacaoIa);

  const tipoDoSaldo = dadosIa.get("saldo_anterior_tipo");
  return {
    codigoConta,
    contaContabil,
    nomeFornecedor,
    saldoAnterior: iaDecimal(dadosIa.get("saldo_anterior")),
    saldoAnteriorTipo: verdadeiro(tipoDoSaldo) ? strPy(tipoDoSaldo!) : "",
    totalDebito: iaDecimal(dadosIa.get("total_debito")),
    totalCredito: iaDecimal(dadosIa.get("total_credito")),
    lancamentos,
    conciliacaoIa,
    resumoIa,
    validacaoIa,
  };
}

// ─── O arquivo inteiro ──────────────────────────────────────────────────────

/** A resposta de uma leitura por IA: os dados, nada (falhou ou não serviu) ou a IA indisponível (com a frase). */
export type RespostaDaIa = { dados: Map<string, ValorPy> } | { indisponivel: string } | null;

/** As duas leituras por IA de um bloco (`ia.ts` e `razao.ts`); os testes trocam. */
export type IaDoRazao = {
  /** `parsear_bloco_fornecedor_ia`: o texto do bloco (já limpo) ao agente de texto. */
  texto(bloco: string): Promise<RespostaDaIa>;
  /**
   * `_renderizar_paginas_pdf` + `parsear_bloco_fornecedor_ia_visao`: as páginas (índices a partir de 0) ao
   * agente de imagem. Lança `FalhaNaLeituraPorImagem` (o `VisionBatchError`) quando um lote falha.
   */
  visao(paginas: number[], bloco: string): Promise<RespostaDaIa>;
};

/** `_tem_valores`: algum lançamento com débito mais crédito positivo (para no primeiro, como o `any`). */
function temValores(lancamentos: readonly ValorPy[]): boolean {
  for (const l of lancamentos) {
    const total = soma(iaDecimal(pegar(l, "valor_credito")), iaDecimal(pegar(l, "valor_debito")));
    if (compara(total, ZERO) > 0) return true;
  }
  return false;
}

const lancamentosDa = (dados: Map<string, ValorPy>): ValorPy[] => {
  const l = dados.get("lancamentos");
  return Array.isArray(l) ? l : [];
};

const PERIODO = re("(\\d{2}/\\d{2}/\\d{4})\\s*-\\s*(\\d{2}/\\d{2}/\\d{4})");
const EMPRESA = re("Empresa:\\s*(.+?)(?:\\s+Folha:|\\n)");
const CNPJ = re("C\\.N\\.P\\.J\\.:\\s*([\\d./-]+)");
const CODIGO_DA_CONTA = re("Conta:\\s*(\\d+)");

/**
 * O laço de `parsear_arquivo_razao` sobre o texto das páginas (já extraído na estratégia escolhida): os
 * blocos "Conta:", cada um pelas três tentativas, a consolidação e o cabeçalho do relatório (empresa,
 * CNPJ e período).
 *
 * Como no original:
 * - as linhas antes do primeiro "Conta:" (o cabeçalho do relatório) também são um bloco, e vão à IA;
 * - a linha do cabeçalho da tabela ("Data", "Débito" e "Crédito") vai na frente de cada bloco;
 * - o "Conta:" repetido no alto da página seguinte, com o mesmo código, continua o bloco (a linha sai);
 * - as páginas de um bloco para a IA de imagem são as das linhas dele, contadas a partir da primeira, com
 *   o cabeçalho da tabela somado e sem as linhas "Conta:" repetidas (por isso podem incluir a página
 *   seguinte ou deixar a última de fora);
 * - a falha de um lote da IA de imagem interrompe a leitura do arquivo inteiro.
 */
export async function lerTextoDoRazao(textosDasPaginas: readonly string[], hashArquivo: string, ia: IaDoRazao): Promise<{ razao: RazaoDeFornecedores; diagnostico: DiagnosticoDoRazao }> {
  const textoCompleto = textosDasPaginas.join("\n\n");
  const linhaParaPagina = new Map<number, number>();
  let ln = 0;
  textosDasPaginas.forEach((texto, pagina) => {
    for (let k = 0; k < texto.split("\n").length; k++) linhaParaPagina.set(ln++, pagina);
    if (pagina < textosDasPaginas.length - 1) ln += 1;
  });

  const diagnostico: DiagnosticoDoRazao = { blocos: 0, deterministicos: 0, porTexto: 0, porImagem: 0, descartados: 0, iaIndisponivel: null };
  const anotar = (r: RespostaDaIa): Map<string, ValorPy> | null => {
    if (r && "indisponivel" in r) {
      diagnostico.iaIndisponivel ??= r.indisponivel;
      return null;
    }
    return r ? r.dados : null;
  };

  const fornecedores: FornecedorDoRazao[] = [];
  const linhas = textoCompleto.split("\n");
  const linhaCabecalho = linhas.find((l) => l.includes("Débito") && l.includes("Crédito") && l.includes("Data")) ?? "";

  const processarBloco = async (linhasBloco: string[], linhaInicio: number) => {
    if (!linhasBloco.length) return;
    diagnostico.blocos += 1;
    if (linhaCabecalho && !linhasBloco.includes(linhaCabecalho)) linhasBloco = [linhaCabecalho, ...linhasBloco];
    const blocoTexto = preprocessarBloco(linhasBloco.join("\n"));

    // 0. As colunas, sem IA.
    const preprocessadas = blocoTexto.split("\n");
    const det = parsearBlocoDeterministico(preprocessadas);
    if (det && (det.lancamentos.some((l) => compara(soma(l.valorCredito, l.valorDebito), ZERO) > 0) || det.semMovimento)) {
      const fornecedor = construirFornecedorDeterministico(det, preprocessadas);
      if (fornecedor) {
        fornecedores.push(fornecedor);
        diagnostico.deterministicos += 1;
        return;
      }
    }

    // 1. O texto, pela IA.
    const dadosIa = anotar(await ia.texto(blocoTexto));
    if (dadosIa && temValores(lancamentosDa(dadosIa))) {
      const fornecedor = construirFornecedorDeIa(dadosIa, linhasBloco);
      if (fornecedor) {
        fornecedores.push(fornecedor);
        diagnostico.porTexto += 1;
        return;
      }
    }

    // 2. As páginas, pela IA de imagem.
    const paginas = new Set<number>();
    for (let i = linhaInicio; i < linhaInicio + linhasBloco.length; i++) {
      const p = linhaParaPagina.get(i);
      if (p !== undefined) paginas.add(p);
    }
    if (paginas.size) {
      const dadosVisao = anotar(await ia.visao([...paginas].sort((a, b) => a - b), blocoTexto));
      if (dadosVisao && temValores(lancamentosDa(dadosVisao))) {
        const fornecedor = construirFornecedorDeIa(dadosVisao, linhasBloco);
        if (fornecedor) {
          fornecedores.push(fornecedor);
          diagnostico.porImagem += 1;
          return;
        }
      }
    }
    diagnostico.descartados += 1;
  };

  let atual: string[] = [];
  let inicioAtual = 0;
  let codigoAtual: string | null = null;
  for (const [i, linha] of linhas.entries()) {
    // Sem `strip`: o recuo é a coluna, e a coluna diz se o valor é débito ou crédito.
    if (lstripPy(linha).startsWith("Conta:")) {
      const codigo = CODIGO_DA_CONTA.match(strip(linha))?.[1] ?? null;
      if (codigo !== null && codigo === codigoAtual) continue;
      await processarBloco(atual, inicioAtual);
      atual = [];
      inicioAtual = i;
      codigoAtual = codigo;
    }
    atual.push(linha);
  }
  await processarBloco(atual, inicioAtual);

  const consolidados = fornecedores.length ? consolidarFornecedoresDuplicados(fornecedores) : fornecedores;

  let periodoInicio: string | null = null;
  let periodoFim: string | null = null;
  const periodo = PERIODO.search(textoCompleto);
  if (periodo) {
    periodoInicio = parseData(periodo[1]!);
    periodoFim = parseData(periodo[2]!);
  }
  const empresa = EMPRESA.search(textoCompleto);
  const cnpj = CNPJ.search(textoCompleto);

  return {
    razao: {
      hashArquivo,
      empresa: empresa ? strip(empresa[1]!) : "",
      cnpj: cnpj ? strip(cnpj[1]!) : "",
      periodoInicio,
      periodoFim,
      totalFornecedores: consolidados.length,
      totalLancamentos: consolidados.reduce((n, f) => n + f.lancamentos.length, 0),
      fornecedores: consolidados,
    },
    diagnostico,
  };
}
