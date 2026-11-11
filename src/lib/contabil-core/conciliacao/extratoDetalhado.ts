// Extrato detalhado do Itaú: o extrato com favorecido e CPF/CNPJ em cada linha (Fase 5,
// 11/11/2026). Porte de `conciliacao_bancaria/extrato_detalhado.py`.
//
// Não é a consulta de pagamentos do SISPAG nem o extrato consolidado: as colunas são Data,
// Lançamento, Razão Social, CPF/CNPJ, Valor e Saldo, e cada pagamento de um lote aparece separado.
//
// O saldo impresso é o da conta corrente SOMADA à aplicação automática: o banco varre o saldo para
// a aplicação e deixa R$ 1,00 na conta; o arquivo traz os resgates ("RES APLIC AUT MAIS"), nunca as
// aplicações. Por isso a conferência é
//
//     SALDO TOTAL DISPONÍVEL DIA = total do dia anterior + movimentos - resgates
//
// e "SALDO APLIC. AUT." é a aplicação no INÍCIO do dia (o total menos a conta corrente do dia
// anterior). Qualquer dia que não feche recusa o arquivo inteiro.

import { fixo, ehZero, igual, soma, subtrai, dec, type Dec } from "../motor/decimal";
import { removerAcentos } from "../motor/texto";
import { ehVazia, strPy, type Celula } from "../planilha/celula";
import { re, split, strip } from "../extrato/py";
import { dataBr, decimalDaCelula, FolhasInvalidas, lerFolhas, ou, strptimeDmy } from "./folhas";

/** O arquivo não é um extrato detalhado legível e conferido. */
export class ExtratoDetalhadoInvalido extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ExtratoDetalhadoInvalido";
  }
}

export type MovimentoDetalhado = {
  /** "AAAA-MM-DD" */
  readonly data: string;
  /** Positivo: entrada; negativo: saída. */
  readonly valor: Dec;
  readonly lancamento: string;
  readonly razaoSocial: string;
  readonly documento: string;
  /** Linha da planilha, para o usuário achar o movimento no original. */
  readonly linha: number;
  readonly resgateAplicacao: boolean;
};

export type ExtratoDetalhado = {
  nome: string;
  agencia: string;
  conta: string;
  periodoInicio: string | null;
  periodoFim: string | null;
  saldoAnterior: Dec;
  saldoFinal: Dec;
  diasConferidos: number;
  movimentos: MovimentoDetalhado[];
};

/** `_sem_acento`: sem acento, minúsculo e com os espaços colapsados. */
export function semAcento(texto: string): string {
  return split(removerAcentos(texto).toLowerCase()).join(" ");
}

const PAPEIS: [string, string][] = [
  ["data", "data"],
  ["lancamento", "lancamento"],
  ["razao social", "razao_social"],
  ["cpf", "documento"],
  ["valor", "valor"],
  ["saldo", "saldo"],
];
const SALDO_ANTERIOR = "saldo anterior";
const SALDO_TOTAL = "saldo total disponivel dia";
const SALDO_CONTA = "saldo movimentacao conta";
const SALDO_APLICACAO = "saldo aplic. aut.";
const RESGATE = "res aplic aut";

/** `_mapear`: o índice de cada papel, ou `null` se faltar alguma das seis colunas. */
export function mapear(linha: readonly Celula[]): Map<string, number> | null {
  const colunas = new Map<string, number>();
  linha.forEach((celula, i) => {
    const texto = semAcento(strPy(ou(celula, "")));
    for (const [prefixo, papel] of PAPEIS) {
      if (texto.startsWith(prefixo) && !colunas.has(papel)) colunas.set(papel, i);
    }
  });
  return PAPEIS.every(([, papel]) => colunas.has(papel)) ? colunas : null;
}

/** `_data`: "AAAA-MM-DD" ou `null`. */
export function dataDaCelula(valor: Celula): string | null {
  if (valor !== null && typeof valor !== "string" && valor.tipo === "datahora") return valor.valor.slice(0, 10);
  return strptimeDmy(strip(strPy(valor)));
}

/** `_decimal`: célula vazia ou só com espaço é `None`. */
export function decimalDetalhado(valor: Celula): Dec | null {
  if (valor === null || (typeof valor === "string" && !strip(valor))) return null;
  return decimalDaCelula(valor);
}

