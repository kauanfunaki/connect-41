// A leitura do XML da nota como o `xml.etree.ElementTree` do Python a faz (Bloco C, Fase C1, 18/11/2026).
//
// O original lê a nota com `ET.fromstring`, que é o expat por baixo, e a assinatura com o lxml, que é a
// libxml2. Os dois aceitam e recusam o mesmo XML bem-formado, e a árvore que sai daqui serve aos dois
// usos: a visão do ElementTree (`tagEt`, `textoEt`, `iterar`), que o leitor da nota usa, e os nós
// completos (declarações de namespace, atributos na ordem, comentários, instruções), que a
// canonicalização da assinatura usa (`c14n.ts`).
//
// O que segue o expat 2.7 do Python 3.14, conferido caso a caso pelo gabarito:
// - a codificação: BOM de UTF-8 e de UTF-16, UTF-16 sem BOM, a declaração (`ISO-8859-1`, `US-ASCII`,
//   `UTF-8` e `UTF-16` são do expat; as outras passam pelo codec do Python, que só aceita codificação
//   de um byte por caractere, e o byte sem caractere vira "invalid token"). Do lado do Python ficam
//   aqui só `latin-1`, `cp1252`, `iso8859-15`, `ascii` e `utf-8` com os apelidos; outra codificação de
//   um byte é recusada como desconhecida (divergência documentada);
// - os fins de linha (`\r\n` e `\r` viram `\n`) e a normalização dos atributos (tab e quebra viram
//   espaço; a referência `&#10;` fica);
// - as mensagens de erro do expat com linha e coluna (coluna em caracteres, a partir de zero), que o
//   original repassa ao usuário em "XML inválido: ...";
// - os namespaces: `{uri}nome` nas tags e nos atributos com prefixo, as recusas de prefixo não
//   declarado e dos prefixos reservados.
//
// DTD não chega aqui: o original recusa `<!DOCTYPE` e `<!ENTITY` nos bytes, antes do parser. Só um
// arquivo em UTF-16 escaparia daquela busca; aqui ele é recusado com a mesma frase (no original, o
// expat leria o DTD — divergência a favor da segurança).

export const NS_XML = "http://www.w3.org/XML/1998/namespace";
const NS_XMLNS = "http://www.w3.org/2000/xmlns/";

export type AtributoXml = {
  /** O nome como está no documento (`p:nome`). */
  readonly qname: string;
  readonly prefixo: string | null;
  readonly local: string;
  /** O namespace do atributo: só atributo com prefixo tem (o sem prefixo não herda o padrão). */
  readonly ns: string | null;
  readonly valor: string;
};

/** Uma declaração `xmlns` ou `xmlns:p` do elemento (`uri` vazio = `xmlns=""`). */
export type DeclaracaoXml = { readonly prefixo: string | null; readonly uri: string };

export type ElementoXml = {
  readonly tipo: "elemento";
  readonly qname: string;
  readonly prefixo: string | null;
  readonly local: string;
  readonly ns: string | null;
  readonly atributos: AtributoXml[];
  readonly declaracoes: DeclaracaoXml[];
  filhos: NoXml[];
  pai: ElementoXml | null;
};

export type TextoXml = { readonly tipo: "texto"; valor: string };
export type ComentarioXml = { readonly tipo: "comentario"; readonly valor: string };
export type InstrucaoXml = { readonly tipo: "instrucao"; readonly alvo: string; readonly dados: string };
export type NoXml = ElementoXml | TextoXml | ComentarioXml | InstrucaoXml;

/** O `ET.ParseError`: a mensagem do expat com a posição ("mismatched tag: line 3, column 2"). */
export class ErroDeXml extends Error {}

/**
 * O que o Python levanta FORA do `ParseError`, e que o original não trata como XML inválido: a
 * codificação que o Python não conhece (`LookupError: unknown encoding: x`) e a de mais de um byte
 * (`ValueError: multi-byte encodings are not supported`). A mensagem é a do Python.
 */
export class ErroDeCodificacao extends Error {
  constructor(
    readonly tipoPython: "LookupError" | "ValueError",
    mensagem: string,
  ) {
    super(mensagem);
  }
}

/** O XML tem DTD (só alcançável em UTF-16: nos outros, o original recusa nos bytes). */
export class ErroDeDtd extends Error {}

// ─── Decodificação ─────────────────────────────────────────────────────────────

/** Caractere que nunca é válido em XML: marca o byte que não decodifica (o expat para nele). */
const INVALIDO = "\uffff";

type Decodificado = { texto: string; parcial: boolean };

function decodificarUtf8(b: Uint8Array, inicio: number): Decodificado {
  let out = "";
  let i = inicio;
  while (i < b.length) {
    const c = b[i];
    if (c < 0x80) {
      out += String.fromCharCode(c);
      i++;
      continue;
    }
    let n = 0;
    let cp = 0;
    let min = 0;
    if (c >= 0xc2 && c <= 0xdf) {
      n = 1;
      cp = c & 0x1f;
      min = 0x80;
    } else if (c >= 0xe0 && c <= 0xef) {
      n = 2;
      cp = c & 0x0f;
      min = 0x800;
    } else if (c >= 0xf0 && c <= 0xf4) {
      n = 3;
      cp = c & 0x07;
      min = 0x10000;
    } else {
      out += INVALIDO;
      i++;
      continue;
    }
    if (i + n >= b.length) {
      // Sequência que o arquivo corta no meio: se só faltam bytes, o expat chama de "partial character".
      let continuacoes = true;
      for (let k = i + 1; k < b.length; k++) if ((b[k] & 0xc0) !== 0x80) continuacoes = false;
      if (continuacoes) return { texto: out, parcial: true };
      out += INVALIDO;
      i++;
      continue;
    }
    let ok = true;
    for (let k = 1; k <= n; k++) {
      const d = b[i + k];
      if ((d & 0xc0) !== 0x80) {
        ok = false;
        break;
      }
      cp = (cp << 6) | (d & 0x3f);
    }
    if (!ok || cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
      out += INVALIDO;
      i++;
      continue;
    }
    out += String.fromCodePoint(cp);
    i += n + 1;
  }
  return { texto: out, parcial: false };
}

function decodificarUtf16(b: Uint8Array, inicio: number, le: boolean): Decodificado {
  let out = "";
  let i = inicio;
  for (; i + 1 < b.length; i += 2) {
    const u = le ? b[i] | (b[i + 1] << 8) : (b[i] << 8) | b[i + 1];
    out += String.fromCharCode(u);
  }
  // Surrogate sem par é inválido para o expat.
  out = out.replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, INVALIDO);
  return { texto: out, parcial: i < b.length };
}

/** O que sobra de 0x80 a 0x9F no cp1252 do Python (o byte sem caractere é -1). */
const CP1252_ALTO = [
  0x20ac, -1, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, -1, 0x017d, -1,
  -1, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, -1, 0x017e, 0x0178,
];
/** O ISO-8859-15 difere do latin-1 só nestes oito bytes. */
const LATIN9: Record<number, number> = { 0xa4: 0x20ac, 0xa6: 0x0160, 0xa8: 0x0161, 0xb4: 0x017d, 0xb8: 0x017e, 0xbc: 0x0152, 0xbd: 0x0153, 0xbe: 0x0178 };

