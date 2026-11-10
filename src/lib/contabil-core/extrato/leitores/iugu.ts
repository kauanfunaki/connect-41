// Porte de `extrato/bancos/iugu.py`: conta Iugu (instituição de pagamento).
//
//     01/04/2026 Saldo do dia R$ 19.271,55
//     01/04/2026 Recebimento por PIX de M2 COMUNICACAO VISUAL ✓ Conciliado R$ 17.647,66
//     01/04/2026 Pagamento por PIX para Fulano ✓ Conciliado - R$ 120,00
//
// O "Saldo do dia" vem no TOPO e é o FECHAMENTO, com a lista CRESCENTE: o saldo do cabeçalho
// pertence ao ÚLTIMO lançamento do dia, sem inverter nada (a inversão da Cora não serve aqui). A
// coluna "Saldo" fica vazia por lançamento; a âncora é a do dia. O status "✓ Conciliado" é coluna
// própria e sai do histórico, senão atrapalharia o casamento por nome do NEO.

import { ehZero, oposto, type Dec } from "../../motor/decimal";
import { bloco, gerarFitid, parseData, parseValor, type Transacao } from "../comum";
import { corta, re, strip } from "../py";
import type { Leitor } from "./tipos";

const DATA = "\\d{2}/\\d{2}/\\d{4}";
const NUMERO = "\\d{1,3}(?:\\.\\d{3})*,\\d{2}";

const CABECALHO_DIA = re(`^(${DATA})\\s+Saldo do dia\\s+R\\$\\s*(-?${NUMERO})\\s*$`, "i");
// O fecho também começa com data ("30/04/2026 Saldo final R$ 486,62") e tem a forma exata de um
// crédito: sem reconhecê-lo à parte, o extrato ganhava um crédito fantasma no fim. Como é o saldo
// de fechamento declarado, vira âncora da cauda.
const SALDO_FINAL = re(`^${DATA}\\s+Saldo final\\s+R\\$\\s*(-?${NUMERO})\\s*$`, "i");
// O sinal, quando existe, fica ANTES do cifrão e separado dele.
const LINHA = re(`^(${DATA})\\s+(.+?)\\s*(-\\s*)?R\\$\\s*(${NUMERO})\\s*$`);

// Marcador da coluna de conciliação, no fim da descrição.
const CONCILIACAO = re("[\\s✓✔]*(?:N[ãa]o\\s+)?[Cc]onciliad[oa]\\s*$", "i");

const ASSINATURA = re("Iugu\\s+Institui[çc][ãa]o de Pagamento|Extrato Conta Az[uú]", "i");

const IGNORAR = re(
  "^(Data\\s+Descri|Saldo anterior|Saldo final|Saldo Bloqueado|Total de entradas|Total de sa[ií]das|Iugu\\s|P[áa]gina \\d)",
  "i",
);
const ESPACOS = re("\\s+");

type Dia = { data: string; saldo: Dec | null; lancamentos: Transacao[] };

export const iugu: Leitor = {
  nome: "iugu",
  siglas: new Set(["IUGU", "401"]),
  reconhece: (linhas) => linhas.some((l) => ASSINATURA.search(l) !== null),
  extrair(linhas, referenciaAno) {
    const dias: Dia[] = [];
    let saldoFinal: Dec | null = null;
    let idx = 0;

    for (const linha of linhas) {
      const limpa = strip(linha);
      if (!limpa) continue;

      const fecho = SALDO_FINAL.match(limpa);
      if (fecho) {
        saldoFinal = parseValor(fecho[1]!);
        continue;
      }

      const cabecalho = CABECALHO_DIA.match(limpa);
      if (cabecalho) {
        const doDia = parseData(cabecalho[1]!, referenciaAno);
        if (doDia === null) continue;
        if (dias.length && dias[dias.length - 1].data === doDia) continue;
        dias.push({ data: doDia, saldo: parseValor(cabecalho[2]!), lancamentos: [] });
        continue;
      }

      if (IGNORAR.match(limpa)) continue;

      const casada = LINHA.match(limpa);
      if (!casada) continue;

      const [dataStr, descricao, sinal, valorStr] = casada.grupos;
      const dataLida = parseData(dataStr!, referenciaAno);
      let valor = parseValor(valorStr!);
      if (dataLida === null || valor === null || ehZero(valor)) continue;
      if (sinal) valor = oposto(valor);

      let historico = strip(CONCILIACAO.sub("", descricao!));
      historico = ESPACOS.sub(" ", historico) || "SEM DESCRIÇÃO";

      // Lançamento sem cabeçalho de dia acima (primeira página cortada) ainda é lançamento: entra
      // num grupo próprio, só sem âncora de saldo.
      if (!dias.length || dias[dias.length - 1].data !== dataLida) {
        dias.push({ data: dataLida, saldo: null, lancamentos: [] });
      }

      dias[dias.length - 1].lancamentos.push({
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
    // A lista já está em ordem crescente: não inverter. O saldo do cabeçalho é o fechamento, então
    // pertence ao último lançamento do dia.
    for (const { saldo, lancamentos } of dias) {
      if (!lancamentos.length) continue;
      if (saldo !== null) lancamentos[lancamentos.length - 1] = { ...lancamentos[lancamentos.length - 1], saldoApos: saldo };
      transacoes.push(...lancamentos);
    }

    if (!transacoes.length) return [];
    return [bloco(transacoes, null, saldoFinal)];
  },
};
