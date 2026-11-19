// O esquema da assinatura XML (Bloco C, Fase C1, 18/11/2026): o `validate_schema` que o `signxml`
// roda no elemento `Signature` antes de conferir qualquer coisa, com os XSD que ele traz
// (`xmldsig1-schema.xsd`, que junta o `xmldsig-core-schema.xsd` e o `xmldsig11-schema.xsd`). Quando o
// esquema não fecha, o original relata "assinatura não confere (DocumentInvalid)".
//
// Aqui o esquema está escrito à mão, tipo a tipo, como o XSD declara: as sequências e escolhas com as
// cardinalidades, os curingas (`##any`/`##other`, estrito ou frouxo), os atributos declarados (e só
// eles), o conteúdo misto e os tipos simples (`base64Binary` como a libxml2 o confere, `integer`,
// `positiveInteger`, `ID` único e `anyURI`).
//
// Simplificações, fora do que uma NF-e ou NFS-e traz: o `anyURI` só recusa escape `%` malformado; um
// elemento desconhecido sob curinga frouxo tem os filhos conferidos também de forma frouxa; os
// parâmetros explícitos de curva elíptica (`ECParameters`) aceitam qualquer conteúdo; `xsi:type` e
// `xsi:nil` são recusados.

import { filhosElemento, type ElementoXml } from "./xmlArvore";

const DS = "http://www.w3.org/2000/09/xmldsig#";
const DS11 = "http://www.w3.org/2009/xmldsig11#";
const XSI = "http://www.w3.org/2001/XMLSchema-instance";

type Simples = (texto: string) => boolean;
type Atributo = { nome: string; tipo: Simples | "ID"; obrigatorio?: boolean };
type Tipo =
  | { simples: Simples; atributos?: Atributo[] }
  | { misto?: boolean; atributos?: Atributo[]; conteudo: Particula | null; livre?: boolean };
type Particula =
  | { p: "el"; ns: string; nome: string; tipo: () => Tipo; min?: number; max?: number }
  | { p: "any"; ns: "##any" | "##other"; estrito: boolean; min?: number; max?: number }
  | { p: "seq" | "choice"; itens: Particula[]; min?: number; max?: number };

// ─── Tipos simples ─────────────────────────────────────────────────────────────

const ESPACO = /[ \t\r\n]/;
const colapsar = (t: string) => t.replace(/[ \t\r\n]+/g, " ").trim();
const string: Simples = () => true;

function valorBase64(c: number): number {
  if (c >= 0x41 && c <= 0x5a) return c - 0x41;
  if (c >= 0x61 && c <= 0x7a) return c - 0x61 + 26;
  if (c >= 0x30 && c <= 0x39) return c - 0x30 + 52;
  if (c === 0x2b) return 62;
  if (c === 0x2f) return 63;
  if (c === 0x3d) return 64;
  return -1;
}

/** `base64Binary` como a libxml2 confere: ignora o que não é do alfabeto, exige contagem e preenchimento. */
const base64: Simples = (texto) => {
  const b = new TextEncoder().encode(texto);
  let k = 0;
  let i = 0;
  let pad = 0;
  for (; k < b.length; k++) {
    const d = valorBase64(b[k]);
    if (d < 0) continue;
    if (d < 64) i++;
    else break;
  }
  for (; k < b.length; k++) {
    const d = valorBase64(b[k]);
    if (d < 0) continue;
    if (d < 64) return false;
    if (d === 64) pad++;
  }
  // O último caractere de dado antes do preenchimento não pode ter bits sobrando.
  const ultimoDado = () => {
    for (let j = b.length - 1; j >= 0; j--) {
      const d = valorBase64(b[j]);
      if (d >= 0 && d < 64) return d;
    }
    return 0;
  };
  if (pad === 0) return i % 4 === 0;
  if (pad === 1) return i % 4 === 3 && (ultimoDado() & ~0x3c) === 0;
  if (pad === 2) return i % 4 === 2 && (ultimoDado() & ~0x30) === 0;
  return false;
};
const integer: Simples = (t) => /^[+-]?[0-9]+$/.test(colapsar(t));
const positiveInteger: Simples = (t) => integer(t) && BigInt(colapsar(t).replace(/^\+/, "")) > BigInt(0);
const anyURI: Simples = (t) => !/%(?![0-9A-Fa-f]{2})/.test(colapsar(t));
const NCNAME = /^[\p{L}\p{Nl}_][\p{L}\p{Nl}\p{Mn}\p{Mc}\p{Nd}\p{Lm}_.\-·]*$/u;

