import "server-only";

// O leitor de comprovantes de pagamento (Bloco C, Fase C2, 19/11/2026). Porte de
// `src/domain/comprovantes/pdf_parser.py` do Contábil Core: PIX, TED, DOC e boleto pago, em PDF ou
// imagem. Só o valor pago é obrigatório; o resto pré-preenche o formulário, que a pessoa revisa.
//
// As camadas são as do original, e param na primeira que achar o valor pago:
// 1. o texto do PDF (o `extract_text` do pdfplumber, porte em `pdf/plumber.ts`), linha a linha, pelos
//    rótulos do comprovante brasileiro (Favorecido, CPF/CNPJ, Valor pago, Vencimento…), com o valor na
//    mesma linha do rótulo ou na seguinte;
// 2. o mesmo texto ao agente de texto, quando os rótulos não bastaram;
// 3. o PDF sem texto (escaneado) e a imagem ao agente de imagem, uma página por chamada.
// Antes da camada 1 o texto passa por `pareceNotaFiscal`: nota fiscal tem valor e casaria nos rótulos,
// mas não prova pagamento (o NEO a ligaria a um débito). A IA também declara o tipo do documento, e a
// nota é recusada com `DOCUMENTO_NAO_E_COMPROVANTE`, para a tela pular o arquivo.
//
// A IA vai pela peça comum `ia/leituraPorIa.ts` (a fundação de IA do Connect, a chave do escritório
// para documento financeiro e o orçamento do arquivo). Como na C1:
// - a página do PDF escaneado vai como um PDF de uma página (pdf-lib), não como PNG de 150 dpi: o
//   Connect não rasteriza PDF sem dependência nova. A ordem, o orçamento e as chamadas são os mesmos;
// - onde o original deixava escapar exceção crua (o PDF que nem o PyMuPDF abre, a falha do provedor na
//   camada de imagem), aqui é recusa com frase.
//
// Conferido pelo gabarito (`gabarito/comprovantes-chamadas.json`, de `gabarito_comprovantes.py`): as
// funções puras chamada a chamada e a leitura inteira em cenários com a IA simulada.

import { PDFDocument } from "pdf-lib";
import { caracteresDoPdf, LimiteDePaginas } from "../pdf/caracteres";
import { extrairTexto } from "../pdf/plumber";
import { decimal, NAO_FINITO, oposto, texto as textoDec, type Dec } from "../motor/decimal";
import { re, splitlines, strip, corta, len } from "../extrato/py";
import { lerPorIa, Orcamento, OrcamentoEsgotado, type ContextoDeLeitura, type DependenciasDaIa } from "../ia/leituraPorIa";
import { analisarRespostaIa, lerDataBr, str, verdadeiro, type ItemPy, type ValorPy } from "../notas/visual";
import { isAiConfigured } from "@/lib/ai";

export const AGENTE_TEXTO = "leitor_de_comprovante_texto";
export const AGENTE_IMAGEM = "leitor_de_comprovante_imagem";

/** O que o leitor devolve: o `ComprovantePDF` do original. Dinheiro é o `str()` do `Decimal`; data, o `isoformat()`. */
export type ComprovanteLido = {
  favorecido: string | null;
  cpfCnpj: string | null;
  dataPagamento: string | null;
  dataVencimento: string | null;
  valorDocumento: string | null;
  valorPago: string | null;
  juros: string | null;
  multa: string | null;
  desconto: string | null;
  confianca: "regex" | "ia";
};

/** O código que a rota devolve quando o arquivo é nota fiscal: a tela pula o arquivo em vez de pedir preenchimento. */
export const DOCUMENTO_NAO_E_COMPROVANTE = "DOCUMENTO_NAO_E_COMPROVANTE";

/** `PDFParseError` (e, com `codigo`, `DocumentoNaoEComprovanteError`): a frase vai para a pessoa. */
export class LeituraRecusada extends Error {
  constructor(
    mensagem: string,
    readonly codigo: typeof DOCUMENTO_NAO_E_COMPROVANTE | null = null,
  ) {
    super(mensagem);
    this.name = "LeituraRecusada";
  }
}

export const MENSAGEM_NOTA_FISCAL =
  "Este arquivo é uma nota fiscal, não um comprovante de pagamento. " +
  "Notas fiscais são importadas na tela de Notas Fiscais; aqui entra a prova " +
  "de que o pagamento saiu (PIX, TED, boleto pago).";

