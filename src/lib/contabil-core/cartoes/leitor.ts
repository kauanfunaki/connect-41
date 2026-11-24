import "server-only";

// O leitor de fatura de cartão de crédito em PDF (Bloco C, Fase C3, 23/11/2026). Porte de
// `src/domain/cartoes/pdf_parser.py` do Contábil Core: as compras da fatura (data, descrição, parcela e
// valor), para a importação dos lançamentos (`importar_lancamentos_pdf`). Quem grava, com a
// duplicidade e o status da fatura, é o serviço.
//
// As camadas são as do original, e param na primeira que achar alguma compra:
// 1. o texto do PDF (o `extract_text` do pdfplumber, porte em `pdf/plumber.ts`), linha a linha, pelo
//    layout genérico da fatura brasileira: data (com o mês em número ou abreviado, "16/dez"), a hora
//    colada (Sicredi), a descrição, a parcela "02/03" e o valor ("R$", sinal antes ou depois). O valor
//    negativo é o pagamento da fatura anterior, e fica de fora. Sem o ano na linha, o ano vem do
//    vencimento da fatura (a fatura que vence em janeiro traz compras de dezembro do ano anterior);
// 2. o mesmo texto ao agente de texto (`leitor_de_fatura_texto`), quando o layout não é o genérico.
// Não há camada de imagem: a fatura escaneada é recusada, como lá (a transcrição revisável da fatura
// escaneada é o documento da fatura, `cartoes/documentos.ts`).
//
// Achando compras, o total declarado na fatura ("TOTAL DESTA FATURA", "VALOR TOTAL", "TOTAL A PAGAR")
// é conferido contra a soma: diferença acima de R$ 0,05 é extração incompleta, e a fatura é recusada.
// Sem total reconhecível, a importação segue.
//
// A IA vai pela peça comum `ia/leituraPorIa.ts` (a fundação de IA do Connect, a chave do escritório e o
// orçamento do arquivo). Como no original, IA desligada, escritório sem provedor e falha do provedor não
// são recusa: a camada só não acha nada, e a frase final é a do layout não reconhecido.
//
// Divergência: onde o original deixava escapar exceção crua (erro 500) por causa da resposta da IA (um
// item que não é objeto, a parcela infinita, o valor "NaN" com total declarado), aqui é recusa com
// `RESPOSTA_FORA_DO_FORMATO`.
//
// Conferido pelo gabarito (`gabarito/cartoes-chamadas.json`, de `gabarito_cartoes.py`): as funções puras
// chamada a chamada e a leitura inteira em cenários com a IA simulada.

import { re, splitlines, strip, corta, len, inteiro } from "../extrato/py";
import { decimal, ehZero, NAO_FINITO, compara, dec, soma, subtrai, modulo, texto as textoDec, type Dec } from "../motor/decimal";
import { digitoUnicode } from "../motor/unicodePy";
import { lerPorIa, Orcamento, OrcamentoEsgotado, type ContextoDeLeitura, type DependenciasDaIa } from "../ia/leituraPorIa";
import { jsonPython, str, verdadeiro, type ValorPy } from "../notas/visual";
import { LeituraRecusada, lerValor, linhasDoPdf, textoDecimal } from "../comprovantes/leitor";

export { LeituraRecusada };

export const AGENTE_TEXTO = "leitor_de_fatura_texto";

/** Uma compra lida da fatura: o `LancamentoPDF` do original. */
export type LancamentoLido = {
  /** O dia da compra, "AAAA-MM-DD" (o original grava a meia-noite UTC). */
  dataCompra: string;
  descricao: string;
  /** O `str()` do `Decimal` lido, exato ("317.93"; da IA pode vir "150.0", "1E+2" e até "NaN"). */
  valor: string;
  parcelaAtual: number | null;
  parcelaTotal: number | null;
};

/** Onde o original quebrava (erro 500) por causa da resposta da IA. */
export const RESPOSTA_FORA_DO_FORMATO =
  "A leitura por IA devolveu dados fora do formato esperado. Verifique o arquivo ou importe via CSV/Excel.";

