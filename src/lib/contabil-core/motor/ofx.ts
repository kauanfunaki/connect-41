// Porte de `src/domain/extrato/ofx_parser.py` do Contábil Core: leitura de OFX 1.x (SGML, o mais
// comum nos bancos brasileiros) e 2.x (XML), por expressão regular e sem biblioteca, como o original.
//
// Segurança: o OFX 2.x passa por uma verificação de XML bem formado SEM resolver entidade externa nem
// DTD (só as cinco entidades do XML e as referências numéricas são aceitas). Isso reproduz o
// `xml.etree` do original, que recusa entidade desconhecida, e fecha a porta para XXE.

import { XMLValidator } from "fast-xml-parser";
import { decimal, NAO_FINITO, type Dec } from "./decimal";
import { casefold, findall, primeiroGrupo, rePy, strip } from "./unicodePy";

export type TransacaoOfx = {
  /** Identidade da transação no banco. */
  fitid: string;
  /** Data de calendário do lançamento ("AAAA-MM-DD"), não instante. */
  data: string;
  /** Positivo é crédito; negativo, débito. */
  valor: Dec;
  historico: string;
  /** CREDIT, DEBIT etc. */
  tipoOfx: string;
  /** O OFX não informa saldo por lançamento: fica nulo. */
  saldoApos: Dec | null;
  /** Posição do bloco no arquivo: desempata lançamentos do mesmo dia. */
  ordem: number | null;
};

export type ResultadoOfx = {
  transacoes: TransacaoOfx[];
  totalBlocos: number;
  erros: string[];
  /** Saldo de fechamento do período (`<LEDGERBAL>`), âncora da conferência entre arquivos. */
  saldoDeclarado: Dec | null;
  dataSaldo: string | null;
};

export class ErroOfx extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "OFXParseError";
  }
}

const BLOCO = rePy("<STMTTRN>(.*?)</STMTTRN>", "si");
const BLOCO_ABERTO = rePy("<STMTTRN>(.*?)(?=<STMTTRN>|</BANKTRANLIST>|$)", "si");
const BLOCO_XML = rePy("<OFX>.*</OFX>", "si");
const LEDGERBAL = rePy("<LEDGERBAL>(.*?)(?=</LEDGERBAL>|<AVAILBAL>|</STMTRS>|$)", "si");
const DATA_OFX = rePy(String.raw`(?<base>\d{8}(?:\d{4}(?:\d{2})?)?)(?:\.(?<fracao>\d+))?(?:\[(?<offset>[+-]?\d+(?:\.\d+)?):[^\]]+\])?`);

const tags = new Map<string, RegExp>();
function tag(bloco: string, nome: string): string | null {
  let r = tags.get(nome);
  if (!r) tags.set(nome, (r = rePy(String.raw`<${nome}>\s*([^\n<]+)`, "i")));
  const v = primeiroGrupo(r, bloco);
  return v === null ? null : strip(v);
}

/** Lê o OFX e devolve as transações, os erros por bloco e o saldo declarado. */
export function lerOfx(conteudo: string): ResultadoOfx {
  let texto = conteudo.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  texto = texto.replace(/^﻿+/, "");
  // O OFX 2.x sempre começa com a declaração <?xml …?>; o 1.x tem cabeçalho textual.
  if (Array.from(texto).slice(0, 200).join("").includes("<?xml")) return lerXml(texto);
  return lerSgml(texto);
}

function lerSgml(conteudo: string): ResultadoOfx {
  let blocos = findall(BLOCO, conteudo);
  // Alguns bancos não fecham a tag.
  if (!blocos.length) blocos = findall(BLOCO_ABERTO, conteudo);
  return montar(conteudo, blocos);
}

const ENTIDADE = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/;

function lerXml(conteudo: string): ResultadoOfx {
  BLOCO_XML.lastIndex = 0;
  const m = BLOCO_XML.exec(conteudo);
  if (!m) throw new ErroOfx("Bloco <OFX> não encontrado.");
  const xml = m[0];
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || ENTIDADE.test(xml) || XMLValidator.validate(xml) !== true) {
    throw new ErroOfx("XML inválido");
  }
  // O original reserializa cada <STMTTRN> com o `xml.etree`: referências numéricas e as entidades
  // &quot; e &apos; viram o caractere, e &amp;, &lt; e &gt; continuam escapadas no texto. O bloco
  // tem a tag com o nome exato (o `iter("STMTTRN")` distingue maiúscula).
  const blocos: string[] = [];
  const r = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/g;
  for (let b = r.exec(xml); b; b = r.exec(xml)) blocos.push("<STMTTRN>" + comoEtree(b[1]) + "</STMTTRN>");
  return montar(conteudo, blocos);
}

function comoEtree(texto: string): string {
  return texto
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, c: string) => c.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"))
    .replace(/&#x([0-9a-fA-F]+);|&#(\d+);/g, (_, h: string | undefined, d: string | undefined) => escaparTexto(String.fromCodePoint(parseInt(h ?? d!, h ? 16 : 10))))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/>([^<]*)</g, (_, t: string) => ">" + t.replace(/>/g, "&gt;") + "<");
}

function escaparTexto(c: string): string {
  return c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c;
}