/** As frases do `_PDFBudget` do comprovante (o original fala em "PDF" também para a imagem). */
const FRASES_DO_ORCAMENTO = {
  tempo: "Processamento do PDF excedeu o tempo limite.",
  chamadas: "PDF excedeu o limite de chamadas ao serviço de IA.",
};

/** Um orçamento novo com os limites do original e as frases do comprovante. */
export const orcamentoDoComprovante = (limites: { segundos?: number; maxPaginas?: number; maxChamadas?: number } = {}) =>
  new Orcamento({ ...limites, frases: FRASES_DO_ORCAMENTO });

// ─── Ajudantes gerais ───────────────────────────────────────────────────────

/** `str(Decimal)` de um não finito: "Infinity", "-NaN", "sNaN12"… */
function textoNaoFinito(t: string): string {
  const s = strip(t);
  const sinal = s.startsWith("-") ? "-" : "";
  const corpo = s.replace(/^[+-]/, "").toLowerCase();
  if (corpo.startsWith("inf")) return `${sinal}Infinity`;
  const sinalizador = corpo.startsWith("s");
  const carga = corpo.replace(/^s?nan/, "").replace(/^0+/, "");
  return `${sinal}${sinalizador ? "sNaN" : "NaN"}${carga}`;
}

/** Arredonda para 28 dígitos significativos, meio para par (a precisão do contexto padrão do `decimal`). */
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

/** `str(Decimal(t))`, ou `null` quando o Python levantaria `InvalidOperation`. */
export function textoDecimal(t: string): string | null {
  const d = decimal(t);
  if (d === null) return null;
  if (d === NAO_FINITO) return textoNaoFinito(t);
  return textoDec(d);
}

/** `_parse_valor`: "R$ 1.234,56" → "1234.56"; "(5,00)" e "-5,00" → "-5.00". */
export function lerValor(entrada: string): string | null {
  let s = strip(entrada).replaceAll("R$", "").replaceAll(" ", "").replaceAll("\xa0", "");
  const negativo = s.startsWith("-") || s.startsWith("(");
  s = s.replace(/^[-(]+/, "").replace(/\)+$/, "");
  if (s.includes(",") && s.includes(".")) s = s.replaceAll(".", "").replaceAll(",", ".");
  else if (s.includes(",")) s = s.replaceAll(",", ".");
  const d = decimal(s);
  if (d === null) return null;
  if (d === NAO_FINITO) {
    const t = textoNaoFinito(s);
    // `-NaN` do Python devolve o próprio NaN; só o infinito troca de sinal.
    if (!negativo || t.includes("NaN")) return t;
    return t.startsWith("-") ? t.slice(1) : `-${t}`;
  }
  // `-val` passa pelo contexto (28 dígitos); o positivo volta como foi lido.
  return textoDec(negativo ? naPrecisao(oposto(d)) : d);
}

/** `_parse_data`: DD/MM/AA(AA) no começo, à meia-noite UTC, no `isoformat()`. */
export const lerData = (s: string): string | null => lerDataBr(s);

const VALOR_NA_LINHA = re("R?\\$?\\s*(-?\\d{1,3}(?:\\.\\d{3})*,\\d{2})");
const DATA_NA_LINHA = re("(\\d{2}/\\d{2}/\\d{2,4})");
const DOCUMENTO = re("(\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}|\\d{2}\\.\\d{3}\\.\\d{3}/\\d{4}-\\d{2}|\\d{11}|\\d{14})");

const valorNaLinha = (linha: string): string | null => {
  const m = VALOR_NA_LINHA.search(linha);
  return m ? lerValor(m[1]!) : null;
};
const dataNaLinha = (linha: string): string | null => {
  const m = DATA_NA_LINHA.search(linha);
  return m ? lerData(m[1]!) : null;
};
const documentoNaLinha = (linha: string): string | null => {
  const m = DOCUMENTO.search(linha);
  return m ? m[1]! : null;
};

/** `_primeiro_nao_nulo` */
const primeiro = <T>(...xs: (T | null)[]): T | null => xs.find((x) => x !== null) ?? null;

