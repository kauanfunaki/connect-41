// Porte de `extrato/bancos/viacredi.py`: cooperativas do sistema Ailos (banco 085) — Viacredi,
// Transpocred. Uma linha por lançamento, com o saldo corrente na ponta. O cabeçalho anuncia CRÉDITO e
// DÉBITO, mas a linha traz um valor só, com o sinal nele (débito com "-"), então não é preciso ler
// por coordenada. O saldo pode ser negativo (limite usado) e é impresso com "-" como qualquer valor.
// A linha TOTAL não é lançamento: não começa com data, e somá-la duplicaria o mês inteiro.

import { ehZero, type Dec } from "../../motor/decimal";
import { bloco, gerarFitid, parseData, parseValor, type Transacao } from "../comum";
import { corta, re, strip } from "../py";
import type { Leitor } from "./tipos";

const DATA = "\\d{2}/\\d{2}/\\d{4}";
const VALOR = "-?\\d{1,3}(?:\\.\\d{3})*,\\d{2}";

// Data, texto (descrição + nº do documento), valor do lançamento e saldo após.
// Os dois últimos números da linha são sempre valor e saldo, nessa ordem.
const LINHA = re(`^(${DATA})\\s+(.+?)\\s+(${VALOR})\\s+(${VALOR})\\s*$`);

const SALDO_ANTERIOR = re(`^SALDO\\s+ANTERIOR\\s+(${VALOR})\\s*$`, "i");

// Viacredi e Transpocred emitem o MESMO relatório; muda só o nome depois de "Cooperativa:". Por isso
// a assinatura ancora no "Banco: 085" (o sistema Ailos), e não no nome. "Cooperativa:" sozinho não
// serve: Unicred e Sicredi também a imprimem, com outro layout de colunas.
const ASSINATURA = re("Cooperativa:\\s*\\w+\\s*\\|\\s*Banco:\\s*085", "i");

const IGNORAR = re(
  "^(TOTAL\\s|DATA\\s+DESCRI|Emitido em|Per[ií]odo\\s|Nome:|Cooperativa:|" +
    "Os dados acima|SAC\\s|OUVIDORIA|Finais de Semana|P[áa]gina\\s)",
  "i",
);

const ESPACOS = re("\\s+");

export const viacredi: Leitor = {
  nome: "viacredi",
  siglas: new Set(["VIACREDI", "TRANSPOCRED", "AILOS", "085"]),
  reconhece: (linhas) => linhas.some((l) => ASSINATURA.search(l) !== null),
  extrair(linhas, referenciaAno) {
    const transacoes: Transacao[] = [];
    let saldoAnterior: Dec | null = null;
    let idx = 0;

    for (const linha of linhas) {
      const limpa = strip(linha);
      if (!limpa) continue;

      if (saldoAnterior === null) {
        const abertura = SALDO_ANTERIOR.match(limpa);
        if (abertura) {
          saldoAnterior = parseValor(abertura[1]!);
          continue;
        }
      }

      if (IGNORAR.match(limpa)) continue;

      const casada = LINHA.match(limpa);
      if (!casada) continue;

      const [dataStr, meio, valorStr, saldoStr] = casada.grupos;
      const dataLida = parseData(dataStr!, referenciaAno);
      const valor = parseValor(valorStr!);
      const saldo = parseValor(saldoStr!);
      if (dataLida === null || valor === null || ehZero(valor)) continue;

      const historico = strip(ESPACOS.sub(" ", meio!)) || "SEM DESCRIÇÃO";
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
    }

    if (!transacoes.length) return [];
    return [bloco(transacoes, saldoAnterior)];
  },
};