/** O que o original deixava escapar sem tratar (`AttributeError`, `OverflowError`, `InvalidOperation`). */
export class ForaDoFormato extends Error {
  constructor(readonly tipoNoOriginal: "AttributeError" | "OverflowError" | "InvalidOperation") {
    super(RESPOSTA_FORA_DO_FORMATO);
    this.name = "ForaDoFormato";
  }
}

/** As frases do `_PDFBudget` da fatura (as mesmas do comprovante). */
const FRASES_DO_ORCAMENTO = {
  tempo: "Processamento do PDF excedeu o tempo limite.",
  chamadas: "PDF excedeu o limite de chamadas ao serviço de IA.",
};

/** Um orçamento novo com os limites do original (60 s, 120 páginas, 30 chamadas) e as frases da fatura. */
export const orcamentoDaFatura = (limites: { segundos?: number; maxPaginas?: number; maxChamadas?: number } = {}, agora?: () => number) =>
  new Orcamento({ ...limites, frases: FRASES_DO_ORCAMENTO }, agora);

/** O relógio do ano das compras sem ano (`datetime.now(UTC).year`); os testes trocam. */
export type Relogio = () => Date;
const AGORA: Relogio = () => new Date();

// ─── Datas ──────────────────────────────────────────────────────────────────

export const MESES_ABREV: Readonly<Record<string, number>> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

/** `_mes_do_texto`: "12" ou "dez". (O `[a-zç0-9]` que chega aqui só tem dígito ASCII.) */
function mesDoTexto(mes: string): number | null {
  if (/^[0-9]+$/.test(mes)) {
    const mo = inteiro(mes);
    return mo >= 1 && mo <= 12 ? mo : null;
  }
  return MESES_ABREV[mes.toLowerCase()] ?? null;
}

/** `_resolve_ano`: o ano do vencimento; o do mês seguinte ao vencimento é o ano anterior. */
function resolverAno(mes: number, referencia: readonly [number, number] | null, agora: Relogio): number {
  if (referencia === null) return agora().getUTCFullYear();
  const [ano, mesVencimento] = referencia;
  return mes > mesVencimento ? ano - 1 : ano;
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** `datetime(ano, mes, dia)`: o dia "AAAA-MM-DD", ou `null` onde o Python levantaria ValueError. */
export function diaValido(ano: number, mes: number, dia: number): string | null {
  if (!Number.isInteger(ano) || ano < 1 || ano > 9999 || mes < 1 || mes > 12 || dia < 1) return null;
  const bissexto = ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0);
  const dias = mes === 2 ? (bissexto ? 29 : 28) : [4, 6, 9, 11].includes(mes) ? 30 : 31;
  if (dia > dias) return null;
  return `${String(ano).padStart(4, "0")}-${p2(mes)}-${p2(dia)}`;
}

const DATA_COMPLETA = re("^(\\d{2})/(\\d{2})/(\\d{2,4})$");
const DATA_SEM_ANO = re("^(\\d{2})/([a-zç0-9]{2,3})$", "i");

/**
 * `_parse_data`: DD/MM/AAAA, DD/MM/AA, DD/MM ou DD/MMM ("16/dez"). Sem o ano no texto, o ano vem de
 * `referencia` (ano e mês do vencimento) ou, sem ela, do relógio.
 */
export function lerData(s: string, referencia: readonly [number, number] | null = null, agora: Relogio = AGORA): string | null {
  const t = strip(s);
  const m = DATA_COMPLETA.match(t);
  if (m) {
    const [d, mo] = [m[1]!, m[2]!];
    let y = m[3]!;
    if (len(y) === 2) y = "20" + y;
    return diaValido(inteiro(y), inteiro(mo), inteiro(d));
  }
  const m2 = DATA_SEM_ANO.match(t);
  if (m2) {
    const mo = mesDoTexto(m2[2]!);
    if (mo === null) return null;
    return diaValido(resolverAno(mo, referencia, agora), mo, inteiro(m2[1]!));
  }
  return null;
}

const VENCIMENTO = re("vencimento\\s+(\\d{2})/(\\d{2})/(\\d{4})", "i");

