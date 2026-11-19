// O leitor de XML de NF-e 4.0 e NFS-e ABRASF (Bloco C, Fase C1, 18/11/2026). Porte de
// `src/domain/notas/xml_parser.py` do Contábil Core: as mesmas buscas pela tag sem o namespace, as
// mesmas recusas com as mesmas frases (inclusive a do evento de NF-e), o CNPJ normalizado, as datas
// com e sem fuso e o valor como `Decimal`.
//
// A assinatura XMLDSig é conferida em `assinatura.ts` (o `signxml` do original), e o resultado vai
// para `assinaturaNaoVerificada`: `null` quando confere, o motivo quando não fecha. A nota entra nos
// dois casos (decisão do escritório em 01/09/2026); quem sustenta o documento é o protocolo da SEFAZ,
// que continua obrigatório na NF-e.
//
// Síncrono: o parser, a canonicalização e a criptografia (`node:crypto`) são todos síncronos.
//
// Conferido pelo gabarito (`gabarito/notas-chamadas.json`, gerado por
// `scripts/contabil-core/gabarito_notas.py`): cada chamada de `parse_nota_xml` da suíte do original e
// dos XML inventados (assinados por um certificado de teste) dá aqui a mesma nota ou a mesma recusa.

import { decimal, NAO_FINITO, compara, type Dec } from "../motor/decimal";
import { digitoUnicode } from "../motor/unicodePy";
import { strip } from "../extrato/py";
import { conferirAssinatura } from "./assinatura";
import type { NotaLida } from "./tipos";
import {
  ErroDeCodificacao,
  ErroDeDtd,
  ErroDeXml,
  atributoEt,
  filhosElemento,
  iterar,
  lerXml,
  textoEt,
  type ElementoXml,
} from "./xmlArvore";

export const NFE_NS = "http://www.portalfiscal.inf.br/nfe";

/**
 * A recusa do arquivo, com a frase do original (o `ValueError` de `parse_nota_xml` e o
 * `VisualParseError` do leitor visual). `tipoPython` guarda o nome da exceção quando o original não
 * levantaria `ValueError` (a codificação desconhecida, que lá sai como `LookupError`).
 */
export class NotaInvalida extends Error {
  constructor(
    mensagem: string,
    readonly tipoPython: string = "ValueError",
  ) {
    super(mensagem);
    this.name = "NotaInvalida";
  }
}

// ─── Ajudantes (os `_find*` do original) ───────────────────────────────────────

/** `_safe_text`: o texto aparado, ou `null` (sem elemento, sem texto ou só espaço). */
function textoSeguro(el: ElementoXml | null): string | null {
  if (!el) return null;
  const t = textoEt(el);
  if (t === null) return null;
  return strip(t) || null;
}

/** `_find_by_local_tag`: o primeiro elemento (o próprio incluído) com a tag, ignorando o namespace. */
function porTagLocal(raiz: ElementoXml | null, tag: string): ElementoXml | null {
  if (!raiz) return null;
  for (const el of iterar(raiz)) if (el.local === tag) return el;
  return null;
}

/** `_find_path_local`: desce pelos filhos diretos, ignorando o namespace. */
function caminhoLocal(raiz: ElementoXml | null, ...tags: string[]): ElementoXml | null {
  let atual = raiz;
  for (const tag of tags) {
    if (!atual) return null;
    atual = filhosElemento(atual).find((f) => f.local === tag) ?? null;
  }
  return atual;
}

/** Só os dígitos (de qualquer escrita, como o `\d` do Python). */
function digitos(texto: string): string[] {
  return Array.from(texto).filter((c) => digitoUnicode(c) !== null);
}

/** `_normalizar_cnpj`: os 14 dígitos com a máscara, ou `null`. */
export function normalizarCnpj(valor: string | null): string | null {
  if (valor === null) return null;
  const d = digitos(valor);
  if (d.length !== 14) return null;
  const j = (a: number, b: number) => d.slice(a, b).join("");
  return `${j(0, 2)}.${j(2, 5)}.${j(5, 8)}/${j(8, 12)}-${j(12, 14)}`;
}