/** `_apos_rotulo`: o texto que sobra na linha depois do rótulo (o favorecido). */
function aposRotulo(linha: string, rotulo: ReturnType<typeof re>): string | null {
  const m = rotulo.search(linha);
  if (!m) return null;
  let resto = linha.slice(m.fim);
  let i = 0;
  while (i < resto.length && " :\t-".includes(resto[i])) i++;
  resto = strip(resto.slice(i));
  return resto || null;
}

// ─── O arquivo é comprovante? ───────────────────────────────────────────────
//
// Nota fiscal tem valor, e as três camadas só procuram valor. O que só existe na nota é a estrutura:
// o nome do documento auxiliar (DANFSe, DANFE), as duas partes do serviço (prestador E tomador) e o
// endereço de impressão do portal emissor (a NFS-e de São Paulo salva com Ctrl+P, em que o corpo é
// imagem e só sobra o cabeçalho do navegador). "Nota fiscal" solto não basta: o PIX que paga a nota
// diz "Pagamento NF 1234".

const NOTA_DOCUMENTO_AUXILIAR = re(
  "\\bDANFS-?e\\b|\\bDANFE\\b" +
    "|documento\\s+auxiliar\\s+da\\s+(?:nota\\s+fiscal|nfs-?e|nf-?e)" +
    "|notaprint\\.aspx|nfe\\.prefeitura\\.|nfse\\.gov\\.br",
  "i",
);
const NOTA_TITULO = re("nota\\s+fiscal\\s+(?:eletr[ôo]nica\\s+)?de\\s+servi[çc]os?|\\bNFS-?e\\b", "i");
const NOTA_PRESTADOR = re("\\bprestador", "i");
const NOTA_TOMADOR = re("\\btomador", "i");

/** `_parece_nota_fiscal` */
export function pareceNotaFiscal(linhas: readonly string[]): boolean {
  const t = linhas.join("\n");
  if (NOTA_DOCUMENTO_AUXILIAR.search(t)) return true;
  const prestador = !!NOTA_PRESTADOR.search(t);
  const tomador = !!NOTA_TOMADOR.search(t);
  if (prestador && tomador) return true;
  // O título sozinho é o que aparece na descrição de um PIX que paga a nota.
  return !!NOTA_TITULO.search(t) && (prestador || tomador);
}

/** `_recusar_se_nota_pela_ia`: nas camadas sem texto local, só a IA pode dizer o tipo. */
function recusarSeNotaPelaIa(item: ItemPy): void {
  const tipo = item.get("tipo_documento");
  if (strip(verdadeiro(tipo) ? str(tipo!) : "").toLowerCase() === "nota_fiscal") {
    throw new LeituraRecusada(MENSAGEM_NOTA_FISCAL, DOCUMENTO_NAO_E_COMPROVANTE);
  }
}

// ─── Camada 1: os rótulos ───────────────────────────────────────────────────

const ROTULO_FAVORECIDO = re("favorecido|benefici[aá]rio|recebedor|pago\\s+a\\b|nome\\s+d[oe]\\s+destinat[aá]rio", "i");
const ROTULO_DOCUMENTO = re("cpf\\s*/\\s*cnpj|cnpj\\s*/\\s*cpf|\\bcpf\\b|\\bcnpj\\b", "i");
const ROTULO_VALOR_DOCUMENTO = re("valor\\s+(?:do\\s+)?documento|valor\\s+nominal|valor\\s+de\\s+face", "i");
// O vocabulário dos apps de banco além do boleto: PIX, TED/DOC e a linha só com "Valor" (o número na
// de baixo). Não é `^valor\b`: isso pegaria "Valor do IOF" e gravaria a taxa como valor pago.
const ROTULO_VALOR_PAGO = re(
  "valor\\s+(?:total\\s+)?pago" +
    "|valor\\s+da\\s+transa[cç][aã]o" +
    "|valor\\s+da\\s+transfer[eê]ncia" +
    "|valor\\s+do\\s+(?:pix|documento\\s+pago)" +
    "|valor\\s+(?:enviado|recebido|debitado|creditado|cobrado)" +
    "|valor\\s+a\\s+pagar" +
    "|total\\s+pago" +
    "|valor\\s+total\\b" +
    "|^valor\\s*[:\\-]?\\s*$" +
    "|^valor\\s*:",
  "i",
);
const ROTULO_DATA_PAGAMENTO = re(
  "data\\s+(?:d[oe]\\s+)?pagamento|pago\\s+em|data\\s+da\\s+transa[cç][aã]o|" +
    "data\\s+d[oe]\\s+cr[eé]dito|efetivad[oa]\\s+em|realizado\\s+em",
  "i",
);
const ROTULO_VENCIMENTO = re("vencimento", "i");
const ROTULO_JUROS = re("\\bjuros\\b", "i");
const ROTULO_MULTA = re("\\bmulta\\b", "i");
const ROTULO_DESCONTO = re("\\bdesconto\\b", "i");

