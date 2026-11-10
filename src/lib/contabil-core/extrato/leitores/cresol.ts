// Porte de `extrato/bancos/cresol.py`: Cresol, com o "Saldo do Dia" de fechamento impresso antes dos
// lançamentos. Ordem decrescente com o saldo de fechamento no topo do dia, como no BBC: ele pertence
// ao ÚLTIMO lançamento do dia em ordem cronológica. A descrição ora está na linha, ora em volta dela,
// como no Bradesco: se entre a data e o valor há texto, o lançamento se descreve sozinho; se não há,
// a descrição são as linhas de texto puro imediatamente acima e abaixo. O sinal vem separado do
// valor (`- R$ 270,00`).

import type { Dec } from "../../motor/decimal";
import { ehZero } from "../../motor/decimal";
import { bloco, gerarFitid, parseData, parseValor, type Transacao } from "../comum";
import { casefold, corta, re, strip } from "../py";
import type { Leitor } from "./tipos";

const MOEDA = "[+-]\\s?R\\$\\s?\\d{1,3}(?:\\.\\d{3})*,\\d{2}";
const DATA = "\\d{2}/\\d{2}/\\d{4}";

const CABECALHO_DIA = re(`^(${DATA})\\s+Saldo do Dia:\\s*(${MOEDA})\\s*$`, "i");
const LINHA = re(`^(${DATA})\\s+(.*?)\\s*(${MOEDA})\\s*$`);
const DATA_ISOLADA = re(`^${DATA}$`);
const SALDO_DIA = re(`^Saldo do dia:\\s*(${MOEDA})\\s*$`, "i");
const MOVIMENTO_SEM_DATA = re(`^(.+?)\\s+(${MOEDA})\\s*$`);
const SALDO_ANTERIOR = re(`^Saldo Anterior:\\s*(${MOEDA})\\s*$`, "i");
const SALDO_FINAL = re(`^Saldo da Conta Corrente\\s+(${MOEDA})\\s*$`, "i");
const CONSULTA_CONSOLIDADA = re("^Consulta posição consolidada em", "i");

// A assinatura exige a DATA COMPLETA antes do rótulo. "Saldo do dia:" sozinho não identifica a
// Cresol: o Inter também o imprime, e como ele tem dias com saldo negativo, até o sinal casava.
const ASSINATURA = re("^\\d{2}/\\d{2}/\\d{4}\\s+Saldo do Dia:", "i");

const IGNORAR = re(
  "^(Ag[eê]ncia\\s|Saldo em Conta|Lan[çc]amentos\\s*$|Consulta Posi[çc][ãa]o|" +
    "R\\$\\s|\\d{2} de \\w+ de \\d{4} a |Per[ií]odo de |P[áa]gina \\d)",
  "i",
);
const ESPACOS = re("\\s+");

/**
 * Converte a variante com data só no cabeçalho para o contrato antigo. A data permanece ativa entre
 * páginas. Resumos não são movimentos, e só um par data/saldo abre um grupo; datas de consulta não
 * definem lançamentos.
 */
function normalizarDatasDeGrupo(linhas: readonly string[]): string[] {
  const resultado: string[] = [];
  let dataGrupo: string | null = null;
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    if (DATA_ISOLADA.match(linha) && i + 1 < linhas.length && SALDO_DIA.match(linhas[i + 1])) {
      dataGrupo = linha;
      continue;
    }
    if (dataGrupo && SALDO_DIA.match(linha)) {
      resultado.push(`${dataGrupo} ${linha}`);
      continue;
    }
    if (SALDO_ANTERIOR.match(linha) || casefold(linha) === "totalizadores") dataGrupo = null;
    if (dataGrupo && MOVIMENTO_SEM_DATA.match(linha) && !LINHA.match(linha) && !IGNORAR.match(linha)) resultado.push(`${dataGrupo} ${linha}`);
    else resultado.push(linha);
  }
  return resultado;
}

/** `next((parse_valor(...) for ln in limpas if (m := padrao.match(ln))), None)` */
function primeiroValor(limpas: readonly string[], padrao: typeof SALDO_ANTERIOR): Dec | null {
  for (const ln of limpas) {
    const m = padrao.match(ln);
    if (m) return parseValor(m[1]!.replaceAll(" ", ""));
  }
  return null;
}