/** `re.fullmatch(r"\d{n}", texto)` */
function soDigitos(texto: string, n: number): boolean {
  const cs = Array.from(texto);
  return cs.length === n && cs.every((c) => digitoUnicode(c) !== null);
}

// ─── Datas: o `datetime.strptime` dos três formatos do original ────────────────

const D = "\\p{Nd}";
const ANO = `(${D}${D}${D}${D})`;
const MES = `(1[0-2]|0[1-9]|[1-9])`;
const DIA = `(3[0-1]|[1-2]${D}|0[1-9]|[1-9]| [1-9])`;
const HORA = `(2[0-3]|[0-1]${D}|${D}| ${D})`;
const MINUTO = `([0-5]${D}|${D})`;
const SEGUNDO = `(6[0-1]|[0-5]${D}|${D})`;
const FUSO = `([+-]${D}${D}:?[0-5]${D}(?::?[0-5]${D}(?:\\.${D}{1,6})?)?|Z)`;
// O `re` do strptime não ancora no fim: casa o começo e depois confere se sobrou texto.
const FORMATOS = [
  new RegExp(`^${ANO}-${MES}-${DIA}[Tt]${HORA}:${MINUTO}:${SEGUNDO}${FUSO}`, "u"),
  new RegExp(`^${ANO}-${MES}-${DIA}[Tt]${HORA}:${MINUTO}:${SEGUNDO}`, "u"),
  new RegExp(`^${ANO}-${MES}-${DIA}`, "u"),
];

