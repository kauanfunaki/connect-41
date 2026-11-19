// A conferência da assinatura XMLDSig da nota (Bloco C, Fase C1, 18/11/2026). Porte de
// `_validar_assinatura` (`src/domain/notas/xml_parser.py`) e do `XMLVerifier.verify` do `signxml` 5.2,
// que o original chama com o certificado do próprio documento, sem dependência nova: o parser é o de
// `xmlArvore.ts`, a canonicalização é a de `c14n.ts`, o esquema é o de `esquemaDsig.ts`, e a
// criptografia (certificado X.509, RSA PKCS#1 v1.5 e PSS, ECDSA, DSA, SHA-1/2/3) é a do `node:crypto`.
//
// O resultado é o mesmo do original: `null` quando a assinatura confere; senão o motivo, com a mesma
// frase — "documento sem assinatura XML", "a assinatura não referencia a identificação deste
// documento", "assinatura sem certificado X.509" ou "assinatura não confere (Tipo)", em que `Tipo` é o
// nome da exceção que o Python levantaria (`InvalidDigest`, `InvalidSignature`, `InvalidCertificate`,
// `InvalidInput`, `DocumentInvalid`...). O motivo vai para a coluna `assinatura_motivo`.
//
// Duas coisas do `signxml` 5.2 que o porte repete de propósito, e que valem saber:
// - o par RSA-SHA1 e SHA-1 que a NF-e exige é aceito, como no original (permissão aditiva);
// - a validade do certificado é conferida no instante da importação, não na emissão: certificado
//   vencido dá "assinatura não confere (InvalidCertificate)". A nota entra assim mesmo, marcada como
//   não verificada (o protocolo da SEFAZ é o que sustenta o documento).

import { createHash, createPublicKey, verify as verificar, X509Certificate, constants, type KeyObject } from "node:crypto";
import { strip } from "../extrato/py";
import { canonicalizar, ErroC14n, namespacesEmEscopo, type OpcoesC14n } from "./c14n";
import { assinaturaValidaPeloEsquema } from "./esquemaDsig";
import { atributoEt, filhosElemento, iterar, lerXml, textoEt, type ElementoXml, type NoXml } from "./xmlArvore";

const DS = "http://www.w3.org/2000/09/xmldsig#";
const DS11 = "http://www.w3.org/2009/xmldsig11#";
const EC = "http://www.w3.org/2001/10/xml-exc-c14n#";

/** Uma exceção do Python, pelo nome — é só o nome que chega ao motivo. */
class ErroPython extends Error {
  constructor(readonly tipo: string) {
    super(tipo);
  }
}
const falha = (tipo: string): never => {
  throw new ErroPython(tipo);
};

// ─── Algoritmos (as enumerações do `signxml.algorithms`) ───────────────────────

const C14N: Record<string, { exclusiva: boolean; comentarios: boolean }> = {
  "http://www.w3.org/TR/2001/REC-xml-c14n-20010315": { exclusiva: false, comentarios: false },
  "http://www.w3.org/TR/2001/REC-xml-c14n-20010315#WithComments": { exclusiva: false, comentarios: true },
  // A 1.1 vira a 1.0 inclusiva: é o `method="c14n"` do lxml.
  "http://www.w3.org/2006/12/xml-c14n11": { exclusiva: false, comentarios: false },
  "http://www.w3.org/2006/12/xml-c14n11#WithComments": { exclusiva: false, comentarios: true },
  "http://www.w3.org/2001/10/xml-exc-c14n#": { exclusiva: true, comentarios: false },
  "http://www.w3.org/2001/10/xml-exc-c14n#WithComments": { exclusiva: true, comentarios: true },
};

