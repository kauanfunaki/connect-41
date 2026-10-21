// O e-CNPJ A1 em formato antigo, convertido para o moderno (20/10/2026).
//
// O A1 exportado por AC ou pelo Windows antigo cifra os certificados com RC2
// de 40 bits (pbeWithSHA1And40BitRC2-CBC). O OpenSSL 3, que é o do Node 22 do
// Dockerfile, só tem o RC2 no provider "legacy", que o Node não carrega: o
// .pfx falha com "Unsupported PKCS12 PFX data" antes de qualquer chamada ao
// Serpro. Aqui o arquivo é aberto à mão (o RC2 é uma cifra pequena) e
// reembalado como o próprio OpenSSL 3 exporta: chave em PBES2 com AES-256-CBC
// e MAC em HMAC-SHA256. Chave e certificado são os mesmos; só muda a
// embalagem, e a chave nunca sai do processo.
//
// Referências: RFC 7292 (PKCS #12, com o KDF do apêndice B) e RFC 2268 (RC2).
// Sem biblioteca nova: DER, KDF e RC2 cabem em poucas linhas, e o resto (3DES,
// AES, PBKDF2, HMAC) é o `node:crypto`.

import { createDecipheriv, createHash, createHmac, createPrivateKey, pbkdf2Sync, randomBytes } from "node:crypto";

class ErroDeFormato extends Error {}

// ─── DER ─────────────────────────────────────────────────────────────────────

export type NoDer = { tag: number; conteudo: Buffer; bruto: Buffer; filhos: NoDer[] | null };

function lerNo(buf: Buffer, pos: number): { no: NoDer; fim: number } {
  if (pos + 2 > buf.length) throw new ErroDeFormato();
  const tag = buf[pos];
  if ((tag & 0x1f) === 0x1f) throw new ErroDeFormato();
  const construido = (tag & 0x20) !== 0;
  let p = pos + 1;
  let tamanho = buf[p++];
  if (tamanho === 0x80) {
    // Tamanho indefinido (BER, de exportadores antigos): os filhos vão até o 00 00.
    if (!construido) throw new ErroDeFormato();
    const inicio = p;
    const filhos: NoDer[] = [];
    for (;;) {
      if (p + 2 > buf.length) throw new ErroDeFormato();
      if (buf[p] === 0 && buf[p + 1] === 0) break;
      const f = lerNo(buf, p);
      filhos.push(f.no);
      p = f.fim;
    }
    return { no: { tag, conteudo: buf.subarray(inicio, p), bruto: buf.subarray(pos, p + 2), filhos }, fim: p + 2 };
  }
  if (tamanho & 0x80) {
    const n = tamanho & 0x7f;
    if (n === 0 || n > 4 || p + n > buf.length) throw new ErroDeFormato();
    tamanho = 0;
    for (let i = 0; i < n; i++) tamanho = tamanho * 256 + buf[p++];
  }
  const fim = p + tamanho;
  if (fim > buf.length) throw new ErroDeFormato();
  const conteudo = buf.subarray(p, fim);
  return { no: { tag, conteudo, bruto: buf.subarray(pos, fim), filhos: construido ? lerFilhos(conteudo) : null }, fim };
}

function lerFilhos(conteudo: Buffer): NoDer[] {
  const filhos: NoDer[] = [];
  for (let p = 0; p < conteudo.length; ) {
    const f = lerNo(conteudo, p);
    filhos.push(f.no);
    p = f.fim;
  }
  return filhos;
}

export function lerDer(buf: Buffer): NoDer {
  return lerNo(buf, 0).no;
}

function filhosDe(no: NoDer | undefined): NoDer[] {
  if (!no?.filhos) throw new ErroDeFormato();
  return no.filhos;
}

/** O conteúdo de um OCTET STRING, inclusive o "construído" do BER (pedaços em sequência). */
function octetos(no: NoDer | undefined): Buffer {
  if (!no) throw new ErroDeFormato();
  return no.filhos ? Buffer.concat(no.filhos.map(octetos)) : no.conteudo;
}

