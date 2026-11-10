// Porte de `extrato/bancos/fitbank.py`: o extrato do Omie.CASH, que é de um sistema e não de um
// banco — por isso o leitor é escolhido pela ASSINATURA, e um "Extrato de Sicredi" pode cair aqui.
//
// - Variante A (FitBank), duas colunas: Entradas e Saídas, com a coluna vazia escrita como `-`; a
//   posição diz o sinal.
// - Variante B, uma coluna de Valor: o sinal só pode vir do próprio número. A amostra só tinha
//   créditos, então o menos no débito é assumido; se o Omie escrever débito sem sinal, a cadeia
//   não fecha e o arquivo é recusado em vez de entrar com o sinal trocado.
//
// A data não tem ano (`01/06`): ele sai do "Período de 01/06/2026 até ...". As duas trazem SALDO
// ANTERIOR e saldo em toda linha, então a cadeia fecha inteira.

import { ehZero, modulo, oposto, type Dec } from "../../motor/decimal";
import { bloco, dataIso, gerarFitid, parseValor, type Transacao } from "../comum";
import { corta, inteiro, re, strip } from "../py";
import type { Leitor } from "./tipos";

const NUM = "\\d{1,3}(?:\\.\\d{3})*,\\d{2}";

// Variante A: <situação> <DD/MM> <descrição> <entradas|-> <saídas|-> <saldo>
const LINHA_DUAS_COLUNAS = re(`^(\\S+)\\s+(\\d{2}/\\d{2})\\s+(.*?)\\s+(-|${NUM})\\s+(-|${NUM})\\s+(${NUM})\\s*$`);

// Variante B: <situação> <DD/MM> <descrição> <valor> <saldo>
const LINHA_UMA_COLUNA = re(`^(\\S+)\\s+(\\d{2}/\\d{2})\\s+(.*?)\\s+(-?${NUM})\\s+(-?${NUM})\\s*$`);

const SALDO_ANTERIOR = re(`^(\\d{2}/\\d{2})\\s+SALDO ANTERIOR\\s+(${NUM})\\s*$`, "i");
const PERIODO = re("Per[ií]odo de\\s+\\d{2}/\\d{2}/(\\d{4})", "i");

// O que identifica o Omie é o par "Situação ... Cliente ou Fornecedor" no cabeçalho — nenhum banco
// desta base nomeia colunas assim. As duas variantes se separam depois, pela presença de "Entradas".
const ASSINATURA = re("\\bsitua[çc][ãa]o\\b.*\\bdata\\b.*\\bcliente ou fornecedor\\b.*\\bsaldo\\b", "i");
const TEM_DUAS_COLUNAS = re("\\bentradas\\b.*\\bsa[íi]das\\b", "i");
const ESPACOS = re("\\s+");

/** Variante A quando o cabeçalho separa Entradas de Saídas. */
function duasColunas(linhas: readonly string[]): boolean {
  for (const linha of linhas) {
    if (ASSINATURA.search(linha)) return TEM_DUAS_COLUNAS.search(linha) !== null;
  }
  return true;
}

function anoDoPeriodo(linhas: readonly string[], referenciaAno: number): number {
  for (const linha of linhas) {
    const achado = PERIODO.search(linha);
    if (achado) return inteiro(achado[1]!);
  }
  return referenciaAno;
}

export const fitbank: Leitor = {
  nome: "fitbank",
  siglas: new Set(["FITBANK", "OMIE", "OMIE.CASH", "450"]),
  reconhece: (linhas) => linhas.some((l) => ASSINATURA.search(l) !== null),
  extrair(linhas, referenciaAno) {
    const ano = anoDoPeriodo(linhas, referenciaAno);
    const variante = duasColunas(linhas);
    const padrao = variante ? LINHA_DUAS_COLUNAS : LINHA_UMA_COLUNA;
    const transacoes: Transacao[] = [];
    let saldoAnterior: Dec | null = null;
    let idx = 0;

    const dataDe = (texto: string): string | null => {
      const [dia, mes] = texto.split("/");
      return dataIso(ano, inteiro(mes), inteiro(dia));
    };

    for (const bruta of linhas) {
      const linha = strip(bruta);
      if (!linha) continue;

      const abertura = SALDO_ANTERIOR.match(linha);
      if (abertura) {
        saldoAnterior = parseValor(abertura[2]!);
        continue;
      }

      const casada = padrao.match(linha);
      if (!casada) continue;

      let dataStr: string;
      let descricao: string;
      let saldoStr: string;
      let valor: Dec | null;
      if (variante) {
        const [, data, desc, entradas, saidas, saldo] = casada.grupos as string[];
        [dataStr, descricao, saldoStr] = [data, desc, saldo];
        if (entradas !== "-") valor = parseValor(entradas);
        else if (saidas !== "-") {
          const bruto = parseValor(saidas);
          valor = bruto !== null ? oposto(modulo(bruto)) : null;
        } else continue;
      } else {
        const [, data, desc, valorStr, saldo] = casada.grupos as string[];
        [dataStr, descricao, saldoStr] = [data, desc, saldo];
        valor = parseValor(valorStr);
      }

      const dataLida = dataDe(dataStr);
      if (dataLida === null) continue;
      if (valor === null || ehZero(valor)) continue;

      const historico = strip(ESPACOS.sub(" ", descricao)) || "SEM DESCRIÇÃO";
      transacoes.push({
        fitid: gerarFitid(dataLida, historico, valor, idx),
        data: dataLida,
        valor,
        historico: corta(historico, 200),
        tipoOfx: !valor.negativo && !ehZero(valor) ? "CREDIT" : "DEBIT",
        saldoApos: parseValor(saldoStr),
        ordem: idx,
      });
      idx++;
    }

    if (!transacoes.length) return [];
    return [bloco(transacoes, saldoAnterior)];
  },
};
