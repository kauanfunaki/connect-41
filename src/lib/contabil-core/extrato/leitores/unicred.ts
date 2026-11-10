// Porte de `extrato/bancos/unicred.py`: Unicred (cooperativa de crédito).
//
//     Coop: 582 - AG: 1740 - Conta: 182443
//     Data Lançamentos Valor (R$) Saldo (R$)
//     03/11/2025 PJ CONTA PJ 4 ( Doc.: 0 ) - R$ 129,50 -R$ 10.552,81
//     DEBITO TRANSFERENCIA PIX ( Doc.: DEB PIX /
//     03/11/2025 - R$ 100,00 -R$ 10.652,81
//     CALHAS COLOMBO IND E COM LTDA )
//
// - O sinal fica antes do `R$` (`- R$` com espaço no valor, `-R$` sem no saldo), e o saldo também
//   tem sinal: a conta pode passar o mês negativa.
// - Quando o texto é longo, a descrição envolve a linha de dados (acima e abaixo) e a linha fica só
//   com data, valor e saldo; o trecho de cima vem primeiro.
// - A assinatura é `Coop: 582 - AG: 1740`: Viacredi e Sicredi também imprimem "Cooperativa".
// - Nenhum saldo do cabeçalho é âncora, de propósito: `Saldo em ...` não carrega o sinal e `Saldo
//   atual` é o do momento da impressão. Vale a coluna `Saldo (R$)`, impressa em toda linha.

import { ehZero, oposto, type Dec } from "../../motor/decimal";
import { bloco, gerarFitid, parseData, parseValor, type Transacao } from "../comum";
import { corta, re, strip } from "../py";
import type { Leitor } from "./tipos";

const DATA = "\\d{2}/\\d{2}/\\d{4}";
// O sinal vem antes do "R$", com ou sem espaço entre os dois.
const VALOR = "-?\\s?R\\$\\s?\\d{1,3}(?:\\.\\d{3})*,\\d{2}";

const LINHA = re(`^(${DATA})\\s+(.*?)\\s*(${VALOR})\\s+(${VALOR})\\s*$`);

const ASSINATURA = re("Coop:\\s*\\d+\\s*-\\s*AG:\\s*\\d+", "i");

const IGNORAR = re(
  "^(Data\\s+Lan[çc]amentos|Per[ií]odo de|Coop:|Solicitado por|Saldo atual|" +
    "Saldo em \\d|Limite de cheque|Tarifas pendentes|Saldo bloq|" +
    "Lan[çc]amentos futuros|CENTRAL DE RELACIONAMENTO|\\d{4} \\d{3} \\d{4}|" +
    "0800 |Extrato\\s*$)",
  "i",
);
const ESPACOS = re("\\s+");

function ehEstrutural(linha: string): boolean {
  const limpa = strip(linha);
  return !limpa || Boolean(LINHA.match(limpa) || IGNORAR.match(limpa));
}

/** `- R$ 129,50` e `-R$ 10.552,81` chegam com o sinal separado do número. */
function valorDe(texto: string): Dec | null {
  const limpo = texto.replaceAll(" ", "");
  const negativo = limpo.startsWith("-");
  // `str.lstrip("-")`
  const valor = parseValor(limpo.replace(/^-+/, ""));
  if (valor === null) return null;
  return negativo ? oposto(valor) : valor;
}

export const unicred: Leitor = {
  nome: "unicred",
  siglas: new Set(["UNICRED", "136"]),
  reconhece: (linhas) => linhas.some((l) => ASSINATURA.search(l) !== null),
  extrair(linhas, referenciaAno) {
    const limpas = linhas.map((l) => strip(l));
    const transacoes: Transacao[] = [];
    let idx = 0;

    limpas.forEach((limpa, i) => {
      if (!limpa) return;

      const casada = LINHA.match(limpa);
      if (!casada) return;

      const [dataStr, meio, valorStr, saldoStr] = casada.grupos;
      const dataLida = parseData(dataStr!, referenciaAno);
      const valor = valorDe(valorStr!);
      const saldo = valorDe(saldoStr!);
      if (dataLida === null || valor === null || ehZero(valor)) return;

      let historico = strip(ESPACOS.sub(" ", meio!));
      if (!historico) {
        const acima = i > 0 && !ehEstrutural(limpas[i - 1]) ? limpas[i - 1] : "";
        const abaixo = i + 1 < limpas.length && !ehEstrutural(limpas[i + 1]) ? limpas[i + 1] : "";
        historico = strip([acima, abaixo].filter(Boolean).join(" "));
      }
      historico = ESPACOS.sub(" ", historico) || "SEM DESCRIÇÃO";

      transacoes.push({
        fitid: gerarFitid(dataLida, historico, valor, idx),
        data: dataLida,
        valor,
        historico: corta(historico, 200),
        tipoOfx: !valor.negativo && !ehZero(valor) ? "CREDIT" : "DEBIT",
        saldoApos: saldo,
        ordem: idx,
      });
      idx++;
    });

    if (!transacoes.length) return [];
    return [bloco(transacoes)];
  },
};
