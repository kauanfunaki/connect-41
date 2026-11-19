import "server-only";

// O leitor visual de notas fiscais (Bloco C, Fase C1, 19/11/2026). Porte de
// `src/domain/notas/visual_parser.py` do Contábil Core: o DANFe ou a NFS-e em PDF ou imagem, lido por
// IA, sem assinatura para conferir — a nota entra com `origem = "ocr"` (quem grava é o serviço).
//
// As camadas são as do original:
// 1. PDF com camada de texto: o texto (o `extract_text` do pdfplumber, porte em `pdf/plumber.ts`) vai
//    ao agente de texto. Sem regex de layout: são dezenas de softwares fiscais.
// 2. PDF sem texto (ou com texto que não bastou) e imagem: a página vai ao agente de imagem, uma
//    chamada por página, até uma delas trazer a nota.
// A resposta passa pela conferência do original (`_parse_ai_response` e `_nota_from_item`): CNPJ com
// dígito verificador, valor positivo, data DD/MM/AAAA, chave de 44 dígitos — o erro de leitura vira
// recusa, nunca dado contábil errado.
//
// A IA vai pela peça comum `contabil-core/ia/leituraPorIa.ts` (a fundação de IA do Connect, a chave do
// escritório para documento financeiro e o orçamento do arquivo). Duas diferenças, documentadas:
// - o original desenhava a página em PNG (PyMuPDF, 200 dpi); o Connect não tem como rasterizar PDF
//   sem dependência nova, e manda a PÁGINA como um PDF de uma página (pdf-lib), que os dois provedores
//   leem como documento. A ordem, o orçamento e a conta de chamadas são os mesmos;
// - onde o original deixava escapar exceção crua (o PDF que nem o PyMuPDF abre, a falha do provedor na
//   camada de imagem), aqui é `NotaInvalida` com frase (a do PDF de que nada sai; a da fundação de IA).
//
// Conferido pelo gabarito (`gabarito/notas-chamadas.json`): as funções puras chamada a chamada, e os
// cenários inteiros com a IA simulada (as respostas da suíte do original).

import { PDFDocument } from "pdf-lib";
import { caracteresDoPdf, LimiteDePaginas } from "../pdf/caracteres";
import { extrairTexto } from "../pdf/plumber";
import { decimal, NAO_FINITO, compara, ehZero, texto as textoDec, type Dec } from "../motor/decimal";
import { digitoUnicode } from "../motor/unicodePy";
import { strip } from "../extrato/py";
import { lerPorIa, Orcamento, OrcamentoEsgotado, type ContextoDeLeitura, type DependenciasDaIa } from "../ia/leituraPorIa";
import { NotaInvalida } from "./xml";
import type { NotaLida } from "./tipos";

export const AGENTE_TEXTO = "leitor_de_nota_texto";
export const AGENTE_IMAGEM = "leitor_de_nota_imagem";

// ─── O prompt (o mesmo do original) ────────────────────────────────────────────

export const SISTEMA =
  "Você é um extrator de dados de documentos fiscais brasileiros. " +
  "Responda SOMENTE com JSON puro — sem texto, sem markdown, sem explicações.";

export const PROMPT = `Analise esta nota fiscal brasileira (DANFe de NF-e, ou NFS-e) e extraia os dados.

Retorne um único objeto JSON com EXATAMENTE estas chaves:
  "tipo"              → "nfe" se for NF-e (mercadoria/produto) ou "nfse" se for NFS-e (serviço)
  "numero"            → número da nota fiscal (como aparece no documento), ou null
  "serie"             → série da nota, ou null
  "cnpj_emitente"      → CNPJ de quem emitiu a nota (como aparece no documento), ou null
  "nome_emitente"      → razão social de quem emitiu, ou null
  "cnpj_destinatario"  → CNPJ ou CPF de quem recebeu/tomou o serviço, ou null
  "valor"              → número decimal (ponto como separador) do valor total da nota, ou null
  "data_emissao"       → string DD/MM/AAAA da data de emissão, ou null
  "chave_acesso"       → chave de acesso de 44 dígitos impressa no documento (só existe em NF-e), ou null

Regras obrigatórias:
- Use EXATAMENTE os nomes de campo acima
- Se um campo não aparecer no documento, use null (não invente valores)
- Valores brasileiros: "1.234,56" vira 1234.56
- chave_acesso: só dígitos, sem espaços

Exemplo de saída:
{"tipo":"nfe","numero":"12345","serie":"1","cnpj_emitente":"12.345.678/0001-90","nome_emitente":"EMPRESA LTDA","cnpj_destinatario":"98.765.432/0001-10","valor":1500.00,"data_emissao":"05/01/2026","chave_acesso":"35260112345678000190550010000123451234567890"}`;