function inteiro(texto: string): number {
  let n = 0;
  for (const c of texto.trim()) n = n * 10 + digitoUnicode(c)!;
  return n;
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");

function diasDoMes(ano: number, mes: number): number {
  if (mes === 2) return ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(mes) ? 30 : 31;
}

/** O `%z` do `_strptime` do Python 3.14, em `isoformat` (`+03:00`, `-03:00:30.500000`), ou `null`. */
function fusoIso(z: string): string | null {
  let sinal: string;
  let s: number;
  let micro: number;
  if (z === "Z") {
    sinal = "+";
    s = 0;
    micro = 0;
  } else {
    let x = Array.from(z);
    if (x[3] === ":") {
      x = [...x.slice(0, 3), ...x.slice(4)];
      if (x.length > 5) {
        if (x[5] !== ":") return null; // "Inconsistent use of :"
        x = [...x.slice(0, 5), ...x.slice(6)];
      }
    }
    const pedaco = (a: number, b: number) => x.slice(a, b).join("");
    const segundos = pedaco(5, 7);
    if (segundos && !/^\p{Nd}+$/u.test(segundos)) return null; // int(":0") levanta
    const resto = pedaco(8, x.length);
    const total = inteiro(pedaco(1, 3)) * 3600 + inteiro(pedaco(3, 5)) * 60 + (segundos ? inteiro(segundos) : 0);
    micro = resto ? inteiro((resto + "000000").slice(0, 6)) : 0;
    s = total;
    sinal = x[0] === "-" && (total > 0 || micro > 0) ? "-" : "+";
    // `timezone()` exige |deslocamento| < 24 h.
    if (total * 1_000_000 + micro >= 86_400 * 1_000_000) return null;
  }
  let out = `${sinal}${doisDigitos(Math.floor(s / 3600))}:${doisDigitos(Math.floor((s % 3600) / 60))}`;
  if (s % 60 || micro) {
    out += `:${doisDigitos(s % 60)}`;
    if (micro) out += `.${String(micro).padStart(6, "0")}`;
  }
  return out;
}

/** `_parse_datetime`: a data e hora em `isoformat` do Python (com o fuso do documento, se houver). */
export function lerDataHora(valor: string | null): string | null {
  if (!valor) return null;
  const v = strip(valor);
  for (const [k, formato] of FORMATOS.entries()) {
    const m = formato.exec(v);
    if (!m || m[0].length !== v.length) continue;
    const ano = inteiro(m[1]);
    const mes = inteiro(m[2]);
    const dia = inteiro(m[3]);
    if (ano < 1 || dia > diasDoMes(ano, mes)) continue;
    const data = `${String(ano).padStart(4, "0")}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
    if (k === 2) return `${data}T00:00:00`;
    const [h, mi, se] = [inteiro(m[4]), inteiro(m[5]), inteiro(m[6])];
    if (se > 59) continue;
    const hora = `${data}T${doisDigitos(h)}:${doisDigitos(mi)}:${doisDigitos(se)}`;
    if (k === 1) return hora;
    const fuso = fusoIso(m[7]);
    if (fuso === null) continue;
    return hora + fuso;
  }
  return null;
}

/** `_parse_decimal`: o valor positivo, ou a recusa com o nome do campo. */
function lerDecimal(valor: string | null, campo: string): Dec {
  const d = decimal(valor ?? "");
  if (d === null) throw new NotaInvalida(`Campo ${campo} ausente ou inválido.`);
  if (d === NAO_FINITO || compara(d, { negativo: false, coeficiente: BigInt(0), expoente: 0 }) <= 0) {
    throw new NotaInvalida(`Campo ${campo} deve ser um valor positivo.`);
  }
  return d;
}

// ─── Detecção ──────────────────────────────────────────────────────────────────

function ehNfe(raiz: ElementoXml): boolean {
  if (raiz.local === "nfeProc" || raiz.local === "NFe") return true;
  if (raiz.ns === NFE_NS) return true;
  return porTagLocal(raiz, "infNFe") !== null;
}

const NOMES_EVENTO_NFE: Record<string, string> = {
  "110110": "Carta de Correção",
  "110111": "Cancelamento",
  "210200": "Confirmação da Operação",
  "210210": "Ciência da Operação",
  "210220": "Desconhecimento da Operação",
  "210240": "Operação não Realizada",
};

/** `_is_evento_nfe`: só evento quando não há `infNFe` (o `NFeLog` traz a nota junto dos eventos). */
export function ehEventoNfe(raiz: ElementoXml): boolean {
  if (porTagLocal(raiz, "infNFe") !== null) return false;
  if (["procEventoNFe", "envEvento", "evento"].includes(raiz.local)) return true;
  return porTagLocal(raiz, "infEvento") !== null;
}

function descricaoEventoNfe(raiz: ElementoXml): string {
  const codigo = textoSeguro(porTagLocal(raiz, "tpEvento"));
  return NOMES_EVENTO_NFE[codigo ?? ""] ?? "evento";
}

function ehNfse(raiz: ElementoXml): boolean {
  if (raiz.local.includes("Nfse") || raiz.local.includes("CompNfse")) return true;
  for (const el of iterar(raiz)) if (el.local === "CompNfse" || el.local === "InfNfse") return true;
  return false;
}

// ─── NF-e ──────────────────────────────────────────────────────────────────────

type NotaSemAssinatura = Omit<NotaLida, "assinaturaNaoVerificada">;

function lerNfe(raiz: ElementoXml): NotaSemAssinatura {
  const infNfe = porTagLocal(raiz, "infNFe");
  if (!infNfe) throw new NotaInvalida("Elemento infNFe não encontrado no XML NF-e.");

  const id = atributoEt(infNfe, "Id") ?? "";
  let chaveAcesso: string | null = id.startsWith("NFe") ? id.slice(3) : null;
  if (chaveAcesso === "") chaveAcesso = null;

  const ide = caminhoLocal(infNfe, "ide");
  const numero = ide ? textoSeguro(caminhoLocal(ide, "nNF")) : null;
  const serie = ide ? textoSeguro(caminhoLocal(ide, "serie")) : null;
  const dataEmissao = lerDataHora(ide ? textoSeguro(caminhoLocal(ide, "dhEmi")) : null);

  const emit = caminhoLocal(infNfe, "emit");
  const cnpjEmitente = normalizarCnpj(emit ? textoSeguro(caminhoLocal(emit, "CNPJ")) : null);
  const nomeEmitente = emit ? textoSeguro(caminhoLocal(emit, "xNome")) : null;

  const dest = caminhoLocal(infNfe, "dest");
  let cnpjDestinatarioBruto: string | null = null;
  let nomeDestinatario: string | null = null;
  if (dest) {
    const cnpj = caminhoLocal(dest, "CNPJ");
    const cpf = caminhoLocal(dest, "CPF");
    if (cnpj) cnpjDestinatarioBruto = textoSeguro(cnpj);
    else if (cpf) cnpjDestinatarioBruto = textoSeguro(cpf);
    nomeDestinatario = textoSeguro(caminhoLocal(dest, "xNome"));
  }
  const cnpjDestinatario = normalizarCnpj(cnpjDestinatarioBruto);

  const total = caminhoLocal(infNfe, "total");
  const icmsTot = total ? caminhoLocal(total, "ICMSTot") : null;
  const valor = lerDecimal(icmsTot ? textoSeguro(caminhoLocal(icmsTot, "vNF")) : null, "vNF");

  const infProt = porTagLocal(raiz, "infProt");
  const cStat = infProt ? textoSeguro(caminhoLocal(infProt, "cStat")) : null;
  const protocolo = infProt ? textoSeguro(caminhoLocal(infProt, "nProt")) : null;
  const recebimento = infProt ? lerDataHora(textoSeguro(caminhoLocal(infProt, "dhRecbto"))) : null;
  const chaveProtocolo = infProt ? textoSeguro(caminhoLocal(infProt, "chNFe")) : null;
  if ((cStat !== "100" && cStat !== "150") || !soDigitos(protocolo ?? "", 15)) {
    throw new NotaInvalida("NF-e sem protocolo de autorização válido (cStat 100 ou 150).");
  }
  if (recebimento === null) throw new NotaInvalida("NF-e sem data válida de recebimento da autorização.");
  if (!chaveAcesso || !soDigitos(chaveAcesso, 44)) {
    throw new NotaInvalida("Chave de acesso da NF-e deve conter exatamente 44 dígitos.");
  }
  if (chaveProtocolo !== chaveAcesso) throw new NotaInvalida("Chave de acesso diverge da chave informada no protocolo.");

  const observacao = nomeDestinatario ? `Destinatário: ${nomeDestinatario}` : null;

  if (numero === null) throw new NotaInvalida("Campo nNF (número da NF-e) não encontrado.");
  if (cnpjEmitente === null) throw new NotaInvalida("CNPJ do emitente não encontrado ou inválido na NF-e.");
  if (dataEmissao === null) throw new NotaInvalida("Data de emissão não encontrada ou inválida na NF-e.");

  return { tipo: "nfe", numero, serie, cnpjEmitente, nomeEmitente, cnpjDestinatario, valor, dataEmissao, chaveAcesso, observacao };
}

// ─── NFS-e ABRASF ──────────────────────────────────────────────────────────────

function lerNfse(raiz: ElementoXml): NotaSemAssinatura {
  const infNfse = porTagLocal(raiz, "InfNfse");
  const numero = textoSeguro(infNfse ? porTagLocal(infNfse, "Numero") : null);
  const dataEmissao = lerDataHora(textoSeguro(infNfse ? porTagLocal(infNfse, "DataEmissao") : null));

  const servico = porTagLocal(raiz, "Servico");
  const valores = servico ? porTagLocal(servico, "Valores") : null;
  const valor = lerDecimal(textoSeguro(valores ? porTagLocal(valores, "ValorServicos") : null), "ValorServicos");
  const valorIss = textoSeguro(valores ? porTagLocal(valores, "ValorIss") : null);
  const observacao = valorIss ? `ISS: ${valorIss}` : null;

  const prestador = porTagLocal(raiz, "PrestadorServico");
  const idPrestador = prestador ? porTagLocal(prestador, "IdentificacaoPrestador") : null;
  const cnpjEmitente = normalizarCnpj(textoSeguro(idPrestador ? porTagLocal(idPrestador, "Cnpj") : null));
  const nomeEmitente = textoSeguro(prestador ? porTagLocal(prestador, "RazaoSocial") : null);

  const tomador = porTagLocal(raiz, "TomadorServico");
  const idTomador = tomador ? porTagLocal(tomador, "IdentificacaoTomador") : null;
  const cpfCnpj = idTomador ? porTagLocal(idTomador, "CpfCnpj") : null;
  let cnpjDestinatarioBruto = textoSeguro(cpfCnpj ? porTagLocal(cpfCnpj, "Cnpj") : null);
  if (cnpjDestinatarioBruto === null && cpfCnpj) cnpjDestinatarioBruto = textoSeguro(porTagLocal(cpfCnpj, "Cpf"));
  const cnpjDestinatario = normalizarCnpj(cnpjDestinatarioBruto);

  if (numero === null) throw new NotaInvalida("Campo Numero da NFS-e não encontrado.");
  if (cnpjEmitente === null) throw new NotaInvalida("CNPJ do prestador não encontrado ou inválido na NFS-e.");
  if (dataEmissao === null) throw new NotaInvalida("Data de emissão não encontrada ou inválida na NFS-e.");
  if (!textoSeguro(porTagLocal(infNfse, "CodigoVerificacao"))) {
    throw new NotaInvalida("NFS-e sem código de verificação/autorização.");
  }

  return { tipo: "nfse", numero, serie: null, cnpjEmitente, nomeEmitente, cnpjDestinatario, valor, dataEmissao, chaveAcesso: null, observacao };
}

// ─── Entrada ───────────────────────────────────────────────────────────────────

/** `re.search(br"<!DOCTYPE|<!ENTITY", conteudo, re.IGNORECASE)` nos bytes. */
function temDtd(conteudo: Uint8Array): boolean {
  const alvos = ["<!DOCTYPE", "<!ENTITY"];
  for (let i = 0; i + 8 <= conteudo.length; i++) {
    if (conteudo[i] !== 0x3c || conteudo[i + 1] !== 0x21) continue;
    for (const alvo of alvos) {
      let ok = i + alvo.length <= conteudo.length;
      for (let k = 2; ok && k < alvo.length; k++) {
        const b = conteudo[i + k];
        ok = b === alvo.charCodeAt(k) || b === alvo.charCodeAt(k) + 32;
      }
      if (ok) return true;
    }
  }
  return false;
}

const DTD = "XML com DTD ou declaração de entidade não é permitido.";

/**
 * `parse_nota_xml`: os bytes do XML viram a nota, ou `NotaInvalida` com a frase do original.
 *
 * `agora` é o instante em que a validade do certificado é conferida (o `signxml` usa o relógio); só
 * os testes o passam.
 */
export function lerNotaXml(conteudo: Uint8Array, opcoes: { agora?: Date } = {}): NotaLida {
  if (temDtd(conteudo)) throw new NotaInvalida(DTD);
  let raiz: ElementoXml;
  try {
    raiz = lerXml(conteudo);
  } catch (e) {
    if (e instanceof ErroDeXml) throw new NotaInvalida(`XML inválido: ${e.message}`);
    if (e instanceof ErroDeCodificacao) throw new NotaInvalida(e.message, e.tipoPython);
    if (e instanceof ErroDeDtd) throw new NotaInvalida(DTD);
    throw e;
  }

  if (ehEventoNfe(raiz)) {
    throw new NotaInvalida(
      `Este arquivo é um evento da NF-e (${descricaoEventoNfe(raiz)}), não a nota fiscal ` +
        "em si. Envie o XML da própria NF-e (nfeProc/NFe) para importar.",
    );
  }

  if (ehNfe(raiz)) {
    const nota = lerNfe(raiz);
    return { ...nota, assinaturaNaoVerificada: conferirAssinatura(conteudo, raiz, `NFe${nota.chaveAcesso}`, opcoes.agora) };
  }

  if (ehNfse(raiz)) {
    const nota = lerNfse(raiz);
    const infNfse = porTagLocal(raiz, "InfNfse");
    const referencia = infNfse ? (atributoEt(infNfse, "Id") ?? "") : "";
    if (!referencia) throw new NotaInvalida("NFS-e sem identificador assinado.");
    return { ...nota, assinaturaNaoVerificada: conferirAssinatura(conteudo, raiz, referencia, opcoes.agora) };
  }

  throw new NotaInvalida("Formato XML não reconhecido. Esperado NF-e 4.0 ou NFS-e ABRASF.");
}