function oid(no: NoDer | undefined): string {
  if (!no || no.tag !== 0x06 || no.conteudo.length === 0) throw new ErroDeFormato();
  const arcos: number[] = [];
  let v = 0;
  for (const b of no.conteudo) {
    v = v * 128 + (b & 0x7f);
    if (!(b & 0x80)) {
      arcos.push(v);
      v = 0;
    }
  }
  const [primeiro, ...resto] = arcos;
  const a = primeiro < 80 ? Math.floor(primeiro / 40) : 2;
  return [a, primeiro - a * 40, ...resto].join(".");
}

function inteiro(no: NoDer | undefined): number {
  if (!no || no.tag !== 0x02) throw new ErroDeFormato();
  let v = 0;
  for (const b of no.conteudo) v = v * 256 + b;
  return v;
}

export function tlv(tag: number, conteudo: Buffer): Buffer {
  const n = conteudo.length;
  if (n < 0x80) return Buffer.concat([Buffer.from([tag, n]), conteudo]);
  const bytes: number[] = [];
  for (let x = n; x > 0; x = Math.floor(x / 256)) bytes.unshift(x & 0xff);
  return Buffer.concat([Buffer.from([tag, 0x80 | bytes.length, ...bytes]), conteudo]);
}

/** O mínimo de DER para montar um PKCS #12. */
export const der = {
  sequencia: (...itens: Buffer[]) => tlv(0x30, Buffer.concat(itens)),
  conjunto: (...itens: Buffer[]) => tlv(0x31, Buffer.concat(itens)),
  octetos: (b: Buffer) => tlv(0x04, b),
  nulo: () => Buffer.from([0x05, 0x00]),
  explicito: (n: number, conteudo: Buffer) => tlv(0xa0 | n, conteudo),
  implicito: (n: number, conteudo: Buffer) => tlv(0x80 | n, conteudo),
  inteiro: (n: number) => {
    const bytes: number[] = [];
    for (let x = n; x > 0; x = Math.floor(x / 256)) bytes.unshift(x & 0xff);
    if (bytes.length === 0 || bytes[0] & 0x80) bytes.unshift(0);
    return tlv(0x02, Buffer.from(bytes));
  },
  oid: (texto: string) => {
    const [a, b, ...resto] = texto.split(".").map(Number);
    const bytes: number[] = [];
    for (const arco of [a * 40 + b, ...resto]) {
      const parte = [arco & 0x7f];
      for (let x = Math.floor(arco / 128); x > 0; x = Math.floor(x / 128)) parte.unshift((x & 0x7f) | 0x80);
      bytes.push(...parte);
    }
    return tlv(0x06, Buffer.from(bytes));
  },
};

export const OID = {
  data: "1.2.840.113549.1.7.1",
  encryptedData: "1.2.840.113549.1.7.6",
  keyBag: "1.2.840.113549.1.12.10.1.1",
  pkcs8ShroudedKeyBag: "1.2.840.113549.1.12.10.1.2",
  certBag: "1.2.840.113549.1.12.10.1.3",
  safeContentsBag: "1.2.840.113549.1.12.10.1.6",
  x509Certificate: "1.2.840.113549.1.9.22.1",
  localKeyId: "1.2.840.113549.1.9.21",
  pbeSha1Rc2de40: "1.2.840.113549.1.12.1.6",
  pbeSha1TripleDes: "1.2.840.113549.1.12.1.3",
  pbes2: "1.2.840.113549.1.5.13",
  pbkdf2: "1.2.840.113549.1.5.12",
  sha1: "1.3.14.3.2.26",
  sha256: "2.16.840.1.101.3.4.2.1",
} as const;

// ─── KDF do PKCS #12 (RFC 7292, apêndice B) ──────────────────────────────────

const BLOCO_DO_HASH: Record<string, number> = { sha1: 64, sha224: 64, sha256: 64, sha384: 128, sha512: 128 };