/** `_referencia_fatura`: (ano, mês) do vencimento, se aparecer em alguma linha. */
export function referenciaDaFatura(linhas: readonly string[]): [number, number] | null {
  const m = VENCIMENTO.search(linhas.join("\n"));
  return m ? [inteiro(m[3]!), inteiro(m[2]!)] : null;
}

// ─── Valores ────────────────────────────────────────────────────────────────

/** `_parse_valor`: "R$ 1.234,56" → "1234.56"; "-R$ 39.249,28" → "-39249.28". O mesmo do comprovante. */
export { lerValor };

/** Arredonda para 28 dígitos significativos, meio para par (o contexto padrão do `decimal`). */
function naPrecisao(d: Dec): Dec {
  const digitos = d.coeficiente.toString().length;
  if (digitos <= 28) return d;
  const corte = digitos - 28;
  const divisor = BigInt(10) ** BigInt(corte);
  let q = d.coeficiente / divisor;
  const r = d.coeficiente % divisor;
  const dobro = r * BigInt(2);
  if (dobro > divisor || (dobro === divisor && q % BigInt(2) === BigInt(1))) q += BigInt(1);
  if (q.toString().length > 28) return { negativo: d.negativo, coeficiente: q / BigInt(10), expoente: d.expoente + corte + 1 };
  return { negativo: d.negativo, coeficiente: q, expoente: d.expoente + corte };
}

/** Uma soma do `Decimal` com o contexto padrão: os não finitos à parte ("NaN" e "Infinity"). */
type SomaPy = Dec | "NaN" | "Infinity";

function somaDosValores(valores: readonly string[]): SomaPy {
  let total: SomaPy = dec("0");
  for (const v of valores) {
    const d = decimal(v);
    if (d === null) throw new Error(`valor sem Decimal: ${v}`);
    if (d === NAO_FINITO) {
      // Os valores da IA passaram por `copy_abs`: só NaN e +Infinity chegam aqui (o sNaN já saiu).
      total = /nan/i.test(v) || (total as SomaPy) === "NaN" ? "NaN" : "Infinity";
      continue;
    }
    if (total !== "NaN" && total !== "Infinity") total = naPrecisao(soma(total, d));
  }
  return total;
}

const TOTAL = re(
  "(TOTAL\\s+(?:DESTA\\s+)?FATURA|VALOR\\s+TOTAL(?:\\s+DA\\s+FATURA)?|TOTAL\\s+A\\s+PAGAR)" + ".{0,20}?(-?\\d{1,3}(?:\\.\\d{3})*,\\d{2})",
  "i",
);
const TOLERANCIA = dec("0.05");

/**
 * `_validar_total_declarado`: com um total reconhecível na fatura, a soma das compras tem de bater (até
 * R$ 0,05). Sem total reconhecível, não bloqueia. Lança `LeituraRecusada` (extração incompleta).
 */
export function validarTotalDeclarado(linhas: readonly string[], lancamentos: readonly Pick<LancamentoLido, "valor">[]): void {
  const m = TOTAL.search(linhas.join("\n"));
  if (!m) return;
  const lido = lerValor(m[2]!);
  if (lido === null) return;
  const declarado = decimal(lido) as Dec;
  const absDeclarado = naPrecisao(modulo(declarado));
  const total = somaDosValores(lancamentos.map((l) => l.valor));
  // NaN na comparação levanta InvalidOperation no Python (erro 500 lá).
  if (total === "NaN") throw new ForaDoFormato("InvalidOperation");
  const diverge = total === "Infinity" || compara(naPrecisao(modulo(naPrecisao(subtrai(total, absDeclarado)))), TOLERANCIA) > 0;
  if (diverge) {
    const somaTexto = total === "Infinity" ? "Infinity" : textoDec(total);
    throw new LeituraRecusada(
      `Extração incompleta: soma dos lançamentos (R$ ${somaTexto}) não bate com o total declarado na fatura (R$ ${textoDec(absDeclarado)}).`,
    );
  }
}

// ─── Camada 1: o layout genérico ────────────────────────────────────────────