// ─── Os tipos do xmldsig-core e do xmldsig11 ───────────────────────────────────

const ds = (nome: string, tipo: () => Tipo, min = 1, max = 1): Particula => ({ p: "el", ns: DS, nome, tipo, min, max });
const ds11 = (nome: string, tipo: () => Tipo, min = 1, max = 1): Particula => ({ p: "el", ns: DS11, nome, tipo, min, max });
const seq = (itens: Particula[], min = 1, max = 1): Particula => ({ p: "seq", itens, min, max });
const escolha = (itens: Particula[], min = 1, max = 1): Particula => ({ p: "choice", itens, min, max });
const outro = (estrito: boolean, min = 1, max = 1): Particula => ({ p: "any", ns: "##other", estrito, min, max });
const qualquer = (estrito: boolean, min = 1, max = 1): Particula => ({ p: "any", ns: "##any", estrito, min, max });
const ID: Atributo = { nome: "Id", tipo: "ID" };
const N = Infinity;

const T = {
  string: (): Tipo => ({ simples: string }),
  base64: (): Tipo => ({ simples: base64 }),
  integer: (): Tipo => ({ simples: integer }),
  positiveInteger: (): Tipo => ({ simples: positiveInteger }),
  Signature: (): Tipo => ({
    atributos: [ID],
    conteudo: seq([G.SignedInfo, G.SignatureValue, { ...G.KeyInfo, min: 0 }, { ...G.Object, min: 0, max: N }]),
  }),
  SignatureValue: (): Tipo => ({ simples: base64, atributos: [ID] }),
  SignedInfo: (): Tipo => ({
    atributos: [ID],
    conteudo: seq([G.CanonicalizationMethod, G.SignatureMethod, { ...G.Reference, max: N }]),
  }),
  CanonicalizationMethod: (): Tipo => ({
    misto: true,
    atributos: [{ nome: "Algorithm", tipo: anyURI, obrigatorio: true }],
    conteudo: seq([qualquer(true, 0, N)]),
  }),
  SignatureMethod: (): Tipo => ({
    misto: true,
    atributos: [{ nome: "Algorithm", tipo: anyURI, obrigatorio: true }],
    conteudo: seq([ds("HMACOutputLength", T.integer, 0), outro(true, 0, N)]),
  }),
  Reference: (): Tipo => ({
    atributos: [ID, { nome: "URI", tipo: anyURI }, { nome: "Type", tipo: anyURI }],
    conteudo: seq([{ ...G.Transforms, min: 0 }, G.DigestMethod, G.DigestValue]),
  }),
  Transforms: (): Tipo => ({ conteudo: seq([{ ...G.Transform, max: N }]) }),
  Transform: (): Tipo => ({
    misto: true,
    atributos: [{ nome: "Algorithm", tipo: anyURI, obrigatorio: true }],
    conteudo: escolha([outro(false), ds("XPath", T.string)], 0, N),
  }),
  DigestMethod: (): Tipo => ({
    misto: true,
    atributos: [{ nome: "Algorithm", tipo: anyURI, obrigatorio: true }],
    conteudo: seq([outro(false, 0, N)]),
  }),
  KeyInfo: (): Tipo => ({
    misto: true,
    atributos: [ID],
    conteudo: escolha([G.KeyName, G.KeyValue, G.RetrievalMethod, G.X509Data, G.PGPData, G.SPKIData, G.MgmtData, outro(false)], 1, N),
  }),
  KeyValue: (): Tipo => ({ misto: true, conteudo: escolha([G.DSAKeyValue, G.RSAKeyValue, outro(false)]) }),
  RetrievalMethod: (): Tipo => ({
    atributos: [{ nome: "URI", tipo: anyURI }, { nome: "Type", tipo: anyURI }],
    conteudo: seq([{ ...G.Transforms, min: 0 }]),
  }),
  X509Data: (): Tipo => ({
    conteudo: seq(
      [
        escolha([
          ds("X509IssuerSerial", T.X509IssuerSerial),
          ds("X509SKI", T.base64),
          ds("X509SubjectName", T.string),
          ds("X509Certificate", T.base64),
          ds("X509CRL", T.base64),
          outro(false),
        ]),
      ],
      1,
      N,
    ),
  }),
  X509IssuerSerial: (): Tipo => ({ conteudo: seq([ds("X509IssuerName", T.string), ds("X509SerialNumber", T.integer)]) }),
  PGPData: (): Tipo => ({
    conteudo: escolha([
      seq([ds("PGPKeyID", T.base64), ds("PGPKeyPacket", T.base64, 0), outro(false, 0, N)]),
      seq([ds("PGPKeyPacket", T.base64), outro(false, 0, N)]),
    ]),
  }),
  SPKIData: (): Tipo => ({ conteudo: seq([ds("SPKISexp", T.base64), outro(false, 0)], 1, N) }),
  Object: (): Tipo => ({
    misto: true,
    atributos: [ID, { nome: "MimeType", tipo: string }, { nome: "Encoding", tipo: anyURI }],
    conteudo: seq([qualquer(false)], 0, N),
  }),
  Manifest: (): Tipo => ({ atributos: [ID], conteudo: seq([{ ...G.Reference, max: N }]) }),
  SignatureProperties: (): Tipo => ({ atributos: [ID], conteudo: seq([{ ...G.SignatureProperty, max: N }]) }),
  SignatureProperty: (): Tipo => ({
    misto: true,
    atributos: [{ nome: "Target", tipo: anyURI, obrigatorio: true }, ID],
    conteudo: escolha([outro(false)], 1, N),
  }),
  DSAKeyValue: (): Tipo => ({
    conteudo: seq([
      seq([ds("P", T.base64), ds("Q", T.base64)], 0),
      ds("G", T.base64, 0),
      ds("Y", T.base64),
      ds("J", T.base64, 0),
      seq([ds("Seed", T.base64), ds("PgenCounter", T.base64)], 0),
    ]),
  }),
  RSAKeyValue: (): Tipo => ({ conteudo: seq([ds("Modulus", T.base64), ds("Exponent", T.base64)]) }),
  // xmldsig11
  ECKeyValue: (): Tipo => ({
    atributos: [ID],
    conteudo: seq([escolha([ds11("ECParameters", T.livre), ds11("NamedCurve", T.NamedCurve)]), ds11("PublicKey", T.base64)]),
  }),
  NamedCurve: (): Tipo => ({ atributos: [{ nome: "URI", tipo: anyURI, obrigatorio: true }], conteudo: null }),
  livre: (): Tipo => ({ conteudo: null, livre: true }),
  Prime: (): Tipo => ({ conteudo: seq([ds11("P", T.base64)]) }),
  GnB: (): Tipo => ({ conteudo: seq([ds11("M", T.positiveInteger)]) }),
  TnB: (): Tipo => ({ conteudo: seq([ds11("M", T.positiveInteger), ds11("K", T.positiveInteger)]) }),
  PnB: (): Tipo => ({
    conteudo: seq([ds11("M", T.positiveInteger), ds11("K1", T.positiveInteger), ds11("K2", T.positiveInteger), ds11("K3", T.positiveInteger)]),
  }),
  DEREncodedKeyValue: (): Tipo => ({ simples: base64, atributos: [ID] }),
  KeyInfoReference: (): Tipo => ({ atributos: [{ nome: "URI", tipo: anyURI, obrigatorio: true }, ID], conteudo: null }),
  X509Digest: (): Tipo => ({ simples: base64, atributos: [{ nome: "Algorithm", tipo: anyURI, obrigatorio: true }] }),
};

