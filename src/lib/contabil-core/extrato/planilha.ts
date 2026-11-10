// Porte de `extrato/planilha_parser.py` (Fase 4b, 10/11/2026): extrato bancário em planilha
// (.xlsx, .xls, .csv).
//
// A planilha nomeia as próprias colunas, então UM leitor guiado pelo cabeçalho cobre os bancos
// todos ("Data | Lançamento | Crédito | Débito | Saldo", "Data | Descrição | Valor | Saldo"…). O
// CNPJ e a razão social, quando vêm em coluna própria, entram no histórico na ordem do extrato, e o
// NEO os acha pelo caminho de sempre. O resultado passa pela MESMA cadeia de saldos do PDF:
// planilha já tabulada não é sinônimo de leitura certa.

import { compara, decimal, igual, modulo, NAO_FINITO, oposto, ehZero, soma, subtrai, type Dec } from "../motor/decimal";
import { ehVazia, strPy, type Celula } from "../planilha/celula";
import { linhasDoCsv } from "../planilha/csv";
import { lerXls, xldateComoTupla, type CelulaXls } from "../planilha/xls";
import { linhasDoXlsx } from "../planilha/xlsx";
import { strDatahora } from "../planilha/celula";
import { bloco, dataIso, gerarFitid, parseData, parseValor, type Bloco, type Transacao } from "./comum";
import { ErroDeLeitura, validarBlocos } from "./leitura";
import { corta, re, strip } from "./py";

export const EXTENSOES = [".xls", ".xlsx", ".xlsm", ".csv"];
const TOLERANCIA_SALDO = decimal("0.05") as Dec;

/** `PlanilhaParseError`: a recusa da planilha, com a frase para o contador. */
export class ErroDePlanilha extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDePlanilha";
  }
}

/** `_sem_acento` + `_chave`: o rótulo de coluna sem acento, sem pontuação e minúsculo. */
export function chave(valor: Celula): string {
  if (valor === null) return "";
  const texto = strPy(valor).normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();
  return texto.replace(/[^a-z0-9]+/g, " ").trim();
}

// Cada papel e os rótulos que o identificam, do mais específico para o mais genérico ("data
// lancamento" antes de "data": a Caixa tem duas colunas de data).
const PAPEIS: [string, string[]][] = [
  ["credito", ["credito", "entrada", "entradas"]],
  ["debito", ["debito", "saida", "saidas"]],
  ["saldo", ["saldo"]],
  ["valor", ["valor lancamento", "valor r", "valor"]],
  ["data", ["data lancamento", "data movimento", "data"]],
  ["documento", ["documento", "dcto", "dcto n", "n documento", "identificador"]],
  ["razao_social", ["razao social", "cliente ou fornecedor", "favorecido"]],
  ["cpf_cnpj", ["cpf cnpj", "cnpj cpf", "cpf", "cnpj"]],
  ["historico", ["lancamento", "descricao", "historico"]],
];

const ABERTURA = re("saldo\\s+anterior|saldo\\s+inicial", "i");
const FECHO = re("^(saldo\\s+(atual|final|do\\s+dia|em\\s)|total(\\s|$)|lan[cç]amentos?\\s+futuros)", "i");

/** Uma linha de movimento já lida, antes de virar transação (`_Linha`). */
export type LinhaDeMovimento = { data: string; valor: Dec; saldo: Dec | null; historico: string };

/** `_decrescente`: a planilha vem do mais recente para o mais antigo (Santander)? */
export function decrescente(linhas: readonly LinhaDeMovimento[]): boolean {
  const datas = linhas.map((l) => l.data);
  const distintas = datas.filter((d, i) => i === 0 || d !== datas[i - 1]);
  if (distintas.length < 2 || distintas[0] <= distintas[distintas.length - 1]) return false;
  return distintas.every((d, i) => i === 0 || distintas[i - 1] >= d);
}

/**
 * `_ajustar_pelo_saldo`: a coluna de saldo corrige o sinal quando só ela diz a direção (poupança do
 * Sicredi, valor sem sinal) e descarta a linha que não move o saldo (previsão no fluxo do Omie).
 */
export function ajustarPeloSaldo(saldoAnterior: Dec | null, linhas: readonly LinhaDeMovimento[]): LinhaDeMovimento[] {
  const ajustadas: LinhaDeMovimento[] = [];
  let anterior = saldoAnterior;
  for (const linha of linhas) {
    let atual = linha;
    if (anterior !== null && linha.saldo !== null) {
      const delta = subtrai(linha.saldo, anterior);
      if (ehZero(delta)) continue;
      if (!igual(delta, linha.valor) && igual(modulo(delta), modulo(linha.valor))) atual = { ...linha, valor: delta };
    }
    ajustadas.push(atual);
    if (atual.saldo !== null) anterior = atual.saldo;
    else if (anterior !== null) anterior = soma(anterior, atual.valor);
  }
  return ajustadas;
}