type Mapa = (byte: number) => number;
const MAPAS: Record<string, Mapa> = {
  latin_1: (x) => x,
  ascii: (x) => (x < 0x80 ? x : -1),
  cp1252: (x) => (x >= 0x80 && x <= 0x9f ? CP1252_ALTO[x - 0x80] : x),
  iso8859_15: (x) => LATIN9[x] ?? x,
  // O utf-8 pelo codec do Python decodifica byte a byte: acima de 0x7F, nenhum vira caractere.
  utf_8: (x) => (x < 0x80 ? x : -1),
};
/** Os apelidos que o `encodings.aliases` do Python resolve para os codecs acima. */
const APELIDOS: Record<string, string> = {
  latin_1: "latin_1", latin1: "latin_1", latin: "latin_1", l1: "latin_1", iso8859_1: "latin_1", iso_8859_1: "latin_1",
  "8859": "latin_1", cp819: "latin_1", ibm819: "latin_1", iso_ir_100: "latin_1", csisolatin1: "latin_1",
  iso_8859_1_1987: "latin_1", iso_8859_1_1998: "latin_1",
  ascii: "ascii", us_ascii: "ascii", us: "ascii", "646": "ascii", ansi_x3_4_1968: "ascii", ansi_x3_4_1986: "ascii",
  ansi_x3_4_1986_: "ascii", cp367: "ascii", csascii: "ascii", ibm367: "ascii", iso646_us: "ascii", iso_646_irv_1991: "ascii", iso_ir_6: "ascii",
  cp1252: "cp1252", windows_1252: "cp1252", "1252": "cp1252",
  iso8859_15: "iso8859_15", iso_8859_15: "iso8859_15", l9: "iso8859_15", latin9: "iso8859_15",
  utf_8: "utf_8", utf8: "utf_8", u8: "utf_8", utf: "utf_8", utf8_ucs2: "utf_8", utf8_ucs4: "utf_8", cp65001: "utf_8",
};
/** Codecs do Python de mais de um byte por caractere: o pyexpat recusa com `ValueError`. */
const MULTIBYTE = /^(utf_?16|utf_?32|u16|u32|utf_16_?(le|be)|utf_32_?(le|be)|shift_?jis|sjis|s_jis|cp932|ms932|mskanji|euc_?jp|euc_?kr|euc_?cn|gb2312|gbk|gb18030|cp936|ms936|big5|big5hkscs|cp950|ms950|cp949|uhc|johab|iso2022_?\w*|hz\w*|utf_7|utf7|u7|unicode_1_1_utf_7|utf_8_sig|idna|punycode|euc_jis_2004|euc_jisx0213|shift_jis_2004|shift_jisx0213)$/;

function normalizarCodec(nome: string): string {
  // `encodings.normalize_encoding` + minúsculas: o que não é letra, número ou ponto vira "_".
  let out = "";
  let pendente = false;
  for (const c of nome.toLowerCase()) {
    if (/[a-z0-9.]/.test(c)) {
      if (pendente && out) out += "_";
      out += c;
      pendente = false;
    } else pendente = true;
  }
  return out;
}

/** O codec do Python para um nome que o expat não conhece. */
function codecDoPython(nome: string): Mapa {
  const normal = normalizarCodec(nome);
  const codec = APELIDOS[normal] ?? APELIDOS[normal.replace(/\./g, "_")];
  if (codec) return MAPAS[codec];
  if (MULTIBYTE.test(normal)) throw new ErroDeCodificacao("ValueError", "multi-byte encodings are not supported");
  throw new ErroDeCodificacao("LookupError", `unknown encoding: ${nome}`);
}

function decodificarMapa(b: Uint8Array, inicio: number, mapa: Mapa): Decodificado {
  let out = "";
  for (let i = inicio; i < b.length; i++) {
    const cp = mapa(b[i]);
    out += cp < 0 ? INVALIDO : String.fromCodePoint(cp);
  }
  return { texto: out, parcial: false };
}

// ─── Posição e erro ────────────────────────────────────────────────────────────

function posicao(texto: string, indice: number): { linha: number; coluna: number } {
  let linha = 1;
  let coluna = 0;
  for (let i = 0; i < indice && i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    if (c === 0x0d) {
      linha++;
      coluna = 0;
      if (texto.charCodeAt(i + 1) === 0x0a) i++;
    } else if (c === 0x0a) {
      linha++;
      coluna = 0;
    } else if (c >= 0xdc00 && c <= 0xdfff && i > 0 && texto.charCodeAt(i - 1) >= 0xd800 && texto.charCodeAt(i - 1) <= 0xdbff) {
      // A segunda metade do par conta junto com a primeira.
    } else coluna++;
  }
  return { linha, coluna };
}

// ─── Classes de caractere ──────────────────────────────────────────────────────

const ESPACO = (c: string) => c === " " || c === "\t" || c === "\n" || c === "\r";

/** Caractere permitido em XML 1.0 (o expat recusa controle, surrogate solto, U+FFFE e U+FFFF). */
function caractereValido(cp: number): boolean {
  if (cp === 0x9 || cp === 0xa || cp === 0xd) return true;
  if (cp < 0x20) return false;
  if (cp >= 0xd800 && cp <= 0xdfff) return false;
  if (cp === 0xfffe || cp === 0xffff) return false;
  return cp <= 0x10ffff;
}

// O expat usa as classes de nome do XML 1.0 (2ª edição, Apêndice B: letras e ideogramas do Unicode 2.0).
// As tabelas abaixo saíram do próprio expat do Python 3.14, testando cada caractere do BMP no começo e
// no meio de um nome (`ET.fromstring("<" + c + "/>")` e `"<a" + c + "/>"`). Acima do BMP, nenhum entra.