/** A senha como o PKCS #12 a usa: BMPString (UTF-16 big-endian) com o 00 00 do fim. */
export function senhaBmp(senha: string): Buffer {
  return Buffer.from(`${senha}\0`, "utf16le").swap16();
}

/** id 1 = chave, 2 = vetor inicial, 3 = chave do MAC. */
export function derivarPkcs12(hash: string, senha: Buffer, sal: Buffer, id: 1 | 2 | 3, iteracoes: number, tamanho: number): Buffer {
  const v = BLOCO_DO_HASH[hash];
  if (!v) throw new ErroDeFormato();
  const repetir = (b: Buffer, ate: number) => {
    const r = Buffer.alloc(ate);
    for (let i = 0; i < ate; i++) r[i] = b[i % b.length];
    return r;
  };
  const D = Buffer.alloc(v, id);
  const I = Buffer.concat([
    sal.length ? repetir(sal, v * Math.ceil(sal.length / v)) : Buffer.alloc(0),
    senha.length ? repetir(senha, v * Math.ceil(senha.length / v)) : Buffer.alloc(0),
  ]);
  const saida: Buffer[] = [];
  for (let total = 0; ; ) {
    let A = createHash(hash).update(D).update(I).digest();
    for (let i = 1; i < iteracoes; i++) A = createHash(hash).update(A).digest();
    saida.push(A);
    total += A.length;
    if (total >= tamanho) break;
    // Cada bloco de I vira (I + B + 1) mod 2^(8v), com B = A repetido até v bytes.
    const B = repetir(A, v);
    for (let j = 0; j < I.length; j += v) {
      let vaiUm = 1;
      for (let k = v - 1; k >= 0; k--) {
        const s = I[j + k] + B[k] + vaiUm;
        I[j + k] = s & 0xff;
        vaiUm = s >> 8;
      }
    }
  }
  return Buffer.concat(saida).subarray(0, tamanho);
}

// ─── RC2 (RFC 2268) ──────────────────────────────────────────────────────────

/** A permutação "PITABLE" da RFC 2268, 16 bytes por linha. */
const PITABLE = Buffer.from(
  [
    "d9 78 f9 c4 19 dd b5 ed 28 e9 fd 79 4a a0 d8 9d",
    "c6 7e 37 83 2b 76 53 8e 62 4c 64 88 44 8b fb a2",
    "17 9a 59 f5 87 b3 4f 13 61 45 6d 8d 09 81 7d 32",
    "bd 8f 40 eb 86 b7 7b 0b f0 95 21 22 5c 6b 4e 82",
    "54 d6 65 93 ce 60 b2 1c 73 56 c0 14 a7 8c f1 dc",
    "12 75 ca 1f 3b be e4 d1 42 3d d4 30 a3 3c b6 26",
    "6f bf 0e da 46 69 07 57 27 f2 1d 9b bc 94 43 03",
    "f8 11 c7 f6 90 ef 3e e7 06 c3 d5 2f c8 66 1e d7",
    "08 e8 ea de 80 52 ee f7 84 aa 72 ac 35 4d 6a 2a",
    "96 1a d2 71 5a 15 49 74 4b 9f d0 5e 04 18 a4 ec",
    "c2 e0 41 6e 0f 51 cb cc 24 91 af 50 a1 f4 70 39",
    "99 7c 3a 85 23 b8 b4 7a fc 02 36 5b 25 55 97 31",
    "2d 5d fa 98 e3 8a 92 ae 05 df 29 10 67 6c ba c9",
    "d3 00 e6 cf e1 9e a8 2c 63 16 01 3f 58 e2 89 a9",
    "0d 38 34 1b ab 33 ff b0 bb 48 0c 5f b9 b1 cd 2e",
    "c5 f3 db 47 e5 a5 9c 77 0a a6 20 68 fe 7f c1 ad",
  ]
    .join("")
    .replace(/ /g, ""),
  "hex"
);