const vazio = (confianca: "regex" | "ia"): ComprovanteLido => ({
  favorecido: null,
  cpfCnpj: null,
  dataPagamento: null,
  dataVencimento: null,
  valorDocumento: null,
  valorPago: null,
  juros: null,
  multa: null,
  desconto: null,
  confianca,
});

/** `_parse_por_regex`: cada campo fica com o primeiro rótulo que o preencher. */
export function lerPorRotulos(linhas: readonly string[]): ComprovanteLido {
  const r = vazio("regex");
  linhas.forEach((bruta, i) => {
    const linha = strip(bruta);
    if (!linha) return;
    const proxima = i + 1 < linhas.length ? strip(linhas[i + 1]) : "";

    if (r.favorecido === null && ROTULO_FAVORECIDO.search(linha)) {
      const achado = primeiro(aposRotulo(linha, ROTULO_FAVORECIDO), proxima || null);
      if (achado) r.favorecido = corta(achado, 300);
    }
    if (r.cpfCnpj === null && ROTULO_DOCUMENTO.search(linha)) {
      const achado = primeiro(documentoNaLinha(linha), documentoNaLinha(proxima));
      if (achado) r.cpfCnpj = corta(achado, 18);
    }
    if (r.valorDocumento === null && ROTULO_VALOR_DOCUMENTO.search(linha)) {
      r.valorDocumento = primeiro(valorNaLinha(linha), valorNaLinha(proxima));
    } else if (r.valorPago === null && ROTULO_VALOR_PAGO.search(linha)) {
      r.valorPago = primeiro(valorNaLinha(linha), valorNaLinha(proxima));
    }
    if (r.dataPagamento === null && ROTULO_DATA_PAGAMENTO.search(linha)) r.dataPagamento = primeiro(dataNaLinha(linha), dataNaLinha(proxima));
    if (r.dataVencimento === null && ROTULO_VENCIMENTO.search(linha)) r.dataVencimento = primeiro(dataNaLinha(linha), dataNaLinha(proxima));
    if (r.juros === null && ROTULO_JUROS.search(linha)) r.juros = primeiro(valorNaLinha(linha), valorNaLinha(proxima));
    if (r.multa === null && ROTULO_MULTA.search(linha)) r.multa = primeiro(valorNaLinha(linha), valorNaLinha(proxima));
    if (r.desconto === null && ROTULO_DESCONTO.search(linha)) r.desconto = primeiro(valorNaLinha(linha), valorNaLinha(proxima));
  });
  return r;
}

// ─── O prompt (o mesmo do original) ─────────────────────────────────────────

export const SISTEMA = "Você é um extrator de dados financeiros. Responda SOMENTE com JSON puro — sem texto, sem markdown, sem explicações.";

export const PROMPT = `Analise este documento brasileiro. Primeiro diga que tipo de documento ele é; se for um
comprovante de pagamento (PIX, TED, DOC ou boleto pago), extraia os dados.

Retorne um único objeto JSON com EXATAMENTE estas chaves:
  "tipo_documento"  → "comprovante_pagamento" se o documento PROVA que um pagamento foi feito;
                       "nota_fiscal" se for nota fiscal (NFS-e, NF-e, DANFE, DANFSe), mesmo que
                       ela traga valor, prestador e tomador; "outro" para qualquer outra coisa
  "favorecido"      → nome de quem recebeu o pagamento, ou null
  "cpf_cnpj"        → CPF ou CNPJ do favorecido (como aparece no documento), ou null
  "valor_pago"      → número decimal (ponto como separador) do valor efetivamente pago, ou null
  "valor_documento" → número decimal do valor original do documento/boleto, se diferente do
                       valor pago (ex: quando há juros/multa/desconto), ou null
  "data_pagamento"  → string DD/MM/AAAA da data em que o pagamento foi efetivado, ou null
  "data_vencimento" → string DD/MM/AAAA da data de vencimento (só existe em boleto), ou null
  "juros"           → número decimal de juros cobrados, ou null
  "multa"           → número decimal de multa cobrada, ou null
  "desconto"        → número decimal de desconto concedido, ou null

Regras obrigatórias:
- Use EXATAMENTE os nomes de campo acima
- Se um campo não aparecer no documento, use null (não invente valores)
- Valores brasileiros: "1.234,56" vira 1234.56
- Nota fiscal NÃO é comprovante de pagamento: o valor dela é o do serviço, não o que saiu da conta

Exemplo de saída:
{"tipo_documento":"comprovante_pagamento","favorecido":"JOAO DA SILVA","cpf_cnpj":"123.456.789-00","valor_pago":150.00,"valor_documento":null,"data_pagamento":"05/01/2026","data_vencimento":null,"juros":null,"multa":null,"desconto":null}`;

