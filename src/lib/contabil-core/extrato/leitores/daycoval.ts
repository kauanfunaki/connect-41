// Porte de `extrato/bancos/daycoval.py`: Extrato Detalhado do Banco Daycoval.
//
// O sinal vem de qual coluna recebeu o número: débito e crédito são colunas separadas, e a que não
// recebeu o lançamento sai como um traço (`43,79 -` é débito; `- 589.145,98` é crédito). Não dá para
// decidir pelo texto; quem decide é a posição, legível sem coordenada porque o traço ocupa a coluna
// vazia. O casamento é ancorado no FIM da linha e exige valor com centavos num dos dois últimos
// campos, então o traço solto dentro da descrição nunca é lido como coluna vazia.
//
// A descrição longa quebra em volta da linha de dados (parte acima, parte abaixo), como em Cresol e
// Itaú; o trecho de cima vem antes. `SALDO EM DD/MM/AAAA` fecha o dia e ancora o ÚLTIMO lançamento
// dele (pode ser negativo, em conta com limite).

import { ehZero, modulo, oposto, type Dec } from "../../motor/decimal";
import { bloco, gerarFitid, parseData, parseValor, type Transacao } from "../comum";
import { corta, re, strip } from "../py";
import type { Leitor } from "./tipos";

const DATA = "\\d{2}/\\d{2}/\\d{4}";
const VALOR = "-?\\d{1,3}(?:\\.\\d{3})*,\\d{2}";
// Uma das duas colunas de valor: o número, ou o traço que marca a coluna vazia.
const CAMPO = `(?:${VALOR}|-)`;

const LINHA = re(`^(${DATA})\\s+(\\S+)\\s*(.*?)\\s+(${CAMPO})\\s+(${CAMPO})\\s*$`);
const SALDO_DIA = re(`^SALDO\\s+EM\\s+(${DATA})\\s+(${VALOR})\\s*$`, "i");
const SALDO_ANTERIOR = re(`^SALDO\\s+ANTERIOR\\s+(${VALOR})\\s*$`, "i");

const ASSINATURA = re("Extrato Detalhado|Dayconnect|DAYCOVAL", "i");

const IGNORAR = re(
  "^(Data\\s+N[ºo]\\s+Docto|P[áa]gina\\s+\\d|Titular\\s*$|Ag[êe]ncia\\s*$|Conta\\s*$|" +
    "Per[ií]odo consultado|Impress[ãa]o realizada|Central de Atendimento|" +
    "SAC\\s|Ouvidoria|Atendimento de segunda|Limite\\(|Saldo Bloqueado|" +
    "Valor Bloqueado|Saldo Dispon[ií]vel|- Os saldos acima|lan[çc]amentos\\.)",
  "i",
);
const ESPACOS = re("\\s+");

/** Linha que não é texto solto de descrição. */
function ehEstrutural(linha: string): boolean {
  const limpa = strip(linha);
  if (!limpa) return true;
  return Boolean(LINHA.match(limpa) || SALDO_DIA.match(limpa) || SALDO_ANTERIOR.match(limpa) || IGNORAR.match(limpa));
}

export const daycoval: Leitor = {
  nome: "daycoval",
  siglas: new Set(["DAYCOVAL", "707"]),
  reconhece(linhas) {
    const temMarca = linhas.some((l) => ASSINATURA.search(l) !== null);
    const temSaldoDia = linhas.some((l) => SALDO_DIA.match(strip(l)) !== null);
    return temMarca && temSaldoDia;
  },
  extrair(linhas, referenciaAno) {
    const limpas = linhas.map((l) => strip(l));
    const transacoes: Transacao[] = [];
    let saldoAnterior: Dec | null = null;
    let idx = 0;

    limpas.forEach((limpa, i) => {
      if (!limpa) return;

      if (saldoAnterior === null) {
        const abertura = SALDO_ANTERIOR.match(limpa);
        if (abertura) {
          saldoAnterior = parseValor(abertura[1]!);
          return;
        }
      }

      const fecho = SALDO_DIA.match(limpa);
      if (fecho) {
        // O saldo do dia pertence ao último lançamento já lido dele.
        const doDia = parseData(fecho[1]!, referenciaAno);
        const saldo = parseValor(fecho[2]!);
        if (transacoes.length && saldo !== null && transacoes[transacoes.length - 1].data === doDia) {
          transacoes[transacoes.length - 1] = { ...transacoes[transacoes.length - 1], saldoApos: saldo };
        }
        return;
      }

      if (IGNORAR.match(limpa)) return;

      const casada = LINHA.match(limpa);
      if (!casada) return;

      const [dataStr, documento, meio, campoDebito, campoCredito] = casada.grupos;
      const dataLida = parseData(dataStr!, referenciaAno);
      if (dataLida === null) return;

      let valor: Dec | null;
      if (campoDebito !== "-" && campoCredito === "-") {
        valor = parseValor(campoDebito!);
        valor = valor !== null ? oposto(modulo(valor)) : null;
      } else if (campoDebito === "-" && campoCredito !== "-") {
        valor = parseValor(campoCredito!);
        valor = valor !== null ? modulo(valor) : null;
      } else {
        // Os dois traços, ou os dois com número: a linha não é um lançamento que este layout saiba
        // ler, e adivinhar o lado seria inventar sinal.
        return;
      }
      if (valor === null || ehZero(valor)) return;

      let historico = strip(ESPACOS.sub(" ", meio!));
      if (!historico) {
        const acima = i > 0 && !ehEstrutural(limpas[i - 1]) ? limpas[i - 1] : "";
        const abaixo = i + 1 < limpas.length && !ehEstrutural(limpas[i + 1]) ? limpas[i + 1] : "";
        historico = strip([acima, abaixo].filter(Boolean).join(" "));
      }
      historico = ESPACOS.sub(" ", historico) || `DOC ${documento}`;

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