// Linha típica: "DD/MM[/AAAA]  [HH:MM]  DESCRICAO  [NN/NN]  VALOR" (o mês pode vir abreviado, "16/dez").
const LINHA = re(
  "^(?P<data>\\d{2}/(?:\\d{2}|[a-zç]{3})(?:/\\d{2,4})?)\\s+" +
    "(?:\\d{2}:\\d{2}\\s+)?" +
    "(?P<descricao>.+?)" +
    "(?:\\s+(?P<parc_atual>\\d{1,2})/(?P<parc_total>\\d{1,2}))?" +
    "\\s+(?P<valor>-?\\s*(?:R\\$\\s*)?-?\\d{1,3}(?:\\.\\d{3})*,\\d{2})\\s*$",
  "i",
);

const PULAR = re(
  "^(Total|Sub-?total|Saldo|Limite|Vencimento|Fechamento|Data\\s|Lan[cç]amento|" + "P[aá]gina|Fatura|Cart[aã]o|Pagamento\\s+m[ií]nimo)",
  "i",
);

/** A linha do layout genérico (o `_LINHA_RE` do original), que o documento da fatura também usa. */
export const LINHA_DA_FATURA = LINHA;

const positivo = (v: string) => {
  const d = decimal(v);
  return d !== null && d !== NAO_FINITO && !ehZero(d) && !d.negativo;
};

/** `_parse_por_regex`: as compras das linhas no layout genérico (o valor negativo fica de fora). */
export function lerPorRegex(linhas: readonly string[], referencia: readonly [number, number] | null, agora: Relogio = AGORA): LancamentoLido[] {
  const lancamentos: LancamentoLido[] = [];
  for (const bruta of linhas) {
    const linha = strip(bruta);
    if (!linha || PULAR.match(linha)) continue;
    const m = LINHA.match(linha);
    if (!m) continue;
    const data = lerData(m.grupo("data")!, referencia, agora);
    if (data === null) continue;
    const valor = lerValor(m.grupo("valor")!);
    // O valor negativo é o pagamento da fatura anterior, não uma compra.
    if (valor === null || !positivo(valor)) continue;
    const descricao = strip(m.grupo("descricao")!);
    if (!descricao) continue;
    const atual = m.grupo("parc_atual");
    const total = m.grupo("parc_total");
    lancamentos.push({
      dataCompra: data,
      descricao: corta(descricao, 200),
      valor,
      parcelaAtual: atual ? inteiro(atual) : null,
      parcelaTotal: total ? inteiro(total) : null,
    });
  }
  return lancamentos;
}

// ─── Camada 2: a IA de texto (o prompt é o do original) ─────────────────────

export const SISTEMA = "Você é um extrator de dados financeiros. Responda SOMENTE com JSON puro — sem texto, sem markdown, sem explicações.";

export const PROMPT = `Analise esta fatura de cartão de crédito brasileira e extraia TODAS as compras/lançamentos.

Retorne um array JSON onde cada objeto tem EXATAMENTE estas chaves:
  "data"          → string no formato DD/MM/AAAA (ex: "15/01/2026")
  "descricao"     → string com a descrição/estabelecimento (ex: "MERCADO LIVRE*COMPRA")
  "valor"         → número decimal positivo (ponto como separador)
  "parcela_atual" → número inteiro da parcela atual, ou null se compra à vista
  "parcela_total" → número inteiro total de parcelas, ou null se compra à vista

Regras obrigatórias:
- Use EXATAMENTE os nomes de campo acima
- IGNORE linhas de total, subtotal, saldo, limite, cabeçalhos e rodapés
- IGNORE o próprio pagamento da fatura anterior (ex: "PAGAMENTO EFETUADO")
- Se não houver lançamentos visíveis, retorne []

Exemplo de saída:
[
  {"data":"05/01/2026","descricao":"MERCADO LIVRE*COMPRA","valor":150.00,"parcela_atual":null,"parcela_total":null},
  {"data":"07/01/2026","descricao":"UBER *TRIP","valor":45.90,"parcela_atual":2,"parcela_total":3}
]`;

const TEXTO_MAXIMO = 80_000;
const MAX_TOKENS = 4096;

