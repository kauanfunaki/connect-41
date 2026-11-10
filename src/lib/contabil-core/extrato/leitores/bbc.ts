// Porte de `extrato/bancos/bbc.py`: BBC, com cabeçalho de dia que traz o saldo de FECHAMENTO daquele
// dia. A ordem é decrescente (dia a dia e dentro do dia) e o "Saldo do dia" vem impresso ANTES dos
// lançamentos dele: pertence ao ÚLTIMO lançamento do dia em ordem cronológica, não ao primeiro que
// aparece embaixo. Ancorar no lugar errado desloca a cadeia por um dia inteiro de movimento. A capa
// traz as duas pontas (saldo inicial e final do período), então a cadeia é conferida inteira.

import type { Dec } from "../../motor/decimal";
import { ehZero } from "../../motor/decimal";
import { bloco, dataIso, gerarFitid, parseValor, type Transacao } from "../comum";
import { corta, inteiro, re, strip } from "../py";
import type { Leitor } from "./tipos";

const MOEDA = "[+-]?R\\$\\s?\\d{1,3}(?:\\.\\d{3})*,\\d{2}";

const MESES: Record<string, number> = {
  JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6,
  JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12,
};

// 12 AGO 2026 Saldo do dia: R$ 24.072,71
const CABECALHO_DIA = re(`^(\\d{1,2})\\s+([A-Z]{3})\\s+(\\d{4})\\s+Saldo do dia:\\s*(${MOEDA})\\s*$`, "i");

// <descrição> <valor>
const LINHA = re(`^(.*?)\\s+(${MOEDA})\\s*$`);

const SALDO_INICIAL = re("Saldo inicial do per[ií]odo", "i");
const SALDO_FINAL = re("Saldo final do per[ií]odo", "i");
const SO_MOEDAS = re(`^(?:${MOEDA})(?:\\s+(?:${MOEDA}))*$`);
const MOEDAS = re(MOEDA);
const ESPACOS = re("\\s+");

const ASSINATURA = re("Saldo do dia:\\s*R\\$", "i");

/**
 * O saldo inicial e o final da capa: os rótulos vêm numa linha e os valores na seguinte, lado a
 * lado e na mesma ordem (é assim que o PDF diagrama as quatro caixas do resumo).
 */
function pontas(linhas: readonly string[]): [Dec | null, Dec | null] {
  for (let i = 0; i < linhas.length; i++) {
    const linha = strip(linhas[i]);
    if (!(SALDO_INICIAL.search(linha) && SALDO_FINAL.search(linha))) continue;
    for (const seguinte of linhas.slice(i + 1, i + 3)) {
      const valores = MOEDAS.findallTextos(strip(seguinte));
      if (valores.length === 4 && SO_MOEDAS.match(strip(seguinte))) return [parseValor(valores[0]), parseValor(valores[3])];
    }
  }
  return [null, null];
}

type Dia = [data: string, saldo: Dec | null, lancamentos: Transacao[]];

export const bbc: Leitor = {
  nome: "bbc",
  siglas: new Set(["BBC", "BBCDIGITAL"]),
  reconhece(linhas) {
    const temDia = linhas.some((l) => CABECALHO_DIA.match(strip(l)) !== null);
    return temDia && linhas.some((l) => ASSINATURA.search(l) !== null);
  },
  extrair(linhas) {
    const [inicial, final] = pontas(linhas);

    // Um grupo por dia, na ordem em que aparecem (do mais recente ao mais antigo).
    const dias: Dia[] = [];
    let idx = 0;

    for (const bruta of linhas) {
      const linha = strip(bruta);
      if (!linha) continue;

      const cabecalho = CABECALHO_DIA.match(linha);
      if (cabecalho) {
        const [dia, mesTxt, ano, saldoTxt] = cabecalho.grupos;
        const mes = MESES[mesTxt!.toUpperCase()];
        if (!mes) continue;
        const dataLida = dataIso(inteiro(ano!), mes, inteiro(dia!));
        if (dataLida === null) continue;
        dias.push([dataLida, parseValor(saldoTxt!), []]);
        continue;
      }

      // Ainda na capa: os valores do resumo não são lançamentos.
      if (!dias.length) continue;
      if (SO_MOEDAS.match(linha)) continue;

      const casada = LINHA.match(linha);
      if (!casada) continue;
      const [descricao, valorStr] = casada.grupos;
      const valor = parseValor(valorStr!);
      if (valor === null || ehZero(valor)) continue;
      const historico = strip(ESPACOS.sub(" ", descricao!));
      if (!historico) continue;

      const [dataLida, , lancamentos] = dias[dias.length - 1];
      lancamentos.push({
        fitid: gerarFitid(dataLida, historico, valor, idx),
        data: dataLida,
        valor,
        historico: corta(historico, 200),
        tipoOfx: !valor.negativo && !ehZero(valor) ? "CREDIT" : "DEBIT",
        saldoApos: null,
        ordem: idx,
      });
      idx++;
    }

    const transacoes: Transacao[] = [];
    // Do dia mais antigo para o mais recente, e dentro do dia idem. O saldo do cabeçalho é o de
    // fechamento, então vai no ÚLTIMO lançamento do dia.
    for (const [, saldo, lancamentos] of [...dias].reverse()) {
      if (!lancamentos.length) continue;
      const cronologicos = [...lancamentos].reverse();
      if (saldo !== null) cronologicos[cronologicos.length - 1] = { ...cronologicos[cronologicos.length - 1], saldoApos: saldo };
      transacoes.push(...cronologicos);
    }

    if (!transacoes.length) return [];
    return [bloco(transacoes, inicial, final)];
  },
};