/** Faixas [de, até] dos caracteres acima de 0x7F que o expat aceita no começo de um nome. */
const INICIO_DE_NOME_BMP: readonly number[] = [
  0xc0, 0xd6, 0xd8, 0xf6, 0xf8, 0x131, 0x134, 0x13e, 0x141, 0x148, 0x14a, 0x17e, 0x180, 0x1c3, 0x1cd, 0x1f0, 0x1f4,
  0x1f5, 0x1fa, 0x217, 0x250, 0x2a8, 0x2bb, 0x2c1, 0x386, 0x386, 0x388, 0x38a, 0x38c, 0x38c, 0x38e, 0x3a1, 0x3a3,
  0x3ce, 0x3d0, 0x3d6, 0x3da, 0x3da, 0x3dc, 0x3dc, 0x3de, 0x3de, 0x3e0, 0x3e0, 0x3e2, 0x3f3, 0x401, 0x40c, 0x40e,
  0x44f, 0x451, 0x45c, 0x45e, 0x481, 0x490, 0x4c4, 0x4c7, 0x4c8, 0x4cb, 0x4cc, 0x4d0, 0x4eb, 0x4ee, 0x4f5, 0x4f8,
  0x4f9, 0x531, 0x556, 0x559, 0x559, 0x561, 0x586, 0x5d0, 0x5ea, 0x5f0, 0x5f2, 0x621, 0x63a, 0x641, 0x64a, 0x671,
  0x6b7, 0x6ba, 0x6be, 0x6c0, 0x6ce, 0x6d0, 0x6d3, 0x6d5, 0x6d5, 0x6e5, 0x6e6, 0x905, 0x939, 0x93d, 0x93d, 0x958,
  0x961, 0x985, 0x98c, 0x98f, 0x990, 0x993, 0x9a8, 0x9aa, 0x9b0, 0x9b2, 0x9b2, 0x9b6, 0x9b9, 0x9dc, 0x9dd, 0x9df,
  0x9e1, 0x9f0, 0x9f1, 0xa05, 0xa0a, 0xa0f, 0xa10, 0xa13, 0xa28, 0xa2a, 0xa30, 0xa32, 0xa33, 0xa35, 0xa36, 0xa38,
  0xa39, 0xa59, 0xa5c, 0xa5e, 0xa5e, 0xa72, 0xa74, 0xa85, 0xa8b, 0xa8d, 0xa8d, 0xa8f, 0xa91, 0xa93, 0xaa8, 0xaaa,
  0xab0, 0xab2, 0xab3, 0xab5, 0xab9, 0xabd, 0xabd, 0xae0, 0xae0, 0xb05, 0xb0c, 0xb0f, 0xb10, 0xb13, 0xb28, 0xb2a,
  0xb30, 0xb32, 0xb33, 0xb36, 0xb39, 0xb3d, 0xb3d, 0xb5c, 0xb5d, 0xb5f, 0xb61, 0xb85, 0xb8a, 0xb8e, 0xb90, 0xb92,
  0xb95, 0xb99, 0xb9a, 0xb9c, 0xb9c, 0xb9e, 0xb9f, 0xba3, 0xba4, 0xba8, 0xbaa, 0xbae, 0xbb5, 0xbb7, 0xbb9, 0xc05,
  0xc0c, 0xc0e, 0xc10, 0xc12, 0xc28, 0xc2a, 0xc33, 0xc35, 0xc39, 0xc60, 0xc61, 0xc85, 0xc8c, 0xc8e, 0xc90, 0xc92,
  0xca8, 0xcaa, 0xcb3, 0xcb5, 0xcb9, 0xcde, 0xcde, 0xce0, 0xce1, 0xd05, 0xd0c, 0xd0e, 0xd10, 0xd12, 0xd28, 0xd2a,
  0xd39, 0xd60, 0xd61, 0xe01, 0xe2e, 0xe30, 0xe30, 0xe32, 0xe33, 0xe40, 0xe45, 0xe81, 0xe82, 0xe84, 0xe84, 0xe87,
  0xe88, 0xe8a, 0xe8a, 0xe8d, 0xe8d, 0xe94, 0xe97, 0xe99, 0xe9f, 0xea1, 0xea3, 0xea5, 0xea5, 0xea7, 0xea7, 0xeaa,
  0xeab, 0xead, 0xeae, 0xeb0, 0xeb0, 0xeb2, 0xeb3, 0xebd, 0xebd, 0xec0, 0xec4, 0xf40, 0xf47, 0xf49, 0xf69, 0x10a0,
  0x10c5, 0x10d0, 0x10f6, 0x1100, 0x1100, 0x1102, 0x1103, 0x1105, 0x1107, 0x1109, 0x1109, 0x110b, 0x110c, 0x110e,
  0x1112, 0x113c, 0x113c, 0x113e, 0x113e, 0x1140, 0x1140, 0x114c, 0x114c, 0x114e, 0x114e, 0x1150, 0x1150, 0x1154,
  0x1155, 0x1159, 0x1159, 0x115f, 0x1161, 0x1163, 0x1163, 0x1165, 0x1165, 0x1167, 0x1167, 0x1169, 0x1169, 0x116d,
  0x116e, 0x1172, 0x1173, 0x1175, 0x1175, 0x119e, 0x119e, 0x11a8, 0x11a8, 0x11ab, 0x11ab, 0x11ae, 0x11af, 0x11b7,
  0x11b8, 0x11ba, 0x11ba, 0x11bc, 0x11c2, 0x11eb, 0x11eb, 0x11f0, 0x11f0, 0x11f9, 0x11f9, 0x1e00, 0x1e9b, 0x1ea0,
  0x1ef9, 0x1f00, 0x1f15, 0x1f18, 0x1f1d, 0x1f20, 0x1f45, 0x1f48, 0x1f4d, 0x1f50, 0x1f57, 0x1f59, 0x1f59, 0x1f5b,
  0x1f5b, 0x1f5d, 0x1f5d, 0x1f5f, 0x1f7d, 0x1f80, 0x1fb4, 0x1fb6, 0x1fbc, 0x1fbe, 0x1fbe, 0x1fc2, 0x1fc4, 0x1fc6,
  0x1fcc, 0x1fd0, 0x1fd3, 0x1fd6, 0x1fdb, 0x1fe0, 0x1fec, 0x1ff2, 0x1ff4, 0x1ff6, 0x1ffc, 0x2126, 0x2126, 0x212a,
  0x212b, 0x212e, 0x212e, 0x2180, 0x2182, 0x3007, 0x3007, 0x3021, 0x3029, 0x3041, 0x3094, 0x30a1, 0x30fa, 0x3105,
  0x312c, 0x4e00, 0x9fa5, 0xac00, 0xd7a3,
];