const TEXTO_MAXIMO = 40_000;
const MAX_TOKENS = 1024;

const OBSERVACAO_OCR = "Extraído por OCR/Vision a partir de PDF/imagem — sem verificação criptográfica de assinatura.";

// ─── Valores do Python (o que o `json.loads(..., parse_float=Decimal)` devolve) ─

export type ValorPy =
  | null
  | boolean
  | string
  | { py: "int"; texto: string }
  | { py: "dec"; valor: Dec | typeof NAO_FINITO; texto: string }
  | { py: "float"; texto: "nan" | "inf" | "-inf" }
  | ValorPy[]
  | Map<string, ValorPy>;

export type ItemPy = Map<string, ValorPy>;

const ESPACO_JSON = new Set([" ", "\t", "\n", "\r"]);

class JsonInvalido extends Error {}

/** `json.loads(texto, parse_float=Decimal)`: o número fica com o texto (sem perder casa nem dígito). */
export function jsonPython(texto: string): ValorPy {
  let i = 0;
  const pular = () => {
    while (i < texto.length && ESPACO_JSON.has(texto[i])) i++;
  };
  const valor = (): ValorPy => {
    pular();
    const c = texto[i];
    if (c === "{") {
      i++;
      const obj = new Map<string, ValorPy>();
      pular();
      if (texto[i] === "}") {
        i++;
        return obj;
      }
      for (;;) {
        pular();
        if (texto[i] !== '"') throw new JsonInvalido();
        const k = cadeia();
        pular();
        if (texto[i] !== ":") throw new JsonInvalido();
        i++;
        obj.set(k, valor());
        pular();
        if (texto[i] === ",") {
          i++;
          continue;
        }
        if (texto[i] === "}") {
          i++;
          return obj;
        }
        throw new JsonInvalido();
      }
    }
    if (c === "[") {
      i++;
      const lista: ValorPy[] = [];
      pular();
      if (texto[i] === "]") {
        i++;
        return lista;
      }
      for (;;) {
        lista.push(valor());
        pular();
        if (texto[i] === ",") {
          i++;
          continue;
        }
        if (texto[i] === "]") {
          i++;
          return lista;
        }
        throw new JsonInvalido();
      }
    }
    if (c === '"') return cadeia();
    for (const [lit, v] of [
      ["true", true],
      ["false", false],
      ["null", null],
      ["NaN", { py: "float", texto: "nan" }],
      ["Infinity", { py: "float", texto: "inf" }],
      ["-Infinity", { py: "float", texto: "-inf" }],
    ] as const) {
      if (texto.startsWith(lit, i)) {
        i += lit.length;
        return v as ValorPy;
      }
    }
    const m = /^-?(?:0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/.exec(texto.slice(i));
    if (!m) throw new JsonInvalido();
    i += m[0].length;
    if (!m[1] && !m[2]) return { py: "int", texto: m[0].replace(/^(-?)0*(\d)/, "$1$2") };
    return { py: "dec", valor: decimal(m[0])!, texto: textoDec(decimal(m[0]) as Dec) };
  };
  const cadeia = (): string => {
    i++;
    let out = "";
    for (;;) {
      if (i >= texto.length) throw new JsonInvalido();
      const c = texto[i];
      if (c === '"') {
        i++;
        return out;
      }
      if (c.charCodeAt(0) < 0x20) throw new JsonInvalido();
      if (c === "\\") {
        const e = texto[i + 1];
        const simples: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
        if (e in simples) {
          out += simples[e];
          i += 2;
          continue;
        }
        if (e === "u" && /^[0-9a-fA-F]{4}$/.test(texto.slice(i + 2, i + 6))) {
          out += String.fromCharCode(parseInt(texto.slice(i + 2, i + 6), 16));
          i += 6;
          continue;
        }
        throw new JsonInvalido();
      }
      out += c;
      i++;
    }
  };
  const v = valor();
  pular();
  if (i !== texto.length) throw new JsonInvalido();
  return v;
}

/** `bool(v)` do Python. */
function verdadeiro(v: ValorPy | undefined): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof Map) return v.size > 0;
  if (v.py === "int") return !/^-?0$/.test(v.texto);
  if (v.py === "dec") return v.valor === NAO_FINITO || !ehZero(v.valor);
  return true; // nan e inf são verdadeiros
}