/**
 * `limpas[i]` como o Python: fora da lista levanta `IndexError`. O original não protege o `abaixo`
 * quando a linha de dados sem descrição é a última do arquivo, e o porte reproduz a falha.
 */
function indice(limpas: readonly string[], i: number): string {
  if (i >= limpas.length) {
    const erro = new Error("list index out of range");
    erro.name = "IndexError";
    throw erro;
  }
  return limpas[i];
}

type Dia = [data: string, saldo: Dec | null, lancamentos: Transacao[]];

export const cresol: Leitor = {
  nome: "cresol",
  siglas: new Set(["CRESOL", "133"]),
  reconhece(linhas) {
    if (linhas.some((l) => ASSINATURA.search(l) !== null)) return true;
    return (
      linhas.some((l) => CONSULTA_CONSOLIDADA.match(strip(l)) !== null) &&
      linhas.some((l) => SALDO_FINAL.match(strip(l)) !== null) &&
      linhas.slice(1).some((b, i) => Boolean(DATA_ISOLADA.match(strip(linhas[i])) && SALDO_DIA.match(strip(b))))
    );
  },
  extrair(linhas, referenciaAno) {
    const limpas = normalizarDatasDeGrupo(linhas.filter((ln) => strip(ln)).map((ln) => strip(ln)));
    const saldoAnterior = primeiroValor(limpas, SALDO_ANTERIOR);
    const saldoFinal = primeiroValor(limpas, SALDO_FINAL);

    // Um grupo por dia, na ordem impressa (do mais recente ao mais antigo).
    const dias: Dia[] = [];
    let idx = 0;

    const ehDados = (i: number): boolean =>
      i >= 0 && i < limpas.length && Boolean(limpas[i]) && (LINHA.match(limpas[i]) !== null || CABECALHO_DIA.match(limpas[i]) !== null);

    limpas.forEach((linha, i) => {
      if (!linha || IGNORAR.match(linha)) return;

      const cabecalho = CABECALHO_DIA.match(linha);
      if (cabecalho) {
        const doDia = parseData(cabecalho[1]!, referenciaAno);
        if (doDia === null) return;
        // Dia que atravessa a quebra de página tem o cabeçalho REPETIDO no topo da página seguinte,
        // com o mesmo saldo de fechamento. Abrir um grupo novo ali ancoraria o mesmo saldo duas
        // vezes e quebraria a cadeia por um dia inteiro de movimento.
        if (dias.length && dias[dias.length - 1][0] === doDia) return;
        dias.push([doDia, parseValor(cabecalho[2]!.replaceAll(" ", "")), []]);
        return;
      }

      const casada = LINHA.match(linha);
      if (!casada || !dias.length) return;

      const [dataStr, meioBruto, valorStr] = casada.grupos;
      const dataLida = parseData(dataStr!, referenciaAno);
      if (dataLida === null) return;
      const valor = parseValor(valorStr!.replaceAll(" ", ""));
      if (valor === null || ehZero(valor)) return;

      const meio = strip(meioBruto!);
      let historico: string;
      if (meio) historico = meio;
      else {
        let acima = i > 0 && !ehDados(i - 1) ? limpas[i - 1] : "";
        let abaixo = !ehDados(i + 1) ? indice(limpas, i + 1) : "";
        if (IGNORAR.match(acima || "x")) acima = "";
        if (IGNORAR.match(abaixo || "x")) abaixo = "";
        historico = strip([acima, abaixo].filter(Boolean).join(" "));
      }

      historico = ESPACOS.sub(" ", historico) || "SEM DESCRIÇÃO";
      dias[dias.length - 1][2].push({
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

    const transacoes: Transacao[] = [];
    for (const [, saldo, lancamentos] of [...dias].reverse()) {
      if (!lancamentos.length) continue;
      const cronologicos = [...lancamentos].reverse();
      if (saldo !== null) cronologicos[cronologicos.length - 1] = { ...cronologicos[cronologicos.length - 1], saldoApos: saldo };
      transacoes.push(...cronologicos);
    }

    if (!transacoes.length) return [];
    return [bloco(transacoes, saldoAnterior, saldoFinal)];
  },
};