/** Faixas [de, até] dos caracteres acima de 0x7F que o expat aceita no meio de um nome. */
const RESTO_DE_NOME_BMP: readonly number[] = [
  0xb7, 0xb7, 0xc0, 0xd6, 0xd8, 0xf6, 0xf8, 0x131, 0x134, 0x13e, 0x141, 0x148, 0x14a, 0x17e, 0x180, 0x1c3, 0x1cd,
  0x1f0, 0x1f4, 0x1f5, 0x1fa, 0x217, 0x250, 0x2a8, 0x2bb, 0x2c1, 0x2d0, 0x2d1, 0x300, 0x345, 0x360, 0x361, 0x386,
  0x38a, 0x38c, 0x38c, 0x38e, 0x3a1, 0x3a3, 0x3ce, 0x3d0, 0x3d6, 0x3da, 0x3da, 0x3dc, 0x3dc, 0x3de, 0x3de, 0x3e0,
  0x3e0, 0x3e2, 0x3f3, 0x401, 0x40c, 0x40e, 0x44f, 0x451, 0x45c, 0x45e, 0x481, 0x483, 0x486, 0x490, 0x4c4, 0x4c7,
  0x4c8, 0x4cb, 0x4cc, 0x4d0, 0x4eb, 0x4ee, 0x4f5, 0x4f8, 0x4f9, 0x531, 0x556, 0x559, 0x559, 0x561, 0x586, 0x591,
  0x5a1, 0x5a3, 0x5b9, 0x5bb, 0x5bd, 0x5bf, 0x5bf, 0x5c1, 0x5c2, 0x5c4, 0x5c4, 0x5d0, 0x5ea, 0x5f0, 0x5f2, 0x621,
  0x63a, 0x640, 0x652, 0x660, 0x669, 0x670, 0x6b7, 0x6ba, 0x6be, 0x6c0, 0x6ce, 0x6d0, 0x6d3, 0x6d5, 0x6e8, 0x6ea,
  0x6ed, 0x6f0, 0x6f9, 0x901, 0x903, 0x905, 0x939, 0x93c, 0x94d, 0x951, 0x954, 0x958, 0x963, 0x966, 0x96f, 0x981,
  0x983, 0x985, 0x98c, 0x98f, 0x990, 0x993, 0x9a8, 0x9aa, 0x9b0, 0x9b2, 0x9b2, 0x9b6, 0x9b9, 0x9bc, 0x9bc, 0x9be,
  0x9c4, 0x9c7, 0x9c8, 0x9cb, 0x9cd, 0x9d7, 0x9d7, 0x9dc, 0x9dd, 0x9df, 0x9e3, 0x9e6, 0x9f1, 0xa02, 0xa02, 0xa05,
  0xa0a, 0xa0f, 0xa10, 0xa13, 0xa28, 0xa2a, 0xa30, 0xa32, 0xa33, 0xa35, 0xa36, 0xa38, 0xa39, 0xa3c, 0xa3c, 0xa3e,
  0xa42, 0xa47, 0xa48, 0xa4b, 0xa4d, 0xa59, 0xa5c, 0xa5e, 0xa5e, 0xa66, 0xa74, 0xa81, 0xa83, 0xa85, 0xa8b, 0xa8d,
  0xa8d, 0xa8f, 0xa91, 0xa93, 0xaa8, 0xaaa, 0xab0, 0xab2, 0xab3, 0xab5, 0xab9, 0xabc, 0xac5, 0xac7, 0xac9, 0xacb,
  0xacd, 0xae0, 0xae0, 0xae6, 0xaef, 0xb01, 0xb03, 0xb05, 0xb0c, 0xb0f, 0xb10, 0xb13, 0xb28, 0xb2a, 0xb30, 0xb32,
  0xb33, 0xb36, 0xb39, 0xb3c, 0xb43, 0xb47, 0xb48, 0xb4b, 0xb4d, 0xb56, 0xb57, 0xb5c, 0xb5d, 0xb5f, 0xb61, 0xb66,
  0xb6f, 0xb82, 0xb83, 0xb85, 0xb8a, 0xb8e, 0xb90, 0xb92, 0xb95, 0xb99, 0xb9a, 0xb9c, 0xb9c, 0xb9e, 0xb9f, 0xba3,
  0xba4, 0xba8, 0xbaa, 0xbae, 0xbb5, 0xbb7, 0xbb9, 0xbbe, 0xbc2, 0xbc6, 0xbc8, 0xbca, 0xbcd, 0xbd7, 0xbd7, 0xbe7,
  0xbef, 0xc01, 0xc03, 0xc05, 0xc0c, 0xc0e, 0xc10, 0xc12, 0xc28, 0xc2a, 0xc33, 0xc35, 0xc39, 0xc3e, 0xc44, 0xc46,
  0xc48, 0xc4a, 0xc4d, 0xc55, 0xc56, 0xc60, 0xc61, 0xc66, 0xc6f, 0xc82, 0xc83, 0xc85, 0xc8c, 0xc8e, 0xc90, 0xc92,
  0xca8, 0xcaa, 0xcb3, 0xcb5, 0xcb9, 0xcbe, 0xcc4, 0xcc6, 0xcc8, 0xcca, 0xccd, 0xcd5, 0xcd6, 0xcde, 0xcde, 0xce0,
  0xce1, 0xce6, 0xcef, 0xd02, 0xd03, 0xd05, 0xd0c, 0xd0e, 0xd10, 0xd12, 0xd28, 0xd2a, 0xd39, 0xd3e, 0xd43, 0xd46,
  0xd48, 0xd4a, 0xd4d, 0xd57, 0xd57, 0xd60, 0xd61, 0xd66, 0xd6f, 0xe01, 0xe2e, 0xe30, 0xe3a, 0xe40, 0xe4e, 0xe50,
  0xe59, 0xe81, 0xe82, 0xe84, 0xe84, 0xe87, 0xe88, 0xe8a, 0xe8a, 0xe8d, 0xe8d, 0xe94, 0xe97, 0xe99, 0xe9f, 0xea1,
  0xea3, 0xea5, 0xea5, 0xea7, 0xea7, 0xeaa, 0xeab, 0xead, 0xeae, 0xeb0, 0xeb9, 0xebb, 0xebd, 0xec0, 0xec4, 0xec6,
  0xec6, 0xec8, 0xecd, 0xed0, 0xed9, 0xf18, 0xf19, 0xf20, 0xf29, 0xf35, 0xf35, 0xf37, 0xf37, 0xf39, 0xf39, 0xf3e,
  0xf47, 0xf49, 0xf69, 0xf71, 0xf84, 0xf86, 0xf8b, 0xf90, 0xf95, 0xf97, 0xf97, 0xf99, 0xfad, 0xfb1, 0xfb7, 0xfb9,
  0xfb9, 0x10a0, 0x10c5, 0x10d0, 0x10f6, 0x1100, 0x1100, 0x1102, 0x1103, 0x1105, 0x1107, 0x1109, 0x1109, 0x110b,
  0x110c, 0x110e, 0x1112, 0x113c, 0x113c, 0x113e, 0x113e, 0x1140, 0x1140, 0x114c, 0x114c, 0x114e, 0x114e, 0x1150,
  0x1150, 0x1154, 0x1155, 0x1159, 0x1159, 0x115f, 0x1161, 0x1163, 0x1163, 0x1165, 0x1165, 0x1167, 0x1167, 0x1169,
  0x1169, 0x116d, 0x116e, 0x1172, 0x1173, 0x1175, 0x1175, 0x119e, 0x119e, 0x11a8, 0x11a8, 0x11ab, 0x11ab, 0x11ae,
  0x11af, 0x11b7, 0x11b8, 0x11ba, 0x11ba, 0x11bc, 0x11c2, 0x11eb, 0x11eb, 0x11f0, 0x11f0, 0x11f9, 0x11f9, 0x1e00,
  0x1e9b, 0x1ea0, 0x1ef9, 0x1f00, 0x1f15, 0x1f18, 0x1f1d, 0x1f20, 0x1f45, 0x1f48, 0x1f4d, 0x1f50, 0x1f57, 0x1f59,
  0x1f59, 0x1f5b, 0x1f5b, 0x1f5d, 0x1f5d, 0x1f5f, 0x1f7d, 0x1f80, 0x1fb4, 0x1fb6, 0x1fbc, 0x1fbe, 0x1fbe, 0x1fc2,
  0x1fc4, 0x1fc6, 0x1fcc, 0x1fd0, 0x1fd3, 0x1fd6, 0x1fdb, 0x1fe0, 0x1fec, 0x1ff2, 0x1ff4, 0x1ff6, 0x1ffc, 0x20d0,
  0x20dc, 0x20e1, 0x20e1, 0x2126, 0x2126, 0x212a, 0x212b, 0x212e, 0x212e, 0x2180, 0x2182, 0x3005, 0x3005, 0x3007,
  0x3007, 0x3021, 0x302f, 0x3031, 0x3035, 0x3041, 0x3094, 0x3099, 0x309a, 0x309d, 0x309e, 0x30a1, 0x30fa, 0x30fc,
  0x30fe, 0x3105, 0x312c, 0x4e00, 0x9fa5, 0xac00, 0xd7a3,
];

function naTabela(tabela: readonly number[], cp: number): boolean {
  let a = 0;
  let b = tabela.length / 2 - 1;
  while (a <= b) {
    const m = (a + b) >> 1;
    if (cp < tabela[2 * m]) b = m - 1;
    else if (cp > tabela[2 * m + 1]) a = m + 1;
    else return true;
  }
  return false;
}

function iniciaNome(c: string): boolean {
  if (c.length !== 1) return false;
  const cp = c.charCodeAt(0);
  if (cp < 0x80) return (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a) || cp === 0x5f;
  return naTabela(INICIO_DE_NOME_BMP, cp);
}
function continuaNome(c: string): boolean {
  if (c.length !== 1) return false;
  const cp = c.charCodeAt(0);
  if (cp < 0x80) return (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a) || (cp >= 0x30 && cp <= 0x39) || cp === 0x5f || cp === 0x2e || cp === 0x2d;
  return naTabela(RESTO_DE_NOME_BMP, cp);
}

// ─── Parser ────────────────────────────────────────────────────────────────────

type Bruto = { qname: string; valor: string; inicio: number };

class Leitor {
  i = 0;
  readonly raizes: NoXml[] = [];
  raiz: ElementoXml | null = null;

  constructor(
    readonly s: string,
    readonly parcial: boolean,
    readonly inicio: number,
  ) {
    this.i = inicio;
  }

  erro(mensagem: string, indice: number): never {
    const { linha, coluna } = posicao(this.s, indice);
    throw new ErroDeXml(`${mensagem}: line ${linha}, column ${coluna}`);
  }

  /** O caractere (code point inteiro) em `i`. */
  c(i = this.i): string {
    const cp = this.s.codePointAt(i);
    return cp === undefined ? "" : String.fromCodePoint(cp);
  }

  fim(i = this.i): boolean {
    return i >= this.s.length;
  }

  /** Fim do arquivo dentro de um token: "partial character" se ele termina no meio de um caractere. */
  fimNoToken(inicio: number): never {
    if (this.parcial) this.erro("partial character", this.s.length);
    this.erro("unclosed token", inicio);
  }

  invalidoSe(i: number): void {
    const cp = this.s.codePointAt(i);
    if (cp !== undefined && !caractereValido(cp)) this.erro("not well-formed (invalid token)", i);
  }