/** Os elementos globais (os que um `ref` ou um curinga alcançam). */
const G = {
  Signature: ds("Signature", T.Signature),
  SignatureValue: ds("SignatureValue", T.SignatureValue),
  SignedInfo: ds("SignedInfo", T.SignedInfo),
  CanonicalizationMethod: ds("CanonicalizationMethod", T.CanonicalizationMethod),
  SignatureMethod: ds("SignatureMethod", T.SignatureMethod),
  Reference: ds("Reference", T.Reference),
  Transforms: ds("Transforms", T.Transforms),
  Transform: ds("Transform", T.Transform),
  DigestMethod: ds("DigestMethod", T.DigestMethod),
  DigestValue: ds("DigestValue", T.base64),
  KeyInfo: ds("KeyInfo", T.KeyInfo),
  KeyName: ds("KeyName", T.string),
  MgmtData: ds("MgmtData", T.string),
  KeyValue: ds("KeyValue", T.KeyValue),
  RetrievalMethod: ds("RetrievalMethod", T.RetrievalMethod),
  X509Data: ds("X509Data", T.X509Data),
  PGPData: ds("PGPData", T.PGPData),
  SPKIData: ds("SPKIData", T.SPKIData),
  Object: ds("Object", T.Object),
  Manifest: ds("Manifest", T.Manifest),
  SignatureProperties: ds("SignatureProperties", T.SignatureProperties),
  SignatureProperty: ds("SignatureProperty", T.SignatureProperty),
  DSAKeyValue: ds("DSAKeyValue", T.DSAKeyValue),
  RSAKeyValue: ds("RSAKeyValue", T.RSAKeyValue),
};
const GLOBAIS: Particula[] = [
  ...Object.values(G),
  ds11("ECKeyValue", T.ECKeyValue),
  ds11("Prime", T.Prime),
  ds11("GnB", T.GnB),
  ds11("TnB", T.TnB),
  ds11("PnB", T.PnB),
  ds11("DEREncodedKeyValue", T.DEREncodedKeyValue),
  ds11("KeyInfoReference", T.KeyInfoReference),
  ds11("X509Digest", T.X509Digest),
];