const TEXTO_MAXIMO = 40_000;
const MAX_TOKENS = 1024;

/** `_decimal_do_item`: `Decimal(str(valor))`, ou `null` (ausente, vazio ou inválido). */
function decimalDoItem(item: ItemPy, chave: string): string | null {
  const v = item.get(chave);
  if (v === undefined || v === null || v === "") return null;
  return textoDecimal(str(v as ValorPy));
}

/** `_data_do_item` */
function dataDoItem(item: ItemPy, chave: string): string | null {
  const v = item.get(chave);
  if (v === undefined || !verdadeiro(v)) return null;
  return lerData(str(v));
}

/** `_comprovante_from_item`: o que a IA leu (`{}` vira `null`). */
export function itemParaComprovante(item: ItemPy, confianca: "regex" | "ia"): ComprovanteLido | null {
  if (item.size === 0) return null;
  const favorecido = item.get("favorecido");
  const documento = item.get("cpf_cnpj");
  return {
    favorecido: favorecido !== undefined && verdadeiro(favorecido) ? corta(str(favorecido), 300) : null,
    cpfCnpj: documento !== undefined && verdadeiro(documento) ? corta(str(documento), 18) : null,
    valorPago: decimalDoItem(item, "valor_pago"),
    valorDocumento: decimalDoItem(item, "valor_documento"),
    dataPagamento: dataDoItem(item, "data_pagamento"),
    dataVencimento: dataDoItem(item, "data_vencimento"),
    juros: decimalDoItem(item, "juros"),
    multa: decimalDoItem(item, "multa"),
    desconto: decimalDoItem(item, "desconto"),
    confianca,
  };
}

// ─── A dica quando a IA está fora ───────────────────────────────────────────

/** `_dica_camadas_ia`, dizendo onde ligar no Connect (o original citava as variáveis do servidor). */
export const DICA_SEM_PROVEDOR =
  " (a leitura assistida por IA está desligada neste escritório: nenhuma chave de IA configurada em Integrações › Inteligência artificial)";
export const DICA_DESLIGADA =
  " (a leitura assistida por IA está desligada neste escritório: ligue em Contábil Core › Configurações › Leitura de documentos por IA)";

export type OpcoesDaLeitura = {
  /** A fundação de IA (os testes trocam pela simulada). */
  ia?: DependenciasDaIa;
  orcamento?: Orcamento;
};

async function dicaDaIa(quem: ContextoDeLeitura, opcoes: OpcoesDaLeitura): Promise<string> {
  const configurada = await (opcoes.ia ?? { isAiConfigured }).isAiConfigured(quem.tenantId);
  if (!configurada) return DICA_SEM_PROVEDOR;
  if (quem.documentosFinanceirosLiberados !== true) return DICA_DESLIGADA;
  return "";
}

// ─── Camadas 2 e 3: a IA ────────────────────────────────────────────────────

function esgotado(e: unknown): never {
  if (e instanceof OrcamentoEsgotado) throw new LeituraRecusada(e.message);
  throw e;
}

/** Camada 2 (`_parse_por_ai_texto`): IA fora ou falha do provedor dão `null`, como no original. */
async function viaTexto(linhas: readonly string[], quem: ContextoDeLeitura, orcamento: Orcamento, opcoes: OpcoesDaLeitura): Promise<ComprovanteLido | null> {
  let t = linhas.join("\n");
  if (len(t) > TEXTO_MAXIMO) t = corta(t, TEXTO_MAXIMO);
  const r = await lerPorIa(
    quem,
    { agentCode: AGENTE_TEXTO, sistema: SISTEMA, texto: `Comprovante:\n\n${t}\n\n${PROMPT}`, maxTokens: MAX_TOKENS, orcamento },
    opcoes.ia,
  ).catch(esgotado);
  if (!r.ok) return null;
  const item = analisarRespostaIa(r.texto);
  recusarSeNotaPelaIa(item);
  return itemParaComprovante(item, "ia");
}