  /** Um nome (com no máximo um `:` no meio, como no modo de namespaces do expat). Devolve o fim. */
  nome(inicio: number, inicioDoToken: number): number {
    let i = inicio;
    const primeiro = this.c(i);
    if (this.fim(i)) this.fimNoToken(inicioDoToken);
    if (!iniciaNome(primeiro)) this.erro("not well-formed (invalid token)", i);
    i += primeiro.length;
    let doisPontos = false;
    for (;;) {
      if (this.fim(i)) return i;
      const c = this.c(i);
      if (c === ":") {
        if (doisPontos) this.erro("not well-formed (invalid token)", i);
        doisPontos = true;
        const prox = this.c(i + 1);
        if (this.fim(i + 1)) this.fimNoToken(inicioDoToken);
        if (!iniciaNome(prox)) this.erro("not well-formed (invalid token)", i + 1);
        i += 1 + prox.length;
        continue;
      }
      if (!continuaNome(c)) return i;
      i += c.length;
    }
  }

  ler(): ElementoXml {
    this.prologo();
    this.epilogo();
    return this.raiz!;
  }

  // ── Prólogo ──

  prologo(): void {
    const z = this.inicio;
    if (this.s.startsWith("<?xml", z) && (this.fim(z + 5) || ESPACO(this.c(z + 5)) || this.s.startsWith("?>", z + 5))) {
      this.i = this.instrucao(z, true);
    }
    for (;;) {
      if (this.fim()) {
        if (this.parcial) this.erro("partial character", this.s.length);
        this.erro("no element found", this.s.length);
      }
      const c = this.c();
      if (ESPACO(c)) {
        this.i++;
        continue;
      }
      if (c === "<") {
        if (this.fim(this.i + 1)) this.fimNoToken(this.i);
        const d = this.c(this.i + 1);
        if (d === "?") {
          this.i = this.instrucao(this.i, false);
          continue;
        }
        if (d === "!") {
          if (this.s.startsWith("<!--", this.i)) {
            this.i = this.comentario(this.i, null);
            continue;
          }
          if (this.s.startsWith("<!DOCTYPE", this.i)) throw new ErroDeDtd("DTD");
          this.declaracaoSolta(this.i, "syntax error");
        }
        this.raiz = this.elemento(this.i, null);
        return;
      }
      this.tokenSolto(this.i, "syntax error");
    }
  }

  /** Texto fora de marcação no prólogo (erro de sintaxe) ou no epílogo (lixo depois do documento). */
  tokenSolto(i: number, mensagem: string): never {
    const c = this.c(i);
    const cp = c.codePointAt(0)!;
    if (!caractereValido(cp)) this.erro("not well-formed (invalid token)", i);
    if (c === "%") {
      const fimNome = iniciaNome(this.c(i + 1)) ? this.nomeSimples(i + 1) : i + 1;
      if (fimNome > i + 1 && this.c(fimNome) === ";") this.erro("illegal parameter entity reference", i);
      this.erro("not well-formed (invalid token)", fimNome);
    }
    if (c === '"' || c === "'") {
      const fim = this.s.indexOf(c, i + 1);
      for (let k = i + 1; k < (fim < 0 ? this.s.length : fim); k++) this.invalidoSe(k);
      if (fim < 0) this.fimNoToken(i);
      this.terminaToken(fim + 1, i, mensagem);
    }
    if (c === "#") {
      if (this.fim(i + 1)) this.fimNoToken(i);
      if (!iniciaNome(this.c(i + 1))) this.erro("not well-formed (invalid token)", i + 1);
      this.terminaToken(this.nomeSimples(i + 1), i, mensagem);
    }
    if (">[]()|,".includes(c)) this.erro(mensagem, i);
    if (continuaNome(c) || c === ":") {
      let j = i;
      while (!this.fim(j) && (continuaNome(this.c(j)) || this.c(j) === ":")) j += this.c(j).length;
      this.terminaToken(j, i, mensagem, iniciaNome(c));
    }
    this.erro("not well-formed (invalid token)", i);
  }

  /** O token solto termina em `j`: se o que vem depois pode separar tokens, o erro é o da posição. */
  terminaToken(j: number, inicio: number, mensagem: string, aceitaQuantificador = true): never {
    const separadores = aceitaQuantificador ? ">[]()|,?*+%" : ">[]()|,%";
    if (this.fim(j) || ESPACO(this.c(j)) || separadores.includes(this.c(j))) this.erro(mensagem, inicio);
    this.erro("not well-formed (invalid token)", j);
  }

  /** `<!` dentro de um elemento que não é comentário nem CDATA: o erro no primeiro caractere que destoa. */
  declaracaoNoConteudo(i: number): never {
    if (this.fim(i + 2)) this.fimNoToken(i);
    const c = this.c(i + 2);
    if (c === "-") {
      if (this.fim(i + 3)) this.fimNoToken(i);
      this.erro("not well-formed (invalid token)", i + 3);
    }
    if (c === "[") {
      for (let k = 3; k < 9; k++) {
        if (this.fim(i + k)) this.fimNoToken(i);
        if (this.s[i + k] !== "<![CDATA["[k]) this.erro("not well-formed (invalid token)", i + k);
      }
    }
    this.erro("not well-formed (invalid token)", i + 2);
  }

  /** `<!` que não é comentário nem DOCTYPE, fora do elemento raiz. */
  declaracaoSolta(i: number, mensagem: string): never {
    if (this.fim(i + 2)) this.fimNoToken(i);
    const c = this.c(i + 2);
    if (c === "-") {
      if (this.fim(i + 3)) this.fimNoToken(i);
      this.erro("not well-formed (invalid token)", i + 3);
    }
    if (c === "[") this.erro(mensagem, i);
    if (!iniciaNome(c)) this.erro("not well-formed (invalid token)", i + 2);
    const j = this.nomeSimples(i + 2);
    if (this.fim(j)) this.fimNoToken(i);
    this.erro(mensagem, i);
  }

  /** O nome da tag de fechamento: o expat só compara com o da abertura, sem conferir os `:`. */
  nomeDeFechamento(inicio: number, inicioDoToken: number): number {
    if (this.fim(inicio)) this.fimNoToken(inicioDoToken);
    const c = this.c(inicio);
    if (!iniciaNome(c)) this.erro("not well-formed (invalid token)", inicio);
    let j = inicio + c.length;
    while (!this.fim(j) && (continuaNome(this.c(j)) || this.c(j) === ":")) j += this.c(j).length;
    return j;
  }

  nomeSimples(i: number): number {
    let j = i;
    while (!this.fim(j) && continuaNome(this.c(j))) j += this.c(j).length;
    return j;
  }

  // ── Epílogo ──

  epilogo(): void {
    for (;;) {
      if (this.fim()) {
        if (this.parcial) this.erro("partial character", this.s.length);
        return;
      }
      const c = this.c();
      if (ESPACO(c)) {
        this.i++;
        continue;
      }
      if (c === "<") {
        if (this.fim(this.i + 1)) this.fimNoToken(this.i);
        const d = this.c(this.i + 1);
        if (d === "?") {
          this.i = this.instrucao(this.i, false);
          continue;
        }
        if (this.s.startsWith("<!--", this.i)) {
          this.i = this.comentario(this.i, null);
          continue;
        }
        if (d === "/") this.erro("not well-formed (invalid token)", this.i + 1);
        if (d === "!") {
          if (this.s.startsWith("<![CDATA[", this.i)) this.erro("junk after document element", this.i);
          this.declaracaoSolta(this.i, "junk after document element");
        }
        if (d !== "!" && !iniciaNome(d)) this.erro("not well-formed (invalid token)", this.i + 1);
        this.erro("junk after document element", this.i);
      }
      if (c === "&") this.erro("not well-formed (invalid token)", this.i);
      if (c === "]" && this.s.startsWith("]]>", this.i)) this.erro("junk after document element", this.i);
      this.tokenSolto(this.i, "junk after document element");
    }
  }

