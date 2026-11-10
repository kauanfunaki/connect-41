// Planilha .xls (Excel 97-2003) lida como o xlrd 2.0 do original lê (Fase 4b, 10/11/2026):
// `open_workbook(file_contents=...)` com os padrões (sem `formatting_info`, sem `on_demand`,
// `ragged_rows=False`), `wb.sheets()`, `ws.row(i)` e `xldate_as_tuple`.
//
// O porte segue o código do xlrd passo a passo (compdoc.py, book.py, sheet.py, formatting.py,
// xldate.py), inclusive nas esquisitices, porque o que sai dele entra no extrato:
// - número com formato de data (pelo XF da célula e o heurístico `is_date_format_string`) vira
//   XL_CELL_DATE; o resto é XL_CELL_NUMBER, sempre `float`;
// - `nrows`/`ncols` vêm das células presentes (o DIMENSIONS só zera a conta) e toda linha é
//   completada com células vazias até `ncols`;
// - BLANK/MULBLANK são ignorados (sem `formatting_info`), então "branco" não aparece;
// - arquivo que não é .xls dá o mesmo erro do xlrd: mesmo nome da exceção (em `name`) e mesma
//   mensagem. Os erros internos do Python (struct.error, IndexError, AssertionError...) também
//   saem com o nome deles, para o original e o porte falharem nos mesmos arquivos.
//
// É dado de cliente vindo de upload: todo índice é conferido, toda cadeia de setores tem limite
// e nada cresce sem que o arquivo tenha bytes para isso. Nos poucos casos em que o xlrd entraria
// em laço sem fim (ciclo na tabela de mini-setores, árvore de diretório circular), o porte para
// com `ErroXls` de nome "LimiteXls".
//
// Suporta BIFF8 (stream "Workbook") e BIFF5/7 (stream "Book"), dentro de OLE2 ou como stream solto
// (o xlrd também aceita). BIFF2-4 e o BIFF4W saem com `ErroXls` de nome "NaoSuportado".

// ─── Tipos públicos ─────────────────────────────────────────────────────────

export type TipoCelulaXls = "vazio" | "texto" | "numero" | "data" | "booleano" | "erro" | "branco";

/** `Cell` do xlrd: `ctype` (pelo nome) e `value` (texto, float, 0/1 ou o código do erro). */
export type CelulaXls = { tipo: TipoCelulaXls; valor: string | number };

export type FolhaXls = { nome: string; linhas: CelulaXls[][] };

export type LivroXls = { datemode: 0 | 1; folhas: FolhaXls[] };

/** Erro de leitura com o nome da exceção que o xlrd (ou o Python por baixo dele) lançaria. */
export class ErroXls extends Error {
  constructor(mensagem: string, nome = "XLRDError") {
    super(mensagem);
    this.name = nome;
  }
}

// ─── Comportamento do Python ────────────────────────────────────────────────

const erro = (nome: string, mensagem: string) => new ErroXls(mensagem, nome);
const erroStruct = (n: number) => erro("struct.error", `unpack requires a buffer of ${n} bytes`);
const erroLista = () => erro("IndexError", "list index out of range");

function afirmar(condicao: boolean, mensagem = ""): asserts condicao {
  if (!condicao) throw erro("AssertionError", mensagem);
}

/** `b[i:j]` do Python (índices negativos contam do fim; fora do intervalo encolhe). */
function fatia(b: Uint8Array, i: number, j: number = b.length): Uint8Array {
  const n = b.length;
  if (i < 0) i = Math.max(i + n, 0);
  else if (i > n) i = n;
  if (j < 0) j = Math.max(j + n, 0);
  else if (j > n) j = n;
  return j <= i ? b.subarray(0, 0) : b.subarray(i, j);
}

/** `b[i]` do Python. */
function byteEm(b: Uint8Array, i: number): number {
  const k = i < 0 ? i + b.length : i;
  if (k < 0 || k >= b.length) throw erro("IndexError", "index out of range");
  return b[k];
}

/** `lista[i]` do Python. */
function itemLista<T>(lista: T[], i: number): T {
  const k = i < 0 ? i + lista.length : i;
  if (k < 0 || k >= lista.length) throw erroLista();
  return lista[k];
}

/** `struct.unpack` exige o tamanho exato: devolve a vista para ler os campos. */
function exato(b: Uint8Array, n: number): DataView {
  if (b.length !== n) throw erroStruct(n);
  return new DataView(b.buffer, b.byteOffset, n);
}

const u16 = (b: Uint8Array, pos: number) => exato(fatia(b, pos, pos + 2), 2).getUint16(0, true);
const i32 = (b: Uint8Array, pos: number) => exato(fatia(b, pos, pos + 4), 4).getInt32(0, true);

/** `a // b` do Python para inteiros. */
function divPy(a: number, b: number): number {
  if (b === 0) throw erro("ZeroDivisionError", "division by zero");
  return Math.floor(a / b);
}

const hex2 = (n: number) => n.toString(16).padStart(2, "0");

/** `repr(bytes)` do Python. */
function reprBytes(b: Uint8Array): string {
  const aspas = b.includes(0x27) && !b.includes(0x22) ? '"' : "'";
  let s = "b" + aspas;
  for (const c of b) {
    if (c === 0x5c || c === aspas.charCodeAt(0)) s += "\\" + String.fromCharCode(c);
    else if (c === 0x09) s += "\\t";
    else if (c === 0x0a) s += "\\n";
    else if (c === 0x0d) s += "\\r";
    else if (c < 0x20 || c >= 0x7f) s += "\\x" + hex2(c);
    else s += String.fromCharCode(c);
  }
  return s + aspas;
}

/** `repr(str)` do Python para os nomes fixos que aparecem nas mensagens. */
function reprStr(t: string): string {
  const aspas = t.includes("'") && !t.includes('"') ? '"' : "'";
  let s = aspas;
  for (const c of t) {
    const n = c.codePointAt(0)!;
    if (c === "\\" || c === aspas) s += "\\" + c;
    else if (c === "\t") s += "\\t";
    else if (c === "\n") s += "\\n";
    else if (c === "\r") s += "\\r";
    else if (n < 0x20 || (n >= 0x7f && n <= 0xa0) || n === 0xad) s += "\\x" + hex2(n);
    else s += c;
  }
  return s + aspas;
}

/** `repr(float)` do Python: dígitos mínimos, notação científica fora de 1e-4 ≤ |x| < 1e16. */
function reprFloat(n: number): string {
  if (Number.isNaN(n)) return "nan";
  if (!Number.isFinite(n)) return n > 0 ? "inf" : "-inf";
  if (n === 0) return Object.is(n, -0) ? "-0.0" : "0.0";
  const [mantissa, expoente] = n.toExponential().split("e");
  const e = Number(expoente);
  const sinal = mantissa.startsWith("-") ? "-" : "";
  const digitos = mantissa.replace("-", "").replace(".", "");
  if (e < -4 || e >= 16) {
    const m = digitos.length > 1 ? `${digitos[0]}.${digitos.slice(1)}` : digitos;
    return `${sinal}${m}e${e < 0 ? "-" : "+"}${String(Math.abs(e)).padStart(2, "0")}`;
  }
  if (e < 0) return `${sinal}0.${"0".repeat(-e - 1)}${digitos}`;
  if (digitos.length <= e + 1) return `${sinal}${digitos}${"0".repeat(e + 1 - digitos.length)}.0`;
  return `${sinal}${digitos.slice(0, e + 1)}.${digitos.slice(e + 1)}`;
}

/** `UnicodeDecodeError` com a mensagem do Python. */
function erroDecodificacao(codec: string, b: Uint8Array, inicio: number, fim: number, motivo: string): ErroXls {
  const onde =
    fim - inicio === 1
      ? `byte 0x${hex2(b[inicio])} in position ${inicio}`
      : `bytes in position ${inicio}-${fim - 1}`;
  return erro("UnicodeDecodeError", `'${codec}' codec can't decode ${onde}: ${motivo}`);
}

function latin1(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
  return s;
}

/** `bytes.decode("utf_16_le")` estrito, como o Python (surrogate solto é erro). */
function utf16(b: Uint8Array): string {
  const unidades: number[] = [];
  const n = b.length;
  let i = 0;
  while (i + 1 < n) {
    const u = b[i] | (b[i + 1] << 8);
    if (u >= 0xd800 && u <= 0xdbff) {
      if (i + 3 >= n) throw erroDecodificacao("utf-16-le", b, i, n, "unexpected end of data");
      const v = b[i + 2] | (b[i + 3] << 8);
      if (v < 0xdc00 || v > 0xdfff) throw erroDecodificacao("utf-16-le", b, i, i + 2, "illegal UTF-16 surrogate");
      unidades.push(u, v);
      i += 4;
    } else if (u >= 0xdc00 && u <= 0xdfff) {
      throw erroDecodificacao("utf-16-le", b, i, i + 2, "illegal encoding");
    } else {
      unidades.push(u);
      i += 2;
    }
  }
  if (i < n) throw erroDecodificacao("utf-16-le", b, i, n, "truncated data");
  let s = "";
  for (let k = 0; k < unidades.length; k += 8192) s += String.fromCharCode(...unidades.slice(k, k + 8192));
  return s;
}

// cp1252 do Python: 0x81, 0x8D, 0x8F, 0x90 e 0x9D não têm caractere (é erro, não C1).
const CP1252_80_9F = [
  0x20ac, -1, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, -1, 0x017d, -1,
  -1, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, -1, 0x017e, 0x0178,
];

function cp1252(b: Uint8Array): string {
  let s = "";
  b.forEach((c, i) => {
    if (c < 0x80 || c > 0x9f) s += String.fromCharCode(c);
    else if (CP1252_80_9F[c - 0x80] < 0) throw erroDecodificacao("charmap", b, i, i + 1, "character maps to <undefined>");
    else s += String.fromCharCode(CP1252_80_9F[c - 0x80]);
  });
  return s;
}

// Codificações que o Python conhece para "cp" + CODEPAGE (300 a 1999), conferidas no Python 3.14.
const CODEPAGES_PYTHON = new Set([
  367, 437, 500, 708, 720, 737, 775, 819, 850, 852, 855, 856, 857, 858, 860, 861, 862, 863, 864, 865, 866, 869, 870,
  874, 875, 932, 936, 949, 950, 1006, 1026, 1047, 1051, 1125, 1140, 1141, 1142, 1143, 1144, 1145, 1146, 1147, 1148, 1149,
  1250, 1251, 1252, 1253, 1254, 1255, 1256, 1257, 1258, 1361,
]);

