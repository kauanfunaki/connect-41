// Porte de `extrato/bancos/sicoob.py`: Sicoob, sinal como letra colada no valor e detalhe em
// linhas soltas.
//
//     PERÍODO: 01/07/2025 - 31/07/2025
//     DATA  HISTÓRICO              VALOR
//     31/07 SALDO DO DIA           11.194,89D
//     31/07 PIX EMIT.OUTRA IF         330,00D
//           Pagamento Pix
//           DOC.: Pix
//
// - `330,00D` é débito e `330,00C` crédito; sem tratar a letra, a linha inteira se perde.
// - `SALDO DO DIA` é o fechamento do dia e pertence ao ÚLTIMO lançamento cronológico dele (a lista
//   vem decrescente).
// - O detalhe em linhas soltas abaixo pertence ao lançamento de cima: é ali que está o documento
//   da contraparte.
// - A data não tem ano; ele sai do `PERÍODO:` do cabeçalho.

import { ehZero, modulo, oposto, type Dec } from "../../motor/decimal";
import { anoDe, bloco, dataIso, diaDe, gerarFitid, mesDe, parseValor, type Transacao } from "../comum";
import { corta, inteiro, re, strip } from "../py";
import type { Leitor } from "./tipos";

// 11.194,89D  /  2,50C
// O `R$` entra no grupo do VALOR, e não na descrição, porque o Internet Banking novo (SISBR)
// imprime `R$ 600,00D`; fora do grupo, o cifrão era engolido pela descrição e a linha de `SALDO DO
// DIA` deixava de casar — o extrato perdia todas as âncoras de saldo.
const VALOR_DC = "(?:R\\$\\s*)?\\d{1,3}(?:\\.\\d{3})*,\\d{2}[DC]";

const LINHA = re(`^(\\d{2}/\\d{2})\\s+(.*?)\\s+(${VALOR_DC})\\s*$`);
const SALDO_DIA = re(`^(\\d{2}/\\d{2})\\s+SALDO DO DIA\\s+(${VALOR_DC})\\s*$`, "i");
const SALDO_ANTERIOR = re(`^(\\d{2}/\\d{2})\\s+SALDO ANTERIOR\\s+(${VALOR_DC})\\s*$`, "i");
// Captura as DUAS pontas: a de fim decide o ano de uma data que cai fora do período (`31/12` num
// extrato de janeiro/2026 é de 2025).
const PERIODO = re("PER[ÍI]ODO:\\s*(\\d{2}/\\d{2}/\\d{4})\\s*-\\s*(\\d{2}/\\d{2}/\\d{4})", "i");

// `Documento` é coluna do export novo e não existe no antigo — daí o opcional.
const ASSINATURA = re("^\\s*DATA\\s+(?:DOCUMENTO\\s+)?HIST[ÓO]RICO\\s+VALOR\\s*$", "im");

const IGNORAR = re(
  "^(SICOOB|SISTEMA DE COOPERATIVAS|PLATAFORMA DE|COOP\\.|CONTA:|PER[ÍI]ODO:|" +
    "COOPERATIVA:|EXTRATO DE CONTA|SALDO BLOQUEADO|SALDO EM CONTA|RESUMO|" +
    "HIST[ÓO]RICO DE MOVIMENTA|DATA\\s+(?:DOCUMENTO\\s+)?HIST)",
  "i",
);
const ESPACOS = re("\\s+");
const CIFRAO = re("^R\\$\\s*");

/** `330,00D` → −330,00; `330,00C` → +330,00. Aceita `R$ 330,00D`. */
function valorComLetra(entrada: string): Dec | null {
  const texto = CIFRAO.sub("", strip(entrada));
  const caracteres = [...texto];
  const letra = caracteres[caracteres.length - 1].toUpperCase();
  const numero = parseValor(caracteres.slice(0, -1).join(""));
  if (numero === null) return null;
  return letra === "D" ? oposto(modulo(numero)) : modulo(numero);
}

/** O `ValueError` que o `date(...)` do Python levantaria com a data do `PERÍODO:` inválida. */
function erroDeData(ano: number, mes: number): Error {
  const mensagem = ano < 1 || ano > 9999 ? `year ${ano} is out of range` : mes < 1 || mes > 12 ? "month must be in 1..12" : "day is out of range for month";
  const erro = new Error(mensagem);
  erro.name = "ValueError";
  return erro;
}