function expandirChaveRc2(chave: Buffer, bitsEfetivos: number): Uint16Array {
  const L = Buffer.alloc(128);
  chave.copy(L);
  const T = chave.length;
  for (let i = T; i < 128; i++) L[i] = PITABLE[(L[i - 1] + L[i - T]) & 0xff];
  const T8 = (bitsEfetivos + 7) >> 3;
  const TM = 0xff >> (8 * T8 - bitsEfetivos);
  L[128 - T8] = PITABLE[L[128 - T8] & TM];
  for (let i = 127 - T8; i >= 0; i--) L[i] = PITABLE[L[i + 1] ^ L[i + T8]];
  const K = new Uint16Array(64);
  for (let i = 0; i < 64; i++) K[i] = L[2 * i] | (L[2 * i + 1] << 8);
  return K;
}

const GIROS = [1, 2, 3, 5];

/** Um bloco de 8 bytes do RC2, sem modo: é o que os vetores da RFC 2268 conferem. */
export function blocoRc2(modo: "cifrar" | "decifrar", chave: Buffer, bitsEfetivos: number, bloco: Buffer): Buffer {
  return rc2Bloco(modo, expandirChaveRc2(chave, bitsEfetivos), bloco);
}

function rc2Bloco(modo: "cifrar" | "decifrar", K: Uint16Array, bloco: Buffer): Buffer {
  const R = [bloco.readUInt16LE(0), bloco.readUInt16LE(2), bloco.readUInt16LE(4), bloco.readUInt16LE(6)];
  // R[i-1], R[i-2] e R[i-3], em volta dos quatro.
  const a = (i: number) => R[(i + 3) % 4];
  const b = (i: number) => R[(i + 2) % 4];
  const c = (i: number) => R[(i + 1) % 4];
  let j = modo === "cifrar" ? 0 : 63;
  const mistura = () => {
    for (let i = 0; i < 4; i++) {
      R[i] = (R[i] + K[j++] + (a(i) & b(i)) + (~a(i) & c(i))) & 0xffff;
      R[i] = ((R[i] << GIROS[i]) | (R[i] >> (16 - GIROS[i]))) & 0xffff;
    }
  };
  const amassa = () => {
    for (let i = 0; i < 4; i++) R[i] = (R[i] + K[a(i) & 63]) & 0xffff;
  };
  const desmistura = () => {
    for (let i = 3; i >= 0; i--) {
      R[i] = ((R[i] >> GIROS[i]) | (R[i] << (16 - GIROS[i]))) & 0xffff;
      R[i] = (R[i] - K[j--] - (a(i) & b(i)) - (~a(i) & c(i))) & 0xffff;
    }
  };
  const desamassa = () => {
    for (let i = 3; i >= 0; i--) R[i] = (R[i] - K[a(i) & 63]) & 0xffff;
  };
  const [rodada, meio] = modo === "cifrar" ? [mistura, amassa] : [desmistura, desamassa];
  for (const n of [5, 0, 6, 0, 5]) {
    if (n === 0) meio();
    else for (let k = 0; k < n; k++) rodada();
  }
  const saida = Buffer.alloc(8);
  R.forEach((r, i) => saida.writeUInt16LE(r, i * 2));
  return saida;
}