/** `repr(texto)` do Python. */
function reprTexto(t: string): string {
  const aspa = t.includes("'") && !t.includes('"') ? '"' : "'";
  let out = aspa;
  for (const c of t) {
    const cp = c.codePointAt(0)!;
    if (c === "\\" || c === aspa) out += "\\" + c;
    else if (c === "\n") out += "\\n";
    else if (c === "\r") out += "\\r";
    else if (c === "\t") out += "\\t";
    else if (c !== " " && /^[\p{C}\p{Z}]$/u.test(c)) {
      out += cp < 0x100 ? `\\x${cp.toString(16).padStart(2, "0")}` : cp < 0x10000 ? `\\u${cp.toString(16).padStart(4, "0")}` : `\\U${cp.toString(16).padStart(8, "0")}`;
    } else out += c;
  }
  return out + aspa;
}

function repr(v: ValorPy): string {
  if (typeof v === "string") return reprTexto(v);
  if (v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Map) && v.py === "dec") return `Decimal('${v.texto}')`;
  return str(v);
}

/** `str(v)` do Python. */
export function str(v: ValorPy): string {
  if (v === null) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return `[${v.map(repr).join(", ")}]`;
  if (v instanceof Map) return `{${[...v].map(([k, x]) => `${reprTexto(k)}: ${repr(x)}`).join(", ")}}`;
  return v.texto;
}

// ─── As funções puras do original ──────────────────────────────────────────────

const ESPACOS = "\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const CERCA_INICIO = new RegExp(`^\`\`\`(?:json)?[${ESPACOS}]*`, "u");
const CERCA_FIM = new RegExp(`[${ESPACOS}]*\`\`\`[${ESPACOS}]*$`, "u");

/** `_parse_ai_response`: o JSON da resposta (sem a cerca de markdown); `{}` quando não serve. */
export function analisarRespostaIa(bruto: string): ItemPy {
  let t = strip(bruto).replace(CERCA_INICIO, "");
  t = strip(t.replace(CERCA_FIM, ""));
  let r: ValorPy;
  try {
    r = jsonPython(t);
  } catch (e) {
    if (e instanceof JsonInvalido) return new Map();
    throw e;
  }
  if (Array.isArray(r) && r.length) r = r[0];
  return r instanceof Map ? r : new Map();
}

/** `_parse_data_str`: DD/MM/AA(AA) no começo, à meia-noite UTC, em `isoformat`. */
export function lerDataBr(v: ValorPy | undefined): string | null {
  if (v === undefined || !verdadeiro(v)) return null;
  const s = strip(str(v));
  const m = /^(\p{Nd}{2})\/(\p{Nd}{2})\/(\p{Nd}{2,4})/u.exec(s);
  if (!m) return null;
  const n = (t: string) => Number([...t].map((c) => digitoUnicode(c)!).join(""));
  const [d, mo] = [n(m[1]), n(m[2])];
  const yTexto = [...m[3]].length === 2 ? "20" + m[3] : m[3];
  const y = n(yTexto);
  if (y < 1 || y > 9999 || mo < 1 || mo > 12 || d < 1) return null;
  const dias = mo === 2 ? (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28) : [4, 6, 9, 11].includes(mo) ? 30 : 31;
  if (d > dias) return null;
  const p2 = (x: number) => String(x).padStart(2, "0");
  return `${String(y).padStart(4, "0")}-${p2(mo)}-${p2(d)}T00:00:00+00:00`;
}

function digitosDe(t: string): string[] {
  return [...t].filter((c) => digitoUnicode(c) !== null);
}

