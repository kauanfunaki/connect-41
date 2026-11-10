// Porte de `extrato/bancos/santander.py`: Santander Empresas, decrescente, com a descrição ora na
// linha, ora nas linhas de texto puro em volta (a mesma regra do Bradesco). Não há SALDO ANTERIOR:
// o primeiro lançamento cronológico não tem contra o que ser conferido; os outros têm, porque o
// Santander imprime saldo em toda linha. A assinatura exige "Histórico", que o separa do Sicredi.

import { ehZero } from "../../motor/decimal";
import { bloco, gerarFitid, ordenarDoMaisAntigo, parseData, parseValor, type Transacao } from "../comum";
import { corta, re, strip } from "../py";
import type { Leitor } from "./tipos";

const NUM = "-?\\d{1,3}(?:\\.\\d{3})*,\\d{2}";
const DATA = "\\d{2}/\\d{2}/\\d{4}";
const LINHA = re(`^(${DATA})\\s+(?:(.*?)\\s+)?(${NUM})\\s+(${NUM})\\s*$`);
const ASSINATURA = re("\\bdata\\b.*\\bhist[óo]rico\\b.*\\bdocumento\\b.*\\bvalor\\b.*\\bsaldo\\b", "i");
const IGNORAR = re("^(Santander|Per[ií]odos?:|Saldo dispon[íi]vel|Data\\s+Hist)", "i");
const SO_DOCUMENTO = re("\\d+[\\d./-]*");
const ESPACOS = re("\\s+");

export const santander: Leitor = {
  nome: "santander",
  siglas: new Set(["SANTANDER", "033"]),
  reconhece: (linhas) => linhas.some((l) => ASSINATURA.search(l) !== null),
  extrair(linhas, referenciaAno) {
    const limpas = linhas.map((l) => strip(l));
    const transacoes: Transacao[] = [];
    let idx = 0;
    const ehEstrutural = (i: number) => {
      if (!(i >= 0 && i < limpas.length) || !limpas[i]) return true;
      return Boolean(LINHA.match(limpas[i]) || IGNORAR.match(limpas[i]));
    };
    limpas.forEach((linha, i) => {
      if (!linha || IGNORAR.match(linha)) return;
      const casada = LINHA.match(linha);
      if (!casada) return;
      const [dataStr, meioBruto, valorStr, saldoStr] = casada.grupos;
      const data = parseData(dataStr!, referenciaAno);
      const valor = parseValor(valorStr!);
      if (data === null || valor === null || ehZero(valor)) return;
      const meio = strip(meioBruto ?? "");
      let historico: string;
      // Quando a descrição quebra, a coluna Documento pode ser o único texto entre data e valor.
      if (meio && !SO_DOCUMENTO.fullmatch(meio)) historico = meio;
      else {
        const acima = i > 0 && !ehEstrutural(i - 1) ? limpas[i - 1] : "";
        const abaixo = !ehEstrutural(i + 1) ? limpas[i + 1] : "";
        historico = [acima, abaixo].filter(Boolean).join(" ");
      }
      historico = strip(ESPACOS.sub(" ", historico)) || "SEM DESCRIÇÃO";
      transacoes.push({
        fitid: gerarFitid(data, historico, valor, idx),
        data,
        valor,
        historico: corta(historico, 200),
        tipoOfx: !valor.negativo && !ehZero(valor) ? "CREDIT" : "DEBIT",
        saldoApos: parseValor(saldoStr!),
        ordem: idx,
      });
      idx++;
    });
    if (!transacoes.length) return [];
    return [bloco(ordenarDoMaisAntigo(transacoes))];
  },
};