/** `DigestAlgorithm`: URI → hash do `node:crypto`. Todos aceitos (o SHA-1 pela permissão aditiva). */
const DIGEST: Record<string, string> = {
  "http://www.w3.org/2001/04/xmldsig-more#sha224": "sha224",
  "http://www.w3.org/2001/04/xmldsig-more#sha384": "sha384",
  "http://www.w3.org/2001/04/xmlenc#sha256": "sha256",
  "http://www.w3.org/2001/04/xmlenc#sha512": "sha512",
  "http://www.w3.org/2007/05/xmldsig-more#sha3-224": "sha3-224",
  "http://www.w3.org/2007/05/xmldsig-more#sha3-256": "sha3-256",
  "http://www.w3.org/2007/05/xmldsig-more#sha3-384": "sha3-384",
  "http://www.w3.org/2007/05/xmldsig-more#sha3-512": "sha3-512",
  "http://www.w3.org/2000/09/xmldsig#sha1": "sha1",
};

type Metodo = { nome: string; hash: string; permitido: boolean };
/** `SignatureMethod`: o nome do Python, o hash, e se a configuração do original aceita. */
const METODOS: Record<string, Metodo> = Object.fromEntries(
  (
    [
      ["http://www.w3.org/2001/04/xmldsig-more#rsa-sha256", "RSA_SHA256", "sha256"],
      ["http://www.w3.org/2001/04/xmldsig-more#rsa-sha224", "RSA_SHA224", "sha224"],
      ["http://www.w3.org/2001/04/xmldsig-more#rsa-sha384", "RSA_SHA384", "sha384"],
      ["http://www.w3.org/2001/04/xmldsig-more#rsa-sha512", "RSA_SHA512", "sha512"],
      ["http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha224", "ECDSA_SHA224", "sha224"],
      ["http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256", "ECDSA_SHA256", "sha256"],
      ["http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha384", "ECDSA_SHA384", "sha384"],
      ["http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha512", "ECDSA_SHA512", "sha512"],
      ["http://www.w3.org/2021/04/xmldsig-more#ecdsa-sha3-224", "ECDSA_SHA3_224", "sha3-224"],
      ["http://www.w3.org/2021/04/xmldsig-more#ecdsa-sha3-256", "ECDSA_SHA3_256", "sha3-256"],
      ["http://www.w3.org/2021/04/xmldsig-more#ecdsa-sha3-384", "ECDSA_SHA3_384", "sha3-384"],
      ["http://www.w3.org/2021/04/xmldsig-more#ecdsa-sha3-512", "ECDSA_SHA3_512", "sha3-512"],
      ["http://www.w3.org/2009/xmldsig11#dsa-sha256", "DSA_SHA256", "sha256"],
      ["http://www.w3.org/2001/04/xmldsig-more#hmac-sha224", "HMAC_SHA224", "sha224"],
      ["http://www.w3.org/2001/04/xmldsig-more#hmac-sha256", "HMAC_SHA256", "sha256"],
      ["http://www.w3.org/2001/04/xmldsig-more#hmac-sha384", "HMAC_SHA384", "sha384"],
      ["http://www.w3.org/2001/04/xmldsig-more#hmac-sha512", "HMAC_SHA512", "sha512"],
      ["http://www.w3.org/2007/05/xmldsig-more#sha3-224-rsa-MGF1", "SHA3_224_RSA_MGF1", "sha3-224"],
      ["http://www.w3.org/2007/05/xmldsig-more#sha3-256-rsa-MGF1", "SHA3_256_RSA_MGF1", "sha3-256"],
      ["http://www.w3.org/2007/05/xmldsig-more#sha3-384-rsa-MGF1", "SHA3_384_RSA_MGF1", "sha3-384"],
      ["http://www.w3.org/2007/05/xmldsig-more#sha3-512-rsa-MGF1", "SHA3_512_RSA_MGF1", "sha3-512"],
      ["http://www.w3.org/2007/05/xmldsig-more#sha224-rsa-MGF1", "SHA224_RSA_MGF1", "sha224"],
      ["http://www.w3.org/2007/05/xmldsig-more#sha256-rsa-MGF1", "SHA256_RSA_MGF1", "sha256"],
      ["http://www.w3.org/2007/05/xmldsig-more#sha384-rsa-MGF1", "SHA384_RSA_MGF1", "sha384"],
      ["http://www.w3.org/2007/05/xmldsig-more#sha512-rsa-MGF1", "SHA512_RSA_MGF1", "sha512"],
      ["http://www.w3.org/2000/09/xmldsig#dsa-sha1", "DSA_SHA1", "sha1"],
      ["http://www.w3.org/2000/09/xmldsig#hmac-sha1", "HMAC_SHA1", "sha1"],
      ["http://www.w3.org/2000/09/xmldsig#rsa-sha1", "RSA_SHA1", "sha1"],
      ["http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha1", "ECDSA_SHA1", "sha1"],
      ["http://www.w3.org/2007/05/xmldsig-more#sha1-rsa-MGF1", "SHA1_RSA_MGF1", "sha1"],
    ] as const
  ).map(([uri, nome, hash]) => [
    uri,
    // O padrão do `signxml` 5 tira tudo que tem SHA1 no nome; o original devolve só o RSA_SHA1.
    { nome, hash, permitido: !nome.includes("SHA1") || nome === "RSA_SHA1" },
  ]),
);

const ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
const BASE64_TRANSFORM = "http://www.w3.org/2000/09/xmldsig#base64";

/** As curvas que o `signxml` conhece (`known_ecdsa_curves`), pelo OID, com o nome do `node:crypto`. */
const CURVAS: Record<string, string> = {
  "urn:oid:1.2.840.10045.3.1.7": "prime256v1",
  "urn:oid:1.3.132.0.34": "secp384r1",
  "urn:oid:1.3.132.0.35": "secp521r1",
  "urn:oid:1.2.840.10045.3.1.1": "prime192v1",
  "urn:oid:1.3.132.0.33": "secp224r1",
};

/** `\s` do `re` do Python (os espaços de `str.isspace()`); o do JavaScript difere (tem U+FEFF, não tem U+001C a U+001F e U+0085). */
const ESPACOS_PYTHON = /[\t\n\v\f\r\x1c-\x1f \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/g;

// ─── Base64 do Python ──────────────────────────────────────────────────────────

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * `binascii.a2b_base64` (o `b64decode`): no modo estrito (`validate=True`), qualquer coisa fora do
 * alfabeto ou preenchimento fora do lugar é `binascii.Error`; no frouxo, o que não é do alfabeto é
 * ignorado e o primeiro preenchimento completo encerra.
 */
export function b64decodePython(texto: string, estrito: boolean): Uint8Array {
  if ([...texto].some((c) => c.charCodeAt(0) > 0x7f)) falha("ValueError");
  const saida: number[] = [];
  let quad = 0;
  let resto = 0;
  let pads = 0;
  let preenchendo = false;
  if (estrito && texto[0] === "=") falha("Error");
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === "=") {
      preenchendo = true;
      if (estrito && quad === 0) falha("Error");
      if (quad >= 2 && quad + ++pads >= 4) {
        if (estrito && i + 1 < texto.length) falha("Error");
        return new Uint8Array(saida);
      }
      continue;
    }
    const v = ALFABETO.indexOf(c);
    if (v < 0) {
      if (estrito) falha("Error");
      continue;
    }
    if (estrito && preenchendo) falha("Error");
    pads = 0;
    if (quad === 0) {
      resto = v;
      quad = 1;
    } else if (quad === 1) {
      saida.push(((resto << 2) | (v >> 4)) & 0xff);
      resto = v & 0x0f;
      quad = 2;
    } else if (quad === 2) {
      saida.push(((resto << 4) | (v >> 2)) & 0xff);
      resto = v & 0x03;
      quad = 3;
    } else {
      saida.push(((resto << 6) | v) & 0xff);
      quad = 0;
    }
  }
  if (quad !== 0) falha("Error");
  return new Uint8Array(saida);
}

// ─── A árvore como o lxml a vê ─────────────────────────────────────────────────

function porTagLocal(raiz: ElementoXml, tag: string): ElementoXml | null {
  for (const el of iterar(raiz)) if (el.local === tag) return el;
  return null;
}

/** `_find(el, "Nome")`: o filho direto `ds:Nome` (ou de outro namespace). */
function filho(el: ElementoXml, nome: string, ns = DS): ElementoXml | null {
  return filhosElemento(el).find((f) => f.ns === ns && f.local === nome) ?? null;
}
function exigir(el: ElementoXml | null, nome: string, ns = DS): ElementoXml {
  const f = el ? filho(el, nome, ns) : null;
  if (!f) falha("InvalidInput");
  return f!;
}