function montar(conteudo: string, blocos: string[]): ResultadoOfx {
  const transacoes: TransacaoOfx[] = [];
  const erros: string[] = [];
  blocos.forEach((bloco, i) => {
    try {
      transacoes.push(lerBloco(bloco, i + 1));
    } catch (e) {
      if (!(e instanceof ErroOfx)) throw e;
      erros.push(`Transação ${i + 1}: ${e.message}`);
    }
  });
  const { saldo, data } = saldoDeclarado(conteudo);
  return { transacoes, totalBlocos: blocos.length, erros, saldoDeclarado: saldo, dataSaldo: data };
}

/**
 * Junta os DOIS campos de descrição do OFX, MEMO e depois NAME. O MEMO é o tipo da operação
 * (`PIX EMITIDO OUTRA IF`) e o NAME é a contraparte, muitas vezes com CPF/CNPJ. Medido nos extratos
 * do Sicoob: 52,5% dos lançamentos traziam documento no NAME, e nenhum no MEMO. O MEMO vem primeiro
 * para as regras já cadastradas pelo texto dele continuarem casando por substring.
 */
export function montarHistorico(memo: string | null, name: string | null): string {
  const espaco = rePy(String.raw`\s+`);
  const m = strip((memo ?? "").replace(espaco, " "));
  const n = strip((name ?? "").replace(espaco, " "));
  if (!n) return m;
  if (!m) return n;
  // Banco que repete a mesma informação nos dois campos não duplica o texto.
  if (casefold(m).includes(casefold(n))) return m;
  if (casefold(n).includes(casefold(m))) return n;
  return `${m} ${n}`;
}

/** Valor no formato do OFX (`1500.00`) ou brasileiro (`1.500,00`). */
export function valorMonetario(bruto: string): Dec {
  let t = strip(bruto);
  if (t.includes(",") && t.includes(".")) t = t.replace(/\./g, "").replace(/,/g, ".");
  else t = t.replace(/,/g, ".");
  const v = decimal(t);
  if (v === null || v === NAO_FINITO) throw new ErroOfx("valor inválido");
  return v;
}

/**
 * Saldo de fechamento de `<LEDGERBAL>`. Não lê `<AVAILBAL>` (o disponível desconta limite e bloqueio
 * e não fecha com a soma). Com mais de um LEDGERBAL no arquivo, não escolhe nenhum: âncora no chute é
 * pior que âncora nenhuma.
 */
function saldoDeclarado(conteudo: string): { saldo: Dec | null; data: string | null } {
  const blocos = findall(LEDGERBAL, conteudo);
  if (blocos.length !== 1) return { saldo: null, data: null };
  const bruto = tag(blocos[0], "BALAMT");
  if (!bruto) return { saldo: null, data: null };
  let saldo: Dec;
  try {
    saldo = valorMonetario(bruto);
  } catch {
    return { saldo: null, data: null };
  }
  const dtasof = tag(blocos[0], "DTASOF");
  return { saldo, data: dtasof ? lerData(dtasof) : null };
}

function lerBloco(bloco: string, ordem: number): TransacaoOfx {
  const fitid = tag(bloco, "FITID");
  const dtposted = tag(bloco, "DTPOSTED");
  const trnamt = tag(bloco, "TRNAMT");
  const memo = montarHistorico(tag(bloco, "MEMO"), tag(bloco, "NAME"));
  const trntype = tag(bloco, "TRNTYPE") || "OTHER";

  const ausentes = (
    [
      ["FITID", fitid],
      ["DTPOSTED", dtposted],
      ["TRNAMT", trnamt],
    ] as const
  )
    .filter(([, v]) => !v)
    .map(([n]) => n);
  if (ausentes.length) throw new ErroOfx(`campo(s) obrigatório(s) ausente(s): ${ausentes.join(", ")}`);

  let valor: Dec;
  try {
    valor = valorMonetario(trnamt!);
  } catch {
    throw new ErroOfx("valor TRNAMT inválido");
  }
  const data = lerData(dtposted!);
  if (!data) throw new ErroOfx(`data DTPOSTED inválida: ${dtposted}`);

  return { fitid: fitid!, data, valor, historico: strip(memo), tipoOfx: trntype.toUpperCase(), saldoApos: null, ordem };
}

function bissexto(a: number): boolean {
  return (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
}

/**
 * A data de calendário do DTPOSTED, no fuso que o próprio OFX declara: só a data (`20260701`) ou
 * data e hora com offset (`20260701220000[-3:BRT]`). As 22h do dia 01 em Brasília são dia 01, e por
 * isso não se converte para UTC. A validação é a do `strptime` do original.
 */
export function lerData(s: string): string | null {
  const r = new RegExp(`^(?:${DATA_OFX.source})$`, "u");
  const m = r.exec(strip(s));
  if (!m?.groups) return null;
  const base = Array.from(m.groups.base);
  if (![8, 12, 14].includes(base.length)) return null;
  // O `\d` do padrão aceita dígito de qualquer escrita, mas o `strptime` recusa (gabarito, Python 3.14).
  if (base.some((c) => c < "0" || c > "9")) return null;
  const parte = (i: number, n: number) => Number(base.slice(i, i + n).join(""));
  const ano = parte(0, 4);
  const mes = parte(4, 2);
  const diaDoMes = parte(6, 2);
  if (ano < 1 || mes < 1 || mes > 12 || diaDoMes < 1) return null;
  const dias = [31, bissexto(ano) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1];
  if (diaDoMes > dias) return null;
  if (base.length >= 12 && (parte(8, 2) > 23 || parte(10, 2) > 59)) return null;
  if (base.length === 14 && parte(12, 2) > 59) return null;
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(diaDoMes).padStart(2, "0")}`;
}