const CERCA_INICIO = re("^```(?:json)?\\s*");
const CERCA_FIM = re("\\s*```\\s*$");

/** `_parse_ai_response`: a lista da resposta (também dentro de "lancamentos", "compras", "items" ou "data"); `[]` quando não serve. */
export function analisarResposta(bruto: string): ValorPy[] {
  let t = CERCA_INICIO.sub("", strip(bruto));
  t = strip(CERCA_FIM.sub("", t));
  let r: ValorPy;
  try {
    r = jsonPython(t);
  } catch {
    return [];
  }
  if (r instanceof Map) {
    for (const chave of ["lancamentos", "compras", "items", "data"]) {
      const v = r.get(chave);
      if (v !== undefined && Array.isArray(v)) {
        r = v;
        break;
      }
    }
  }
  return Array.isArray(r) ? r : [];
}

/** `int(v)` do Python sobre o que o `json.loads` devolveu: `null` onde ele levantaria ValueError/TypeError. */
function intDoItem(v: ValorPy): number | null {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    let t = "";
    for (const c of strip(v)) {
      const d = c >= "0" && c <= "9" ? null : digitoUnicode(c);
      t += d === null ? c : String(d);
    }
    const m = /^([+-]?)(\d(?:_?\d)*)$/.exec(t);
    if (!m) return null;
    const n = Number(m[2].replaceAll("_", ""));
    return m[1] === "-" ? -n : n + 0;
  }
  if (v === null || Array.isArray(v) || v instanceof Map) return null;
  if (v.py === "int") return Number(v.texto) + 0;
  if (v.py === "float") {
    if (v.texto === "nan") return null;
    throw new ForaDoFormato("OverflowError");
  }
  // Decimal: NaN é ValueError, infinito é OverflowError; o finito é truncado.
  if (v.valor === NAO_FINITO) {
    if (/nan/i.test(v.texto)) return null;
    throw new ForaDoFormato("OverflowError");
  }
  const d = v.valor;
  const q = d.expoente >= 0 ? d.coeficiente * BigInt(10) ** BigInt(d.expoente) : d.coeficiente / BigInt(10) ** BigInt(-d.expoente);
  const n = Number(q);
  return d.negativo ? -n + 0 : n;
}

/**
 * `_lancamento_from_ai`: a compra que a IA leu, ou `null` (sem data, sem valor, valor zero, parcela que não
 * é número). O item que não é objeto quebrava o original (`AttributeError`): lança `ForaDoFormato`.
 */
export function lancamentoDaIa(item: ValorPy, agora: Relogio = AGORA): LancamentoLido | null {
  if (!(item instanceof Map)) throw new ForaDoFormato("AttributeError");
  const textoDe = (v: ValorPy | undefined) => (v !== undefined && verdadeiro(v) ? str(v) : "");
  const data = lerData(strip(textoDe(item.get("data"))), null, agora);
  if (data === null) return null;
  const descricao = strip(textoDe(item.get("descricao"))) || "SEM DESCRIÇÃO";
  const bruto = item.get("valor");
  if (bruto === undefined || bruto === null) return null;
  // `Decimal(str(valor_raw)).copy_abs()`; inválido (InvalidOperation) e zero dão `null`.
  const lido = textoDecimal(str(bruto));
  if (lido === null) return null;
  const d = decimal(lido);
  let valor: string;
  if (d === NAO_FINITO) {
    if (/snan/i.test(lido)) return null; // `sNaN == 0` levanta InvalidOperation, que o original captura.
    valor = lido.replace(/^-/, "");
  } else {
    if (d === null || ehZero(d)) return null;
    valor = textoDec({ ...d, negativo: false });
  }
  const parcela = (chave: string): number | null => {
    const v = item.get(chave);
    return v !== undefined && verdadeiro(v) ? intDoItem(v) : null;
  };
  const atualBruto = item.get("parcela_atual");
  const parcelaAtual = parcela("parcela_atual");
  if (parcelaAtual === null && atualBruto !== undefined && verdadeiro(atualBruto)) return null;
  const totalBruto = item.get("parcela_total");
  const parcelaTotal = parcela("parcela_total");
  if (parcelaTotal === null && totalBruto !== undefined && verdadeiro(totalBruto)) return null;
  return { dataCompra: data, descricao: corta(descricao, 200), valor, parcelaAtual, parcelaTotal };
}

