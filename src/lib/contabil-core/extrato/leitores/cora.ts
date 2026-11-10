// Porte de `extrato/bancos/cora.py`: Banco Cora. A lista é decrescente e o cabeçalho de cada dia traz
// o saldo do FIM daquele dia, com os lançamentos logo abaixo (a mesma forma de Cresol e BBC): o saldo
// pertence ao ÚLTIMO lançamento do dia em ordem cronológica. O lançamento não tem data própria,
// herda a do cabeçalho acima dele. O sinal vem separado do valor (`+ R$ 196,50`).

import type { Dec } from "../../motor/decimal";
import { ehZero } from "../../motor/decimal";
import { bloco, gerarFitid, parseData, parseValor, type Transacao } from "../comum";
import { corta, re, strip } from "../py";
import type { Leitor } from "./tipos";

const DATA = "\\d{2}/\\d{2}/\\d{4}";
const MOEDA = "[+-]\\s?R\\$\\s?\\d{1,3}(?:\\.\\d{3})*,\\d{2}";

const CABECALHO_DIA = re(`^(${DATA})\\s+Saldo do dia\\s+R\\$\\s*(-?\\d{1,3}(?:\\.\\d{3})*,\\d{2})\\s*$`, "i");
const LINHA = re(`^(.*?)\\s*(${MOEDA})\\s*$`);

// A assinatura é o nome da instituição no rodapé, que se repete em toda página. "Cora" solto não
// serve: aparece dentro de razão social de contraparte.
const ASSINATURA = re("Cora\\s+SCFI|Cora\\s+SCD", "i");

const IGNORAR = re(
  "^(CNPJ\\s|Ag[êe]ncia:|Extrato do per[ií]odo|Saldo inicial|Saldo final|" +
    "Total de entradas|Total de sa[ií]das|Transa[çc][õo]es\\s*$|Cora\\s|" +
    "Ouvidoria:|Extrato gerado|p[áa]g \\d)",
  "i",
);
const ESPACOS = re("\\s+");

type Dia = [data: string, saldo: Dec | null, lancamentos: Transacao[]];

export const cora: Leitor = {
  nome: "cora",
  siglas: new Set(["CORA", "403"]),
  reconhece(linhas) {
    const temMarca = linhas.some((l) => ASSINATURA.search(l) !== null);
    const temDia = linhas.some((l) => CABECALHO_DIA.match(strip(l)) !== null);
    return temMarca && temDia;
  },
  extrair(linhas, referenciaAno) {
    const dias: Dia[] = [];
    let idx = 0;

    for (const linha of linhas) {
      const limpa = strip(linha);
      if (!limpa) continue;

      const cabecalho = CABECALHO_DIA.match(limpa);
      if (cabecalho) {
        const doDia = parseData(cabecalho[1]!, referenciaAno);
        if (doDia === null) continue;
        // Dia que atravessa a quebra de página reaparece no topo da seguinte com o mesmo saldo;
        // abrir um grupo novo ali ancoraria o mesmo valor duas vezes.
        if (dias.length && dias[dias.length - 1][0] === doDia) continue;
        dias.push([doDia, parseValor(cabecalho[2]!), []]);
        continue;
      }

      if (IGNORAR.match(limpa) || !dias.length) continue;

      const casada = LINHA.match(limpa);
      if (!casada) continue;

      const [descricao, valorStr] = casada.grupos;
      const valor = parseValor(valorStr!.replaceAll(" ", ""));
      if (valor === null || ehZero(valor)) continue;

      const historico = strip(ESPACOS.sub(" ", descricao!)) || "SEM DESCRIÇÃO";
      const [doDia, , lancamentos] = dias[dias.length - 1];
      lancamentos.push({
        fitid: gerarFitid(doDia, historico, valor, idx),
        data: doDia,
        valor,
        historico: corta(historico, 200),
        tipoOfx: !valor.negativo && !ehZero(valor) ? "CREDIT" : "DEBIT",
        saldoApos: null,
        ordem: idx,
      });
      idx++;
    }

    const transacoes: Transacao[] = [];
    // Do dia mais antigo para o mais recente, e dentro do dia idem: o arquivo é decrescente nos
    // dois níveis.
    for (const [, saldo, lancamentos] of [...dias].reverse()) {
      if (!lancamentos.length) continue;
      const cronologicos = [...lancamentos].reverse();
      if (saldo !== null) cronologicos[cronologicos.length - 1] = { ...cronologicos[cronologicos.length - 1], saldoApos: saldo };
      transacoes.push(...cronologicos);
    }

    if (!transacoes.length) return [];
    return [bloco(transacoes)];
  },
};