  // ── Instrução de processamento (e a declaração XML) ──

  instrucao(inicio: number, declaracao: boolean): number {
    if (this.fim(inicio + 2)) this.fimNoToken(inicio);
    if (!iniciaNome(this.c(inicio + 2))) this.erro("not well-formed (invalid token)", inicio + 2);
    const fimAlvo = this.nomeSimples(inicio + 2);
    const alvo = this.s.slice(inicio + 2, fimAlvo);
    if (alvo.toLowerCase() === "xml" && alvo !== "xml") this.erro("not well-formed (invalid token)", fimAlvo);
    if (this.c(fimAlvo) === ":") this.erro("not well-formed (invalid token)", fimAlvo);
    const i = fimAlvo;
    if (this.fim(i)) this.fimNoToken(inicio);
    if (this.s.startsWith("?>", i)) {
      if (alvo === "xml" && !declaracao) this.erro("XML or text declaration not at start of entity", inicio);
      if (declaracao) this.erroDeDeclaracao(inicio, i);
      this.adicionarInstrucao(alvo, "");
      return i + 2;
    }
    if (!ESPACO(this.c(i))) {
      if (this.c(i) === "?") {
        if (this.fim(i + 1)) this.fimNoToken(inicio);
        this.erro("not well-formed (invalid token)", i + 1);
      }
      this.erro("not well-formed (invalid token)", i);
    }
    const fim = this.s.indexOf("?>", i);
    // Caractere inválido antes do fim (ou até o fim do arquivo) é erro nele.
    const limite = fim < 0 ? this.s.length : fim;
    for (let k = i; k < limite; k++) this.invalidoSe(k);
    if (fim < 0) this.fimNoToken(inicio);
    if (alvo === "xml") {
      if (!declaracao) this.erro("XML or text declaration not at start of entity", inicio);
      this.validarDeclaracao(inicio, fim);
      return fim + 2;
    }
    let d = i;
    while (d < fim && ESPACO(this.c(d))) d++;
    this.adicionarInstrucao(alvo, normalizarFimDeLinha(this.s.slice(d, fim)));
    return fim + 2;
  }

  adicionarInstrucao(alvo: string, dados: string): void {
    const no: InstrucaoXml = { tipo: "instrucao", alvo, dados };
    if (this.pilha.length) this.pilha[this.pilha.length - 1].filhos.push(no);
    else this.raizes.push(no);
  }

  erroDeDeclaracao(_inicio: number, onde: number): never {
    this.erro("XML declaration not well-formed", onde);
  }

  /** `XmlParseXmlDecl` do expat: só confere a forma (a codificação já foi tratada antes). */
  validarDeclaracao(inicio: number, fim: number): void {
    const s = this.s;
    let p = inicio + 5;
    const ascii = (k: number) => (k < fim && s.charCodeAt(k) < 0x80 ? s[k] : null);
    const pseudo = (): { nome: [number, number]; valor: [number, number] } | null => {
      if (p === fim) return null;
      if (!ESPACO(ascii(p) ?? "x")) this.erroDeDeclaracao(inicio, p);
      do p++;
      while (p < fim && ESPACO(ascii(p) ?? "x"));
      if (p === fim) return null;
      const nomeIni = p;
      let nomeFim: number;
      for (;;) {
        const c = ascii(p);
        if (c === null) this.erroDeDeclaracao(inicio, p);
        if (c === "=") {
          nomeFim = p;
          break;
        }
        if (ESPACO(c)) {
          nomeFim = p;
          do p++;
          while (p < fim && ESPACO(ascii(p) ?? "x"));
          if (ascii(p) !== "=") this.erroDeDeclaracao(inicio, p);
          break;
        }
        p++;
      }
      if (p === nomeIni) this.erroDeDeclaracao(inicio, p);
      p++;
      while (ESPACO(ascii(p) ?? "x")) p++;
      const aspa = ascii(p);
      if (aspa !== '"' && aspa !== "'") this.erroDeDeclaracao(inicio, p);
      p++;
      const valIni = p;
      for (;;) {
        const c = ascii(p);
        if (c === aspa) break;
        if (c === null || !/[A-Za-z0-9._-]/.test(c)) this.erroDeDeclaracao(inicio, p);
        p++;
      }
      const valFim = p;
      p++;
      return { nome: [nomeIni, nomeFim], valor: [valIni, valFim] };
    };
    const nomeDe = (a: { nome: [number, number] }) => s.slice(a.nome[0], a.nome[1]);
    let a = pseudo();
    if (!a) this.erroDeDeclaracao(inicio, inicio + 5);
    if (nomeDe(a) !== "version") this.erroDeDeclaracao(inicio, a.nome[0]);
    a = pseudo();
    if (!a) return;
    if (nomeDe(a) === "encoding") {
      if (!/[A-Za-z]/.test(ascii(a.valor[0]) ?? "")) this.erroDeDeclaracao(inicio, a.valor[0]);
      a = pseudo();
      if (!a) return;
    }
    if (nomeDe(a) !== "standalone") this.erroDeDeclaracao(inicio, a.nome[0]);
    const v = s.slice(a.valor[0], a.valor[1]);
    if (v !== "yes" && v !== "no") this.erroDeDeclaracao(inicio, a.valor[0]);
    while (p < fim && ESPACO(ascii(p) ?? "x")) p++;
    if (p !== fim) this.erroDeDeclaracao(inicio, p);
  }

  // ── Comentário ──

  comentario(inicio: number, pai: ElementoXml | null): number {
    let i = inicio + 4;
    for (;;) {
      if (this.fim(i)) this.fimNoToken(inicio);
      this.invalidoSe(i);
      if (this.s.startsWith("--", i)) {
        if (this.fim(i + 2)) this.fimNoToken(inicio);
        if (this.c(i + 2) !== ">") this.erro("not well-formed (invalid token)", i + 2);
        const no: ComentarioXml = { tipo: "comentario", valor: normalizarFimDeLinha(this.s.slice(inicio + 4, i)) };
        if (pai) pai.filhos.push(no);
        else this.raizes.push(no);
        return i + 3;
      }
      i += this.c(i).length;
    }
  }

  // ── Elementos ──

  readonly pilha: ElementoXml[] = [];
  readonly escopos: Map<string, string>[] = [];

  /** Lê o elemento que começa em `inicio` e todo o conteúdo dele (iterativo: sem limite de profundidade). */
  elemento(inicio: number, pai: ElementoXml | null): ElementoXml {
    const raiz = this.abrir(inicio, pai);
    if (!raiz.vazio) this.conteudo();
    return raiz.el;
  }