/** RC2 em CBC com o preenchimento do PKCS #5 — o "cifrar" é só para os testes montarem um .pfx antigo. */
export function rc2Cbc(modo: "cifrar" | "decifrar", chave: Buffer, bitsEfetivos: number, iv: Buffer, dados: Buffer): Buffer {
  const K = expandirChaveRc2(chave, bitsEfetivos);
  const xor = (x: Buffer, y: Buffer) => Buffer.from(x.map((v, i) => v ^ y[i]));
  const partes: Buffer[] = [];
  let anterior = iv;
  if (modo === "cifrar") {
    const n = 8 - (dados.length % 8);
    const cheio = Buffer.concat([dados, Buffer.alloc(n, n)]);
    for (let p = 0; p < cheio.length; p += 8) {
      anterior = rc2Bloco("cifrar", K, xor(cheio.subarray(p, p + 8), anterior));
      partes.push(anterior);
    }
    return Buffer.concat(partes);
  }
  if (dados.length === 0 || dados.length % 8) throw new ErroDeFormato();
  for (let p = 0; p < dados.length; p += 8) {
    const bloco = dados.subarray(p, p + 8);
    partes.push(xor(rc2Bloco("decifrar", K, bloco), anterior));
    anterior = bloco;
  }
  const claro = Buffer.concat(partes);
  const n = claro[claro.length - 1];
  if (n < 1 || n > 8 || claro.subarray(claro.length - n).some((x) => x !== n)) throw new ErroDeFormato();
  return claro.subarray(0, claro.length - n);
}

function rc4(chave: Buffer, dados: Buffer): Buffer {
  const S = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + S[i] + chave[i % chave.length]) & 0xff;
    [S[i], S[j]] = [S[j], S[i]];
  }
  const saida = Buffer.alloc(dados.length);
  for (let k = 0, i = 0, j = 0; k < dados.length; k++) {
    i = (i + 1) & 0xff;
    j = (j + S[i]) & 0xff;
    [S[i], S[j]] = [S[j], S[i]];
    saida[k] = dados[k] ^ S[(S[i] + S[j]) & 0xff];
  }
  return saida;
}

// ─── Decifrar o que o .pfx traz ──────────────────────────────────────────────

/** As cifras de senha do próprio PKCS #12. O 3DES está no OpenSSL 3; RC2 e RC4, não. */
const PBE_DO_PKCS12: Record<string, { cifra: "rc2" | "rc4" | "des-ede3-cbc" | "des-ede-cbc"; chave: number; bits?: number }> = {
  "1.2.840.113549.1.12.1.1": { cifra: "rc4", chave: 16 },
  "1.2.840.113549.1.12.1.2": { cifra: "rc4", chave: 5 },
  "1.2.840.113549.1.12.1.3": { cifra: "des-ede3-cbc", chave: 24 },
  "1.2.840.113549.1.12.1.4": { cifra: "des-ede-cbc", chave: 16 },
  "1.2.840.113549.1.12.1.5": { cifra: "rc2", chave: 16, bits: 128 },
  "1.2.840.113549.1.12.1.6": { cifra: "rc2", chave: 5, bits: 40 },
};

const PRF_DO_PBKDF2: Record<string, string> = {
  "1.2.840.113549.2.7": "sha1",
  "1.2.840.113549.2.8": "sha224",
  "1.2.840.113549.2.9": "sha256",
  "1.2.840.113549.2.10": "sha384",
  "1.2.840.113549.2.11": "sha512",
};

const CIFRA_DO_PBES2: Record<string, { nome: string; chave: number }> = {
  "2.16.840.1.101.3.4.1.2": { nome: "aes-128-cbc", chave: 16 },
  "2.16.840.1.101.3.4.1.22": { nome: "aes-192-cbc", chave: 24 },
  "2.16.840.1.101.3.4.1.42": { nome: "aes-256-cbc", chave: 32 },
  "1.2.840.113549.3.7": { nome: "des-ede3-cbc", chave: 24 },
};

const HASH_DO_MAC: Record<string, string> = {
  "1.3.14.3.2.26": "sha1",
  "2.16.840.1.101.3.4.2.4": "sha224",
  "2.16.840.1.101.3.4.2.1": "sha256",
  "2.16.840.1.101.3.4.2.2": "sha384",
  "2.16.840.1.101.3.4.2.3": "sha512",
};

function decifrarComNode(cifra: string, chave: Buffer, iv: Buffer, dados: Buffer): Buffer {
  try {
    const d = createDecipheriv(cifra, chave, iv);
    return Buffer.concat([d.update(dados), d.final()]);
  } catch {
    throw new ErroDeFormato();
  }
}