function global(el: ElementoXml): (Particula & { p: "el" }) | null {
  for (const g of GLOBAIS) if (g.p === "el" && g.ns === el.ns && g.nome === el.local) return g;
  return null;
}

// ─── Validação ─────────────────────────────────────────────────────────────────

class Invalido extends Error {}

type Folha = (Particula & { p: "el" }) | (Particula & { p: "any" });
type Caminho = { fim: number; atribuicoes: [ElementoXml, Folha][] };

/** Todas as formas de a partícula consumir os filhos a partir de `i`. */
function casar(p: Particula, filhos: ElementoXml[], i: number): Caminho[] {
  const min = p.min ?? 1;
  const max = p.max ?? 1;
  let atuais: Caminho[] = [{ fim: i, atribuicoes: [] }];
  const saida: Caminho[] = min === 0 ? [...atuais] : [];
  for (let n = 1; n <= max && atuais.length; n++) {
    const proximos: Caminho[] = [];
    for (const c of atuais) {
      for (const r of casarUma(p, filhos, c.fim)) {
        if (r.fim === c.fim && n > 1) continue; // repetição vazia não avança
        proximos.push({ fim: r.fim, atribuicoes: [...c.atribuicoes, ...r.atribuicoes] });
      }
    }
    atuais = proximos;
    if (n >= min) saida.push(...atuais);
    if (n > filhos.length + 1) break;
  }
  return saida;
}

