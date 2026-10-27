// O termo de autorização do Integra Contador (Fase 3, 27/10/2026): o XML que
// quem recebe as autorizações (o autor do pedido) assina para que quem
// contratou o Serpro peça em nome dele — o modelo software house. A 41 Tech
// contratou, a 41 Contábil assina.
//
// Fonte: "Padrões Técnicos de Assinatura do XML" e "Envio de XML assinado" do
// Autentica Procurador, lidos em 27/10/2026 (página de 10/04/2026). O que
// importa aqui:
// - o modelo do XML é fixo: os três textos são os da documentação, letra por
//   letra, e qualquer caractere a mais (até um invisível) volta
//   AcessoNegado-AUTENTICAPROCURADOR-013;
// - assinatura XMLDSig envelopada, C14N inclusivo, RSA-SHA256, SHA-256, a
//   referência com URI vazia e só o certificado do assinante no KeyInfo;
// - o CNPJ de `assinadoPor` tem de ser o do certificado que assinou, e o de
//   `destinatario`, o de quem contratou;
// - `vigencia` não pode ser anterior a hoje, nem `dataAssinatura` posterior.
//
// O XML é assinado fora do servidor (decisão do Kauan, 27/10/2026): o e-CNPJ
// da 41 Contábil não vai para o Connect. Aqui só se gera o XML e se confere o
// que voltou assinado, antes de gastar uma ida ao Serpro.

import { createHash, verify, X509Certificate } from "node:crypto";
import { XMLParser } from "fast-xml-parser";

export const TEXTO_DO_TERMO =
  "Autorizo a empresa CONTRATANTE, identificada neste termo de autorização como DESTINATÁRIO, a executar as requisições dos serviços web disponibilizados pela API INTEGRA CONTADOR, onde terei o papel de AUTOR PEDIDO DE DADOS no corpo da mensagem enviada na requisição do serviço web. Esse termo de autorização está assinado digitalmente com o certificado digital do PROCURADOR ou OUTORGADO DO CONTRIBUINTE responsável, identificado como AUTOR DO PEDIDO DE DADOS.";
export const TEXTO_DO_AVISO_LEGAL =
  "O acesso a estas informações foi autorizado pelo próprio PROCURADOR ou OUTORGADO DO CONTRIBUINTE, responsável pela informação, via assinatura digital. É dever do destinatário da autorização e consumidor deste acesso observar a adoção de base legal para o tratamento dos dados recebidos conforme artigos 7º ou 11º da LGPD (Lei n.º 13.709, de 14 de agosto de 2018), aos direitos do titular dos dados (art. 9º, 17 e 18, da LGPD) e aos princípios que norteiam todos os tratamentos de dados no Brasil (art. 6º, da LGPD).";
export const TEXTO_DA_FINALIDADE =
  "A finalidade única e exclusiva desse TERMO DE AUTORIZAÇÃO, é garantir que o CONTRATANTE apresente a API INTEGRA CONTADOR esse consentimento do PROCURADOR ou OUTORGADO DO CONTRIBUINTE assinado digitalmente, para que possa realizar as requisições dos serviços web da API INTEGRA CONTADOR em nome do AUTOR PEDIDO DE DADOS (PROCURADOR ou OUTORGADO DO CONTRIBUINTE).";
const SISTEMA = "API Integra Contador";

const DSIG = "http://www.w3.org/2000/09/xmldsig#";
const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256";
const ENVELOPADA = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";

/** O XML assinado é pequeno (uns 4 KB); um arquivo bem maior não é um termo. */
export const TAMANHO_MAXIMO_DO_TERMO = 64 * 1024;

export type ParteDoTermo = { numero: string; nome: string };

/** "2026-10-27" → "20261027", como o termo pede. */
const dataDoTermo = (iso: string) => iso.replace(/-/g, "");
/** "20261027" → "2026-10-27". null = não é uma data AAAAMMDD. */
function isoDoTermo(d: string | undefined): string | null {
  if (!d || !/^\d{8}$/.test(d)) return null;
  const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
  return Number.isNaN(Date.parse(`${iso}T12:00:00Z`)) ? null : iso;
}

