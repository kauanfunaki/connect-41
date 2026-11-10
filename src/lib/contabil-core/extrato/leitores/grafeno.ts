// Porte de `extrato/bancos/grafeno.py`: Grafeno, data e hora em linhas diferentes, do mais recente
// ao mais antigo.
//
//     DATA / HORA  LANÇAMENTO  NOME · DOC · BANCO / AG / CONTA   VALOR (R$)  SALDO (R$)
//     31/07/2026   SALDO FINAL                                                R$ 555,68
//     16/07/2026   PIX Enviado  POTENCIAL SERVICOS ... LTDA      -R$200.000,00 R$ 813,16
//     10:44        06.915.323/0001-91 · Bco 237 · Ag 5755 · Cc 00252250-0
//     04:32        Recebimento de boletos                        +R$200.000,00 R$ 200.813,16
//     01/07/2026   SALDO INICIAL                                               R$ 827,09
//
// Uma linha que começa por hora é a continuação da anterior (CNPJ e banco da contraparte, o que a
// conciliação usa) ou um lançamento inteiro do dia já impresso acima: o que separa é ter valor.
// SALDO INICIAL e SALDO FINAL vêm impressos, então as duas pontas da cadeia são conferidas.

import { ehZero, type Dec } from "../../motor/decimal";
import { agruparLinhas, bloco, gerarFitid, ordenarDoMaisAntigo, parseData, parseValor, type Bloco, type Transacao } from "../comum";
import { corta, re, strip } from "../py";
import type { Leitor } from "./tipos";

const MOEDA = "[+-]?R\\$\\s?\\d{1,3}(?:\\.\\d{3})*,\\d{2}";
const PREFIXO = "(?:(\\d{2}/\\d{2}/\\d{4})|(\\d{2}:\\d{2}))";

// <data|hora> <descrição> <valor> <saldo>
const LINHA = re(`^${PREFIXO}\\s+(.*?)\\s+(${MOEDA})\\s+(${MOEDA})\\s*$`);

// <data> SALDO INICIAL|FINAL <saldo>   — um valor só
const LINHA_SALDO = re(`^${PREFIXO}\\s+SALDO\\s+(INICIAL|FINAL)\\s+(${MOEDA})\\s*$`, "i");

// <hora> <texto>   — continuação da linha de cima (CNPJ, banco, agência)
const CONTINUACAO = re("^(\\d{2}:\\d{2})\\s*(.*)$");

const ASSINATURA = re("\\bdata\\s*/\\s*hora\\b.*\\blan[çc]amento\\b.*\\bvalor\\b.*\\bsaldo\\b", "i");

const IGNORAR = re("^(Extrato\\s+Detalhado|Gerado em:|CNPJ:|Per[ií]odo:|Grafeno\\s)", "i");
const ESPACOS = re("\\s+");

// Marcador interno da continuação sem hora que veio de dentro das colunas da tabela.
const COMPLEMENTO_TABELA = "\x00COMPLEMENTO:";

function extrair(linhas: readonly string[], referenciaAno: number): Bloco[] {
  const transacoes: Transacao[] = [];
  let saldoInicial: Dec | null = null;
  let saldoFinal: Dec | null = null;
  let idx = 0;
  let ultimaData: string | null = null;

  for (const bruta of linhas) {
    const linha = strip(bruta);
    if (!linha || IGNORAR.match(linha) || ASSINATURA.search(linha)) continue;

    const marco = LINHA_SALDO.match(linha);
    if (marco) {
      const [dataStr, , qual, valorStr] = marco.grupos;
      if (dataStr) {
        const lida = parseData(dataStr, referenciaAno);
        if (lida) ultimaData = lida;
      }
      const saldo = parseValor(valorStr!);
      if (qual!.toUpperCase() === "INICIAL") saldoInicial = saldo;
      else saldoFinal = saldo;
      continue;
    }

    const casada = LINHA.match(linha);
    if (casada) {
      const [dataStr, , descricao, valorStr, saldoStr] = casada.grupos;
      if (dataStr) {
        const lida = parseData(dataStr, referenciaAno);
        if (lida) ultimaData = lida;
      }
      if (ultimaData === null) continue;
      const valor = parseValor(valorStr!);
      if (valor === null || ehZero(valor)) continue;
      const historico = strip(ESPACOS.sub(" ", descricao!)) || "SEM DESCRIÇÃO";
      transacoes.push({
        fitid: gerarFitid(ultimaData, historico, valor, idx),
        data: ultimaData,
        valor,
        historico: corta(historico, 200),
        tipoOfx: !valor.negativo && !ehZero(valor) ? "CREDIT" : "DEBIT",
        saldoApos: parseValor(saldoStr!),
        ordem: idx,
      });
      idx++;
      continue;
    }

    // Linha que começa por hora e não tem valor: é a continuação da de cima, e traz o CNPJ e o
    // banco da contraparte. Vale colar — permite resolver a contraparte por documento.
    const continuacao = CONTINUACAO.match(linha);
    if ((continuacao || linha.startsWith(COMPLEMENTO_TABELA)) && transacoes.length) {
      const complemento = continuacao ? strip(continuacao[2]!) : strip(linha.slice(COMPLEMENTO_TABELA.length));
      if (complemento) {
        const alvo = transacoes[transacoes.length - 1];
        const juntado = corta(strip(`${alvo.historico} ${complemento}`), 200);
        transacoes[transacoes.length - 1] = { ...alvo, historico: juntado };
      }
    }
  }

  if (!transacoes.length) return [];
  return [bloco(ordenarDoMaisAntigo(transacoes), saldoInicial, saldoFinal)];
}

export const grafeno: Leitor = {
  nome: "grafeno",
  siglas: new Set(["GRAFENO", "384", "310"]),
  reconhece: (linhas) => linhas.some((l) => ASSINATURA.search(l) !== null),
  /**
   * Preserva continuações sem hora somente dentro das colunas da tabela. Cabeçalhos e rodapés não
   * pertencem ao histórico; a posição das palavras distingue a continuação (inclusive `boletos`)
   * das informações do titular.
   */
  extrairDePalavras(paginas, referenciaAno) {
    const linhasTexto: string[] = [];
    for (const pagina of paginas) {
      let colunas: [number, number] | null = null;
      let naTabela = false;
      for (const palavras of agruparLinhas(pagina)) {
        const texto = palavras.map((p) => p.text).join(" ");
        if (ASSINATURA.search(texto)) {
          const nomes = palavras.map((p) => p.text.toUpperCase());
          const lancamento = palavras.find((p) => ["LANÇAMENTO", "LANCAMENTO"].includes(p.text.toUpperCase()));
          if (lancamento && nomes.includes("VALOR")) {
            colunas = [lancamento.x0, palavras[nomes.indexOf("VALOR")].x0];
            naTabela = true;
          }
          continue;
        }
        if (IGNORAR.match(texto)) {
          naTabela = false;
          continue;
        }
        if (!naTabela || colunas === null) continue;
        if (LINHA.match(texto) || LINHA_SALDO.match(texto) || CONTINUACAO.match(texto)) {
          linhasTexto.push(texto);
          continue;
        }
        const [de, ate] = colunas;
        if (palavras.every((p) => de <= p.x0 && p.x0 < ate)) {
          // Um marcador interno permite reutilizar a montagem do histórico sem inventar data/hora
          // nem ampliar a leitura textual genérica.
          linhasTexto.push(COMPLEMENTO_TABELA + texto);
        }
      }
    }
    return extrair(linhasTexto, referenciaAno);
  },
  extrair,
};