/** Decifra pelo AlgorithmIdentifier: as cifras do PKCS #12 (RC2, RC4, 3DES) ou o PBES2. */
function decifrar(algoritmo: NoDer, dados: Buffer, senha: string): Buffer {
  const [idNo, params] = filhosDe(algoritmo);
  const id = oid(idNo);
  const pkcs12 = PBE_DO_PKCS12[id];
  if (pkcs12) {
    const [salNo, iteracoesNo] = filhosDe(params);
    const sal = octetos(salNo);
    const iteracoes = iteracoesNo ? inteiro(iteracoesNo) : 1;
    const bmp = senhaBmp(senha);
    const chave = derivarPkcs12("sha1", bmp, sal, 1, iteracoes, pkcs12.chave);
    if (pkcs12.cifra === "rc4") return rc4(chave, dados);
    const iv = derivarPkcs12("sha1", bmp, sal, 2, iteracoes, 8);
    if (pkcs12.cifra === "rc2") return rc2Cbc("decifrar", chave, pkcs12.bits!, iv, dados);
    return decifrarComNode(pkcs12.cifra, chave, iv, dados);
  }
  if (id === OID.pbes2) {
    const [kdf, esquema] = filhosDe(params);
    const [kdfId, kdfParams] = filhosDe(kdf);
    if (oid(kdfId) !== OID.pbkdf2) throw new ErroDeFormato();
    const [salNo, iteracoesNo, ...extras] = filhosDe(kdfParams);
    let prf = "sha1";
    let tamanho: number | null = null;
    for (const extra of extras) {
      if (extra.tag === 0x02) tamanho = inteiro(extra);
      else prf = PRF_DO_PBKDF2[oid(filhosDe(extra)[0])] ?? "";
    }
    const [cifraId, ivNo] = filhosDe(esquema);
    const cifra = CIFRA_DO_PBES2[oid(cifraId)];
    if (!cifra || !prf) throw new ErroDeFormato();
    const chave = pbkdf2Sync(Buffer.from(senha, "utf8"), octetos(salNo), inteiro(iteracoesNo), tamanho ?? cifra.chave, prf);
    return decifrarComNode(cifra.nome, chave, octetos(ivNo), dados);
  }
  throw new ErroDeFormato();
}

/** A chave privada em PKCS #8 aberto. O Node abre 3DES e PBES2; RC2 e RC4 vão à mão. */
function abrirChave(epki: NoDer, senha: string): Buffer {
  try {
    return createPrivateKey({ key: epki.bruto, format: "der", type: "pkcs8", passphrase: senha }).export({ type: "pkcs8", format: "der" });
  } catch {
    const [algoritmo, dados] = filhosDe(epki);
    return decifrar(algoritmo, octetos(dados), senha);
  }
}

function conferirMac(macData: NoDer, conteudo: Buffer, senha: string): boolean {
  const [digestInfo, salNo, iteracoesNo] = filhosDe(macData);
  const [algoritmo, resumoNo] = filhosDe(digestInfo);
  const hash = HASH_DO_MAC[oid(filhosDe(algoritmo)[0])];
  if (!hash) throw new ErroDeFormato();
  const iteracoes = iteracoesNo ? inteiro(iteracoesNo) : 1;
  const tamanho = createHash(hash).digest().length;
  const chave = derivarPkcs12(hash, senhaBmp(senha), octetos(salNo), 3, iteracoes, tamanho);
  return createHmac(hash, chave).update(conteudo).digest().equals(octetos(resumoNo));
}

// ─── A conversão ─────────────────────────────────────────────────────────────

export type ConversaoDoPfx = { ok: true; pfx: Buffer } | { ok: false; erro: "senha" | "formato" };

const conteudoDeDados = (conteudo: Buffer) => der.sequencia(der.oid(OID.data), der.explicito(0, der.octetos(conteudo)));

/**
 * Abre o .pfx antigo com a senha e devolve o mesmo certificado e a mesma chave
 * num .pfx moderno, com a mesma senha. "senha" = o MAC não fecha; "formato" =
 * não é PKCS #12, ou usa algo de fora (assinado por chave pública, cifra
 * desconhecida, sem chave ou sem certificado).
 */