export const sicoob: Leitor = {
  nome: "sicoob",
  siglas: new Set(["SICOOB", "756"]),
  reconhece: (linhas) => linhas.some((l) => ASSINATURA.match(l) !== null),
  extrair(linhas, referenciaAno) {
    let ano = referenciaAno;
    let fimPeriodo: string | null = null;
    for (const linha of linhas) {
      const achado = PERIODO.search(linha);
      if (achado) {
        const [d, m, a] = achado[2]!.split("/");
        fimPeriodo = dataIso(inteiro(a), inteiro(m), inteiro(d));
        if (fimPeriodo === null) throw erroDeData(inteiro(a), inteiro(m));
        ano = anoDe(fimPeriodo);
        break;
      }
    }

    const dataDe = (texto: string): string | null => {
      const [dia, mes] = texto.split("/");
      const lida = dataIso(ano, inteiro(mes), inteiro(dia));
      if (lida === null) return null;
      // Data depois do fim do período só pode ser do ano anterior: é o `31/12` que abre um
      // extrato de janeiro.
      if (fimPeriodo !== null && lida > fimPeriodo) return dataIso(ano - 1, mesDe(lida), diaDe(lida));
      return lida;
    };

    // A LINHA DE SALDO TRAZ A PRÓPRIA DATA, e é isso que decide a qual dia ela pertence — não a
    // posição no arquivo. O layout antigo imprime `SALDO DO DIA` no TOPO do dia; o SISBR, no FIM.
    // Agrupar por data lê os dois sem precisar distingui-los.
    const lancamentos: Transacao[] = [];
    const saldos = new Map<string, Dec>();
    let saldoAnterior: Dec | null = null;
    let idx = 0;

    for (const bruta of linhas) {
      const linha = strip(bruta);
      if (!linha || IGNORAR.match(linha)) continue;

      // ANTES de `LINHA`, que também casaria: a abertura entraria como lançamento, e a cadeia não
      // pegaria (o valor falso é o próprio saldo de abertura, na primeira posição).
      const abertura = SALDO_ANTERIOR.match(linha);
      if (abertura) {
        if (saldoAnterior === null) saldoAnterior = valorComLetra(abertura[2]!);
        continue;
      }

      const fechamento = SALDO_DIA.match(linha);
      if (fechamento) {
        const doDia = dataDe(fechamento[1]!);
        const saldo = valorComLetra(fechamento[2]!);
        // Dia partido por quebra de página repete a linha; o primeiro valor lido é o do dia.
        if (doDia !== null && saldo !== null && !saldos.has(doDia)) saldos.set(doDia, saldo);
        continue;
      }

      const casada = LINHA.match(linha);
      if (casada) {
        const [dataStr, descricao, valorStr] = casada.grupos;
        const dataLida = dataDe(dataStr!);
        const valor = valorComLetra(valorStr!);
        if (dataLida === null || valor === null || ehZero(valor)) continue;
        const historico = strip(ESPACOS.sub(" ", descricao!)) || "SEM DESCRIÇÃO";
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
        continue;
      }

      // Linha de detalhe: pertence ao lançamento imediatamente acima.
      if (lancamentos.length) {
        const alvo = lancamentos[lancamentos.length - 1];
        const juntado = corta(strip(`${alvo.historico} ${linha}`), 200);
        lancamentos[lancamentos.length - 1] = { ...alvo, historico: juntado };
      }
    }

    // O extrato sai do mais recente para o mais antigo, e dentro do dia também.
    const transacoes = [...lancamentos].reverse();

    // O saldo do dia é o que vale DEPOIS do último lançamento dele — e "último" só existe depois
    // de ordenar.
    const ultimoDoDia = new Map<string, number>();
    transacoes.forEach((t, posicao) => ultimoDoDia.set(t.data, posicao));
    for (const [doDia, saldo] of saldos) {
      const posicao = ultimoDoDia.get(doDia);
      if (posicao !== undefined) transacoes[posicao] = { ...transacoes[posicao], saldoApos: saldo };
    }

    if (!transacoes.length) return [];
    return [bloco(transacoes, saldoAnterior)];
  },
};