/** `_extrair_via_vision`: a IA fora é recusa ("OCR externo desabilitado…"); a falha do provedor também. */
async function viaImagem(anexo: { nome: string; mime: string; bytes: Uint8Array }, quem: ContextoDeLeitura, orcamento: Orcamento, opcoes: OpcoesDaLeitura): Promise<ItemPy> {
  const r = await lerPorIa(quem, { agentCode: AGENTE_IMAGEM, sistema: SISTEMA, texto: PROMPT, anexo, maxTokens: MAX_TOKENS, orcamento }, opcoes.ia).catch(esgotado);
  if (!r.ok) throw new LeituraRecusada(r.mensagem);
  return analisarRespostaIa(r.texto);
}

/** O PDF que nem o leitor de páginas abre. O original deixava escapar a exceção do PyMuPDF (erro 500). */
export const PDF_ILEGIVEL = "Não foi possível abrir este PDF. Preencha os campos manualmente.";

/** As páginas do PDF, cada uma como um PDF de uma página (o lugar do PNG do PyMuPDF). */
async function paginasDoPdf(conteudo: Uint8Array, orcamento: Orcamento): Promise<(() => Promise<Uint8Array>)[]> {
  let doc: PDFDocument;
  let total: number;
  try {
    doc = await PDFDocument.load(conteudo, { ignoreEncryption: true, updateMetadata: false });
    total = doc.getPageCount();
  } catch {
    throw new LeituraRecusada(PDF_ILEGIVEL);
  }
  if (total > orcamento.maxPaginas) throw new LeituraRecusada(`PDF excede o limite de ${orcamento.maxPaginas} páginas.`);
  return Array.from({ length: total }, (_, k) => async () => {
    try {
      const uma = await PDFDocument.create();
      const [pagina] = await uma.copyPages(doc, [k]);
      uma.addPage(pagina);
      return await uma.save();
    } catch {
      throw new LeituraRecusada(PDF_ILEGIVEL);
    }
  });
}

/** Camada 3 para PDF (`_parse_por_vision_pdf`): para na primeira página que trouxer o valor pago. */
async function viaImagemDoPdf(conteudo: Uint8Array, quem: ContextoDeLeitura, orcamento: Orcamento, opcoes: OpcoesDaLeitura): Promise<ComprovanteLido | null> {
  const paginas = await paginasDoPdf(conteudo, orcamento);
  for (const [k, pagina] of paginas.entries()) {
    orcamento.verificarTempo();
    const item = await viaImagem({ nome: `pagina-${k + 1}.pdf`, mime: "application/pdf", bytes: await pagina() }, quem, orcamento, opcoes);
    recusarSeNotaPelaIa(item);
    const r = itemParaComprovante(item, "ia");
    if (r !== null && r.valorPago !== null) return r;
  }
  return null;
}

// ─── O texto do PDF ─────────────────────────────────────────────────────────

/** `_extrair_linhas`: as linhas de todas as páginas e o total de caracteres. O PDF que não abre dá `[]`. */
export async function linhasDoPdf(conteudo: Uint8Array, orcamento: Orcamento): Promise<{ linhas: string[]; total: number }> {
  let paginas;
  try {
    paginas = await caracteresDoPdf(conteudo, { maxPaginas: orcamento.maxPaginas });
  } catch (e) {
    if (e instanceof LimiteDePaginas) throw new LeituraRecusada(`PDF excede o limite de ${orcamento.maxPaginas} páginas.`);
    return { linhas: [], total: 0 };
  }
  if (!paginas.length) throw new LeituraRecusada("PDF sem páginas.");
  const linhas: string[] = [];
  let total = 0;
  for (const p of paginas) {
    orcamento.verificarTempo();
    const t = extrairTexto(p.caracteres);
    total += len(t);
    linhas.push(...splitlines(t));
  }
  return { linhas, total };
}

// ─── As entradas ────────────────────────────────────────────────────────────