/** `_moeda`: "R$ 1.234,56" (`f"R$ {valor:,.2f}"` com ponto e vírgula trocados). */
export function moeda(valor: Dec): string {
  const t = fixo(valor, 2);
  const negativo = t.startsWith("-");
  const [inteira, fracao] = (negativo ? t.slice(1) : t).split(".");
  const agrupada = inteira.replace(/\B(?=(\d{3})+$)/g, ".");
  return `R$ ${negativo ? "-" : ""}${agrupada},${fracao}`;
}

const DATA_NO_TEXTO = re("\\d{2}/\\d{2}/\\d{4}");

/** `_periodo`: as duas datas do "Período:", ou nenhuma. */
export function periodo(texto: string): [string | null, string | null] {
  const datas = DATA_NO_TEXTO.findallTextos(texto);
  if (datas.length !== 2) return [null, null];
  return [dataDaCelula(datas[0]), dataDaCelula(datas[1])];
}

const OLE = [0xd0, 0xcf, 0x11, 0xe0];

/** `_linhas`: a folha que tem a tabela (ou todas, se nenhuma tiver). */
function linhasDoArquivo(conteudo: Uint8Array): Celula[][] {
  const zip = conteudo[0] === 0x50 && conteudo[1] === 0x4b;
  if (!zip && !OLE.every((b, i) => conteudo[i] === b)) {
    throw new ExtratoDetalhadoInvalido("Envie o extrato detalhado do Itaú em XLS ou XLSX.");
  }
  let folhas: Celula[][][];
  try {
    folhas = lerFolhas(conteudo).map((f) => f.linhas.map((linha) => [...linha]));
  } catch (e) {
    if (e instanceof FolhasInvalidas) throw new ExtratoDetalhadoInvalido(e.message);
    throw e;
  }
  const comTabela = folhas.filter((linhas) => linhas.some((linha) => mapear(linha) !== null));
  if (comTabela.length > 1) {
    throw new ExtratoDetalhadoInvalido("O arquivo tem mais de uma folha com lançamentos. Envie um extrato por arquivo.");
  }
  return comTabela.length ? comTabela[0] : folhas.flat();
}

const ROTULOS_DO_CABECALHO = new Set(["nome", "agencia", "conta", "periodo"]);

