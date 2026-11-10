// Porte de `extrato/bancos/inter.py`: Banco Inter, em que a data é cabeçalho de seção, não da linha.
//
//     2 de Janeiro de 2026 Saldo do dia: R$ 1.575,54
//     Pix enviado: "Cp :60701190-Fulano" -R$ 40,00 R$ 710,83
//
// O cabeçalho do dia vem por extenso e vale para as linhas abaixo dele até o próximo; a linha do
// lançamento não tem data. Os valores trazem "R$" com o sinal antes do símbolo. O "Saldo do dia"
// do cabeçalho é o FECHAMENTO do dia, por isso não serve de saldo anterior: a conferência é a cadeia
// de saldos, que o Inter imprime em toda linha.

import { ehZero, naoNegativo } from "../../motor/decimal";
import { bloco, gerarFitid, parseDataExtenso, parseValor, type Transacao } from "../comum";
import { corta, re, strip } from "../py";
import type { Leitor } from "./tipos";

const MOEDA = "-?R\\$\\s?\\d{1,3}(?:\\.\\d{3})*,\\d{2}";

// <descrição> <valor> <saldo>
const LINHA = re(`^(.*?)\\s+(${MOEDA})\\s+(${MOEDA})\\s*$`);

const CABECALHO_DIA = re("^\\d{1,2}\\s+de\\s+[A-Za-zçÇãÃéÉ]+\\s+de\\s+\\d{4}\\b");

const IGNORAR = re(
  "^(Solicitado em:|CPF/CNPJ:|Per[ií]odo:|Saldo total|\\(bloqueado|Fale com a gente|SAC:|Ouvidoria|Defici[eê]ncia)",
  "i",
);
const ESPACOS = re("\\s+");

export const inter: Leitor = {
  nome: "inter",
  siglas: new Set(["INTER", "077"]),
  reconhece(linhas) {
    for (const linha of linhas.slice(0, 40)) {
      if (linha.toLowerCase().includes("banco inter")) return true;
      if (CABECALHO_DIA.match(strip(linha)) && linha.toLowerCase().includes("saldo do dia")) return true;
    }
    return false;
  },
  extrair(linhas) {
    const transacoes: Transacao[] = [];
    let idx = 0;
    let dia: string | null = null;

    for (const raw of linhas) {
      const linha = strip(raw);
      if (!linha || IGNORAR.match(linha)) continue;

      if (CABECALHO_DIA.match(linha)) {
        const d = parseDataExtenso(linha);
        if (d) dia = d;
        continue;
      }

      const m = LINHA.match(linha);
      if (!m || dia === null) continue;

      const [descricao, valorStr, saldoStr] = m.grupos;
      const valor = parseValor(valorStr!);
      if (valor === null || ehZero(valor)) continue;

      const historico = ESPACOS.sub(" ", strip(descricao!)) || "SEM DESCRIÇÃO";

      transacoes.push({
        fitid: gerarFitid(dia, historico, valor, idx),
        data: dia,
        valor,
        historico: corta(historico, 200),
        tipoOfx: naoNegativo(valor) ? "CREDIT" : "DEBIT",
        saldoApos: parseValor(saldoStr!),
        ordem: idx,
      });
      idx++;
    }

    return transacoes.length ? [bloco(transacoes)] : [];
  },
};
