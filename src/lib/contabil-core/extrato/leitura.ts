// Porte da parte determinística de `extrato/pdf_parser.py` (Fase 4, 10/11/2026): o leitor genérico
// (camada 1), as conferências de saldo e as recusas com frase própria. As camadas de IA (texto e
// imagem) não vêm: ver "Divergências deliberadas" em docs/CONTABIL-CORE.md.

import { compara, dec, fixo, modulo, oposto, somaTodos, subtrai, soma, ehZero, naoNegativo, type Dec } from "../motor/decimal";
import { gerarFitid, parseData, parseValor, type Bloco, type Transacao } from "./comum";
import { corta, re, strip } from "./py";

/** `PDFParseError`: a recusa do arquivo, com a frase que o contador lê. */
export class ErroDeLeitura extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeLeitura";
  }
}

// ─── Camada 1: leitor genérico ─────────────────────────────────────────────

const SALDO_RE = re("\\bSALDO\\b|\\bBALANCE\\b|\\bTOTAL\\b", "i");
const BARCODE_RE = re("^\\d{17,20}");
const TX_LINE = re("^(.+?)\\s+([-]?\\d{1,3}(?:\\.\\d{3})*(?:,\\d{2})?)\\s+([-]?\\d{1,3}(?:\\.\\d{3})*(?:,\\d{2})?)\\s*$");
const DATE_PREFIX = re("^(\\d{2}[/\\-]\\d{2}[/\\-](?:\\d{4}|\\d{2}))\\s*");
const SKIP_RE = re(
  "^(Data\\s|Ag[eê]ncia|Extrato|Total\\s|Os dados|Pr[oó]ximo|^\\s*Cr[eé]dito|^\\s*D[eé]bito|Saldo \\(|REM:\\s|Associado:|Cooperativa:|Conta Corrente:|Impresso em|Dados referentes)",
  "i",
);
const TABLE_HEADER_RE = re("^Data\\b.*\\bSaldo\\b", "i");
const MENOS_DIGITO = re("[-]\\d");
const SO_DIGITOS = re("^\\d+$");
const DOC_INICIO = re("^\\d{3,8}\\s*");
const DOC_FIM = re("\\s+\\d{4,8}\\s*$");
const MILESIMO = dec("0.001");

/** `_parse_linhas_multipagina`: o leitor linha a linha (Bradesco X-One e parecidos). */
export function parseLinhasMultipagina(linhas: readonly string[], referenciaAno: number, anoAtual?: number): Transacao[] {
  const transacoes: Transacao[] = [];
  let idx = 0;
  let ultimaData: string | null = null;
  let pendente: string | null = null;
  for (const bruta of linhas) {
    const linha = strip(bruta);
    if (!linha) continue;
    if (TABLE_HEADER_RE.match(linha)) {
      pendente = null;
      continue;
    }
    if (SKIP_RE.search(linha)) continue;
    if (SALDO_RE.search(linha) && !MENOS_DIGITO.search(linha)) continue;

    const m = TX_LINE.match(linha);
    if (!m) {
      const limpa = strip(BARCODE_RE.sub("", linha, 1));
      if (limpa && !SO_DIGITOS.match(limpa)) pendente = limpa;
      continue;
    }
    const [prefixo, valStr, saldoStr] = [m[1]!, m[2]!, m[3]!];
    const dm = DATE_PREFIX.match(prefixo);
    let resto: string;
    if (dm) {
      const d = parseData(dm[1]!, referenciaAno, anoAtual);
      if (d) ultimaData = d;
      resto = strip(prefixo.slice(dm.fim));
    } else resto = strip(prefixo);
    if (ultimaData === null) continue;

    resto = strip(BARCODE_RE.sub("", resto, 1));
    let semDoc = strip(DOC_INICIO.sub("", resto, 1));
    semDoc = strip(DOC_FIM.sub("", semDoc, 1));
    const historico = strip(pendente || semDoc || resto || "SEM DESCRIÇÃO");
    pendente = null;

    const valor = parseValor(valStr);
    if (valor === null || compara(modulo(valor), MILESIMO) < 0) continue;
    const saldoApos = parseValor(saldoStr);
    transacoes.push({
      fitid: gerarFitid(ultimaData, historico, valor, idx),
      data: ultimaData,
      valor,
      historico: corta(historico, 200),
      tipoOfx: naoNegativo(valor) ? "CREDIT" : "DEBIT",
      saldoApos,
      ordem: idx,
    });
    idx++;
  }
  return transacoes;
}

// ─── Texto que não é texto ─────────────────────────────────────────────────

const CID_RE = re("\\(cid:\\d+\\)");
const UTEIS = new Set(" ,.:;/-()R$%*");