const CODIFICACAO_DE_CODEPAGE: Record<number, string> = {
  1200: "utf_16_le",
  10000: "mac_roman",
  10006: "mac_greek",
  10007: "mac_cyrillic",
  10029: "mac_latin2",
  10079: "mac_iceland",
  10081: "mac_turkish",
  32768: "mac_roman",
  32769: "cp1252",
};

function codificacaoExiste(enc: string): boolean {
  if (enc === "iso-8859-1" || Object.values(CODIFICACAO_DE_CODEPAGE).includes(enc)) return true;
  const m = /^cp(\d+)$/.exec(enc);
  return !!m && CODEPAGES_PYTHON.has(Number(m[1]));
}

// Para as outras codificações (só o BIFF5 usa), o rótulo equivalente do TextDecoder.
const ROTULO_TEXTDECODER: Record<string, string> = {
  mac_roman: "macintosh",
  cp866: "ibm866",
  cp874: "windows-874",
  cp932: "shift_jis",
  cp936: "gbk",
  cp949: "euc-kr",
  cp950: "big5",
  cp1250: "windows-1250",
  cp1251: "windows-1251",
  cp1253: "windows-1253",
  cp1254: "windows-1254",
  cp1255: "windows-1255",
  cp1256: "windows-1256",
  cp1257: "windows-1257",
  cp1258: "windows-1258",
};

/** `unicode(bytes, enc)` do xlrd. */
function decodificar(b: Uint8Array, enc: string): string {
  if (enc === "latin_1" || enc === "iso-8859-1") return latin1(b);
  if (enc === "utf_16_le") return utf16(b);
  if (enc === "cp1252") return cp1252(b);
  if (enc === "cp367") {
    const i = b.findIndex((c) => c >= 0x80);
    if (i >= 0) throw erroDecodificacao("ascii", b, i, i + 1, "ordinal not in range(128)");
    return latin1(b);
  }
  if (!codificacaoExiste(enc)) throw erro("LookupError", `unknown encoding: ${enc}`);
  const rotulo = ROTULO_TEXTDECODER[enc];
  if (!rotulo) throw erro("NaoSuportado", `Codificação ${enc} não suportada no porte do xlrd`);
  try {
    return new TextDecoder(rotulo, { fatal: true }).decode(b);
  } catch {
    throw erro("UnicodeDecodeError", `'${enc}' codec can't decode bytes`);
  }
}

/** Quantos caracteres o Python conta (`len(str)` conta pontos de código, não unidades UTF-16). */
function tamanhoPy(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (!(c >= 0xdc00 && c <= 0xdfff && i > 0 && s.charCodeAt(i - 1) >= 0xd800 && s.charCodeAt(i - 1) <= 0xdbff)) n++;
  }
  return n;
}

// ─── Strings do BIFF (biffh.py) ─────────────────────────────────────────────

function lerTamanho(data: Uint8Array, pos: number, lenlen: number): number {
  return lenlen === 1 ? exato(fatia(data, pos, pos + 1), 1).getUint8(0) : u16(data, pos);
}

/** `unpack_unicode` */
function unpackUnicode(data: Uint8Array, pos: number, lenlen = 2): string {
  const nchars = lerTamanho(data, pos, lenlen);
  if (!nchars) return "";
  pos += lenlen;
  const opcoes = byteEm(data, pos);
  pos += 1;
  if (opcoes & 0x08) pos += 2;
  if (opcoes & 0x04) pos += 4;
  if (opcoes & 0x01) return utf16(fatia(data, pos, pos + 2 * nchars));
  return latin1(fatia(data, pos, pos + nchars));
}

/** `unpack_unicode_update_pos` */
function unpackUnicodePos(data: Uint8Array, pos: number, lenlen = 2, conhecido: number | null = null): [string, number] {
  let nchars: number;
  if (conhecido !== null) nchars = conhecido;
  else {
    nchars = lerTamanho(data, pos, lenlen);
    pos += lenlen;
  }
  if (!nchars && fatia(data, pos).length === 0) return ["", pos];
  const opcoes = byteEm(data, pos);
  pos += 1;
  let rt = 0;
  let sz = 0;
  if (opcoes & 0x08) {
    rt = u16(data, pos);
    pos += 2;
  }
  if (opcoes & 0x04) {
    sz = i32(data, pos);
    pos += 4;
  }
  let s: string;
  if (opcoes & 0x01) {
    s = utf16(fatia(data, pos, pos + 2 * nchars));
    pos += 2 * nchars;
  } else {
    s = latin1(fatia(data, pos, pos + nchars));
    pos += nchars;
  }
  if (opcoes & 0x08) pos += 4 * rt;
  if (opcoes & 0x04) pos += sz;
  return [s, pos];
}

/** `unpack_string` */
function unpackString(data: Uint8Array, pos: number, enc: string, lenlen = 1): string {
  const nchars = lerTamanho(data, pos, lenlen);
  pos += lenlen;
  return decodificar(fatia(data, pos, pos + nchars), enc);
}

/** `unpack_string_update_pos` */
function unpackStringPos(data: Uint8Array, pos: number, enc: string, lenlen = 1, conhecido: number | null = null): [string, number] {
  let nchars: number;
  if (conhecido !== null) nchars = conhecido;
  else {
    nchars = lerTamanho(data, pos, lenlen);
    pos += lenlen;
  }
  return [decodificar(fatia(data, pos, pos + nchars), enc), pos + nchars];
}

/** `unpack_cell_range_address_list_update_pos` com endereços de 8 bytes. */
function listaIntervalos(data: Uint8Array, pos: number): number {
  const n = u16(data, pos);
  pos += 2;
  for (let i = 0; i < n; i++) {
    exato(fatia(data, pos, pos + 8), 8);
    pos += 8;
  }
  return pos;
}

// ─── Arquivo composto OLE2 (compdoc.py) ─────────────────────────────────────

const ASSINATURA_OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const EOCSID = -2;
const FREESID = -1;
const MSATSID = -4;
const EVILSID = -5;

const comeca = (b: Uint8Array, prefixo: number[]) => prefixo.every((c, i) => b[i] === c);

type NoDiretorio = {
  did: number;
  nome: string;
  tipo: number;
  esq: number;
  dir: number;
  raiz: number;
  primeiro: number;
  tamanho: number;
  filhos: number[];
};

// Limites para os laços em que o xlrd não terminaria.
const PROFUNDIDADE_MAX_ARVORE = 990; // o Python estoura a pilha perto de 1000 chamadas
// Proteção do servidor (aqui o porte para antes do xlrd): uma célula em IV65536 faz o xlrd montar
// 16 milhões de células vazias, e BOUNDSHEETs repetidos apontando para a mesma folha grande fazem
// ler a folha de novo a cada um. Extrato real fica em milhares de células e registros.
const LIMITE_CELULAS = 2_000_000;
const LIMITE_REGISTROS = 20_000_000;
const VISITAS_MAX_ARVORE = 1_000_000;

class DocumentoComposto {
  private readonly setor: number;
  private readonly miniSetor: number;
  private readonly tamMinStream: number;
  private readonly visto: Uint8Array;
  private readonly sat: number[] = [];
  private readonly ssat: number[] = [];
  private readonly dirlist: NoDiretorio[] = [];
  private readonly sscs: Uint8Array;
  private readonly sscsEhTexto: boolean; // o xlrd guarda "" (str) quando não há mini-stream
  readonly tamDados: number;

  constructor(private readonly mem: Uint8Array) {
    if (!comeca(mem, ASSINATURA_OLE)) throw erro("CompDocError", "Not an OLE2 compound document");
    const marca = fatia(mem, 28, 30);
    if (!(marca.length === 2 && marca[0] === 0xfe && marca[1] === 0xff))
      throw erro("CompDocError", `Expected "little-endian" marker, found ${reprBytes(marca)}`);
    exato(fatia(mem, 24, 28), 4);
    const tams = exato(fatia(mem, 30, 34), 4);
    let ssz = tams.getUint16(0, true);
    let sssz = tams.getUint16(2, true);
    if (ssz > 20) ssz = 9;
    if (sssz > ssz) sssz = 6;
    const setor = (this.setor = 2 ** ssz);
    this.miniSetor = 2 ** sssz;
    const cab = exato(fatia(mem, 44, 76), 32);
    const dirPrimeiro = cab.getInt32(4, true);
    this.tamMinStream = cab.getInt32(12, true);
    const ssatPrimeiro = cab.getInt32(16, true);
    const ssatTotal = cab.getInt32(20, true);
    const msatxPrimeiro = cab.getInt32(24, true);
    const msatxTotal = cab.getInt32(28, true);

    const tamDados = (this.tamDados = mem.length - 512);
    let setoresDados = Math.floor(tamDados / setor);
    if (tamDados - setoresDados * setor) setoresDados += 1;
    const visto = (this.visto = new Uint8Array(Math.max(0, setoresDados)));
    const nent = Math.floor(setor / 4);
    const lerSetorInts = (offset: number): number[] => {
      const v = exato(fatia(mem, offset, offset + setor), nent * 4);
      const out: number[] = [];
      for (let k = 0; k < nent; k++) out.push(v.getInt32(4 * k, true));
      return out;
    };
    const cabMsat = exato(fatia(mem, 76, 512), 436);
    const msat: number[] = [];
    for (let k = 0; k < 109; k++) msat.push(cabMsat.getInt32(4 * k, true));
    const satNecessarios = divPy(setoresDados + nent - 1, nent);
    divPy(satNecessarios - 109 + nent - 2, nent - 1);

    if (!(msatxTotal === 0 && [EOCSID, FREESID, 0].includes(msatxPrimeiro))) {
      let sid = msatxPrimeiro;
      while (![EOCSID, FREESID, MSATSID].includes(sid)) {
        if (sid >= setoresDados)
          throw erro("CompDocError", `MSAT extension: accessing sector ${sid} but only ${setoresDados} in file`);
        if (sid < 0) throw erro("CompDocError", `MSAT extension: invalid sector id: ${sid}`);
        if (visto[sid]) throw erro("CompDocError", `MSAT corruption: seen[${sid}] == ${visto[sid]}`);
        visto[sid] = 1;
        msat.push(...lerSetorInts(512 + setor * sid));
        sid = msat.pop()!;
      }
    }

    for (let k = 0; k < msat.length; k++) {
      const msid = msat[k];
      if (msid === FREESID || msid === EOCSID) continue;
      if (msid >= setoresDados) {
        msat[k] = EVILSID;
        continue;
      }
      if (msid < -2) throw erro("CompDocError", `MSAT: invalid sector id: ${msid}`);
      if (visto[msid]) throw erro("CompDocError", `MSAT extension corruption: seen[${msid}] == ${visto[msid]}`);
      visto[msid] = 2;
      for (const x of lerSetorInts(512 + setor * msid)) this.sat.push(x);
    }

    const dbytes = this.lerStream(mem, 512, this.sat, setor, dirPrimeiro, null, "directory", 3);
    for (let pos = 0, did = 0; pos < dbytes.length; pos += 128, did++) {
      this.dirlist.push(lerNoDiretorio(did, fatia(dbytes, pos, pos + 128)));
    }
    this.montarArvore(0, itemLista(this.dirlist, 0).raiz);

    const raiz = this.dirlist[0];
    afirmar(raiz.tipo === 5);
    if (raiz.primeiro < 0 || raiz.tamanho === 0) {
      this.sscs = new Uint8Array(0);
      this.sscsEhTexto = true;
    } else {
      this.sscs = this.lerStream(mem, 512, this.sat, setor, raiz.primeiro, raiz.tamanho, "SSCS", 4);
      this.sscsEhTexto = false;
    }

    if (raiz.tamanho > 0) {
      let sid = ssatPrimeiro;
      let nsecs = ssatTotal;
      while (sid >= 0 && nsecs > 0) {
        if (sid >= visto.length) throw erro("IndexError", "array index out of range");
        if (visto[sid]) throw erro("CompDocError", `SSAT corruption: seen[${sid}] == ${visto[sid]}`);
        visto[sid] = 5;
        nsecs -= 1;
        for (const x of lerSetorInts(512 + sid * setor)) this.ssat.push(x);
        sid = itemLista(this.sat, sid);
      }
      afirmar(nsecs === 0 && sid === EOCSID);
    }
  }