/**
 * `parse_pdf` depois de `_extrair_linhas`: as camadas sobre o texto já extraído (os testes do original
 * trocam a extração pelo texto pronto). Recusa com `LeituraRecusada`.
 */
export async function lerComprovanteDoTexto(
  conteudo: Uint8Array,
  texto: { linhas: readonly string[]; total: number },
  quem: ContextoDeLeitura,
  orcamento: Orcamento,
  opcoes: OpcoesDaLeitura = {},
): Promise<ComprovanteLido> {
  try {
    if (texto.total < 20) {
      const r = await viaImagemDoPdf(conteudo, quem, orcamento, opcoes);
      if (r !== null) return r;
      throw new LeituraRecusada(
        "Não foi possível identificar o valor pago neste comprovante escaneado. Preencha os campos manualmente." + (await dicaDaIa(quem, opcoes)),
      );
    }
    // Antes dos rótulos, e não depois: os rótulos acham o valor da nota e devolvem sucesso.
    if (pareceNotaFiscal(texto.linhas)) throw new LeituraRecusada(MENSAGEM_NOTA_FISCAL, DOCUMENTO_NAO_E_COMPROVANTE);
    const r = lerPorRotulos(texto.linhas);
    if (r.valorPago !== null) return r;
    const ia = await viaTexto(texto.linhas, quem, orcamento, opcoes);
    if (ia !== null && ia.valorPago !== null) return ia;
    throw new LeituraRecusada("Não foi possível identificar o valor pago neste comprovante. Preencha os campos manualmente." + (await dicaDaIa(quem, opcoes)));
  } catch (e) {
    return esgotado(e);
  }
}

/** `parse_pdf`: o comprovante em PDF. */
export async function lerComprovantePdf(conteudo: Uint8Array, quem: ContextoDeLeitura, opcoes: OpcoesDaLeitura = {}): Promise<ComprovanteLido> {
  const orcamento = opcoes.orcamento ?? orcamentoDoComprovante();
  const texto = await linhasDoPdf(conteudo, orcamento).catch(esgotado);
  return lerComprovanteDoTexto(conteudo, texto, quem, orcamento, opcoes);
}

/** `parse_imagem`: a imagem (PNG ou JPEG) vai direto ao agente de imagem. */
export async function lerComprovanteImagem(conteudo: Uint8Array, tipoMime: string, quem: ContextoDeLeitura, opcoes: OpcoesDaLeitura = {}): Promise<ComprovanteLido> {
  const orcamento = opcoes.orcamento ?? orcamentoDoComprovante();
  const extensao = tipoMime === "image/jpeg" ? "jpg" : "png";
  const item = await viaImagem({ nome: `comprovante.${extensao}`, mime: tipoMime, bytes: conteudo }, quem, orcamento, opcoes);
  recusarSeNotaPelaIa(item);
  const r = itemParaComprovante(item, "ia");
  if (r === null || r.valorPago === null) {
    throw new LeituraRecusada("Não foi possível identificar o valor pago nesta imagem. Preencha os campos manualmente." + (await dicaDaIa(quem, opcoes)));
  }
  return r;
}

/**
 * O formato pelo nome, pelo tipo de mídia e, por último, pela assinatura do arquivo (a rota
 * `extrair_dados_pdf` do original): arrastar da caixa de e-mail ou do visualizador às vezes chega como
 * "blob", sem extensão.
 */
export function formatoDoComprovante(nome: string, tipo: string, conteudo: Uint8Array): { pdf: true } | { pdf: false; tipoMime: "image/png" | "image/jpeg" } | null {
  const n = nome.toLowerCase();
  const t = strip(tipo.split(";")[0]).toLowerCase();
  if (n.endsWith(".pdf") || t === "application/pdf") return { pdf: true };
  if (n.endsWith(".png") || t === "image/png") return { pdf: false, tipoMime: "image/png" };
  if (n.endsWith(".jpg") || n.endsWith(".jpeg") || t === "image/jpg" || t === "image/jpeg") return { pdf: false, tipoMime: "image/jpeg" };
  if (conteudo.length >= 5 && String.fromCharCode(...conteudo.slice(0, 5)) === "%PDF-") return { pdf: true };
  return null;
}

export const FORMATO_NAO_SUPORTADO = "Formato não suportado. Envie um PDF, PNG ou JPG do comprovante.";