function dv(digitos: number[], pesos: number[]): number {
  const resto = digitos.reduce((s, d, k) => s + d * pesos[k], 0) % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** `src/core/cnpj.valido`. */
function cnpjValido(d: string[]): boolean {
  if (d.length !== 14 || d.every((c) => c === d[0])) return false;
  const n = d.map((c) => digitoUnicode(c)!);
  return n[12] === dv(n.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) && n[13] === dv(n.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
}

/** `_cnpj_valido_formatado`: o CNPJ com máscara, se o dígito verificador fecha. */
export function cnpjValidoFormatado(v: ValorPy | undefined): string | null {
  if (v === undefined || !verdadeiro(v)) return null;
  const d = digitosDe(str(v));
  if (!cnpjValido(d)) return null;
  const j = (a: number, b: number) => d.slice(a, b).join("");
  return `${j(0, 2)}.${j(2, 5)}.${j(5, 8)}/${j(8, 12)}-${j(12, 14)}`;
}

/** `_nota_from_item`: o que a IA leu, conferido campo a campo. Recusa com `NotaInvalida`. */
export function itemParaNota(item: ItemPy): NotaLida {
  const campo = (k: string) => item.get(k) ?? null;
  const tipo = strip(verdadeiro(campo("tipo")) ? str(campo("tipo")) : "").toLowerCase();
  if (tipo !== "nfe" && tipo !== "nfse") throw new NotaInvalida("Não foi possível identificar se é NF-e ou NFS-e no documento.");

  const numero = strip(verdadeiro(campo("numero")) ? str(campo("numero")) : "") || null;
  if (numero === null) throw new NotaInvalida("Número da nota não encontrado no documento.");

  const cnpjEmitente = cnpjValidoFormatado(campo("cnpj_emitente"));
  if (cnpjEmitente === null) {
    throw new NotaInvalida("CNPJ do emitente não encontrado ou com dígito verificador inválido no documento.");
  }

  const valorBruto = campo("valor");
  if (valorBruto === null) throw new NotaInvalida("Valor da nota não encontrado no documento.");
  const valor = decimal(str(valorBruto));
  if (valor === null) throw new NotaInvalida("Valor da nota inválido.");
  if (valor === NAO_FINITO || compara(valor, { negativo: false, coeficiente: BigInt(0), expoente: 0 }) <= 0) {
    throw new NotaInvalida("Valor da nota deve ser positivo.");
  }

  const dataEmissao = lerDataBr(campo("data_emissao"));
  if (dataEmissao === null) throw new NotaInvalida("Data de emissão não encontrada ou inválida no documento.");

  const serie = verdadeiro(campo("serie")) ? strip(str(campo("serie"))) : null;
  const nomeEmitente = verdadeiro(campo("nome_emitente")) ? strip(str(campo("nome_emitente"))) : null;
  const cnpjDestinatario = cnpjValidoFormatado(campo("cnpj_destinatario"));

  let chaveAcesso: string | null = null;
  if (verdadeiro(campo("chave_acesso"))) {
    const d = digitosDe(str(campo("chave_acesso")));
    if (d.length === 44) chaveAcesso = d.join("");
  }

  return {
    tipo,
    numero,
    serie,
    cnpjEmitente,
    nomeEmitente,
    cnpjDestinatario,
    valor,
    dataEmissao,
    chaveAcesso,
    observacao: OBSERVACAO_OCR,
    assinaturaNaoVerificada: null,
  };
}

// ─── As camadas ────────────────────────────────────────────────────────────────

export type OpcoesDaLeitura = {
  /** A fundação de IA (os testes trocam pela simulada). */
  ia?: DependenciasDaIa;
  orcamento?: Orcamento;
};

function recusa(e: unknown): never {
  if (e instanceof OrcamentoEsgotado) throw new NotaInvalida(e.message, "VisualParseError");
  throw e;
}

/** Camada 1: o texto do PDF ao agente de texto. Recusa e falha viram `{}`, como no original. */
async function viaTexto(texto: string, quem: ContextoDeLeitura, orcamento: Orcamento, opcoes: OpcoesDaLeitura): Promise<ItemPy> {
  const cortado = [...texto].length > TEXTO_MAXIMO ? [...texto].slice(0, TEXTO_MAXIMO).join("") : texto;
  const r = await lerPorIa(
    quem,
    { agentCode: AGENTE_TEXTO, sistema: SISTEMA, texto: `Nota fiscal:\n\n${cortado}\n\n${PROMPT}`, maxTokens: MAX_TOKENS, orcamento },
    opcoes.ia,
  ).catch(recusa);
  return r.ok ? analisarRespostaIa(r.texto) : new Map();
}

/** Camada 2: o documento (imagem ou página) ao agente de imagem. Recusa vira `NotaInvalida`. */
async function viaImagem(
  anexo: { nome: string; mime: string; bytes: Uint8Array },
  quem: ContextoDeLeitura,
  orcamento: Orcamento,
  opcoes: OpcoesDaLeitura,
): Promise<ItemPy> {
  const r = await lerPorIa(quem, { agentCode: AGENTE_IMAGEM, sistema: SISTEMA, texto: PROMPT, anexo, maxTokens: MAX_TOKENS, orcamento }, opcoes.ia).catch(
    recusa,
  );
  if (!r.ok) throw new NotaInvalida(r.mensagem, "VisualParseError");
  return analisarRespostaIa(r.texto);
}

/** O texto de cada página como o `page.extract_text()` do pdfplumber, e o total de caracteres. */
async function textoDoPdf(conteudo: Uint8Array, orcamento: Orcamento): Promise<{ texto: string; total: number }> {
  let paginas;
  try {
    paginas = await caracteresDoPdf(conteudo, { maxPaginas: orcamento.maxPaginas });
  } catch (e) {
    if (e instanceof LimiteDePaginas) throw new NotaInvalida(`PDF excede o limite de ${orcamento.maxPaginas} páginas.`, "VisualParseError");
    // O pdfplumber que não abre o arquivo: segue sem texto, para a camada de imagem.
    return { texto: "", total: 0 };
  }
  if (!paginas.length) throw new NotaInvalida("PDF sem páginas.", "VisualParseError");
  orcamento.verificarTempo();
  const textos = paginas.map((p) => extrairTexto(p.caracteres));
  return { texto: textos.join("\n"), total: textos.reduce((s, t) => s + [...t].length, 0) };
}

const SEM_DADOS_DO_PDF = "Não foi possível extrair os dados da nota fiscal deste PDF.";

/**
 * As páginas do PDF, cada uma como um PDF de uma página (o lugar do PNG do PyMuPDF). Abre ANTES de a
 * chave da IA ser conferida, como o original (o `fitz.open` vem antes do `_extrair_via_vision`).
 *
 * O PDF que não abre (vazio, sem objetos, quebrado) derrubava o original com a exceção do PyMuPDF
 * (`FileDataError`, HTTP 500); aqui é recusado com a frase que o original dá ao PDF de que nada sai.
 * PDF sem página nenhuma dá a mesma frase, como lá (o laço das páginas não roda).
 */
async function paginasDoPdf(conteudo: Uint8Array, orcamento: Orcamento): Promise<(() => Promise<Uint8Array>)[]> {
  let doc: PDFDocument;
  let total: number;
  try {
    doc = await PDFDocument.load(conteudo, { ignoreEncryption: true, updateMetadata: false });
    total = doc.getPageCount();
  } catch {
    throw new NotaInvalida(SEM_DADOS_DO_PDF, "VisualParseError");
  }
  if (total > orcamento.maxPaginas) throw new NotaInvalida(`PDF excede o limite de ${orcamento.maxPaginas} páginas.`, "VisualParseError");
  return Array.from({ length: total }, (_, k) => async () => {
    try {
      const uma = await PDFDocument.create();
      const [pagina] = await uma.copyPages(doc, [k]);
      uma.addPage(pagina);
      return await uma.save();
    } catch {
      throw new NotaInvalida(SEM_DADOS_DO_PDF, "VisualParseError");
    }
  });
}

/**
 * `parse_pdf`: a nota de um PDF (DANFe ou NFS-e). Primeiro o texto (se tiver ao menos 20
 * caracteres), depois cada página como imagem. Recusa com `NotaInvalida`.
 */
export async function lerNotaPdf(conteudo: Uint8Array, quem: ContextoDeLeitura, opcoes: OpcoesDaLeitura = {}): Promise<NotaLida> {
  const orcamento = opcoes.orcamento ?? new Orcamento();
  const { texto, total } = await textoDoPdf(conteudo, orcamento);
  if (total >= 20) {
    const item = await viaTexto(texto, quem, orcamento, opcoes);
    try {
      return itemParaNota(item);
    } catch (e) {
      if (!(e instanceof NotaInvalida)) throw e;
      // A camada de texto não trouxe os campos: tenta a imagem.
    }
  }
  const paginas = await paginasDoPdf(conteudo, orcamento);
  let ultimoErro: NotaInvalida | null = null;
  for (const [k, pagina] of paginas.entries()) {
    orcamento.verificarTempo();
    const item = await viaImagem({ nome: `pagina-${k + 1}.pdf`, mime: "application/pdf", bytes: await pagina() }, quem, orcamento, opcoes);
    try {
      return itemParaNota(item);
    } catch (e) {
      if (!(e instanceof NotaInvalida)) throw e;
      ultimoErro = e;
    }
  }
  throw new NotaInvalida(ultimoErro ? ultimoErro.message : SEM_DADOS_DO_PDF, "VisualParseError");
}

/** `parse_imagem`: a nota de uma imagem (PNG ou JPEG), direto ao agente de imagem. */
export async function lerNotaImagem(
  conteudo: Uint8Array,
  tipoMime: string,
  quem: ContextoDeLeitura,
  opcoes: OpcoesDaLeitura = {},
): Promise<NotaLida> {
  const orcamento = opcoes.orcamento ?? new Orcamento();
  const extensao = tipoMime === "image/jpeg" ? "jpg" : "png";
  const item = await viaImagem({ nome: `nota.${extensao}`, mime: tipoMime, bytes: conteudo }, quem, orcamento, opcoes);
  try {
    return itemParaNota(item);
  } catch (e) {
    if (e instanceof NotaInvalida) throw new NotaInvalida(e.message, "VisualParseError");
    throw e;
  }
}
