// Porte de `extrato/bancos/c6.py`: C6, com duas colunas de data e a descrição quebrada em volta da
// linha. Vale a data do lançamento (a primeira), que é a que o extrato ordena e o contador concilia;
// nenhuma das duas tem ano, que sai do cabeçalho do período ("Maio 2025 ( 01/05/2025 - ...").
// A descrição longa quebra acima e abaixo da linha de dados sem deixar linha vazia; como o C6 só
// emite texto solto nesse caso, colar as vizinhas é seguro. `Saldo do dia` vem depois dos
// lançamentos e a lista é crescente: ele é o fechamento e ancora o último lançamento do dia.

import { ehZero } from "../../motor/decimal";
import { bloco, dataIso, gerarFitid, parseValor, type Transacao } from "../comum";
import { corta, inteiro, re, strip } from "../py";
import type { Leitor } from "./tipos";

const MOEDA = "-?R\\$\\s?\\d{1,3}(?:\\.\\d{3})*,\\d{2}";

const LINHA = re(`^(\\d{2}/\\d{2})\\s+(\\d{2}/\\d{2})\\s+(.*?)\\s+(${MOEDA})\\s*$`);
const SALDO_DIA = re(`^Saldo do dia\\s+(\\d{2}/\\d{2}/\\d{2})\\s+(${MOEDA})\\s*$`, "i");
const PERIODO = re("\\(\\s*\\d{2}/\\d{2}/(\\d{4})\\s*-");

const ASSINATURA = re("^Saldo do dia\\s+\\d{2}/\\d{2}/\\d{2}\\s+R\\$", "i");

const IGNORAR = re("^(Extrato\\s|Ag[eê]ncia:|Saldo do dia\\s|Data\\s*$|Tipo\\s|lan[çc]amento\\s|\\w+\\s+\\d{4}\\s*\\()", "i");
const ESPACOS = re("\\s+");

export const c6: Leitor = {
  nome: "c6",
  siglas: new Set(["C6", "C6BANK", "336"]),
  reconhece: (linhas) => linhas.some((l) => ASSINATURA.match(strip(l)) !== null),
  extrair(linhas, referenciaAno) {
    const limpas = linhas.map((l) => strip(l));

    let ano = referenciaAno;
    for (const linha of limpas) {
      const achado = PERIODO.search(linha);
      if (achado) {
        ano = inteiro(achado[1]!);
        break;
      }
    }

    const dataDe = (texto: string): string | null => {
      const [dia, mes] = texto.split("/");
      return dataIso(ano, inteiro(mes), inteiro(dia));
    };

    const ehEstrutural = (i: number): boolean => {
      if (!(i >= 0 && i < limpas.length) || !limpas[i]) return true;
      return Boolean(LINHA.match(limpas[i]) || SALDO_DIA.match(limpas[i]) || IGNORAR.match(limpas[i]));
    };

    const transacoes: Transacao[] = [];
    let idx = 0;
    let pendentesDoDia: number[] = [];

    limpas.forEach((linha, i) => {
      if (!linha) return;

      const fechamento = SALDO_DIA.match(linha);
      if (fechamento) {
        const saldo = parseValor(fechamento[2]!);
        if (saldo !== null && pendentesDoDia.length) {
          const ultimo = pendentesDoDia[pendentesDoDia.length - 1];
          transacoes[ultimo] = { ...transacoes[ultimo], saldoApos: saldo };
        }
        pendentesDoDia = [];
        return;
      }

      const casada = LINHA.match(linha);
      if (!casada) return;

      const [dataStr, , meio, valorStr] = casada.grupos;
      const dataLida = dataDe(dataStr!);
      const valor = parseValor(valorStr!);
      if (dataLida === null || valor === null || ehZero(valor)) return;

      const acima = i > 0 && !ehEstrutural(i - 1) ? limpas[i - 1] : "";
      const abaixo = !ehEstrutural(i + 1) ? limpas[i + 1] : "";
      let historico = [acima, strip(meio!), abaixo].filter(Boolean).join(" ");
      historico = strip(ESPACOS.sub(" ", historico)) || "SEM DESCRIÇÃO";

      transacoes.push({
        fitid: gerarFitid(dataLida, historico, valor, idx),
        data: dataLida,
        valor,
        historico: corta(historico, 200),
        tipoOfx: !valor.negativo && !ehZero(valor) ? "CREDIT" : "DEBIT",
        saldoApos: null,
        ordem: idx,
      });
      pendentesDoDia.push(transacoes.length - 1);
      idx++;
    });

    if (!transacoes.length) return [];
    return [bloco(transacoes)];
  },
};