/** `_mapear_colunas`: o papel de cada coluna, ou `null` se a linha não parece um cabeçalho. */
export function mapearColunas(linha: readonly Celula[]): Map<string, number> | null {
  const mapa = new Map<string, number>();
  linha.forEach((celula, indice) => {
    const rotulo = chave(celula);
    if (!rotulo) return;
    for (const [papel, aliases] of PAPEIS) {
      if (mapa.has(papel)) continue;
      if (aliases.some((a) => rotulo === a || rotulo.startsWith(a + " "))) {
        mapa.set(papel, indice);
        break;
      }
    }
  });
  const temDinheiro = ["valor", "credito", "debito"].some((p) => mapa.has(p));
  return mapa.has("data") && temDinheiro ? mapa : null;
}

// A célula da coluna de data tem de SER uma data, não conter uma ("Saldo a partir 04/05/12:" do
// Sicredi virava lançamento de 2012 e invertia o arquivo inteiro).
const SO_DATA = re("^\\d{1,4}[-/.]\\d{1,2}[-/.]\\d{1,4}(?:[ T]\\d{1,2}:\\d{2}(?::\\d{2})?(?:[.,]\\d+)?)?$");
const ISO = re("^(\\d{4})-(\\d{2})-(\\d{2})");

/** `_para_data` */
export function paraData(valor: Celula, referenciaAno: number): string | null {
  if (valor === null) return null;
  if (typeof valor !== "string" && valor.tipo === "datahora") return valor.valor.slice(0, 10);
  const texto = strip(strPy(valor));
  if (!SO_DATA.match(texto)) return null;
  const iso = ISO.match(texto);
  if (iso) return dataIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  return parseData(texto, referenciaAno);
}

/** `_para_decimal`: o número da célula, tipado ou como texto no formato brasileiro. */
export function paraDecimal(valor: Celula): Dec | null {
  if (valor === null || valor === "") return null;
  if (typeof valor === "string") return parseValor(valor);
  if (valor.tipo === "bool") return null;
  if (valor.tipo === "int" || valor.tipo === "float") {
    const d = decimal(strPy(valor));
    return d === null || d === NAO_FINITO ? null : d;
  }
  return parseValor(strPy(valor));
}

// ─── Arquivo → linhas ───────────────────────────────────────────────────────

/** O .xls como o `_linhas_xls`: data vira `datetime(*xldate_as_tuple(...))`. */
function linhasDoXls(bytes: Uint8Array): Celula[][] {
  const { datemode, folhas } = lerXls(bytes);
  const folha = folhas[0];
  if (!folha) throw new Error("list index out of range");
  return folha.linhas.map((linha) => linha.map((c: CelulaXls): Celula => celulaDoXls(c, datemode)));
}

function celulaDoXls(c: CelulaXls, datemode: 0 | 1): Celula {
  switch (c.tipo) {
    case "texto":
      return String(c.valor);
    case "numero":
      return { tipo: "float", valor: Number(c.valor) };
    case "data": {
      const [a, m, d, h, mi, s] = xldateComoTupla(Number(c.valor), datemode);
      return { tipo: "datahora", valor: strDatahora(a, m, d, h, mi, s) };
    }
    case "booleano":
    case "erro":
      return { tipo: "int", valor: BigInt(Number(c.valor)) };
    default:
      return "";
  }
}

/** `_ler_linhas`: CSV pelo nome; xlsx pela assinatura ZIP (há .xls que é xlsx renomeado) ou pelo nome. */
export function lerLinhas(bytes: Uint8Array, nomeArquivo: string): Celula[][] {
  const nome = (nomeArquivo || "").toLowerCase();
  if (nome.endsWith(".csv")) return linhasDoCsv(bytes);
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return linhasDoXlsx(bytes);
  if (nome.endsWith(".xlsx") || nome.endsWith(".xlsm")) return linhasDoXlsx(bytes);
  return linhasDoXls(bytes);
}

// ─── Leitura ────────────────────────────────────────────────────────────────

const ESPACOS = re("\\s+");