/** Escape de atributo: os cinco da tabela da documentação. */
const escaparAtributo = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** Tira o que não é letra, número, espaço ou pontuação comum: o caractere invisível derruba o termo. */
const nomeLimpo = (nome: string) =>
  nome
    .normalize("NFC")
    .replace(/[^\p{L}\p{N} .,&'()\-/]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);

/**
 * O termo pronto para assinar, numa linha só, sem recuo: a documentação pede o
 * documento sem quebras, e o que se assina é exatamente isto.
 */
export function gerarTermo(p: { contratante: ParteDoTermo; autor: ParteDoTermo; assinadoEm: string; vigencia: string }): string {
  const tipo = (numero: string) => (numero.length === 11 ? "PF" : "PJ");
  const el = (nome: string, atributos: [string, string][]) => `<${nome} ${atributos.map(([k, v]) => `${k}="${escaparAtributo(v)}"`).join(" ")} />`;
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<termoDeAutorizacao><dados>" +
    el("sistema", [["id", SISTEMA]]) +
    el("termo", [["texto", TEXTO_DO_TERMO]]) +
    el("avisoLegal", [["texto", TEXTO_DO_AVISO_LEGAL]]) +
    el("finalidade", [["texto", TEXTO_DA_FINALIDADE]]) +
    el("dataAssinatura", [["data", dataDoTermo(p.assinadoEm)]]) +
    el("vigencia", [["data", dataDoTermo(p.vigencia)]]) +
    el("destinatario", [
      ["numero", p.contratante.numero],
      ["nome", nomeLimpo(p.contratante.nome)],
      ["tipo", "PJ"],
      ["papel", "contratante"],
    ]) +
    el("assinadoPor", [
      ["numero", p.autor.numero],
      ["nome", nomeLimpo(p.autor.nome)],
      ["tipo", tipo(p.autor.numero)],
      ["papel", "autor pedido de dados"],
    ]) +
    "</dados></termoDeAutorizacao>"
  );
}

// ─── C14N ────────────────────────────────────────────────────────────────────
// O bastante do C14N inclusivo (W3C, 15/03/2001) para o termo e para o
// SignedInfo: elementos, atributos, texto e a declaração de namespace padrão.
// Sem comentário, sem instrução de processamento, sem prefixo — o termo não
// tem nenhum, e um que tenha não passa na conferência de qualquer jeito.

type No = Record<string, unknown> & { ":@"?: Record<string, string>; "#text"?: string };

const escaparTexto = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#xD;");
const escaparAtributoC14n = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/\t/g, "&#x9;").replace(/\n/g, "&#xA;").replace(/\r/g, "&#xD;");

const nomeDoNo = (n: No) => Object.keys(n).find((k) => k !== ":@") ?? "";
const filhos = (n: No) => (n[nomeDoNo(n)] as No[] | undefined) ?? [];
const atributos = (n: No) => n[":@"] ?? {};

/**
 * Um elemento em C14N. `nsHerdado` é o namespace padrão em vigor no pai, já
 * escrito na saída: o elemento só repete a declaração quando ela muda — e o
 * ápice de um subconjunto (o SignedInfo) a recebe do ancestral.
 */
function canonico(n: No, nsHerdado: string, pular?: (n: No) => boolean): string {
  const nome = nomeDoNo(n);
  if (nome === "#text") return escaparTexto(n["#text"] ?? "");
  const attrs = { ...atributos(n) };
  const ns = attrs.xmlns ?? nsHerdado;
  delete attrs.xmlns;
  const declaracao = ns !== nsHerdado ? ` xmlns="${escaparAtributoC14n(ns)}"` : "";
  const lista = Object.keys(attrs)
    .sort()
    .map((k) => ` ${k}="${escaparAtributoC14n(attrs[k])}"`)
    .join("");
  const dentro = filhos(n)
    .filter((f) => !pular?.(f))
    .map((f) => canonico(f, ns, pular))
    .join("");
  return `<${nome}${declaracao}${lista}>${dentro}</${nome}>`;
}

// ─── O termo assinado ────────────────────────────────────────────────────────

export type TermoLido = {
  contratante: ParteDoTermo;
  autor: ParteDoTermo;
  assinadoEm: string;
  vigencia: string;
  certificado: { titular: string | null; documento: string | null; validoAte: string };
};

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: true,
});

/** O documento do certificado ICP-Brasil: o CN é "NOME:CNPJ" (e-CNPJ) ou "NOME:CPF" (e-CPF). */
export function sujeitoDoCertificado(sujeito: string): { titular: string | null; documento: string | null } {
  const cn = /(?:^|\n|,\s*|\/)CN=([^\n,/]+)/.exec(sujeito)?.[1]?.trim() ?? null;
  const m = cn ? /^(.*):(\d{11}|\d{14})$/.exec(cn) : null;
  return m ? { titular: m[1].trim(), documento: m[2] } : { titular: cn, documento: null };
}