  abrir(inicio: number, pai: ElementoXml | null): { el: ElementoXml; vazio: boolean } {
    const fimNome = this.nome(inicio + 1, inicio);
    const qname = this.s.slice(inicio + 1, fimNome);
    const brutos: Bruto[] = [];
    let i = fimNome;
    let vazio = false;
    for (;;) {
      if (this.fim(i)) this.fimNoToken(inicio);
      let c = this.c(i);
      if (c === ">") {
        i++;
        break;
      }
      if (c === "/") {
        if (this.fim(i + 1)) this.fimNoToken(inicio);
        if (this.c(i + 1) !== ">") this.erro("not well-formed (invalid token)", i + 1);
        i += 2;
        vazio = true;
        break;
      }
      if (!ESPACO(c)) this.erro("not well-formed (invalid token)", i);
      while (!this.fim(i) && ESPACO(this.c(i))) i++;
      if (this.fim(i)) this.fimNoToken(inicio);
      c = this.c(i);
      if (c === ">" || c === "/") continue;
      // Atributo.
      const ini = i;
      const fimAttr = this.nome(i, inicio);
      i = fimAttr;
      while (!this.fim(i) && ESPACO(this.c(i))) i++;
      if (this.fim(i)) this.fimNoToken(inicio);
      if (this.c(i) !== "=") this.erro("not well-formed (invalid token)", i);
      i++;
      while (!this.fim(i) && ESPACO(this.c(i))) i++;
      if (this.fim(i)) this.fimNoToken(inicio);
      const aspa = this.c(i);
      if (aspa !== '"' && aspa !== "'") this.erro("not well-formed (invalid token)", i);
      i++;
      const [valor, depois] = this.valorDeAtributo(i, aspa, inicio);
      i = depois;
      brutos.push({ qname: this.s.slice(ini, fimAttr), valor, inicio: ini });
      if (this.fim(i)) this.fimNoToken(inicio);
      const prox = this.c(i);
      if (prox !== ">" && prox !== "/" && !ESPACO(prox)) this.erro("not well-formed (invalid token)", i);
    }
    // Atributo repetido pelo nome cru: o erro aponta o segundo.
    const vistos = new Set<string>();
    for (const b of brutos) {
      if (vistos.has(b.qname)) this.erro("duplicate attribute", b.inicio);
      vistos.add(b.qname);
    }
    const el = this.resolverNamespaces(inicio, qname, brutos, pai);
    this.i = i;
    if (pai) pai.filhos.push(el);
    if (vazio) {
      this.escopos.pop();
    } else {
      this.pilha.push(el);
    }
    return { el, vazio };
  }

  resolverNamespaces(inicio: number, qname: string, brutos: Bruto[], pai: ElementoXml | null): ElementoXml {
    const anterior = this.escopos.length ? this.escopos[this.escopos.length - 1] : new Map([["xml", NS_XML]]);
    const escopo = new Map(anterior);
    const declaracoes: DeclaracaoXml[] = [];
    const comuns: Bruto[] = [];
    for (const b of brutos) {
      if (b.qname === "xmlns" || b.qname.startsWith("xmlns:")) {
        const prefixo = b.qname === "xmlns" ? null : b.qname.slice(6);
        if (prefixo === "xmlns") this.erro("reserved prefix (xmlns) must not be declared or undeclared", inicio);
        if (prefixo === "xml" && b.valor !== NS_XML) {
          this.erro("reserved prefix (xml) must not be undeclared or bound to another namespace name", inicio);
        }
        if (prefixo !== "xml" && (b.valor === NS_XML || b.valor === NS_XMLNS)) {
          this.erro("prefix must not be bound to one of the reserved namespace names", inicio);
        }
        if (prefixo !== null && b.valor === "") this.erro("must not undeclare prefix", inicio);
        declaracoes.push({ prefixo, uri: b.valor });
        escopo.set(prefixo ?? "", b.valor);
      } else comuns.push(b);
    }
    const atributos: AtributoXml[] = [];
    const expandidos = new Set<string>();
    for (const b of comuns) {
      const k = b.qname.indexOf(":");
      const prefixo = k > 0 ? b.qname.slice(0, k) : null;
      const local = k > 0 ? b.qname.slice(k + 1) : b.qname;
      let ns: string | null = null;
      if (prefixo !== null) {
        const uri = escopo.get(prefixo);
        if (uri === undefined || uri === "") this.erro("unbound prefix", inicio);
        ns = uri;
      }
      const chave = ns === null ? local : `{${ns}}${local}`;
      if (expandidos.has(chave)) this.erro("duplicate attribute", inicio);
      expandidos.add(chave);
      atributos.push({ qname: b.qname, prefixo, local, ns, valor: b.valor });
    }
    const k = qname.indexOf(":");
    const prefixo = k > 0 ? qname.slice(0, k) : null;
    const local = k > 0 ? qname.slice(k + 1) : qname;
    let ns: string | null;
    if (prefixo !== null) {
      const uri = escopo.get(prefixo);
      if (uri === undefined || uri === "") this.erro("unbound prefix", inicio);
      ns = uri;
    } else {
      const padrao = escopo.get("");
      ns = padrao ? padrao : null;
    }
    this.escopos.push(escopo);
    return { tipo: "elemento", qname, prefixo, local, ns, atributos, declaracoes, filhos: [], pai };
  }

  /** O valor do atributo, normalizado como o expat (e a libxml2) normalizam. */
  valorDeAtributo(inicio: number, aspa: string, inicioDoToken: number): [string, number] {
    let out = "";
    let i = inicio;
    for (;;) {
      if (this.fim(i)) this.fimNoToken(inicioDoToken);
      const c = this.c(i);
      if (c === aspa) return [out, i + 1];
      if (c === "<") this.erro("not well-formed (invalid token)", i);
      if (c === "&") {
        const [texto, depois] = this.referencia(i, inicioDoToken);
        out += texto;
        i = depois;
        continue;
      }
      this.invalidoSe(i);
      if (c === "\r") {
        out += " ";
        i += this.c(i + 1) === "\n" ? 2 : 1;
        continue;
      }
      out += c === "\n" || c === "\t" ? " " : c;
      i += c.length;
    }
  }

  /** `&...;` em `i`. Devolve o texto e o índice depois do `;`. */
  referencia(i: number, inicioDoToken: number): [string, number] {
    if (this.fim(i + 1)) this.fimNoToken(inicioDoToken);
    if (this.c(i + 1) === "#") {
      let j = i + 2;
      let hex = false;
      if (this.fim(j)) this.fimNoToken(inicioDoToken);
      if (this.c(j) === "x") {
        hex = true;
        j++;
      }
      const digitos = hex ? /[0-9a-fA-F]/ : /[0-9]/;
      const ini = j;
      for (;;) {
        if (this.fim(j)) this.fimNoToken(inicioDoToken);
        const c = this.c(j);
        if (c === ";" && j > ini) break;
        if (!digitos.test(c) || c.length !== 1) this.erro("not well-formed (invalid token)", j);
        j++;
      }
      const texto = this.s.slice(ini, j);
      let valor = 0;
      for (const d of texto) {
        valor = valor * (hex ? 16 : 10) + parseInt(d, 16);
        if (valor > 0x10ffff) break;
      }
      if (!caractereValido(valor)) this.erro("reference to invalid character number", i);
      return [String.fromCodePoint(valor), j + 1];
    }
    const c1 = this.c(i + 1);
    if (!iniciaNome(c1)) this.erro("not well-formed (invalid token)", i + 1);
    let j = i + 1 + c1.length;
    for (;;) {
      if (this.fim(j)) this.fimNoToken(inicioDoToken);
      const c = this.c(j);
      if (c === ";") break;
      if (!continuaNome(c)) this.erro("not well-formed (invalid token)", j);
      j += c.length;
    }
    const nome = this.s.slice(i + 1, j);
    const predefinidas: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (!(nome in predefinidas)) this.erro("undefined entity", i);
    return [predefinidas[nome], j + 1];
  }

  textoNo(el: ElementoXml, texto: string): void {
    if (!texto) return;
    const ultimo = el.filhos[el.filhos.length - 1];
    if (ultimo && ultimo.tipo === "texto") ultimo.valor += texto;
    else el.filhos.push({ tipo: "texto", valor: texto });
  }