/** `_ler_blocos`: lê a planilha e devolve os blocos já em ordem crescente e com o sinal certo. */
export function lerBlocos(bytes: Uint8Array, nomeArquivo: string, referenciaAno: number | null = null, agora = new Date()): Bloco[] {
  const ano = referenciaAno || agora.getFullYear();
  let linhas: Celula[][];
  try {
    linhas = lerLinhas(bytes, nomeArquivo);
  } catch (e) {
    if (e instanceof ErroDePlanilha) throw e;
    throw new ErroDePlanilha(`Não foi possível abrir a planilha: ${e instanceof Error ? e.message : String(e)}`);
  }

  let mapa: Map<string, number> | null = null;
  let inicio = 0;
  for (let i = 0; i < linhas.length; i++) {
    mapa = mapearColunas(linhas[i]);
    if (mapa) {
      inicio = i + 1;
      break;
    }
  }
  if (!mapa) {
    throw new ErroDePlanilha(
      "A planilha não tem uma linha de cabeçalho reconhecível. Esperado ao menos uma coluna de data e uma de valor, crédito ou débito.",
    );
  }
  const colunas = mapa;
  const celula = (linha: readonly Celula[], papel: string): Celula => {
    const i = colunas.get(papel);
    if (i === undefined || i >= linha.length) return null;
    return linha[i];
  };

  // Uma planilha pode trazer mais de uma cadeia (o consolidado do Bradesco emenda dois períodos,
  // cada um com seu SALDO ANTERIOR): cada seção vira um bloco.
  let secoes: [Dec | null, LinhaDeMovimento[]][] = [[null, []]];
  for (const linha of linhas.slice(inicio)) {
    if (!linha.some((c) => !ehVazia(c))) continue;
    const textoHistorico = ["historico", "razao_social", "cpf_cnpj", "documento"]
      .filter((p) => !ehVazia(celula(linha, p)))
      .map((p) => strip(strPy(celula(linha, p))))
      .join(" ");

    if (ABERTURA.search(textoHistorico)) {
      const saldo = paraDecimal(celula(linha, "saldo"));
      const ultima = secoes[secoes.length - 1];
      if (ultima[1].length) secoes.push([saldo, []]);
      else secoes[secoes.length - 1] = [saldo, ultima[1]];
      continue;
    }
    // O rodapé tem a forma de um lançamento e não é um.
    if (FECHO.match(strip(textoHistorico))) continue;

    const data = paraData(celula(linha, "data"), ano);
    if (data === null) continue;

    const credito = paraDecimal(celula(linha, "credito"));
    const debito = paraDecimal(celula(linha, "debito"));
    let valor: Dec | null;
    if (credito !== null || debito !== null) {
      // Colunas separadas: o sinal vem de QUAL delas recebeu o número.
      if (credito !== null && !ehZero(credito)) valor = modulo(credito);
      else if (debito !== null && !ehZero(debito)) valor = oposto(modulo(debito));
      else continue;
    } else valor = paraDecimal(celula(linha, "valor"));
    if (valor === null || ehZero(valor)) continue;

    const historico = strip(ESPACOS.sub(" ", textoHistorico)) || "SEM DESCRIÇÃO";
    secoes[secoes.length - 1][1].push({ data, valor, saldo: paraDecimal(celula(linha, "saldo")), historico: corta(historico, 200) });
  }

  let todas = secoes.flatMap(([, s]) => s);
  if (!todas.length) {
    throw new ErroDePlanilha(
      "A planilha foi lida, mas nenhuma linha tinha data e valor ao mesmo tempo. Confira se o arquivo é um extrato de conta corrente.",
    );
  }
  // Decrescente vira bloco único (o corte das emendas cairia no lugar errado).
  if (decrescente(todas)) {
    todas = [...todas].reverse();
    secoes = [[null, todas]];
  }

  const blocos: Bloco[] = [];
  let idx = 0;
  for (const [saldoAnterior, linhasDaSecao] of secoes) {
    if (!linhasDaSecao.length) continue;
    const transacoes: Transacao[] = [];
    for (const atual of ajustarPeloSaldo(saldoAnterior, linhasDaSecao)) {
      transacoes.push({
        fitid: gerarFitid(atual.data, atual.historico, atual.valor, idx),
        data: atual.data,
        valor: atual.valor,
        historico: atual.historico,
        tipoOfx: compara(atual.valor, decimal("0") as Dec) > 0 ? "CREDIT" : "DEBIT",
        saldoApos: atual.saldo,
        ordem: idx,
      });
      idx++;
    }
    blocos.push(bloco(transacoes, saldoAnterior));
  }
  return blocos;
}

/** `parse_planilha`: as transações em ordem cronológica, com a cadeia de saldos conferida. */
export function lerPlanilha(bytes: Uint8Array, nomeArquivo: string, referenciaAno: number | null = null, agora = new Date()): Transacao[] {
  const blocos = lerBlocos(bytes, nomeArquivo, referenciaAno, agora);
  try {
    validarBlocos(blocos, TOLERANCIA_SALDO);
  } catch (e) {
    // A conferência é a do PDF; a frase serve nos dois casos, o nome da classe não.
    if (e instanceof ErroDeLeitura) throw new ErroDePlanilha(e.message);
    throw e;
  }
  return blocos.flatMap((b) => b.transacoes);
}