function casarUma(p: Particula, filhos: ElementoXml[], i: number): Caminho[] {
  if (p.p === "el") {
    const f = filhos[i];
    return f && f.ns === p.ns && f.local === p.nome ? [{ fim: i + 1, atribuicoes: [[f, p]] }] : [];
  }
  if (p.p === "any") {
    const f = filhos[i];
    if (!f) return [];
    const aceita = p.ns === "##any" || (f.ns !== null && f.ns !== DS);
    return aceita ? [{ fim: i + 1, atribuicoes: [[f, p]] }] : [];
  }
  if (p.p === "choice") return p.itens.flatMap((x) => casar(x, filhos, i));
  let caminhos: Caminho[] = [{ fim: i, atribuicoes: [] }];
  for (const item of p.itens) {
    caminhos = caminhos.flatMap((c) => casar(item, filhos, c.fim).map((r) => ({ fim: r.fim, atribuicoes: [...c.atribuicoes, ...r.atribuicoes] })));
  }
  return caminhos;
}

function textoDireto(el: ElementoXml): string {
  return el.filhos.map((f) => (f.tipo === "texto" ? f.valor : "")).join("");
}

function validar(el: ElementoXml, tipo: Tipo, ids: Set<string>): void {
  const atributos = "atributos" in tipo ? (tipo.atributos ?? []) : [];
  for (const a of el.atributos) {
    if (a.ns === XSI) {
      if (a.local === "schemaLocation" || a.local === "noNamespaceSchemaLocation") continue;
      throw new Invalido();
    }
    const decl = a.ns === null ? atributos.find((d) => d.nome === a.local) : undefined;
    if (!decl) throw new Invalido();
    if (decl.tipo === "ID") {
      const v = colapsar(a.valor);
      if (!NCNAME.test(v) || ids.has(v)) throw new Invalido();
      ids.add(v);
    } else if (!decl.tipo(a.valor)) throw new Invalido();
  }
  for (const d of atributos) {
    if (d.obrigatorio && !el.atributos.some((a) => a.ns === null && a.local === d.nome)) throw new Invalido();
  }
  const filhos = filhosElemento(el);
  if ("simples" in tipo) {
    if (filhos.length) throw new Invalido();
    if (!tipo.simples(textoDireto(el))) throw new Invalido();
    return;
  }
  if (tipo.livre) return;
  if (!tipo.misto && [...textoDireto(el)].some((c) => !ESPACO.test(c))) throw new Invalido();
  if (tipo.conteudo === null) {
    if (filhos.length) throw new Invalido();
    return;
  }
  const caminho = casar(tipo.conteudo, filhos, 0).find((c) => c.fim === filhos.length);
  if (!caminho) throw new Invalido();
  for (const [filho, folha] of caminho.atribuicoes) {
    if (folha.p === "el") validar(filho, folha.tipo(), ids);
    else validarCuringa(filho, folha.estrito, ids);
  }
}

function validarCuringa(el: ElementoXml, estrito: boolean, ids: Set<string>): void {
  const decl = global(el);
  if (decl) return validar(el, decl.tipo(), ids);
  if (estrito) throw new Invalido();
  for (const f of filhosElemento(el)) validarCuringa(f, false, ids);
}

/** O `Signature` passa no esquema? (`schema.assertValid` do lxml, sem a mensagem.) */
export function assinaturaValidaPeloEsquema(assinatura: ElementoXml): boolean {
  if (assinatura.ns !== DS || assinatura.local !== "Signature") return false;
  try {
    validar(assinatura, T.Signature(), new Set());
    return true;
  } catch (e) {
    if (e instanceof Invalido) return false;
    throw e;
  }
}
