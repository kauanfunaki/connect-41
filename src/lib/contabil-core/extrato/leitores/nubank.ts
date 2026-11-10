// Porte de `extrato/bancos/nubank.py`: o sinal vem da SEÇÃO em que a linha está, não do número.
//
//     Movimentações
//     09 OUT 2025  Total de entradas   + 300,00
//       Transferência Recebida Fulano                 300,00
//                  Total de saídas     - 250,00
//       Aplicação RDB                                 250,00
//                  Saldo do dia                        50,00
//
// Os valores dos lançamentos não têm sinal: entre "Total de entradas" e "Total de saídas" é
// crédito; entre "Total de saídas" e "Saldo do dia", débito. "Saldo do dia" fecha o dia e a lista é
// crescente, então pertence ao último lançamento do dia (sem inversão). Os mesmos rótulos aparecem
// no resumo da capa, por isso a leitura só começa depois de "Movimentações".

import { ehZero, modulo, oposto, type Dec } from "../../motor/decimal";
import { bloco, dataIso, gerarFitid, parseValor, type Transacao } from "../comum";
import { corta, inteiro, re, strip } from "../py";
import type { Leitor } from "./tipos";

const NUM = "\\d{1,3}(?:\\.\\d{3})*,\\d{2}";

const MESES = new Map<string, number>([
  ["JAN", 1], ["FEV", 2], ["MAR", 3], ["ABR", 4], ["MAI", 5], ["JUN", 6],
  ["JUL", 7], ["AGO", 8], ["SET", 9], ["OUT", 10], ["NOV", 11], ["DEZ", 12],
]);

const INICIO = re("^Movimenta[çc][õo]es\\s*$", "i");
const DIA = re("^(\\d{1,2})\\s+([A-Z]{3})\\s+(\\d{4})\\b", "i");
const ENTRADAS = re("Total de entradas", "i");
const SAIDAS = re("Total de sa[íi]das", "i");
const SALDO_DIA = re(`^Saldo do dia\\s+(${NUM})\\s*$`, "i");
const LINHA = re(`^(.*?)\\s+(${NUM})\\s*$`);

const ASSINATURA = re("^Saldo do dia\\s+\\d", "i");
const SALDO_INICIAL = re(`^Saldo inicial\\s+(${NUM})\\s*$`, "i");
const SALDO_FINAL = re(`^Saldo final do per[ií]odo\\s+(${NUM})\\s*$`, "i");
const ESPACOS = re("\\s+");

type Dia = { data: string; saldo: Dec | null; lancamentos: Transacao[] };

export const nubank: Leitor = {
  nome: "nubank",
  siglas: new Set(["NUBANK", "NU", "260"]),
  reconhece(linhas) {
    const temMovimentacoes = linhas.some((l) => INICIO.match(strip(l)) !== null);
    const temSaldoDoDia = linhas.some((l) => ASSINATURA.match(strip(l)) !== null);
    const temDia = linhas.some((l) => DIA.match(strip(l)) !== null);
    return temMovimentacoes && temSaldoDoDia && temDia;
  },
  extrair(linhas) {
    // As duas pontas ficam na capa, ANTES de "Movimentações". Sem elas, um extrato de um dia só
    // tem uma âncora e nada pode ser conferido.
    let saldoInicial: Dec | null = null;
    let saldoFinal: Dec | null = null;
    for (const bruta of linhas) {
      const linha = strip(bruta);
      if (saldoInicial === null) {
        const achado = SALDO_INICIAL.match(linha);
        if (achado) saldoInicial = parseValor(achado[1]!);
      }
      const achado = SALDO_FINAL.match(linha);
      if (achado) saldoFinal = parseValor(achado[1]!);
    }

    let comecou = false;
    let sinal = 0;
    let diaAtual: string | null = null;
    const dias: Dia[] = [];
    let idx = 0;

    for (const bruta of linhas) {
      const linha = strip(bruta);
      if (!linha) continue;

      if (!comecou) {
        comecou = INICIO.match(linha) !== null;
        continue;
      }

      const cabecalho = DIA.match(linha);
      if (cabecalho) {
        const [dia, mesTxt, ano] = cabecalho.grupos;
        const mes = MESES.get(mesTxt!.toUpperCase());
        if (mes) {
          // `date(...)` com ValueError vira None.
          diaAtual = dataIso(inteiro(ano!), mes, inteiro(dia!));
          if (diaAtual !== null && (!dias.length || dias[dias.length - 1].data !== diaAtual)) {
            dias.push({ data: diaAtual, saldo: null, lancamentos: [] });
          }
        }
        // A própria linha do dia abre a seção de entradas.
        sinal = ENTRADAS.search(linha) ? 1 : sinal;
        continue;
      }

      const fechamento = SALDO_DIA.match(linha);
      if (fechamento && dias.length) {
        dias[dias.length - 1] = { ...dias[dias.length - 1], saldo: parseValor(fechamento[1]!) };
        sinal = 0;
        continue;
      }

      if (ENTRADAS.search(linha)) {
        sinal = 1;
        continue;
      }
      if (SAIDAS.search(linha)) {
        sinal = -1;
        continue;
      }

      if (sinal === 0 || !dias.length) continue;

      const ultimo = dias[dias.length - 1];
      const casada = LINHA.match(linha);
      if (!casada) {
        // Continuação da descrição (agência, conta, documento).
        if (ultimo.lancamentos.length) {
          const pos = ultimo.lancamentos.length - 1;
          const alvo = ultimo.lancamentos[pos];
          ultimo.lancamentos[pos] = { ...alvo, historico: corta(strip(`${alvo.historico} ${linha}`), 200) };
        }
        continue;
      }

      const [descricao, valorStr] = casada.grupos;
      const bruto = parseValor(valorStr!);
      if (bruto === null || ehZero(bruto)) continue;
      // `abs(bruto) * sinal`
      const valor = sinal === 1 ? modulo(bruto) : oposto(modulo(bruto));
      const historico = strip(ESPACOS.sub(" ", descricao!)) || "SEM DESCRIÇÃO";
      ultimo.lancamentos.push({
        fitid: gerarFitid(ultimo.data, historico, valor, idx),
        data: ultimo.data,
        valor,
        historico: corta(historico, 200),
        tipoOfx: !valor.negativo && !ehZero(valor) ? "CREDIT" : "DEBIT",
        saldoApos: null,
        ordem: idx,
      });
      idx++;
    }

    const transacoes: Transacao[] = [];
    for (const { saldo, lancamentos } of dias) {
      if (!lancamentos.length) continue;
      if (saldo !== null) lancamentos[lancamentos.length - 1] = { ...lancamentos[lancamentos.length - 1], saldoApos: saldo };
      transacoes.push(...lancamentos);
    }

    if (!transacoes.length) return [];
    return [bloco(transacoes, saldoInicial, saldoFinal)];
  },
};