/** `_fracao_legivel`: quanto do texto extraído é texto de verdade (fonte sem ToUnicode dá `(cid:N)`). */
export function fracaoLegivel(linhas: readonly string[]): number {
  const texto = linhas.join("\n");
  if (!texto) return 0;
  const semCid = CID_RE.sub("", texto);
  let uteis = 0;
  for (const c of semCid) {
    const n = c.codePointAt(0)!;
    if ((/^[\p{L}\p{N}]$/u.test(c) && !(n >= 0xe000 && n <= 0xf8ff)) || UTEIS.has(c)) uteis++;
  }
  // `len(texto)` conta caractere, não unidade UTF-16.
  return uteis / [...texto].length;
}

/** Abaixo disto, o que veio não é texto: é o glifo sem tradução. */
export const FRACAO_LEGIVEL_MINIMA = 0.5;

const OUTROS_DOCUMENTOS: [ReturnType<typeof re>, string][] = [
  [
    re("^\\s*extrato\\s+de\\s+rendimentos\\s*$", "i"),
    "Este arquivo é um extrato de RENDIMENTOS de aplicação financeira, não um extrato de conta corrente. O sistema ainda não importa aplicações — envie o extrato da conta bancária.",
  ],
  [
    re("\\brendimento\\b.*\\bvalor\\s+bruto\\b.*\\bIR\\b.*\\bIOF\\b", "i"),
    "Este arquivo é um extrato de RENDIMENTOS de aplicação financeira, não um extrato de conta corrente. O sistema ainda não importa aplicações — envie o extrato da conta bancária.",
  ],
];

/** `_documento_de_outro_tipo`: a recusa própria quando o arquivo não é extrato de conta. */
export function documentoDeOutroTipo(linhas: readonly string[]): string | null {
  for (const linha of linhas.slice(0, 60)) {
    const texto = strip(linha);
    for (const [marcador, mensagem] of OUTROS_DOCUMENTOS) if (marcador.search(texto)) return mensagem;
  }
  return null;
}

/** `_recusa_de_adaptador_vazio`: o leitor do banco foi acionado e não achou a tabela. */
export function recusaDeAdaptadorVazio(nome: string, reconhecido: boolean): string {
  const n = nome.toUpperCase();
  if (reconhecido) {
    return (
      `O leitor do ${n} reconheceu o extrato, mas não encontrou a tabela de lançamentos — provavelmente é um layout novo deste ` +
      "banco. Nenhum lançamento foi importado; envie este arquivo ao suporte para que o leitor seja ajustado."
    );
  }
  return (
    `O leitor do ${n} foi usado porque é o banco cadastrado na agência, mas o arquivo não tem o layout dele e nenhum lançamento foi ` +
    "importado. Confira se o extrato é desta conta e se a agência está com o banco correto no cadastro."
  );
}

// ─── Conferências ──────────────────────────────────────────────────────────

const VALOR_DECLARADO_RE = re("(?P<valor>-?\\(?\\d[\\d.]*,\\d{2}\\)?)(?:\\s*(?P<dc>[DC]))?\\s*$", "i");

/** `_valor_declarado`: o valor no fim da linha de resumo, com "D"/"C" decidindo o sinal. */
export function valorDeclarado(linha: string): Dec | null {
  const m = VALOR_DECLARADO_RE.search(linha);
  if (!m) return null;
  const valor = parseValor(m.grupo("valor")!);
  if (valor === null) return null;
  const dc = (m.grupo("dc") ?? "").toUpperCase();
  if (dc === "D") return oposto(modulo(valor));
  if (dc === "C") return modulo(valor);
  return valor;
}

