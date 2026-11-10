// Porte de `extrato/bancos/safra.py`: Extrato de Movimentação do Banco Safra.
//
//     Data Lançamento Complemento Nº Documento Valor (R$)
//     29/07 PIX ENVIADO COUTINHO INCORPORADORA DE 268724779 -100.000,00
//     BENS 46515935000101
//     29/07 SALDO TOTAL 1.986,41
//
// A data não traz o ano: ele vem do `referenciaAno` que o parser resolve pelo período do cabeçalho
// (um extrato de dezembro lido em janeiro cairia no ano errado inteiro). `SALDO TOTAL` e `SALDO
// INICIAL` têm a forma de lançamento mas são âncora — somá-los duplicaria o saldo; `SALDO TOTAL`
// fecha o dia e pertence ao ÚLTIMO lançamento dele. A descrição transborda só para baixo.

import { ehZero, type Dec } from "../../motor/decimal";
import { bloco, gerarFitid, parseData, parseValor, type Transacao } from "../comum";
import { corta, re, strip } from "../py";
import type { Leitor } from "./tipos";

const DATA = "\\d{2}/\\d{2}";
const VALOR = "-?\\d{1,3}(?:\\.\\d{3})*,\\d{2}";

const LINHA = re(`^(${DATA})\\s+(.+?)\\s+(${VALOR})\\s*$`);

// Rótulos que ocupam a coluna de descrição mas não são movimento.
const SALDO_DO_DIA = re("^SALDO\\s+TOTAL$", "i");
const SALDO_ABERTURA = re("^SALDO\\s+INICIAL$", "i");

const ASSINATURA = re("Banco Safra S/?A|Extrato de Movimenta[çc][ãa]o", "i");

const IGNORAR = re(
  "^(Data\\s+Lan[çc]amento|LAN[ÇC]AMENTOS REALIZADOS|CNPJ:|Per[ií]odo de|" +
    "Saldo \\+ Limite|R\\$\\s|CENTRAL DE SUPORTE|\\(\\d{2}\\)\\s|\\d{4} \\d{3} \\d{4}|" +
    "personalizado|a 6[ªa] feira|\\d{2}h, exceto|P[áa]gina \\d)",
  "i",
);
const ESPACOS = re("\\s+");

function ehEstrutural(linha: string): boolean {
  const limpa = strip(linha);
  return !limpa || Boolean(LINHA.match(limpa) || IGNORAR.match(limpa));
}

export const safra: Leitor = {
  nome: "safra",
  siglas: new Set(["SAFRA", "422"]),
  reconhece: (linhas) => linhas.some((l) => ASSINATURA.search(l) !== null),
  extrair(linhas, referenciaAno) {
    const limpas = linhas.map((l) => strip(l));
    const transacoes: Transacao[] = [];
    let saldoAnterior: Dec | null = null;
    let idx = 0;

    limpas.forEach((limpa, i) => {
      if (!limpa || IGNORAR.match(limpa)) return;

      const casada = LINHA.match(limpa);
      if (!casada) return;

      const [dataStr, meio, valorStr] = casada.grupos;
      const dataLida = parseData(dataStr!, referenciaAno);
      const valor = parseValor(valorStr!);
      if (dataLida === null || valor === null) return;

      const rotulo = strip(ESPACOS.sub(" ", meio!));

      if (SALDO_DO_DIA.match(rotulo)) {
        const ultima = transacoes[transacoes.length - 1];
        if (ultima && ultima.data === dataLida) transacoes[transacoes.length - 1] = { ...ultima, saldoApos: valor };
        return;
      }

      if (SALDO_ABERTURA.match(rotulo)) {
        // Só vale como abertura do extrato se nada foi lido ainda; no meio do arquivo é a abertura
        // de um dia, e a cadeia já a cobre.
        if (!transacoes.length && saldoAnterior === null) saldoAnterior = valor;
        return;
      }

      if (ehZero(valor)) return;

      let historico = rotulo;
      // A descrição transborda para a linha de baixo quando não cabe.
      if (i + 1 < limpas.length && !ehEstrutural(limpas[i + 1])) historico = strip(`${historico} ${limpas[i + 1]}`);
      historico = ESPACOS.sub(" ", historico) || "SEM DESCRIÇÃO";

      transacoes.push({
        fitid: gerarFitid(dataLida, historico, valor, idx),
        data: dataLida,
        valor,
        historico: corta(historico, 200),
        tipoOfx: !valor.negativo && !ehZero(valor) ? "CREDIT" : "DEBIT",
        saldoApos: null,
        ordem: idx,
      });
      idx++;
    });

    if (!transacoes.length) return [];
    return [bloco(transacoes, saldoAnterior)];
  },
};