/** `.text` do lxml: `None` quando não há texto antes do primeiro filho. */
function texto(el: ElementoXml): string | null {
  return textoEt(el);
}

/**
 * O `etree.fromstring(etree.tostring(no))` que o `signxml` faz para copiar um nó: o `tostring` leva o
 * texto que vem depois do elemento (a "cauda"), e texto que não seja espaço ali não é XML que se leia.
 */
function copiar(el: ElementoXml): void {
  const irmaos = el.pai?.filhos;
  if (!irmaos) return;
  const depois = irmaos[irmaos.indexOf(el) + 1];
  if (depois && depois.tipo === "texto" && /[^ \t\r\n]/.test(depois.valor)) falha("XMLSyntaxError");
}

function c14n(el: ElementoXml, algoritmo: string, prefixos: string[] | null, ignorar?: Set<NoXml>, raizFalsa = false): Uint8Array {
  const opcoes: OpcoesC14n = { ...C14N[algoritmo], prefixosInclusivos: prefixos, ignorar, raizFalsa };
  try {
    return canonicalizar(el, opcoes);
  } catch (e) {
    if (e instanceof ErroC14n) falha("C14NError");
    throw e;
  }
}

/** `_get_inclusive_ns_prefixes`: `ec:InclusiveNamespaces[@PrefixList]` do nó. */
function prefixosInclusivos(no: ElementoXml): string[] | null {
  const inc = filhosElemento(no).find((f) => f.ns === EC && f.local === "InclusiveNamespaces" && atributoEt(f, "PrefixList") !== null);
  return inc ? atributoEt(inc, "PrefixList")!.split(" ") : null;
}

/** `_get_signature`: a raiz, se for `ds:Signature`, ou o primeiro `ds:Signature` descendente. */
function assinaturaDoDocumento(raiz: ElementoXml): ElementoXml | null {
  if (raiz.ns === DS && raiz.local === "Signature") return raiz;
  for (const el of iterar(raiz)) if (el !== raiz && el.ns === DS && el.local === "Signature") return el;
  return null;
}