  /** O conteúdo dos elementos abertos, até fechar a raiz. */
  conteudo(): void {
    let i = this.i;
    while (this.pilha.length) {
      const el = this.pilha[this.pilha.length - 1];
      if (this.fim(i)) {
        if (this.parcial) this.erro("partial character", this.s.length);
        this.erro("no element found", this.s.length);
      }
      const c = this.c(i);
      if (c === "<") {
        if (this.fim(i + 1)) this.fimNoToken(i);
        const d = this.c(i + 1);
        if (d === "/") {
          const fimNome = this.nomeDeFechamento(i + 2, i);
          const nome = this.s.slice(i + 2, fimNome);
          let j = fimNome;
          while (!this.fim(j) && ESPACO(this.c(j))) j++;
          if (this.fim(j)) this.fimNoToken(i);
          if (this.c(j) !== ">") this.erro("not well-formed (invalid token)", j);
          if (nome !== el.qname) this.erro("mismatched tag", i + 2);
          this.pilha.pop();
          this.escopos.pop();
          i = j + 1;
          continue;
        }
        if (d === "!") {
          if (this.s.startsWith("<!--", i)) {
            i = this.comentario(i, el);
            continue;
          }
          if (this.s.startsWith("<![CDATA[", i)) {
            const fim = this.s.indexOf("]]>", i + 9);
            const limite = fim < 0 ? this.s.length : fim;
            for (let k = i + 9; k < limite; k++) this.invalidoSe(k);
            if (fim < 0) this.erro("unclosed CDATA section", this.s.length);
            this.textoNo(el, normalizarFimDeLinha(this.s.slice(i + 9, fim)));
            i = fim + 3;
            continue;
          }
          this.declaracaoNoConteudo(i);
        }
        if (d === "?") {
          this.i = i;
          i = this.instrucao(i, false);
          continue;
        }
        this.abrir(i, el);
        i = this.i;
        continue;
      }
      if (c === "&") {
        const [texto, depois] = this.referencia(i, i);
        this.textoNo(el, texto);
        i = depois;
        continue;
      }
      // Texto até a próxima marcação.
      let j = i;
      let texto = "";
      while (!this.fim(j)) {
        const x = this.c(j);
        if (x === "<" || x === "&") break;
        this.invalidoSe(j);
        if (x === "]" && this.s.startsWith("]]>", j)) this.erro("not well-formed (invalid token)", j + 2);
        if (x === "\r") {
          texto += "\n";
          j += this.c(j + 1) === "\n" ? 2 : 1;
          continue;
        }
        texto += x;
        j += x.length;
      }
      this.textoNo(el, texto);
      i = j;
    }
    this.i = i;
  }
}

function normalizarFimDeLinha(t: string): string {
  return t.replace(/\r\n?/g, "\n");
}

/** A codificação da declaração XML, se ela for bem-formada (a malformada vira erro no parser). */
function lerDeclaracaoAscii(texto: string): { nome: string; posicao: number } | null {
  const m = /^<\?xml[ \t\r\n]+version[ \t\r\n]*=[ \t\r\n]*(["'])[A-Za-z0-9._-]*\1[ \t\r\n]+encoding[ \t\r\n]*=[ \t\r\n]*(["'])([A-Za-z][A-Za-z0-9._-]*)\2(?:[ \t\r\n]+standalone[ \t\r\n]*=[ \t\r\n]*(["'])(?:yes|no)\4)?[ \t\r\n]*\?>/.exec(texto);
  if (!m) return null;
  return { nome: m[3], posicao: m[0].indexOf(m[3], m[0].indexOf("encoding")) };
}

const NATIVAS = new Set(["ISO-8859-1", "US-ASCII", "UTF-8", "UTF-16", "UTF-16BE", "UTF-16LE"]);

/**
 * Bytes → texto, com a escolha de codificação do expat (e do codec do Python). O BOM fica no começo do
 * texto, porque o expat conta a coluna dele; `inicio` diz onde o documento começa.
 */
function decodificar(b: Uint8Array): Decodificado & { inicio: number } {
  let bom = 0;
  let utf16: boolean | null = null;
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) bom = 3;
  else if (b[0] === 0xff && b[1] === 0xfe) {
    utf16 = true;
    bom = 2;
  } else if (b[0] === 0xfe && b[1] === 0xff) {
    utf16 = false;
    bom = 2;
  } else if (b[0] === 0x3c && b[1] === 0x00) utf16 = true;
  else if (b[0] === 0x00 && b[1] === 0x3c) utf16 = false;
  const prefixo = bom ? "\ufeff" : "";
  const inicio = prefixo.length;
  if (utf16 !== null) {
    const d = decodificarUtf16(b, bom, utf16);
    const texto = prefixo + d.texto;
    const decl = lerDeclaracaoAscii(d.texto);
    if (decl) {
      const nome = decl.nome.toUpperCase();
      const certa = nome === "UTF-16" || nome === (utf16 ? "UTF-16LE" : "UTF-16BE");
      if (!certa) {
        if (!NATIVAS.has(nome)) codecDoPython(decl.nome);
        throw new ErroDeXml(`encoding specified in XML declaration is incorrect: ${pos(texto, inicio + decl.posicao)}`);
      }
    }
    return { texto, parcial: d.parcial, inicio };
  }
  // Oito bits: a declaração é ASCII em qualquer codificação aceita.
  const cabeca = decodificarMapa(b.subarray(bom, Math.min(b.length, bom + 512)), 0, MAPAS.latin_1).texto;
  const decl = lerDeclaracaoAscii(cabeca);
  let d: Decodificado = { texto: "", parcial: false };
  let feito = false;
  if (decl) {
    const nome = decl.nome.toUpperCase();
    if (NATIVAS.has(nome)) {
      if (nome.startsWith("UTF-16")) {
        throw new ErroDeXml(`encoding specified in XML declaration is incorrect: ${pos(prefixo + cabeca, inicio + decl.posicao)}`);
      }
      if (nome === "ISO-8859-1" || nome === "US-ASCII") {
        d = decodificarMapa(b, bom, nome === "US-ASCII" ? MAPAS.ascii : MAPAS.latin_1);
        feito = true;
      }
    } else {
      d = decodificarMapa(b, bom, codecDoPython(decl.nome));
      feito = true;
    }
  }
  if (!feito) d = decodificarUtf8(b, bom);
  return { texto: prefixo + d.texto, parcial: d.parcial, inicio };
}

function pos(texto: string, indice: number): string {
  const { linha, coluna } = posicao(texto, indice);
  return `line ${linha}, column ${coluna}`;
}

/** `ET.fromstring(conteudo)` (e o `etree.fromstring` do lxml, para os XML que os dois aceitam). */
export function lerXml(conteudo: Uint8Array): ElementoXml {
  const { texto, parcial, inicio } = decodificar(conteudo);
  return new Leitor(texto, parcial, inicio).ler();
}

// ─── A visão do ElementTree ────────────────────────────────────────────────────

/** `element.tag`: `{uri}local` ou só `local`. */
export function tagEt(el: ElementoXml): string {
  return el.ns === null ? el.local : `{${el.ns}}${el.local}`;
}

/** `element.text`: o texto antes do primeiro filho (comentário e instrução não interrompem). */
export function textoEt(el: ElementoXml): string | null {
  let out = "";
  for (const f of el.filhos) {
    if (f.tipo === "elemento") break;
    if (f.tipo === "texto") out += f.valor;
  }
  return out === "" ? null : out;
}

/** `element.get(nome)` para atributo sem namespace. */
export function atributoEt(el: ElementoXml, nome: string): string | null {
  for (const a of el.atributos) if (a.ns === null && a.local === nome) return a.valor;
  return null;
}

export function filhosElemento(el: ElementoXml): ElementoXml[] {
  return el.filhos.filter((f): f is ElementoXml => f.tipo === "elemento");
}

/** `element.iter()`: o próprio elemento e os descendentes, em ordem de documento. */
export function* iterar(el: ElementoXml): Generator<ElementoXml> {
  const pilha: ElementoXml[] = [el];
  while (pilha.length) {
    const atual = pilha.pop()!;
    yield atual;
    const filhos = filhosElemento(atual);
    for (let k = filhos.length - 1; k >= 0; k--) pilha.push(filhos[k]);
  }
}