/** `ler_extrato_detalhado` */
export function lerExtratoDetalhado(conteudo: Uint8Array): ExtratoDetalhado {
  const linhas = linhasDoArquivo(conteudo);
  const cabecalho = new Map<string, string>();
  let colunas: Map<string, number> | null = null;
  const movimentos: MovimentoDetalhado[] = [];
  let saldoAnterior: Dec | null = null;
  let total: Dec | null = null; // último SALDO TOTAL conferido
  let acumulado = dec("0");
  let contaFimDia: Dec | null = null;
  let totalFimDia: Dec | null = null;
  let dias = 0;
  let pendentes = 0; // movimentos ainda não conferidos por um saldo total

  for (const [indice, linha] of linhas.entries()) {
    const numero = indice + 1;
    if (colunas === null) {
      const textos = linha.filter((c) => !ehVazia(c)).map((c) => strip(strPy(c)));
      for (let i = 0; i < textos.length - 1; i++) {
        const rotulo = semAcento(textos[i]).replace(/:+$/, ""); // .rstrip(":")
        if (ROTULOS_DO_CABECALHO.has(rotulo) && !cabecalho.has(rotulo)) cabecalho.set(rotulo, textos[i + 1]);
      }
      colunas = mapear(linha);
      continue;
    }
    if (linha.every((c) => ehVazia(c))) continue;

    const mapa = colunas;
    const celula = (papel: string): Celula => {
      const i = mapa.get(papel)!;
      return i < linha.length ? linha[i] : null;
    };

    const data = dataDaCelula(celula("data"));
    const lancamento = strip(strPy(ou(celula("lancamento"), "")));
    const rotulo = semAcento(lancamento);
    const valor = decimalDetalhado(celula("valor"));
    const saldo = decimalDetalhado(celula("saldo"));
    if (data === null) {
      const descricao = lancamento || "linha sem texto";
      throw new ExtratoDetalhadoInvalido(`Linha ${numero}: data ausente ou ilegível em "${descricao}".`);
    }

    if (rotulo === SALDO_ANTERIOR) {
      if (saldo === null || saldoAnterior !== null || movimentos.length) {
        throw new ExtratoDetalhadoInvalido(`Linha ${numero}: o saldo anterior deve aparecer uma vez, antes dos movimentos.`);
      }
      saldoAnterior = total = saldo;
      continue;
    }
    if (valor === null) {
      if (saldo === null || ![SALDO_TOTAL, SALDO_CONTA, SALDO_APLICACAO].includes(rotulo)) {
        throw new ExtratoDetalhadoInvalido(
          `Linha ${numero}: "${lancamento}" não tem valor e não é um saldo conhecido ` +
            "do extrato detalhado. O arquivo não foi lido para não omitir movimentos.",
        );
      }
      if (total === null) {
        throw new ExtratoDetalhadoInvalido("O extrato não informa o SALDO ANTERIOR; sem ele os saldos não podem ser conferidos.");
      }
      if (rotulo === SALDO_TOTAL) {
        const esperado = soma(total, acumulado);
        if (!igual(saldo, esperado)) {
          throw new ExtratoDetalhadoInvalido(
            `Em ${dataBr(data)} o saldo total impresso é ${moeda(saldo)}, mas os ` +
              `movimentos lidos levam a ${moeda(esperado)}. O arquivo não foi ` +
              "importado para não registrar uma leitura incompleta.",
          );
        }
        total = saldo;
        acumulado = dec("0");
        pendentes = 0;
        totalFimDia = saldo;
        dias += 1;
      } else if (rotulo === SALDO_CONTA) {
        contaFimDia = saldo;
      } else if (totalFimDia !== null && contaFimDia !== null) {
        // Aplicação no início do dia = total - conta corrente do dia anterior.
        if (!igual(saldo, subtrai(totalFimDia, contaFimDia))) {
          throw new ExtratoDetalhadoInvalido(
            `Em ${dataBr(data)} o saldo da aplicação automática é ${moeda(saldo)}, ` +
              "diferente do total menos a conta corrente do dia anterior " +
              `(${moeda(subtrai(totalFimDia, contaFimDia))}).`,
          );
        }
      }
      continue;
    }
    if (saldo !== null) {
      throw new ExtratoDetalhadoInvalido(
        `Linha ${numero}: movimento com valor e saldo na mesma linha não segue o ` + "modelo do extrato detalhado reconhecido.",
      );
    }
    if (ehZero(valor)) continue;
    const resgate = rotulo.startsWith(RESGATE);
    if (!resgate) acumulado = soma(acumulado, valor);
    pendentes += 1;
    movimentos.push({
      data,
      valor,
      lancamento,
      razaoSocial: strip(strPy(ou(celula("razao_social"), ""))),
      documento: strip(strPy(ou(celula("documento"), ""))),
      linha: numero,
      resgateAplicacao: resgate,
    });
  }

  if (colunas === null) {
    throw new ExtratoDetalhadoInvalido(
      "Não encontrei a tabela do extrato detalhado (colunas Data, Lançamento, Razão Social, CPF/CNPJ, Valor e Saldo).",
    );
  }
  if (saldoAnterior === null || total === null) throw new ExtratoDetalhadoInvalido("O extrato não informa o SALDO ANTERIOR.");
  if (!movimentos.length) throw new ExtratoDetalhadoInvalido("O extrato detalhado não tem movimentos.");
  if (pendentes) {
    throw new ExtratoDetalhadoInvalido(
      `${pendentes} movimento(s) após o último saldo total não puderam ser conferidos. Envie o extrato completo do período.`,
    );
  }
  const [inicio, fim] = periodo(cabecalho.get("periodo") ?? "");
  const fora = movimentos.filter((m) => inicio && fim && !(inicio <= m.data && m.data <= fim));
  if (fora.length) {
    throw new ExtratoDetalhadoInvalido(
      `${fora.length} movimento(s) fora do período declarado no extrato (primeiro na linha ${fora[0].linha}).`,
    );
  }
  return {
    nome: cabecalho.get("nome") ?? "",
    agencia: cabecalho.get("agencia") ?? "",
    conta: cabecalho.get("conta") ?? "",
    periodoInicio: inicio,
    periodoFim: fim,
    saldoAnterior,
    saldoFinal: total,
    diasConferidos: dias,
    movimentos,
  };
}