export function converterPfxAntigo(pfx: Buffer, senha: string): ConversaoDoPfx {
  try {
    const [versao, authSafe, macData] = filhosDe(lerDer(pfx));
    if (inteiro(versao) !== 3) return { ok: false, erro: "formato" };
    const [tipo, explicito] = filhosDe(authSafe);
    if (oid(tipo) !== OID.data) return { ok: false, erro: "formato" };
    const autenticado = octetos(filhosDe(explicito)[0]);
    if (macData && !conferirMac(macData, autenticado, senha)) return { ok: false, erro: "senha" };

    const certificados: Buffer[] = [];
    const chaves: { pkcs8: Buffer; atributos: Buffer | null }[] = [];
    const lerBolsas = (safeContents: NoDer) => {
      for (const bolsa of filhosDe(safeContents)) {
        const [tipoNo, valorExplicito, atributos] = filhosDe(bolsa);
        const valor = filhosDe(valorExplicito)[0];
        const t = oid(tipoNo);
        if (t === OID.certBag) certificados.push(bolsa.bruto);
        else if (t === OID.pkcs8ShroudedKeyBag) chaves.push({ pkcs8: abrirChave(valor, senha), atributos: atributos?.bruto ?? null });
        else if (t === OID.keyBag) chaves.push({ pkcs8: valor.bruto, atributos: atributos?.bruto ?? null });
        else if (t === OID.safeContentsBag) lerBolsas(valor);
        // CRL e segredo ficam de fora: o TLS com o Serpro só usa a chave e os certificados.
      }
    };
    for (const info of filhosDe(lerDer(autenticado))) {
      const [tipoNo, conteudo] = filhosDe(info);
      const t = oid(tipoNo);
      if (t === OID.data) {
        lerBolsas(lerDer(octetos(filhosDe(conteudo)[0])));
      } else if (t === OID.encryptedData) {
        // EncryptedData = { versão, { tipo, algoritmo, [0] IMPLICIT conteúdo cifrado } }.
        const [, info] = filhosDe(filhosDe(conteudo)[0]);
        const [, algoritmo, cifrado] = filhosDe(info);
        lerBolsas(lerDer(decifrar(algoritmo, octetos(cifrado), senha)));
      } else {
        return { ok: false, erro: "formato" };
      }
    }
    if (chaves.length === 0 || certificados.length === 0) return { ok: false, erro: "formato" };

    // Como o OpenSSL 3 exporta: a chave em PBES2/AES-256-CBC (o `export` do
    // Node), os certificados em claro — são públicos — e o MAC em HMAC-SHA256.
    const bolsasDeChave = chaves.map((k) => {
      const epki = createPrivateKey({ key: k.pkcs8, format: "der", type: "pkcs8" }).export({
        type: "pkcs8",
        format: "der",
        cipher: "aes-256-cbc",
        passphrase: senha,
      });
      return der.sequencia(der.oid(OID.pkcs8ShroudedKeyBag), der.explicito(0, epki), ...(k.atributos ? [k.atributos] : []));
    });
    const novo = der.sequencia(conteudoDeDados(der.sequencia(...certificados)), conteudoDeDados(der.sequencia(...bolsasDeChave)));
    const sal = randomBytes(16);
    const iteracoes = 2048;
    const mac = createHmac("sha256", derivarPkcs12("sha256", senhaBmp(senha), sal, 3, iteracoes, 32)).update(novo).digest();
    const macNovo = der.sequencia(der.sequencia(der.sequencia(der.oid(OID.sha256), der.nulo()), der.octetos(mac)), der.octetos(sal), der.inteiro(iteracoes));
    return { ok: true, pfx: der.sequencia(der.inteiro(3), conteudoDeDados(novo), macNovo) };
  } catch {
    return { ok: false, erro: "formato" };
  }
}