export type OpcoesDaLeitura = {
  /** A fundação de IA (os testes trocam pela simulada). */
  ia?: DependenciasDaIa;
  orcamento?: Orcamento;
  /** O ano das compras sem ano e sem vencimento na fatura (os testes trocam). */
  agora?: Relogio;
};

/** Camada 2 (`_parse_por_ai_texto`): IA fora ou falha do provedor dão `[]`, como no original. */
async function viaTexto(linhas: readonly string[], quem: ContextoDeLeitura, orcamento: Orcamento, opcoes: OpcoesDaLeitura): Promise<LancamentoLido[]> {
  let t = linhas.join("\n");
  if (len(t) > TEXTO_MAXIMO) t = corta(t, TEXTO_MAXIMO);
  const r = await lerPorIa(
    quem,
    { agentCode: AGENTE_TEXTO, sistema: SISTEMA, texto: `Fatura de cartão:\n\n${t}\n\n${PROMPT}`, maxTokens: MAX_TOKENS, orcamento },
    opcoes.ia,
  );
  if (!r.ok) return [];
  const lancamentos: LancamentoLido[] = [];
  for (const item of analisarResposta(r.texto)) {
    const l = lancamentoDaIa(item, opcoes.agora);
    if (l !== null) lancamentos.push(l);
  }
  return lancamentos;
}

// ─── As entradas ────────────────────────────────────────────────────────────

export const SEM_TEXTO =
  "PDF sem camada de texto reconhecível (documentos escaneados/imagem não são suportados para fatura de cartão; envie via CSV/Excel).";
export const LAYOUT_NAO_RECONHECIDO = "Não foi possível extrair lançamentos desta fatura. Verifique o arquivo ou importe via CSV/Excel.";

function recusa(e: unknown): never {
  if (e instanceof OrcamentoEsgotado || e instanceof ForaDoFormato) throw new LeituraRecusada(e.message);
  throw e;
}

/**
 * `parse_pdf` depois de `_extrair_linhas`: as camadas sobre o texto já extraído (os testes do original
 * trocam a extração pelo texto pronto). Recusa com `LeituraRecusada`.
 */
export async function lerFaturaDoTexto(
  texto: { linhas: readonly string[]; total: number },
  quem: ContextoDeLeitura,
  orcamento: Orcamento,
  opcoes: OpcoesDaLeitura = {},
): Promise<LancamentoLido[]> {
  try {
    if (texto.total < 50) throw new LeituraRecusada(SEM_TEXTO);
    const referencia = referenciaDaFatura(texto.linhas);
    let lancamentos = lerPorRegex(texto.linhas, referencia, opcoes.agora);
    if (lancamentos.length) {
      validarTotalDeclarado(texto.linhas, lancamentos);
      return lancamentos;
    }
    lancamentos = await viaTexto(texto.linhas, quem, orcamento, opcoes);
    if (lancamentos.length) {
      validarTotalDeclarado(texto.linhas, lancamentos);
      return lancamentos;
    }
    throw new LeituraRecusada(LAYOUT_NAO_RECONHECIDO);
  } catch (e) {
    return recusa(e);
  }
}

/**
 * `parse_pdf`: as compras da fatura em PDF. Recusa com `LeituraRecusada` e a frase do original, sem o
 * "Arquivo PDF inválido: " que a rota do original punha na frente (quem põe é o servidor).
 */
export async function lerFaturaPdf(conteudo: Uint8Array, quem: ContextoDeLeitura, opcoes: OpcoesDaLeitura = {}): Promise<LancamentoLido[]> {
  const orcamento = opcoes.orcamento ?? orcamentoDaFatura();
  const texto = await linhasDoPdf(conteudo, orcamento).catch(recusa);
  return lerFaturaDoTexto(texto, quem, orcamento, opcoes);
}

/** Para o teste: o texto de cada página (`_extrair_linhas`). */
export { linhasDoPdf, splitlines };