/**
 * Lê e confere o termo que voltou assinado: o modelo, os textos, os
 * algoritmos, a assinatura de verdade (o digest do documento e o RSA do
 * SignedInfo) e se o certificado é o de quem consta como autor. O que fica de
 * fora é a cadeia ICP-Brasil e a revogação — essas o Serpro confere.
 */
export function lerTermoAssinado(texto: string, hoje: string): { ok: true; termo: TermoLido } | { ok: false; erro: string } {
  const xml = texto.replace(/^﻿/, "").trim();
  if (!xml) return { ok: false, erro: "O arquivo está vazio." };
  if (Buffer.byteLength(xml) > TAMANHO_MAXIMO_DO_TERMO) return { ok: false, erro: "O arquivo é grande demais para um termo de autorização." };
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return { ok: false, erro: "O arquivo não é um termo de autorização." };

  let arvore: No[];
  try {
    arvore = parser.parse(xml) as No[];
  } catch {
    return { ok: false, erro: "O arquivo não é um XML válido." };
  }
  const raizes = arvore.filter((n) => !nomeDoNo(n).startsWith("?"));
  const raiz = raizes.length === 1 ? raizes[0] : null;
  if (!raiz || nomeDoNo(raiz) !== "termoDeAutorizacao") return { ok: false, erro: "O arquivo não é um termo de autorização (a raiz não é termoDeAutorizacao)." };

  const elementos = filhos(raiz).filter((n) => nomeDoNo(n) !== "#text");
  if (filhos(raiz).some((n) => nomeDoNo(n) === "#text" && (n["#text"] ?? "").trim() !== "")) return { ok: false, erro: "O termo tem texto fora das tags." };
  const dados = elementos.filter((n) => nomeDoNo(n) === "dados");
  const assinaturas = elementos.filter((n) => nomeDoNo(n) === "Signature");
  if (dados.length !== 1) return { ok: false, erro: "O termo precisa de um bloco <dados>." };
  if (assinaturas.length === 0) return { ok: false, erro: "O termo não está assinado. Rode o assinador e envie o arquivo termo-assinado.xml." };
  if (assinaturas.length > 1 || elementos.length !== 2) return { ok: false, erro: "O termo tem mais de uma assinatura ou partes a mais." };

  // ── Os dados ──
  const tag = (nome: string) => {
    const achados = filhos(dados[0]).filter((n) => nomeDoNo(n) === nome);
    return achados.length === 1 ? atributos(achados[0]) : null;
  };
  const sistema = tag("sistema");
  const termo = tag("termo");
  const aviso = tag("avisoLegal");
  const finalidade = tag("finalidade");
  const assinatura = tag("dataAssinatura");
  const vigencia = tag("vigencia");
  const destinatario = tag("destinatario");
  const assinadoPor = tag("assinadoPor");
  if (!sistema || !termo || !aviso || !finalidade || !assinatura || !vigencia || !destinatario || !assinadoPor) {
    return { ok: false, erro: "Falta alguma parte do termo. Gere e assine um termo novo pelo Connect." };
  }
  if (sistema.id !== SISTEMA || termo.texto !== TEXTO_DO_TERMO || aviso.texto !== TEXTO_DO_AVISO_LEGAL || finalidade.texto !== TEXTO_DA_FINALIDADE) {
    return { ok: false, erro: "O texto do termo foi alterado. Gere e assine um termo novo pelo Connect, sem abrir o arquivo num editor." };
  }
  if (destinatario.papel !== "contratante" || destinatario.tipo !== "PJ" || !/^\d{14}$/.test(destinatario.numero ?? "")) {
    return { ok: false, erro: "O destinatário do termo está incompleto." };
  }
  if (assinadoPor.papel !== "autor pedido de dados" || !/^(\d{11}|\d{14})$/.test(assinadoPor.numero ?? "")) {
    return { ok: false, erro: "Quem assina o termo está incompleto." };
  }
  const assinadoEm = isoDoTermo(assinatura.data);
  const vale = isoDoTermo(vigencia.data);
  if (!assinadoEm || !vale) return { ok: false, erro: "As datas do termo estão fora do formato." };
  if (assinadoEm > hoje) return { ok: false, erro: "A data de assinatura do termo é posterior a hoje." };
  if (vale < hoje) return { ok: false, erro: `O termo venceu em ${vale.split("-").reverse().join("/")}. Gere um novo.` };

  // ── A assinatura ──
  const sig = assinaturas[0];
  if (atributos(sig).xmlns !== DSIG) return { ok: false, erro: "A assinatura não está no padrão XMLDSig." };
  const de = (n: No, nome: string) => filhos(n).filter((f) => nomeDoNo(f) === nome);
  const um = (n: No, nome: string) => {
    const l = de(n, nome);
    return l.length === 1 ? l[0] : null;
  };
  const textoDe = (n: No | null) =>
    n
      ? filhos(n)
          .map((f) => f["#text"] ?? "")
          .join("")
          .replace(/\s/g, "")
      : "";
  const signedInfo = um(sig, "SignedInfo");
  const valor = um(sig, "SignatureValue");
  const keyInfo = um(sig, "KeyInfo");
  const referencias = signedInfo ? de(signedInfo, "Reference") : [];
  const referencia = referencias.length === 1 ? referencias[0] : null;
  if (!signedInfo || !valor || !keyInfo || !referencia) return { ok: false, erro: "A assinatura está incompleta (SignedInfo, Reference, SignatureValue ou KeyInfo)." };
  if (atributos(um(signedInfo, "CanonicalizationMethod") ?? ({} as No)).Algorithm !== C14N) return { ok: false, erro: "A assinatura não usa o C14N que o Serpro pede." };
  if (atributos(um(signedInfo, "SignatureMethod") ?? ({} as No)).Algorithm !== RSA_SHA256) return { ok: false, erro: "A assinatura não é RSA-SHA256." };
  if (atributos(referencia).URI !== "") return { ok: false, erro: "A assinatura não cobre o documento inteiro (URI vazia)." };
  if (atributos(um(referencia, "DigestMethod") ?? ({} as No)).Algorithm !== SHA256) return { ok: false, erro: "O resumo da assinatura não é SHA-256." };
  const transformacoes = de(um(referencia, "Transforms") ?? ({} as No), "Transform").map((t) => atributos(t).Algorithm);
  if (transformacoes.length !== 2 || transformacoes[0] !== ENVELOPADA || transformacoes[1] !== C14N) {
    return { ok: false, erro: "A assinatura não traz as transformações Enveloped e C14N." };
  }
  const x509 = de(um(keyInfo, "X509Data") ?? ({} as No), "X509Certificate");
  if (x509.length !== 1) return { ok: false, erro: "A assinatura precisa trazer só o certificado de quem assinou." };

  let cert: X509Certificate;
  try {
    cert = new X509Certificate(Buffer.from(textoDe(x509[0]), "base64"));
  } catch {
    return { ok: false, erro: "O certificado dentro da assinatura não pôde ser lido." };
  }
  const { titular, documento } = sujeitoDoCertificado(cert.subject);
  const validoAte = new Date(cert.validTo).toISOString().slice(0, 10);
  if (documento !== assinadoPor.numero) {
    return {
      ok: false,
      erro: `O termo foi assinado com o certificado de ${titular ?? "outra pessoa"}${documento ? ` (${documento})` : ""}, e não com o de quem consta como autor (${assinadoPor.numero}).`,
    };
  }
  if (validoAte < hoje) return { ok: false, erro: `O certificado que assinou o termo venceu em ${validoAte.split("-").reverse().join("/")}.` };

  // O digest: o documento sem a assinatura (enveloped), em C14N.
  const documentoCanonico = canonico(raiz, "", (f) => f === sig);
  if (createHash("sha256").update(documentoCanonico, "utf8").digest("base64") !== textoDe(um(referencia, "DigestValue"))) {
    return { ok: false, erro: "A assinatura não confere: o termo foi alterado depois de assinado. Envie o arquivo termo-assinado.xml como o assinador gerou." };
  }
  // O SignedInfo é o ápice do subconjunto: herda a declaração do Signature.
  const signedInfoCanonico = canonico({ ...signedInfo, ":@": { xmlns: DSIG, ...atributos(signedInfo) } }, "", undefined);
  const confere = verify("sha256", Buffer.from(signedInfoCanonico, "utf8"), cert.publicKey, Buffer.from(textoDe(valor), "base64"));
  if (!confere) return { ok: false, erro: "A assinatura não confere com o certificado." };

  return {
    ok: true,
    termo: {
      contratante: { numero: destinatario.numero, nome: destinatario.nome ?? "" },
      autor: { numero: assinadoPor.numero, nome: assinadoPor.nome ?? "" },
      assinadoEm,
      vigencia: vale,
      certificado: { titular, documento, validoAte },
    },
  };
}

/** Até quando o termo vale: a vigência ou o vencimento do certificado que assinou, o que vier antes. */
export const validadeDoTermo = (t: { vigencia: string; certificadoValidoAte: string }) => (t.vigencia < t.certificadoValidoAte ? t.vigencia : t.certificadoValidoAte);