/** `_fmt_reais`: R$ no padrão brasileiro, para a mensagem que o contador lê. */
export function fmtReais(valor: Dec): string {
  const [inteiraBruta, centavos] = fixo(modulo(valor), 2).split(".");
  const milhar = BigInt(inteiraBruta).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${valor.negativo && !ehZero(valor) ? "-" : ""}R$ ${milhar},${centavos}`;
}

const maior = (a: Dec, b: Dec) => compara(a, b) > 0;

/** `_validar_cadeia_de_saldos`: o saldo caminha de um lançamento para o outro? */
export function validarCadeiaDeSaldos(transacoes: readonly Transacao[], tolerancia: Dec): boolean {
  const comSaldo = transacoes.filter((t) => t.saldoApos !== null);
  if (comSaldo.length < 2 || comSaldo.length !== transacoes.length) return false;
  for (let i = 1; i < transacoes.length; i++) {
    const anterior = transacoes[i - 1];
    const atual = transacoes[i];
    const movimento = subtrai(atual.saldoApos!, anterior.saldoApos!);
    if (maior(modulo(subtrai(movimento, atual.valor)), tolerancia)) {
      throw new ErroDeLeitura(
        "Extração incompleta: o saldo do extrato não caminha com os lançamentos. " +
          `Depois de ${fmtReais(anterior.saldoApos!)} o saldo vai para ${fmtReais(atual.saldoApos!)}, uma variação de ` +
          `${fmtReais(movimento)}, mas o lançamento '${corta(atual.historico, 60)}' é de ${fmtReais(atual.valor)} — ` +
          "há lançamento faltando ou com valor errado entre os dois.",
      );
    }
  }
  return true;
}

const ZERO = dec("0");

/**
 * `_validar_blocos`: a cadeia de saldos de cada bloco, por segmentos (nem todo banco imprime saldo em
 * toda linha). As pontas vêm do saldo anterior e do saldo final impressos. Devolve `true` se todos os
 * blocos puderam ser conferidos de ponta a ponta; lança se algum não fecha.
 */
export function validarBlocos(blocos: readonly Bloco[], tolerancia: Dec): boolean {
  if (!blocos.length) return false;
  for (const bloco of blocos) {
    if (!bloco.transacoes.length) return false;
    let ancora = bloco.saldoAnterior;
    let acumulado = ZERO;
    let pendentes = 0;
    let conferidos = 0;
    let primeiroSegmento = true;
    for (const t of bloco.transacoes) {
      acumulado = soma(acumulado, t.valor);
      pendentes++;
      if (t.saldoApos === null) continue;
      if (ancora !== null) {
        const movimento = subtrai(t.saldoApos, ancora);
        if (maior(modulo(subtrai(movimento, acumulado)), tolerancia)) {
          const onde =
            primeiroSegmento && bloco.saldoAnterior !== null
              ? "há lançamento faltando no início do extrato."
              : "há lançamento faltando ou com valor errado entre os dois.";
          const quantos = pendentes > 1 ? `${pendentes} lançamentos somam` : "o lançamento";
          throw new ErroDeLeitura(
            "Extração incompleta: o saldo do extrato não caminha com " +
              `os lançamentos. Depois de ${fmtReais(ancora)} o saldo vai para ${fmtReais(t.saldoApos)}, uma variação ` +
              `de ${fmtReais(movimento)}, mas ${quantos} ${fmtReais(acumulado)} até '${corta(t.historico, 60)}' — ${onde}`,
          );
        }
        conferidos++;
        primeiroSegmento = false;
      }
      ancora = t.saldoApos;
      acumulado = ZERO;
      pendentes = 0;
    }
    if (bloco.saldoFinal !== null && ancora !== null) {
      const movimento = subtrai(bloco.saldoFinal, ancora);
      if (maior(modulo(subtrai(movimento, acumulado)), tolerancia)) {
        throw new ErroDeLeitura(
          "Extração incompleta: os últimos lançamentos não fecham com o " +
            `saldo final impresso. De ${fmtReais(ancora)} para ${fmtReais(bloco.saldoFinal)} há uma variação de ` +
            `${fmtReais(movimento)}, mas os lançamentos do trecho somam ${fmtReais(acumulado)} — há lançamento sobrando ou faltando ` +
            "no fim do extrato.",
        );
      }
      conferidos++;
      pendentes = 0;
    }
    if (conferidos === 0 || pendentes > 0) return false;
  }
  return true;
}

/** `_validar_completude`: confere pela cadeia, pelos saldos inicial e final ou pelos totais declarados. */
export function validarCompletude(linhas: readonly string[], transacoes: readonly Transacao[]): void {
  const iniciais: Dec[] = [];
  const finais: Dec[] = [];
  let totalDebitos: Dec | null = null;
  let totalCreditos: Dec | null = null;
  for (const linha of linhas) {
    const normalizada = linha.toUpperCase();
    const valor = valorDeclarado(linha);
    if (valor === null) continue;
    if (normalizada.includes("SALDO ANTERIOR") || normalizada.includes("SALDO INICIAL")) iniciais.push(valor);
    else if (normalizada.includes("SALDO FINAL") || normalizada.includes("SALDO ATUAL")) finais.push(valor);
    else if (normalizada.includes("TOTAL") && (normalizada.includes("DÉBIT") || normalizada.includes("DEBIT"))) totalDebitos = modulo(valor);
    else if (normalizada.includes("TOTAL") && (normalizada.includes("CRÉDIT") || normalizada.includes("CREDIT"))) totalCreditos = modulo(valor);
  }
  const valores = transacoes.map((t) => t.valor);
  const tolerancia = dec("0.05");
  let validou = validarCadeiaDeSaldos(transacoes, tolerancia);
  if (iniciais.length && finais.length) {
    const diferenca = subtrai(finais[finais.length - 1], iniciais[0]);
    if (maior(modulo(subtrai(somaTodos(valores), diferenca)), tolerancia)) {
      throw new ErroDeLeitura("Extração incompleta: lançamentos não reconciliam saldo inicial e final.");
    }
    validou = true;
  }
  if (totalDebitos !== null && totalCreditos !== null) {
    const debitos = somaTodos(valores.filter((v) => compara(v, ZERO) < 0).map(oposto));
    const creditos = somaTodos(valores.filter((v) => compara(v, ZERO) > 0));
    if (maior(modulo(subtrai(debitos, totalDebitos)), tolerancia) || maior(modulo(subtrai(creditos, totalCreditos)), tolerancia)) {
      throw new ErroDeLeitura("Extração incompleta: lançamentos não reconciliam os totais declarados.");
    }
    validou = true;
  }
  if (!validou) throw new ErroDeLeitura("Não foi possível validar a completude: saldos ou totais declarados não encontrados.");
}