/** `_resolve_reference`: o elemento com `Id` (depois `ID`, `id`) igual à URI, de qualquer namespace. */
function resolverReferencia(raiz: ElementoXml, uri: string | null): ElementoXml {
  if (uri === null) falha("InvalidInput");
  if (uri === "") return raiz;
  if (uri!.startsWith("#xpointer(")) falha("InvalidInput");
  if (!uri!.startsWith("#")) falha("InvalidInput");
  const alvo = uri!.replace(/^#+/, "");
  for (const nomeId of ["Id", "ID", "id", "xml:id"]) {
    const achados = [...iterar(raiz)].filter((el) => el.atributos.some((a) => a.local === nomeId && a.valor === alvo));
    if (achados.length > 1) falha("InvalidInput");
    if (achados.length === 1) return achados[0];
  }
  return falha("InvalidInput");
}

// ─── Chaves ────────────────────────────────────────────────────────────────────

function inteiroDeBase64(el: ElementoXml | null): bigint {
  if (!el) return falha("InvalidInput");
  const t = texto(el);
  if (t === null) falha("TypeError");
  const b = b64decodePython(t!, false);
  return b.length ? BigInt("0x" + Buffer.from(b).toString("hex")) : BigInt(0);
}

function bigintDeJwk(v: string | undefined): bigint {
  const b = Buffer.from(v ?? "", "base64url");
  return b.length ? BigInt("0x" + b.toString("hex")) : BigInt(0);
}

/** `_check_key_value_matches_cert_public_key`. */
function keyValueConfere(keyValue: ElementoXml, chave: KeyObject, metodo: string): boolean {
  const tipo = chave.asymmetricKeyType;
  const jwk = chave.export({ format: "jwk" }) as Record<string, string>;
  if (metodo.startsWith("ECDSA_") && tipo === "ec") {
    const ecKv = exigir(keyValue, "ECKeyValue", DS11);
    const curva = exigir(ecKv, "NamedCurve", DS11);
    const pub = exigir(ecKv, "PublicKey", DS11);
    const dados = b64decodePython(texto(pub) ?? falha("TypeError"), false).subarray(1);
    const metade = Math.floor(dados.length / 2);
    const x = dados.length ? BigInt("0x" + (Buffer.from(dados.subarray(0, metade)).toString("hex") || "0")) : BigInt(0);
    const y = BigInt("0x" + (Buffer.from(dados.subarray(metade)).toString("hex") || "0"));
    const uri = atributoEt(curva, "URI");
    if (uri === null) return false;
    const nome = CURVAS[uri];
    if (!nome) falha("KeyError");
    return chave.asymmetricKeyDetails?.namedCurve === nome && x === bigintDeJwk(jwk.x) && y === bigintDeJwk(jwk.y);
  }
  if (metodo.startsWith("DSA_") && tipo === "dsa") {
    const dsa = exigir(keyValue, "DSAKeyValue");
    const p = inteiroDeBase64(filho(dsa, "P"));
    const q = inteiroDeBase64(filho(dsa, "Q"));
    const g = filho(dsa, "G") ? inteiroDeBase64(filho(dsa, "G")) : null;
    return p === bigintDeJwk(jwk.p) && q === bigintDeJwk(jwk.q) && g === bigintDeJwk(jwk.g);
  }
  if (metodo.startsWith("RSA_") && tipo === "rsa") {
    const rsa = exigir(keyValue, "RSAKeyValue");
    return inteiroDeBase64(filho(rsa, "Modulus")) === bigintDeJwk(jwk.n) && inteiroDeBase64(filho(rsa, "Exponent")) === bigintDeJwk(jwk.e);
  }
  return falha("NotImplementedError");
}

/** `_check_der_key_value_matches_cert_public_key`. */
function derKeyValueConfere(der: ElementoXml, chave: KeyObject, metodo: string): boolean {
  let outra: KeyObject;
  try {
    outra = createPublicKey({ key: Buffer.from(b64decodePython(texto(der) ?? falha("TypeError"), false)), format: "der", type: "spki" });
  } catch (e) {
    if (e instanceof ErroPython) throw e;
    return falha("ValueError");
  }
  const a = outra.export({ format: "jwk" }) as Record<string, string>;
  const b = chave.export({ format: "jwk" }) as Record<string, string>;
  const tipos = [outra.asymmetricKeyType, chave.asymmetricKeyType];
  if (metodo.startsWith("ECDSA_") && tipos.every((t) => t === "ec")) return a.crv === b.crv && a.x === b.x && a.y === b.y;
  if (metodo.startsWith("DSA_") && tipos.every((t) => t === "dsa")) return a.p === b.p && a.q === b.q && a.g === b.g;
  if (metodo.startsWith("RSA_") && tipos.every((t) => t === "rsa")) return a.n === b.n && a.e === b.e;
  return falha("NotImplementedError");
}

/** `_verify_signature_with_pubkey` com a chave do certificado. */
function conferirComChave(dados: Uint8Array, assinatura: Uint8Array, metodo: Metodo, chave: KeyObject): void {
  const tipo = chave.asymmetricKeyType;
  let ok = false;
  try {
    if (metodo.nome.startsWith("ECDSA_")) {
      if (tipo !== "ec") falha("InvalidInput");
      const bits = { prime256v1: 256, secp384r1: 384, secp521r1: 521, prime192v1: 192, secp224r1: 224, secp256k1: 256 }[
        chave.asymmetricKeyDetails?.namedCurve ?? ""
      ];
      if (!bits || assinatura.length !== Math.ceil(bits / 8) * 2) falha("InvalidSignature");
      ok = verificar(metodo.hash, dados, { key: chave, dsaEncoding: "ieee-p1363" }, assinatura);
    } else if (metodo.nome.startsWith("DSA_")) {
      if (tipo !== "dsa") falha("InvalidInput");
      ok = verificar(metodo.hash, dados, { key: chave, dsaEncoding: "ieee-p1363" }, assinatura);
    } else if (metodo.nome.startsWith("RSA_") || metodo.nome.startsWith("SHA")) {
      if (tipo !== "rsa") falha("InvalidInput");
      const padding = metodo.nome.startsWith("RSA_")
        ? { padding: constants.RSA_PKCS1_PADDING }
        : { padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: createHash(metodo.hash).digest().length };
      ok = verificar(metodo.hash, dados, { key: chave, ...padding }, assinatura);
    } else {
      falha("InvalidInput");
    }
  } catch (e) {
    if (e instanceof ErroPython) throw e;
    ok = false;
  }
  if (!ok) falha("InvalidSignature");
}

// ─── O `XMLVerifier.verify` ────────────────────────────────────────────────────

function verificarComSignxml(raiz: ElementoXml, certificado: X509Certificate, agora: Date): void {
  const refAssinatura = assinaturaDoDocumento(raiz);
  if (!refAssinatura) falha("InvalidInput");
  const assinatura = refAssinatura!;
  copiar(assinatura);
  if (!assinaturaValidaPeloEsquema(assinatura)) falha("DocumentInvalid");

  const signedInfo = exigir(assinatura, "SignedInfo");
  const metodoC14n = exigir(signedInfo, "CanonicalizationMethod");
  const algC14n = atributoEt(metodoC14n, "Algorithm");
  if (algC14n === null || !(algC14n in C14N)) falha("InvalidInput");
  const prefixos = prefixosInclusivos(metodoC14n);
  const signatureMethod = exigir(signedInfo, "SignatureMethod");
  const signatureValue = exigir(assinatura, "SignatureValue");
  const metodo = METODOS[atributoEt(signatureMethod, "Algorithm") ?? ""];
  if (!metodo || !metodo.permitido) falha("InvalidInput");
  const textoAssinatura = texto(signatureValue);
  if (textoAssinatura === null) falha("TypeError");
  const valorAssinatura = b64decodePython(textoAssinatura!, false);
  const keyInfo = filho(assinatura, "KeyInfo");
  const keyValue = keyInfo ? filho(keyInfo, "KeyValue") : null;
  const derKeyValue = keyInfo ? filho(keyInfo, "DEREncodedKeyValue", DS11) : null;
  // O `SignedInfo` não é a raiz do documento copiado: o lxml o canonicaliza numa raiz falsa.
  const signedInfoC14n = c14n(signedInfo, algC14n!, prefixos, undefined, true);

  // Certificado fornecido (`x509_cert`): vale a validade no instante da conferência.
  const validade = certificado as unknown as { validFromDate?: Date; validToDate?: Date };
  const de = validade.validFromDate ?? new Date(certificado.validFrom);
  const ate = validade.validToDate ?? new Date(certificado.validTo);
  if (agora < de || agora > ate) falha("InvalidCertificate");
  conferirComChave(signedInfoC14n, valorAssinatura, metodo, certificado.publicKey);
  if (keyValue && !keyValueConfere(keyValue, certificado.publicKey, metodo.nome)) falha("InvalidInput");
  if (derKeyValue && !derKeyValueConfere(derKeyValue, certificado.publicKey, metodo.nome)) falha("InvalidInput");

  // As referências saem do `SignedInfo` canonicalizado e relido (`verified_signed_info`), não do
  // documento. Com a assinatura no namespace padrão, a raiz falsa deixa `xmlns=""` nos filhos de
  // `Reference`, e o `signxml` não acha mais o `DigestMethod` (InvalidInput) — é o que acontece com a
  // NF-e, que declara `<Signature xmlns="...xmldsig#">`.
  const verificado = lerXml(signedInfoC14n);
  const referencias = filhosElemento(verificado).filter((f) => f.ns === DS && f.local === "Reference");
  for (const referencia of referencias) conferirReferencia(raiz, assinatura, referencia);
  if (referencias.length !== 1) falha("InvalidSignature");
}

/** `_verify_reference` com `_apply_transforms`. */
function conferirReferencia(raiz: ElementoXml, assinatura: ElementoXml, referencia: ElementoXml): void {
  const transforms = filho(referencia, "Transforms");
  const algDigest = atributoEt(exigir(referencia, "DigestMethod"), "Algorithm");
  const digestValue = exigir(referencia, "DigestValue");
  const alvo = resolverReferencia(raiz, atributoEt(referencia, "URI"));

  const lista = transforms ? filhosElemento(transforms).filter((f) => f.ns === DS && f.local === "Transform") : [];
  const ignorar = new Set<NoXml>();
  // A enveloped tira a assinatura do documento copiado (se ela não for a raiz).
  if (lista.some((t) => atributoEt(t, "Algorithm") === ENVELOPED) && assinatura.pai) ignorar.add(assinatura);

  let carga: ElementoXml | Uint8Array = alvo;
  for (const t of lista) {
    if (atributoEt(t, "Algorithm") !== BASE64_TRANSFORM) continue;
    if (!(carga instanceof Uint8Array)) {
      const t2 = texto(carga);
      if (t2 === null) falha("TypeError");
      carga = b64decodePython(t2!, false);
    } else falha("AttributeError");
  }
  let canonicalizado = false;
  for (const t of lista) {
    const alg = atributoEt(t, "Algorithm");
    if (alg === null || !(alg in C14N)) continue;
    if (carga instanceof Uint8Array) falha("TypeError");
    copiar(carga as ElementoXml);
    carga = c14n(carga as ElementoXml, alg, prefixosInclusivos(t), ignorar);
    canonicalizado = true;
  }
  if (!canonicalizado && !(carga instanceof Uint8Array)) {
    copiar(carga);
    carga = c14n(carga, "http://www.w3.org/2006/12/xml-c14n11", null, ignorar);
  }

  const hash = DIGEST[algDigest ?? ""];
  if (!hash) falha("InvalidInput");
  const esperado = b64decodePython(texto(digestValue) ?? falha("TypeError"), false);
  const obtido = createHash(hash).update(carga as Uint8Array).digest();
  if (!Buffer.from(esperado).equals(obtido)) falha("InvalidDigest");
}

/**
 * `_validar_assinatura`: `null` se a assinatura confere, ou o motivo de não conferir.
 *
 * `agora` é o instante da conferência da validade do certificado (padrão: o relógio).
 */
export function conferirAssinatura(conteudo: Uint8Array, raiz: ElementoXml, referencia: string, agora: Date = new Date()): string | null {
  void conteudo; // o lxml relê os mesmos bytes; a árvore de `xmlArvore.ts` é a mesma
  const assinatura = porTagLocal(raiz, "Signature");
  if (!assinatura) return "documento sem assinatura XML";

  const ref = porTagLocal(assinatura, "Reference");
  if (!ref || atributoEt(ref, "URI") !== `#${referencia}`) return "a assinatura não referencia a identificação deste documento";

  const elCert = porTagLocal(assinatura, "X509Certificate");
  const textoCert = elCert ? textoEt(elCert) : null;
  const cert = textoCert === null ? null : strip(textoCert) || null;
  if (!cert) return "assinatura sem certificado X.509";

  try {
    // `re.sub(r"\s+", "", ...)`: os espaços do `str.isspace()` do Python (o `\s` do JavaScript difere).
    const der = b64decodePython(cert.replace(ESPACOS_PYTHON, ""), true);
    let certificado: X509Certificate;
    try {
      certificado = new X509Certificate(Buffer.from(der));
    } catch {
      return falha("ValueError");
    }
    // O `cryptography` só aceita DER exato; o OpenSSL aceita sobra no fim e codificação frouxa.
    if (!certificado.raw.equals(Buffer.from(der))) falha("ValueError");
    verificarComSignxml(raiz, certificado, agora);
  } catch (e) {
    if (e instanceof ErroPython) return `assinatura não confere (${e.tipo})`;
    throw e;
  }
  return null;
}

/** Para os testes: os namespaces em escopo (a cópia do lxml leva todos para o elemento copiado). */
export const _paraTestes = { namespacesEmEscopo, b64decodePython };