  /** `_build_family_tree` (recursivo como no xlrd; a ordem dos filhos importa na busca). */
  private visitas = 0;
  private montarArvore(pai: number, filho: number, profundidade = 0): void {
    if (filho < 0) return;
    if (profundidade > PROFUNDIDADE_MAX_ARVORE) throw erro("RecursionError", "maximum recursion depth exceeded");
    if (++this.visitas > VISITAS_MAX_ARVORE) throw erro("LimiteXls", "Diretório OLE2 circular ou grande demais");
    const no = itemLista(this.dirlist, filho);
    this.montarArvore(pai, no.esq, profundidade + 1);
    this.dirlist[pai].filhos.push(filho);
    this.montarArvore(pai, no.dir, profundidade + 1);
    if (no.tipo === 1) this.montarArvore(filho, no.raiz, profundidade + 1);
  }

  /** `_get_stream`: junta os setores da cadeia (com `seen_id`, cada setor uma vez só). */
  private lerStream(
    mem: Uint8Array,
    base: number,
    sat: number[],
    setor: number,
    inicio: number,
    tamanho: number | null,
    nome: string,
    vistoId: number | null,
  ): Uint8Array {
    const partes: Uint8Array[] = [];
    let s = inicio;
    let falta = tamanho ?? 0;
    let voltas = 0;
    while (s >= 0) {
      if (vistoId !== null) {
        if (s >= this.visto.length) throw erro("IndexError", "array index out of range");
        if (this.visto[s]) throw erro("CompDocError", `${nome} corruption: seen[${s}] == ${this.visto[s]}`);
        this.visto[s] = vistoId;
      } else if (++voltas > sat.length + 1) {
        // Sem `seen`, o xlrd seguiria o ciclo para sempre.
        throw erro("LimiteXls", `Cadeia de setores circular no stream ${nome}`);
      }
      const ini = base + s * setor;
      if (tamanho === null) partes.push(fatia(mem, ini, ini + setor));
      else {
        const pega = setor > falta ? falta : setor;
        falta -= pega;
        partes.push(fatia(mem, ini, ini + pega));
      }
      if (s >= sat.length) {
        throw erro("CompDocError", `OLE2 stream ${reprStr(nome)}: sector allocation table invalid entry (${s})`);
      }
      s = sat[s];
    }
    afirmar(s === EOCSID);
    if (mem === this.sscs && this.sscsEhTexto && partes.length) {
      throw erro("TypeError", "sequence item 0: expected a bytes-like object, str found");
    }
    return juntar(partes);
  }

  /** `_dir_search` para um nome sem "/" (só os filhos da raiz). */
  private procurar(nome: string): NoDiretorio | null {
    for (const filho of this.dirlist[0].filhos) {
      const no = this.dirlist[filho];
      if (no.nome.toLowerCase() === nome.toLowerCase()) {
        if (no.tipo === 2) return no;
        if (no.tipo === 1) throw erro("CompDocError", "Requested component is a 'storage'");
        throw erro("CompDocError", "Requested stream is not a 'user stream'");
      }
    }
    return null;
  }

  /** `locate_named_stream`: o stream e onde ele começa (contíguo, é o próprio arquivo). */
  localizar(nome: string): { mem: Uint8Array; base: number } | null {
    const no = this.procurar(nome);
    if (!no) return null;
    if (no.tamanho > this.tamDados) {
      throw erro(
        "CompDocError",
        `${reprStr(nome)} stream length (${no.tamanho} bytes) > file data size (${this.tamDados} bytes)`,
      );
    }
    if (no.tamanho >= this.tamMinStream) return this.localizarContiguo(no, nome);
    const mem = this.lerStream(this.sscs, 0, this.ssat, this.miniSetor, no.primeiro, no.tamanho, `${nome} (from SSCS)`, null);
    return { mem, base: 0 };
  }

  /** `_locate_stream` */
  private localizarContiguo(no: NoDiretorio, nome: string): { mem: Uint8Array; base: number } {
    let s = no.primeiro;
    if (s < 0) throw erro("CompDocError", `_locate_stream: start_sid (${s}) is -ve`);
    const vistoId = no.did + 6;
    let anterior = -99;
    let ini = -9999;
    let fim = -8888;
    const trechos: [number, number][] = [];
    let achados = 0;
    const limite = divPy(no.tamanho + this.setor - 1, this.setor);
    while (s >= 0) {
      if (s >= this.visto.length) throw erro("IndexError", "array index out of range");
      if (this.visto[s]) throw erro("CompDocError", `${nome} corruption: seen[${s}] == ${this.visto[s]}`);
      if (vistoId > 255) throw erro("OverflowError", "unsigned byte integer is greater than maximum");
      this.visto[s] = vistoId;
      achados += 1;
      if (achados > limite) {
        throw erro("CompDocError", `${nome}: size exceeds expected ${limite * this.setor} bytes; corrupt?`);
      }
      if (s === anterior + 1) fim += this.setor;
      else {
        if (anterior >= 0) trechos.push([ini, fim]);
        ini = 512 + s * this.setor;
        fim = ini + this.setor;
      }
      anterior = s;
      s = itemLista(this.sat, s);
    }
    afirmar(s === EOCSID);
    afirmar(achados === limite);
    if (!trechos.length) return { mem: this.mem, base: ini };
    trechos.push([ini, fim]);
    return { mem: juntar(trechos.map(([a, b]) => fatia(this.mem, a, b))), base: 0 };
  }
}

function lerNoDiretorio(did: number, dent: Uint8Array): NoDiretorio {
  const a = exato(fatia(dent, 64, 80), 16);
  const cbufsize = a.getUint16(0, true);
  const b = exato(fatia(dent, 116, 124), 8);
  const nome = cbufsize === 0 ? "" : utf16(fatia(dent, 0, cbufsize - 2));
  return {
    did,
    nome,
    tipo: a.getUint8(2),
    esq: a.getInt32(4, true),
    dir: a.getInt32(8, true),
    raiz: a.getInt32(12, true),
    primeiro: b.getInt32(0, true),
    tamanho: b.getInt32(4, true),
    filhos: [],
  };
}

function juntar(partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

// ─── Zip (só para dizer "xlsx não suportado" como o xlrd) ───────────────────

const erroZip = (msg: string) => erro("BadZipFile", msg);

let tabelaCrc: Uint32Array | null = null;
function crc32(b: Uint8Array): number {
  if (!tabelaCrc) {
    tabelaCrc = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tabelaCrc[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const x of b) c = tabelaCrc[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function utf8Estrito(b: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(b);
  } catch {
    throw erro("UnicodeDecodeError", "'utf-8' codec can't decode bytes");
  }
}

// cp437 (o padrão do zipfile para nome sem a marca de UTF-8): 0x80-0xFF.
const CP437_ALTO =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ";
const cp437 = (b: Uint8Array) => Array.from(b, (c) => (c < 0x80 ? String.fromCharCode(c) : CP437_ALTO[c - 0x80])).join("");

function limparNomeZip(nome: string): string {
  const nulo = nome.indexOf("\0");
  return nulo >= 0 ? nome.slice(0, nulo) : nome;
}

/** Os nomes do zip como o `zipfile.ZipFile(...).namelist()` do Python 3.14. */
function nomesZip(b: Uint8Array): string[] {
  const n = b.length;
  const dv = (ini: number, tam: number) => exato(fatia(b, ini, ini + tam), tam);
  const fimCentral = [0x50, 0x4b, 0x05, 0x06];
  let ecd: number;
  if (n < 22) throw erroZip("File is not a zip file");
  if (comeca(b.subarray(n - 22), fimCentral) && b[n - 2] === 0 && b[n - 1] === 0) ecd = n - 22;
  else {
    const minimo = Math.max(n - 65535 - 22, 0);
    ecd = -1;
    for (let i = n - 4; i >= minimo; i--) {
      if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) {
        ecd = i;
        break;
      }
    }
    if (ecd < 0 || n - ecd < 22) throw erroZip("File is not a zip file");
  }
  const fim = dv(ecd, 22);
  let tamCentral = fim.getUint32(12, true);
  let inicioCentral = fim.getUint32(16, true);
  let local = ecd;
  // ZIP64
  if (ecd - 20 >= 0) {
    const loc = dv(ecd - 20, 20);
    if (loc.getUint32(0, true) === 0x07064b50) {
      const disco = loc.getUint32(4, true);
      const reloff = Number(loc.getBigUint64(8, true));
      const discos = loc.getUint32(16, true);
      if (disco !== 0 || discos > 1) throw erroZip("zipfiles that span multiple disks are not supported");
      const offset = ecd - 20 - 56;
      if (reloff > offset) throw erroZip("Corrupt zip64 end of central directory locator");
      let extra = offset - reloff;
      let reg = dv(reloff, 56);
      if (reg.getUint32(0, true) !== 0x06064b50 && reloff !== offset) {
        if (offset < 0 || offset + 56 > n) throw erroZip("File is not a zip file");
        extra = 0;
        reg = dv(offset, 56);
      }
      if (reg.getUint32(0, true) !== 0x06064b50) throw erroZip("Zip64 end of central directory record not found");
      const sz = Number(reg.getBigUint64(4, true));
      const dirsize = Number(reg.getBigUint64(40, true));
      const diroffset = Number(reg.getBigUint64(48, true));
      if (diroffset + dirsize !== reloff || sz + 12 !== 56 + extra)
        throw erroZip("Corrupt zip64 end of central directory record");
      tamCentral = dirsize;
      inicioCentral = diroffset;
      local = offset - extra;
    }
  }
  const concat = local - tamCentral - inicioCentral;
  const inicio = inicioCentral + concat;
  if (inicio < 0) throw erroZip("Bad offset for central directory");
  const dados = fatia(b, inicio, inicio + tamCentral);
  const nomes: string[] = [];
  let p = 0;
  let total = 0;
  while (total < tamCentral) {
    const cab = fatia(dados, p, p + 46);
    p += 46;
    if (cab.length !== 46) throw erroZip("Truncated central directory");
    const c = exato(cab, 46);
    if (c.getUint32(0, true) !== 0x02014b50) throw erroZip("Bad magic number for central directory");
    const tamNome = c.getUint16(28, true);
    const tamExtra = c.getUint16(30, true);
    const tamComent = c.getUint16(32, true);
    const brutoNome = fatia(dados, p, p + tamNome);
    p += tamNome;
    let nome = c.getUint16(8, true) & 0x800 ? utf8Estrito(brutoNome) : cp437(brutoNome);
    nome = limparNomeZip(nome).replaceAll("\\", "/");
    let extra = fatia(dados, p, p + tamExtra);
    p += tamExtra + tamComent;
    const versao = c.getUint8(6);
    if (versao > 63) throw erro("NotImplementedError", `zip file version ${(versao / 10).toFixed(1)}`);
    while (extra.length >= 4) {
      const tp = extra[0] | (extra[1] << 8);
      const ln = extra[2] | (extra[3] << 8);
      if (ln + 4 > extra.length) throw erroZip(`Corrupt extra field ${tp.toString(16).padStart(4, "0")} (size=${ln})`);
      const d = extra.subarray(4, ln + 4);
      if (tp === 0x0001) {
        let resto = d;
        const campos: [string, boolean][] = [
          ["File size", [0xffffffff].includes(c.getUint32(24, true))],
          ["Compress size", c.getUint32(20, true) === 0xffffffff],
          ["Header offset", c.getUint32(42, true) === 0xffffffff],
        ];
        for (const [campo, usa] of campos) {
          if (!usa) continue;
          if (resto.length < 8) throw erroZip(`Corrupt zip64 extra field. ${campo} not found.`);
          resto = resto.subarray(8);
        }
      } else if (tp === 0x7075) {
        if (d.length < 5) throw erroZip("Corrupt unicode path extra field (0x7075)");
        const dd = new DataView(d.buffer, d.byteOffset, 5);
        if (dd.getUint8(0) === 1 && dd.getUint32(1, true) === crc32(brutoNome)) {
          let unicodeNome: string;
          try {
            unicodeNome = new TextDecoder("utf-8", { fatal: true }).decode(d.subarray(5));
          } catch {
            throw erroZip("Corrupt unicode path extra field (0x7075): invalid utf-8 bytes");
          }
          if (unicodeNome) nome = limparNomeZip(unicodeNome).replaceAll("\\", "/");
        }
      }
      extra = extra.subarray(ln + 4);
    }
    nomes.push(nome);
    total += 46 + tamNome + tamExtra + tamComent;
  }
  return nomes;
}

// ─── Formatos: o que é data (formatting.py) ─────────────────────────────────

// Faixas dos formatos embutidos; só importa se é data (FDT) ou não.
const FAIXAS_FORMATO: [number, number, boolean][] = [
  [0, 0, false],
  [1, 13, false],
  [14, 22, true],
  [27, 36, true],
  [37, 44, false],
  [45, 47, true],
  [48, 48, false],
  [49, 49, false],
  [50, 58, true],
  [59, 62, false],
  [67, 70, false],
  [71, 81, true],
];

const NAO_DATA = new Set(["0.00E+00", "##0.0E+0", "General", "GENERAL", "general", "@"]);

/** `is_date_format_string` do xlrd: o heurístico que decide se o formato personalizado é data. */
export function ehFormatoData(formato: string): boolean {
  let estado = 0;
  let s = "";
  for (const c of formato) {
    if (estado === 0) {
      if (c === '"') estado = 1;
      else if (c === "\\" || c === "_" || c === "*") estado = 2;
      else if (!"$-+/(): ".includes(c)) s += c;
    } else if (estado === 1) {
      if (c === '"') estado = 0;
    } else estado = 0;
  }
  // `re.sub(r'\[[^]]*\]', '', s)`: tira [cor], [h], [$-416] etc.
  s = s.replace(/\[[^\]]*\]/g, "");
  if (NAO_DATA.has(s)) return false;
  let datas = 0;
  let numeros = 0;
  for (const c of s) {
    if ("ymdhsYMDHS".includes(c)) datas += 5;
    else if (c === "0" || c === "#" || c === "?") numeros += 5;
  }
  if (datas && !numeros) return true;
  if (numeros && !datas) return false;
  return datas > numeros;
}

// ─── Livro (book.py) ────────────────────────────────────────────────────────

const XL_CELL_EMPTY = 0;
const XL_CELL_TEXT = 1;
const XL_CELL_NUMBER = 2;
const XL_CELL_DATE = 3;
const XL_CELL_BOOLEAN = 4;
const XL_CELL_ERROR = 5;
const NOMES_TIPO: TipoCelulaXls[] = ["vazio", "texto", "numero", "data", "booleano", "erro", "branco"];

const MY_EOF = 0xf00baaa;
const BOFCODES = [0x0809, 0x0409, 0x0209, 0x0009];
const BOFLEN: Record<number, number> = { 0x0809: 8, 0x0409: 6, 0x0209: 6, 0x0009: 4 };
const XL_WORKBOOK_GLOBALS = 0x5;
const XL_WORKBOOK_GLOBALS_4W = 0x100;
const XL_WORKSHEET = 0x10;

const R = {
  ARRAY: 0x0221,
  BOOLERR: 0x205,
  BOUNDSHEET: 0x85,
  CODEPAGE: 0x42,
  CONTINUE: 0x3c,
  COUNTRY: 0x8c,
  DATEMODE: 0x22,
  DEFAULTROWHEIGHT: 0x225,
  DEFCOLWIDTH: 0x55,
  DIMENSION: 0x200,
  DIMENSION2: 0x0,
  EOF: 0x0a,
  EXTERNNAME: 0x23,
  EXTERNSHEET: 0x17,
  FILEPASS: 0x2f,
  FORMAT: 0x41e,
  HLINK: 0x1b8,
  LABEL: 0x204,
  LABELRANGES: 0x15f,
  LABELSST: 0xfd,
  MULRK: 0xbd,
  NAME: 0x18,
  NOTE: 0x1c,
  NUMBER: 0x203,
  OBJ: 0x5d,
  PANE: 0x41,
  QUICKTIP: 0x800,
  RK: 0x27e,
  RSTRING: 0xd6,
  SCL: 0xa0,
  SHEETHDR: 0x8f,
  SHEETSOFFSET: 0x8e,
  SHRFMLA: 0x4bc,
  SST: 0xfc,
  STANDARDWIDTH: 0x99,
  STRING: 0x207,
  STRING_B2: 0x7,
  SUPBOOK: 0x1ae,
  TXO: 0x1b6,
  WINDOW2: 0x23e,
  WRITEACCESS: 0x5c,
  XF: 0xe0,
} as const;
const FORMULAS = [0x0006, 0x0406, 0x0206];
const SHRFMLA_ETC = [0x04bc, 0x0221, 0x0236, 0x37, 0x21, 0x36];

const SUPBOOK_INTERNAL = 1;
const SUPBOOK_EXTERNAL = 2;
const SUPBOOK_ADDIN = 3;
const SUPBOOK_DDEOLE = 4;

type Registro = [codigo: number, tamanho: number, dados: Uint8Array];

class Livro {
  pos = 0;
  bv = 0;
  datemode: 0 | 1 = 0;
  private codepage: number | null = null;
  private encoding: string | null = null;
  private countries: [number, number] = [0, 0];
  sst: string[] = [];
  private formatos = new Map<number, boolean>(); // chave do formato → é data
  private xfFormatos: number[] = []; // a chave de formato de cada XF, na ordem
  private xfcount = 0;
  /** `_xf_index_to_xl_type_map` */
  readonly mapaTipoXf = new Map<number, number>([[0, XL_CELL_NUMBER]]);
  readonly nomesFolhas: string[] = [];
  readonly posFolhas: number[] = [];
  private supbookTipos: (number | null)[] = [];
  private extnshtNomes = new Map<number, string>();
  private extnshtCount = 0;
  private nomesExtnsht: number[] = [];
  private userNameBruto: Uint8Array | null = null;
  private registrosLidos = 0;
  private celulas = 0;

  /** Conta as células que o xlrd alocaria (somando todas as folhas). */
  gastarCelulas(n: number): void {
    this.celulas += n;
    if (this.celulas > LIMITE_CELULAS) {
      throw erro("LimiteXls", `Planilha grande demais: mais de ${LIMITE_CELULAS} células`);
    }
  }

  constructor(
    readonly mem: Uint8Array,
    readonly base: number,
  ) {
    this.pos = base;
  }

  get2bytes(): number {
    const b = fatia(this.mem, this.pos, this.pos + 2);
    this.pos += b.length;
    return b.length < 2 ? MY_EOF : b[0] | (b[1] << 8);
  }

  lerRegistro(): Registro {
    if (++this.registrosLidos > LIMITE_REGISTROS) {
      throw erro("LimiteXls", `Planilha grande demais: mais de ${LIMITE_REGISTROS} registros lidos`);
    }
    const cab = exato(fatia(this.mem, this.pos, this.pos + 4), 4);
    const codigo = cab.getUint16(0, true);
    const tamanho = cab.getUint16(2, true);
    const ini = this.pos + 4;
    this.pos = ini + tamanho;
    return [codigo, tamanho, fatia(this.mem, ini, ini + tamanho)];
  }

  private lerRegistroSe(esperado: number): Registro | null {
    const cab = exato(fatia(this.mem, this.pos, this.pos + 4), 4);
    if (cab.getUint16(0, true) !== esperado) return null;
    return this.lerRegistro();
  }

  /** `getbof` */
  getbof(pedido: number): number {
    const falhaBof = (msg: string) => erro("XLRDError", "Unsupported format, or corrupt file: " + msg);
    const salvo = this.pos;
    const opcode = this.get2bytes();
    if (opcode === MY_EOF) throw falhaBof("Expected BOF record; met end of file");
    if (!BOFCODES.includes(opcode)) {
      throw falhaBof(`Expected BOF record; found ${reprBytes(fatia(this.mem, salvo, salvo + 8))}`);
    }
    const tamanho = this.get2bytes();
    if (tamanho === MY_EOF) throw falhaBof("Incomplete BOF record[1]; met end of file");
    if (!(tamanho >= 4 && tamanho <= 20)) {
      throw falhaBof(`Invalid length (${tamanho}) for BOF record type 0x${opcode.toString(16).padStart(4, "0")}`);
    }
    const lido = fatia(this.mem, this.pos, this.pos + tamanho);
    this.pos += lido.length;
    if (lido.length < tamanho) throw falhaBof("Incomplete BOF record[2]; met end of file");
    const data = new Uint8Array(Math.max(lido.length, BOFLEN[opcode]));
    data.set(lido);
    const v = new DataView(data.buffer);
    const versao1 = opcode >> 8;
    const versao2 = v.getUint16(0, true);
    const streamtype = v.getUint16(2, true);
    let versao = 0;
    let build = 0;
    let ano = 0;
    if (versao1 === 0x08) {
      build = v.getUint16(4, true);
      ano = v.getUint16(6, true);
      if (versao2 === 0x0600) versao = 80;
      else if (versao2 === 0x0500) versao = ano < 1994 || [2412, 3218, 3321].includes(build) ? 50 : 70;
      else versao = ({ 0x0000: 21, 0x0007: 21, 0x0200: 21, 0x0300: 30, 0x0400: 40 } as Record<number, number>)[versao2] ?? 0;
    } else if (versao1 === 0x04 || versao1 === 0x02 || versao1 === 0x00) {
      versao = ({ 0x04: 40, 0x02: 30, 0x00: 21 } as Record<number, number>)[versao1];
    }
    if (versao === 40 && streamtype === XL_WORKBOOK_GLOBALS_4W) versao = 45;
    const globais = streamtype === XL_WORKBOOK_GLOBALS || (versao === 45 && streamtype === XL_WORKBOOK_GLOBALS_4W);
    if ((pedido === XL_WORKBOOK_GLOBALS && globais) || streamtype === pedido) return versao;
    if (versao < 50 && streamtype === XL_WORKSHEET) return versao;
    if (versao >= 50 && streamtype === 0x0100) throw falhaBof("Workspace file -- no spreadsheet data");
    const h4 = (x: number) => x.toString(16).padStart(4, "0");
    throw falhaBof(
      `BOF not workbook/worksheet: op=0x${h4(opcode)} vers=0x${h4(versao2)} strm=0x${h4(streamtype)} build=${build} year=${ano} -> BIFF${versao}`,
    );
  }

  /** `derive_encoding` */
  codificacao(): string | null {
    if (this.codepage === null) {
      if (this.bv < 80) this.encoding = "iso-8859-1";
      else this.codepage = 1200;
    } else {
      const cp = this.codepage;
      let enc: string;
      if (cp in CODIFICACAO_DE_CODEPAGE) enc = CODIFICACAO_DE_CODEPAGE[cp];
      else if (cp >= 300 && cp <= 1999) enc = "cp" + cp;
      else if (this.bv >= 80) {
        this.codepage = 1200;
        enc = "utf_16_le";
      } else enc = "unknown_codepage_" + cp;
      this.encoding = enc;
    }
    if (this.codepage !== 1200 && !codificacaoExiste(this.encoding!)) {
      throw erro("LookupError", `unknown encoding: ${this.encoding}`);
    }
    if (this.userNameBruto) {
      const bruto = this.userNameBruto;
      this.userNameBruto = null;
      unpackString(bruto, 0, this.encoding!, 1);
    }
    return this.encoding;
  }

  /** `bk.encoding or bk.derive_encoding()` */
  codificacaoAtual(): string {
    return (this.encoding || this.codificacao())!;
  }

  /** `parse_globals` */
  lerGlobais(): void {
    for (;;) {
      const [rc, , data] = this.lerRegistro();
      switch (rc) {
        case R.SST:
          this.lerSst(data);
          break;
        case R.FORMAT:
          this.lerFormato(data);
          break;
        case R.XF:
          this.lerXf(data);
          break;
        case R.BOUNDSHEET:
          this.lerBoundsheet(data);
          break;
        case R.DATEMODE: {
          const dm = u16(fatia(data, 0, 2), 0);
          afirmar(dm === 0 || dm === 1);
          this.datemode = dm;
          break;
        }
        case R.CODEPAGE:
          this.codepage = u16(fatia(data, 0, 2), 0);
          this.codificacao();
          break;
        case R.COUNTRY:
          this.lerCountry(data);
          break;
        case R.EXTERNNAME:
          this.lerExternname(data);
          break;
        case R.EXTERNSHEET:
          this.lerExternsheet(data);
          break;
        case R.FILEPASS:
          throw erro("XLRDError", "Workbook is encrypted");
        case R.WRITEACCESS:
          this.lerWriteaccess(data);
          break;
        case R.SHEETSOFFSET:
          exato(data, 4);
          break;
        case R.SHEETHDR: {
          // `handle_sheethdr` (BIFF4W): confere o começo como o xlrd e para (não portado).
          this.codificacao();
          i32(fatia(data, 0, 4), 0);
          if (this.encoding === null) throw erro("TypeError", "decode() argument 'encoding' must be str, not None");
          const nome = unpackString(data, 4, this.encoding, 1);
          afirmar(nome === itemLista(this.nomesFolhas, 0));
          throw erro("NaoSuportado", "SHEETHDR (BIFF4W) não é suportado no porte do xlrd");
        }
        case R.SUPBOOK:
          this.lerSupbook(data);
          break;
        case R.NAME:
          this.lerName(data);
          break;
        case R.EOF:
          this.xfEpilogo();
          this.nomesEpilogo();
          if (!this.encoding) this.codificacao();
          return;
        // FONT, PALETTE e STYLE só contam com `formatting_info`; o resto o xlrd ignora.
      }
    }
  }

  private lerSst(data: Uint8Array): void {
    const blocos = [data];
    const unicas = i32(fatia(data, 4, 8), 0);
    for (;;) {
      const reg = this.lerRegistroSe(R.CONTINUE);
      if (!reg) break;
      blocos.push(reg[2]);
    }
    this.sst = desempacotarSst(blocos, unicas);
  }

  /** `handle_format` (BIFF5+) */
  private lerFormato(data: Uint8Array): void {
    if (!this.encoding) this.codificacao();
    const chave = u16(fatia(data, 0, 2), 0);
    const texto = this.bv >= 80 ? unpackUnicode(data, 2) : unpackString(data, 2, this.encoding!, 1);
    this.formatos.set(chave, ehFormatoData(texto));
  }

  /** `handle_xf`: só a chave do formato importa sem `formatting_info`. */
  private lerXf(data: Uint8Array): void {
    if (!this.xfcount) {
      // fill_in_standard_formats
      for (const [lo, hi, data_] of FAIXAS_FORMATO) {
        for (let x = lo; x <= hi; x++) if (!this.formatos.has(x)) this.formatos.set(x, data_);
      }
    }
    let chave: number;
    if (this.bv >= 80) chave = exato(fatia(data, 0, 20), 20).getUint16(2, true);
    else chave = exato(fatia(data, 0, 16), 16).getUint16(2, true);
    const indice = this.xfFormatos.length;
    this.xfcount += 1;
    const ehData = this.formatos.get(chave);
    this.mapaTipoXf.set(indice, ehData ? XL_CELL_DATE : XL_CELL_NUMBER);
    this.xfFormatos.push(this.formatos.has(chave) ? chave : 0);
  }

  /** `xf_epilogue`: refaz o tipo de cada XF com os formatos finais. */
  private xfEpilogo(): void {
    this.xfFormatos.forEach((chave, indice) => {
      const ehData = this.formatos.get(chave);
      this.mapaTipoXf.set(indice, ehData === undefined ? XL_CELL_TEXT : ehData ? XL_CELL_DATE : XL_CELL_NUMBER);
    });
  }

  private lerBoundsheet(data: Uint8Array): void {
    this.codificacao();
    const v = exato(fatia(data, 0, 6), 6);
    const offset = v.getInt32(0, true);
    const tipo = v.getUint8(5);
    const nome = this.bv < 80 ? unpackString(data, 6, this.encoding!, 1) : unpackUnicode(data, 6, 1);
    if (tipo !== 0) return; // macro, gráfico, VB: o xlrd ignora
    this.nomesFolhas.push(nome);
    this.posFolhas.push(offset + this.base);
  }

  lerCountry(data: Uint8Array): void {
    const v = exato(fatia(data, 0, 4), 4);
    const c: [number, number] = [v.getUint16(0, true), v.getUint16(2, true)];
    afirmar(
      (this.countries[0] === 0 && this.countries[1] === 0) || (this.countries[0] === c[0] && this.countries[1] === c[1]),
    );
    this.countries = c;
  }

  private lerExternname(data: Uint8Array): void {
    if (this.bv < 80) return;
    exato(fatia(data, 0, 6), 6);
    unpackUnicodePos(data, 6, 1);
    itemLista(this.supbookTipos, -1);
  }

  private lerExternsheet(data: Uint8Array): void {
    this.codificacao();
    this.extnshtCount += 1;
    if (this.bv >= 80) {
      const nrefs = u16(fatia(data, 0, 2), 0);
      const necessarios = nrefs * 6 + 2;
      while (data.length < necessarios) {
        const [rc2, , data2] = this.lerRegistro();
        if (rc2 !== R.CONTINUE) throw erro("XLRDError", "Missing CONTINUE after EXTERNSHEET record");
        data = juntar([data, data2]);
      }
      for (let k = 0, pos = 2; k < nrefs; k++, pos += 6) exato(fatia(data, pos, pos + 6), 6);
    } else {
      const v = exato(fatia(data, 0, 2), 2);
      const nc = v.getUint8(0);
      const ty = v.getUint8(1);
      if (ty === 3) this.extnshtNomes.set(this.extnshtCount, decodificar(fatia(data, 2, nc + 2), this.encoding!));
    }
  }

  private lerWriteaccess(data: Uint8Array): void {
    if (this.bv < 80) {
      if (!this.encoding) {
        this.userNameBruto = data;
        return;
      }
      unpackString(data, 0, this.encoding, 1);
      return;
    }
    try {
      unpackUnicode(data, 0, 2);
    } catch (e) {
      if (!(e instanceof ErroXls && e.name === "UnicodeDecodeError")) throw e;
      unpackUnicode(stripPy(data), 0, 2);
    }
  }

  private lerSupbook(data: Uint8Array): void {
    this.supbookTipos.push(null);
    const nfolhas = u16(fatia(data, 0, 2), 0);
    const d24 = fatia(data, 2, 4);
    if (d24.length === 2 && d24[0] === 0x01 && d24[1] === 0x04) {
      this.supbookTipos[this.supbookTipos.length - 1] = SUPBOOK_INTERNAL;
      return;
    }
    const d04 = fatia(data, 0, 4);
    if (d04.length === 4 && comeca(d04, [0x01, 0x00, 0x01, 0x3a])) {
      this.supbookTipos[this.supbookTipos.length - 1] = SUPBOOK_ADDIN;
      return;
    }
    let [, pos] = unpackUnicodePos(data, 2, 2);
    if (nfolhas === 0) {
      this.supbookTipos[this.supbookTipos.length - 1] = SUPBOOK_DDEOLE;
      return;
    }
    this.supbookTipos[this.supbookTipos.length - 1] = SUPBOOK_EXTERNAL;
    for (let x = 0; x < nfolhas; x++) {
      try {
        [, pos] = unpackUnicodePos(data, pos, 2);
      } catch (e) {
        if (e instanceof ErroXls && e.name === "struct.error") break;
        throw e;
      }
    }
  }

  /** `handle_name` sem avaliar a fórmula (ver limitações). */
  private lerName(data: Uint8Array): void {
    if (this.bv < 50) return;
    this.codificacao();
    const v = exato(fatia(data, 0, 14), 14);
    const tamNome = v.getUint8(3);
    const extsht = v.getUint16(6, true);
    if (this.bv < 80) unpackStringPos(data, 14, this.encoding!, 1, tamNome);
    else unpackUnicodePos(data, 14, 2, tamNome);
    this.nomesExtnsht.push(extsht);
  }

  /** `names_epilogue`: no BIFF5 o escopo de cada nome consulta o EXTERNSHEET. */
  private nomesEpilogo(): void {
    if (this.bv >= 50 && this.bv <= 70) {
      for (const idx of this.nomesExtnsht) {
        if (idx !== 0 && !this.extnshtNomes.has(idx)) throw erro("KeyError", String(idx));
      }
    }
  }
}

/** `bytes.strip()` do Python (espaços ASCII). */
function stripPy(b: Uint8Array): Uint8Array {
  const branco = (c: number) => c === 0x20 || (c >= 0x09 && c <= 0x0d);
  let i = 0;
  let j = b.length;
  while (i < j && branco(b[i])) i++;
  while (j > i && branco(b[j - 1])) j--;
  return b.subarray(i, j);
}

/** `unpack_SST_table` */
function desempacotarSst(blocos: Uint8Array[], n: number): string[] {
  let inx = 0;
  let data = blocos[0];
  let datalen = data.length;
  let pos = 8;
  const strings: string[] = [];
  // Cada string ocupa ao menos 3 bytes; passar disso é o SST andando para trás (o xlrd não pararia).
  const limite = blocos.reduce((s, b) => s + b.length, 0) + 1;
  for (let i = 0; i < n; i++) {
    if (strings.length > limite) throw erro("LimiteXls", "SST circular ou grande demais");
    const nchars = u16(data, pos);
    pos += 2;
    let opcoes = byteEm(data, pos);
    pos += 1;
    let rtcount = 0;
    let phosz = 0;
    if (opcoes & 0x08) {
      rtcount = u16(data, pos);
      pos += 2;
    }
    if (opcoes & 0x04) {
      phosz = i32(data, pos);
      pos += 4;
    }
    let acc = "";
    let obtidos = 0;
    for (;;) {
      const faltam = nchars - obtidos;
      let disponiveis: number;
      if (opcoes & 0x01) {
        disponiveis = Math.min(Math.floor((datalen - pos) / 2), faltam);
        acc += utf16(fatia(data, pos, pos + 2 * disponiveis));
        pos += 2 * disponiveis;
      } else {
        disponiveis = Math.min(datalen - pos, faltam);
        acc += latin1(fatia(data, pos, pos + disponiveis));
        pos += disponiveis;
      }
      obtidos += disponiveis;
      if (obtidos === nchars) break;
      inx += 1;
      data = itemLista(blocos, inx);
      datalen = data.length;
      opcoes = byteEm(data, 0);
      pos = 1;
    }
    for (let r = 0; r < rtcount; r++) {
      if (pos === datalen) {
        pos = 0;
        inx += 1;
        data = itemLista(blocos, inx);
        datalen = data.length;
      }
      exato(fatia(data, pos, pos + 4), 4);
      pos += 4;
    }
    pos += phosz;
    if (pos >= datalen) {
      pos -= datalen;
      inx += 1;
      if (inx < blocos.length) {
        data = blocos[inx];
        datalen = data.length;
      } else afirmar(i === n - 1);
    }
    strings.push(acc);
  }
  return strings;
}

/** `unpack_RK` */
function desempacotarRk(rk: Uint8Array): number {
  const flags = byteEm(rk, 0);
  if (flags & 2) {
    const i = exato(rk, 4).getInt32(0, true) >> 2;
    return flags & 1 ? i / 100.0 : i;
  }
  const b = new Uint8Array(8);
  b[4] = flags & 252;
  const resto = fatia(rk, 1, 4);
  if (resto.length !== 3) throw erroStruct(8);
  b.set(resto, 5);
  const d = new DataView(b.buffer).getFloat64(0, true);
  return flags & 1 ? d / 100.0 : d;
}

// ─── Folha (sheet.py) ───────────────────────────────────────────────────────

const GUID_HLINK = [0xd0, 0xc9, 0xea, 0x79, 0xf9, 0xba, 0xce, 0x11, 0x8c, 0x82, 0x00, 0xaa, 0x00, 0x4b, 0xa9, 0x0b];
const CLSID_URL = [0xe0, 0xc9, 0xea, 0x79, 0xf9, 0xba, 0xce, 0x11, 0x8c, 0x82, 0x00, 0xaa, 0x00, 0x4b, 0xa9, 0x0b];
const CLSID_ARQUIVO = [0x03, 0x03, 0, 0, 0, 0, 0, 0, 0xc0, 0, 0, 0, 0, 0, 0, 0x46];
const iguais = (b: Uint8Array, ref: number[]) => b.length === ref.length && comeca(b, ref);

class Folha {
  private tipos: number[][] = [];
  private valores: (string | number)[][] = [];
  private nrows = 0;
  private ncols = 0;
  private primeiraCheia = -1; // `_first_full_rowx`
  private readonly maxLinhas: number;
  private hyperlinks: [number, number, number, number][] = [];

  constructor(private readonly livro: Livro) {
    this.maxLinhas = livro.bv >= 80 ? 65536 : 16384;
  }

  /** `put_cell_unragged` */
  private por(rowx: number, colx: number, tipo: number | null, valor: string | number, xf: number): void {
    if (tipo === null) {
      const t = this.livro.mapaTipoXf.get(xf);
      if (t === undefined) throw erro("KeyError", String(xf));
      tipo = t;
    }
    const linha = this.tipos[rowx];
    if (linha && colx < linha.length) {
      linha[colx] = tipo;
      this.valores[rowx][colx] = valor;
      return;
    }
    const nr = rowx + 1;
    const nc = colx + 1;
    afirmar(1 <= nc && nc <= 256);
    afirmar(1 <= nr && nr <= this.maxLinhas);
    if (nc > this.ncols) {
      this.ncols = nc;
      if (nr < this.nrows) this.primeiraCheia = -2;
      else if (rowx > this.primeiraCheia && this.primeiraCheia > -2) this.primeiraCheia = rowx;
    }
    if (nr <= this.nrows) {
      const trow = this.tipos[rowx];
      const extra = this.ncols - trow.length;
      if (extra > 0) this.livro.gastarCelulas(extra);
      for (let k = 0; k < extra; k++) {
        trow.push(XL_CELL_EMPTY);
        this.valores[rowx].push("");
      }
    } else {
      this.livro.gastarCelulas((nr - this.nrows) * this.ncols);
      for (let k = this.nrows; k < nr; k++) {
        this.tipos.push(new Array<number>(this.ncols).fill(XL_CELL_EMPTY));
        this.valores.push(new Array<string>(this.ncols).fill(""));
      }
      this.nrows = nr;
    }
    const alvo = this.tipos[rowx];
    // A linha de tipos do xlrd é um `array('B')`.
    if (colx >= alvo.length) throw erro("IndexError", "array assignment index out of range");
    alvo[colx] = tipo;
    this.valores[rowx][colx] = valor;
  }

  /** `Sheet.read` */
  ler(): CelulaXls[][] {
    const livro = this.livro;
    const bv = livro.bv;
    // `saved_obj_id` do xlrd: nasce no primeiro OBJ; um TXO antes dele é UnboundLocalError.
    let objIdDefinido = false;
    let objId: number | null = null;
    for (;;) {
      const [rc, tamanho, data] = livro.lerRegistro();
      if (rc === R.NUMBER) {
        const v = exato(fatia(data, 0, 14), 14);
        this.por(v.getUint16(0, true), v.getUint16(2, true), null, v.getFloat64(6, true), v.getUint16(4, true));
      } else if (rc === R.LABELSST) {
        const v = exato(data, 10);
        const s = itemLista(livro.sst, v.getInt32(6, true));
        this.por(v.getUint16(0, true), v.getUint16(2, true), XL_CELL_TEXT, s, v.getUint16(4, true));
      } else if (rc === R.LABEL) {
        const v = exato(fatia(data, 0, 6), 6);
        const s = bv < 80 ? unpackString(data, 6, livro.codificacaoAtual(), 2) : unpackUnicode(data, 6, 2);
        this.por(v.getUint16(0, true), v.getUint16(2, true), XL_CELL_TEXT, s, v.getUint16(4, true));
      } else if (rc === R.RSTRING) {
        const v = exato(fatia(data, 0, 6), 6);
        let s: string;
        let pos: number;
        if (bv < 80) {
          [s, pos] = unpackStringPos(data, 6, livro.codificacaoAtual(), 2);
          const nrt = byteEm(data, pos);
          pos += 1;
          for (let k = 0; k < nrt; k++, pos += 2) exato(fatia(data, pos, pos + 2), 2);
        } else {
          [s, pos] = unpackUnicodePos(data, 6, 2);
          const nrt = u16(data, pos);
          pos += 2;
          for (let k = 0; k < nrt; k++, pos += 4) exato(fatia(data, pos, pos + 4), 4);
        }
        afirmar(pos === data.length);
        this.por(v.getUint16(0, true), v.getUint16(2, true), XL_CELL_TEXT, s, v.getUint16(4, true));
      } else if (rc === R.RK) {
        const v = exato(fatia(data, 0, 6), 6);
        const d = desempacotarRk(fatia(data, 6, 10));
        this.por(v.getUint16(0, true), v.getUint16(2, true), null, d, v.getUint16(4, true));
      } else if (rc === R.MULRK) {
        const v = exato(fatia(data, 0, 4), 4);
        const linha = v.getUint16(0, true);
        const primeira = v.getUint16(2, true);
        const ultima = u16(fatia(data, -2), 0);
        let pos = 4;
        for (let colx = primeira; colx <= ultima; colx++, pos += 6) {
          const xf = u16(fatia(data, pos, pos + 2), 0);
          const d = desempacotarRk(fatia(data, pos + 2, pos + 6));
          this.por(linha, colx, null, d, xf);
        }
      } else if (FORMULAS.includes(rc)) {
        this.lerFormula(data);
      } else if (rc === R.BOOLERR) {
        const v = exato(fatia(data, 0, 8), 8);
        const eErro = v.getUint8(7);
        if (eErro > 1) throw erro("IndexError", "tuple index out of range");
        const tipo = eErro ? XL_CELL_ERROR : XL_CELL_BOOLEAN;
        this.por(v.getUint16(0, true), v.getUint16(2, true), tipo, v.getUint8(6), v.getUint16(4, true));
      } else if (rc === R.DIMENSION || rc === R.DIMENSION2) {
        if (tamanho === 0) continue;
        if (bv < 80) exato(fatia(data, 2, 8), 6);
        else exato(fatia(data, 4, 12), 8);
        this.nrows = 0;
        this.ncols = 0;
      } else if (rc === R.HLINK) {
        this.lerHlink(data);
      } else if (rc === R.QUICKTIP) {
        this.lerQuicktip(data);
      } else if (rc === R.EOF) {
        break;
      } else if (rc === R.OBJ) {
        const r = this.lerObj(data);
        objIdDefinido = true;
        objId = r === null ? null : r;
      } else if (rc === R.TXO) {
        if (bv >= 80) {
          this.lerTxo(data);
          if (!objIdDefinido) {
            throw erro(
              "UnboundLocalError",
              "cannot access local variable 'saved_obj_id' where it is not associated with a value",
            );
          }
          if (objId) objId = null;
        }
      } else if (rc === R.NOTE) {
        this.lerNote(data);
      } else if (BOFCODES.includes(rc)) {
        exato(fatia(data, 0, 4), 4);
        for (;;) if (livro.lerRegistro()[0] === R.EOF) break;
      } else if (rc === R.COUNTRY) {
        livro.lerCountry(data);
      } else if (rc === R.LABELRANGES) {
        let pos = listaIntervalos(data, 0);
        pos = listaIntervalos(data, pos);
        afirmar(pos === tamanho);
      } else if (rc === R.ARRAY) {
        exato(fatia(data, 0, 14), 14);
      } else if (rc === R.SHRFMLA) {
        exato(fatia(data, 0, 10), 10);
      } else if (rc === R.DEFAULTROWHEIGHT) {
        if (tamanho === 4) exato(fatia(data, 0, 4), 4);
        else if (tamanho === 2) exato(data, 2);
      } else if (rc === R.WINDOW2) {
        if (bv >= 80 && tamanho >= 14) exato(fatia(data, 0, 14), 14);
        else {
          afirmar(bv >= 30);
          exato(fatia(data, 0, 6), 6);
          exato(fatia(data, 6, 9), 3);
        }
      } else if (rc === R.SCL) {
        exato(data, 4);
      } else if (rc === R.PANE) {
        exato(fatia(data, 0, 9), 9);
      } else if (rc === R.DEFCOLWIDTH || rc === R.STANDARDWIDTH) {
        exato(fatia(data, 0, 2), 2);
      }
      // ROW, COLINFO, BLANK, MULBLANK, MERGEDCELLS e afins só contam com `formatting_info`.
    }
    this.arrumarDimensoes();
    const linhas: CelulaXls[][] = [];
    for (let r = 0; r < this.nrows; r++) {
      const tipos = this.tipos[r];
      linhas.push(this.valores[r].map((valor, c) => ({ tipo: NOMES_TIPO[tipos[c]], valor })));
    }
    return linhas;
  }

  /** `tidy_dimensions` (sem células mescladas, que só existem com `formatting_info`). */
  private arrumarDimensoes(): void {
    const limite = this.primeiraCheia === -2 ? this.nrows : this.primeiraCheia;
    for (let r = 0; r < limite; r++) {
      const trow = this.tipos[r];
      const extra = this.ncols - trow.length;
      if (extra > 0) this.livro.gastarCelulas(extra);
      for (let k = 0; k < extra; k++) {
        trow.push(XL_CELL_EMPTY);
        this.valores[r].push("");
      }
    }
  }

  private lerFormula(data: Uint8Array): void {
    const livro = this.livro;
    const v = exato(fatia(data, 0, 16), 16);
    const rowx = v.getUint16(0, true);
    const colx = v.getUint16(2, true);
    const xf = v.getUint16(4, true);
    if (v.getUint8(12) === 0xff && v.getUint8(13) === 0xff) {
      const primeiro = v.getUint8(6);
      if (primeiro === 0) {
        // Resultado texto: vem no registro STRING seguinte (às vezes depois de SHRFMLA/ARRAY).
        let achou = false;
        let [rc2, , data2] = livro.lerRegistro();
        if (rc2 === R.STRING || rc2 === R.STRING_B2) achou = true;
        else if (rc2 === R.ARRAY) exato(fatia(data2, 0, 14), 14);
        else if (rc2 === R.SHRFMLA) exato(fatia(data2, 0, 10), 10);
        else if (!SHRFMLA_ETC.includes(rc2)) {
          throw erro("XLRDError", `Expected SHRFMLA, ARRAY, TABLEOP* or STRING record; found 0x${rc2.toString(16).padStart(4, "0")}`);
        }
        if (!achou) {
          [rc2, , data2] = livro.lerRegistro();
          if (rc2 !== R.STRING && rc2 !== R.STRING_B2) {
            throw erro("XLRDError", `Expected STRING record; found 0x${rc2.toString(16).padStart(4, "0")}`);
          }
        }
        this.por(rowx, colx, XL_CELL_TEXT, this.conteudoString(data2), xf);
      } else if (primeiro === 1) this.por(rowx, colx, XL_CELL_BOOLEAN, v.getUint8(8), xf);
      else if (primeiro === 2) this.por(rowx, colx, XL_CELL_ERROR, v.getUint8(8), xf);
      else if (primeiro === 3) this.por(rowx, colx, XL_CELL_TEXT, "", xf);
      else throw erro("XLRDError", `unexpected special case (0x${hex2(primeiro)}) in FORMULA`);
    } else {
      this.por(rowx, colx, null, v.getFloat64(6, true), xf);
    }
  }

  /** `string_record_contents`: o texto do STRING, que pode continuar em CONTINUE. */
  private conteudoString(data: Uint8Array): string {
    const livro = this.livro;
    const bv = livro.bv;
    const esperados = u16(fatia(data, 0, 2), 0);
    let offset = 2;
    let enc = bv < 80 ? livro.codificacaoAtual() : "";
    let achados = 0;
    let resultado = "";
    for (;;) {
      if (bv >= 80) {
        enc = byteEm(data, offset) & 1 ? "utf_16_le" : "latin_1";
        offset += 1;
      }
      const pedaco = decodificar(fatia(data, offset), enc);
      resultado += pedaco;
      achados += tamanhoPy(pedaco);
      if (achados === esperados) return resultado;
      if (achados > esperados) throw erro("XLRDError", `STRING/CONTINUE: expected ${esperados} chars, found ${achados}`);
      const [rc, , seguinte] = livro.lerRegistro();
      data = seguinte;
      if (rc !== R.CONTINUE) {
        throw erro("XLRDError", `Expected CONTINUE record; found record-type 0x${rc.toString(16).toUpperCase().padStart(4, "0")}`);
      }
      offset = 0;
    }
  }

  /** `handle_hlink`: nada do hyperlink entra no resultado, mas o xlrd falha nos mesmos lugares. */
  private lerHlink(data: Uint8Array): void {
    const tamanho = data.length;
    const v = exato(fatia(data, 0, 32), 32);
    const intervalo: [number, number, number, number] = [
      v.getUint16(0, true),
      v.getUint16(2, true),
      v.getUint16(4, true),
      v.getUint16(6, true),
    ];
    afirmar(iguais(data.subarray(8, 24), GUID_HLINK));
    afirmar(iguais(data.subarray(24, 28), [2, 0, 0, 0]));
    const opcoes = v.getInt32(28, true);
    let offset = 32;
    const terminadoEmNulo = (ofs: number): number => {
      const nb = exato(fatia(data, ofs, ofs + 4), 4).getUint32(0, true) * 2;
      ofs += 4;
      utf16(fatia(data, ofs, ofs + nb));
      return ofs + nb;
    };
    if (opcoes & 0x14) offset = terminadoEmNulo(offset);
    if (opcoes & 0x80) offset = terminadoEmNulo(offset);
    if (opcoes & 1 && !(opcoes & 0x100)) {
      const clsid = fatia(data, offset, offset + 16);
      exato(clsid, 16);
      offset += 16;
      if (iguais(clsid, CLSID_URL)) {
        const nbytes = exato(fatia(data, offset, offset + 4), 4).getUint32(0, true);
        offset += 4;
        const url = utf16(fatia(data, offset, offset + nbytes));
        let fimPos = -1;
        let k = 0;
        for (const c of url) {
          if (c === "\0") {
            fimPos = k;
            break;
          }
          k++;
        }
        const verdadeiros = 2 * (fimPos + 1);
        const extra = nbytes - verdadeiros;
        offset += verdadeiros + extra;
        afirmar(extra === 24 || extra === 0);
      } else if (iguais(clsid, CLSID_ARQUIVO)) {
        const a = exato(fatia(data, offset, offset + 6), 6);
        const nbytes = a.getInt32(2, true);
        offset += 6 + nbytes + 24;
        const sz = i32(fatia(data, offset, offset + 4), 0);
        offset += 4;
        if (sz) {
          const xl = i32(fatia(data, offset, offset + 4), 0);
          offset += 4 + 2;
          utf16(fatia(data, offset, offset + xl));
          offset += xl;
        }
      }
    } else if ((opcoes & 0x163) === 0x103) {
      offset = terminadoEmNulo(offset);
    }
    if (opcoes & 0x8) offset = terminadoEmNulo(offset);
    if (tamanho - offset < 0) throw erro("XLRDError", "Bug or corrupt file, send copy of input file for debugging");
    this.hyperlinks.push(intervalo);
  }

  private lerQuicktip(data: Uint8Array): void {
    const v = exato(fatia(data, 0, 10), 10);
    afirmar(v.getUint16(0, true) === R.QUICKTIP);
    afirmar(this.hyperlinks.length > 0);
    const h = this.hyperlinks[this.hyperlinks.length - 1];
    afirmar([1, 2, 3, 4].every((k, i) => v.getUint16(2 * k, true) === h[i]));
    afirmar(iguais(fatia(data, -2), [0, 0]));
    utf16(fatia(data, 10, -2));
  }

  /** `handle_obj`: devolve o id do objeto, `null` se o xlrd devolve None. */
  private lerObj(data: Uint8Array): number | null {
    if (this.livro.bv < 80) return null;
    const n = data.length;
    let id: number | undefined;
    let autofiltro = 0;
    let pos = 0;
    while (pos < n) {
      const v = exato(fatia(data, pos, pos + 4), 4);
      const ft = v.getUint16(0, true);
      const cb = v.getUint16(2, true);
      if (pos === 0 && !(ft === 0x15 && cb === 18)) return null;
      if (ft === 0x15) {
        afirmar(pos === 0);
        const o = exato(fatia(data, pos + 4, pos + 10), 6);
        id = o.getUint16(2, true);
        autofiltro = (o.getUint16(4, true) & 0x100) >> 8;
      } else if (ft === 0x00) {
        if (data.subarray(pos).every((c) => c === 0)) break;
        throw erro("XLRDError", "Unexpected data at end of OBJECT record");
      } else if (ft === 0x0c) {
        exato(fatia(data, pos + 8, pos + 18), 10);
      } else if (ft === 0x13) {
        if (autofiltro) break;
      }
      pos += cb + 4;
    }
    if (id === undefined) throw erro("AttributeError", "'MSObj' object has no attribute 'id'");
    return id;
  }

  /** `handle_txo` (BIFF8): consome os CONTINUE com o texto e os "runs". */
  private lerTxo(data: Uint8Array): void {
    const livro = this.livro;
    const v = exato(fatia(data, 0, 16), 16);
    const cchText = v.getUint16(10, true);
    const cbRuns = v.getUint16(12, true);
    let total = 0;
    while (total < cchText) {
      const [rc2, len2, data2] = livro.lerRegistro();
      afirmar(rc2 === R.CONTINUE);
      const nb = byteEm(data2, 0);
      let nchars = len2 - 1;
      if (nb) {
        afirmar(nchars % 2 === 0);
        nchars = nchars / 2;
      }
      const [, fim] = unpackUnicodePos(data2, 0, 2, nchars);
      afirmar(fim === len2);
      total += nchars;
    }
    let runs = 0;
    while (runs < cbRuns) {
      const [rc3, len3, data3] = livro.lerRegistro();
      afirmar(rc3 === R.CONTINUE);
      afirmar(len3 % 8 === 0);
      for (let pos = 0; pos < len3; pos += 8) {
        exato(fatia(data3, pos, pos + 8), 8);
        runs += 8;
      }
    }
  }

  private lerNote(data: Uint8Array): void {
    const livro = this.livro;
    if (livro.bv < 80) {
      const v = exato(fatia(data, 0, 6), 6);
      let esperado = v.getUint16(4, true);
      const nb = data.length - 6;
      afirmar(nb <= esperado);
      const pedacos = [fatia(data, 6)];
      esperado -= nb;
      while (esperado > 0) {
        const [rc2, len2, data2] = livro.lerRegistro();
        afirmar(rc2 === R.NOTE);
        const w = exato(fatia(data2, 0, 6), 6);
        afirmar(w.getUint16(0, true) === 0xffff);
        const nb2 = w.getUint16(4, true);
        afirmar(nb2 === len2 - 6);
        pedacos.push(fatia(data2, 6));
        esperado -= nb2;
      }
      afirmar(esperado === 0);
      decodificar(juntar(pedacos), livro.codificacaoAtual());
      return;
    }
    exato(fatia(data, 0, 8), 8);
    const [, fim] = unpackUnicodePos(data, 8, 2);
    afirmar(data.length - fim === 0 || data.length - fim === 1);
  }
}

// ─── Entrada ────────────────────────────────────────────────────────────────

const ASSINATURA_ZIP = [0x50, 0x4b, 0x03, 0x04];

/** `xlrd.open_workbook(file_contents=bytes)` seguido de `wb.sheets()` e `ws.row(i)`. */
export function lerXls(bytes: Uint8Array): LivroXls {
  if (bytes.length === 0) {
    // `inspect_format` cai no caminho de arquivo com `path=None`.
    throw erro("TypeError", "expected str, bytes or os.PathLike object, not NoneType");
  }
  if (!comeca(bytes, ASSINATURA_OLE) && comeca(bytes, ASSINATURA_ZIP)) {
    const nomes = new Set(nomesZip(bytes).map((n) => n.replaceAll("\\", "/").toLowerCase()));
    if (nomes.has("xl/workbook.xml")) throw erro("XLRDError", "Excel xlsx file; not supported");
    if (nomes.has("xl/workbook.bin")) throw erro("XLRDError", "Excel 2007 xlsb file; not supported");
    if (nomes.has("content.xml")) throw erro("XLRDError", "Openoffice.org ODS file; not supported");
    throw erro("XLRDError", "Unknown ZIP file; not supported");
  }

  let mem = bytes;
  let base = 0;
  if (comeca(bytes, ASSINATURA_OLE)) {
    const cd = new DocumentoComposto(bytes);
    let achado: { mem: Uint8Array; base: number } | null = null;
    for (const nome of ["Workbook", "Book"]) {
      achado = cd.localizar(nome);
      if (achado && achado.mem.length) break;
      achado = null;
    }
    if (!achado) throw erro("XLRDError", "Can't find workbook in OLE2 compound document");
    ({ mem, base } = achado);
  }

  const livro = new Livro(mem, base);
  const bv = livro.getbof(XL_WORKBOOK_GLOBALS);
  if (!bv) throw erro("XLRDError", "Can't determine file's BIFF version");
  livro.bv = bv;
  if (bv <= 40) {
    // `fake_globals_get_sheet`: a única folha começa no byte 0 do stream (o xlrd confere o BOF dela).
    livro.pos = 0;
    livro.getbof(XL_WORKSHEET);
  }
  if (bv <= 45) throw erro("NaoSuportado", `BIFF${bv === 45 ? "4W" : bv / 10} não é suportado no porte do xlrd`);
  livro.lerGlobais();

  const folhas: FolhaXls[] = livro.nomesFolhas.map((nome, i) => {
    livro.pos = livro.posFolhas[i];
    livro.getbof(XL_WORKSHEET);
    return { nome, linhas: new Folha(livro).ler() };
  });
  return { datemode: livro.datemode, folhas };
}

// ─── Datas (xldate.py) ──────────────────────────────────────────────────────

const JDN_DELTA = [2415080 - 61, 2416482 - 1];
const XLDAYS_TOO_LARGE = [2958466, 2958466 - 1462];

/** `round()` do Python (meio para o par). */
function arredondarPar(x: number): number {
  const piso = Math.floor(x);
  const diferenca = x - piso;
  if (diferenca > 0.5) return piso + 1;
  if (diferenca < 0.5) return piso;
  return piso % 2 === 0 ? piso : piso + 1;
}

/** `xlrd.xldate_as_tuple`: (ano, mês, dia, hora, minuto, segundo), com os mesmos erros. */
export function xldateComoTupla(valor: number, datemode: 0 | 1): [number, number, number, number, number, number] {
  if (datemode !== 0 && datemode !== 1) throw erro("XLDateBadDatemode", String(datemode));
  if (valor === 0) return [0, 0, 0, 0, 0, 0];
  if (valor < 0) throw erro("XLDateNegative", reprFloat(valor));
  if (Number.isNaN(valor)) throw erro("ValueError", "cannot convert float NaN to integer");
  if (!Number.isFinite(valor)) throw erro("OverflowError", "cannot convert float infinity to integer");
  let dias = Math.trunc(valor);
  const fracao = valor - dias;
  const segundos = arredondarPar(fracao * 86400.0);
  let hora: number;
  let minuto: number;
  let segundo: number;
  if (segundos === 86400) {
    hora = minuto = segundo = 0;
    dias += 1;
  } else {
    segundo = segundos % 60;
    const minutos = (segundos - segundo) / 60;
    minuto = minutos % 60;
    hora = (minutos - minuto) / 60;
  }
  if (dias >= XLDAYS_TOO_LARGE[datemode]) throw erro("XLDateTooLarge", reprFloat(valor));
  if (dias === 0) return [0, 0, 0, hora, minuto, segundo];
  if (dias < 61 && datemode === 0) throw erro("XLDateAmbiguous", reprFloat(valor));
  const jdn = dias + JDN_DELTA[datemode];
  const yreg = (Math.floor((Math.floor((jdn * 4 + 274277) / 146097) * 3) / 4) + jdn + 1363) * 4 + 3;
  let mp = Math.floor((yreg % 1461) / 4) * 535 + 333;
  const d = Math.floor((mp % 16384) / 535) + 1;
  mp = Math.floor(mp / 16384);
  if (mp >= 10) return [Math.floor(yreg / 1461) - 4715, mp - 9, d, hora, minuto, segundo];
  return [Math.floor(yreg / 1461) - 4716, mp + 3, d, hora, minuto, segundo];
}
