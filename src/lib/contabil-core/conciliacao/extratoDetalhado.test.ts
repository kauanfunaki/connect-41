// Gabarito do leitor do extrato detalhado do Itaú (scripts/contabil-core/gabarito_sispag.py): o que o
// `ler_extrato_detalhado` do Contábil Core devolve para os arquivos da suíte do original e para as
// planilhas inventadas (dias que não fecham, resgates, cabeçalho deslocado, valores e datas como
// texto ou número), e as funções internas (`_data`, `_decimal`, `_sem_acento`, `_mapear`,
// `_moeda`, `_periodo`).
import { describe, expect, it } from "vitest";
import { dec } from "../motor/decimal";
import { bytesDoArquivo, celula, dataJson, decJson, esperado, executar, nomeDoArquivo, registros, type Json, type Registro } from "./gabarito/ler";
import {
  dataDaCelula,
  decimalDetalhado,
  lerExtratoDetalhado,
  mapear,
  moeda,
  periodo,
  semAcento,
  type ExtratoDetalhado,
} from "./extratoDetalhado";

function comoPy(e: ExtratoDetalhado): Json {
  return {
    nome: e.nome,
    agencia: e.agencia,
    conta: e.conta,
    periodo_inicio: dataJson(e.periodoInicio),
    periodo_fim: dataJson(e.periodoFim),
    saldo_anterior: decJson(e.saldoAnterior),
    saldo_final: decJson(e.saldoFinal),
    dias_conferidos: e.diasConferidos,
    movimentos: e.movimentos.map((m) => ({
      data: dataJson(m.data),
      valor: decJson(m.valor),
      lancamento: m.lancamento,
      razao_social: m.razaoSocial,
      documento: m.documento,
      linha: m.linha,
      resgate_aplicacao: m.resgateAplicacao,
    })),
  };
}

const lista = (j: Json) => (Array.isArray(j) ? j : []);
const textoDec = (j: Json) => String((j as { $dec: string }).$dec);

const FUNCOES: Record<string, (args: Json[]) => Json> = {
  "detalhado.ler_extrato_detalhado": ([a]) => comoPy(lerExtratoDetalhado(bytesDoArquivo(a))),
  "detalhado._data": ([a]) => dataJson(dataDaCelula(celula(a))),
  "detalhado._decimal": ([a]) => decJson(decimalDetalhado(celula(a))),
  "detalhado._sem_acento": ([a]) => semAcento(String(a)),
  "detalhado._mapear": ([a]) => {
    const m = mapear(lista(a).map(celula));
    return m && Object.fromEntries(m);
  },
  "detalhado._moeda": ([a]) => moeda(dec(textoDec(a))),
  "detalhado._periodo": ([a]) => periodo(String(a)).map(dataJson),
};

const todos = registros("detalhado-chamadas.json");

describe("lerExtratoDetalhado × ler_extrato_detalhado", () => {
  it("o gabarito cobre a suíte e os arquivos inventados", () => {
    const leituras = todos.filter((r) => r.fn === "detalhado.ler_extrato_detalhado");
    expect(leituras.length).toBeGreaterThanOrEqual(80);
    expect(leituras.filter((r) => r.result).length).toBeGreaterThanOrEqual(15);
  });

  const titulo = (r: Registro) =>
    `${r.fn} ${r.fn.endsWith("ler_extrato_detalhado") ? nomeDoArquivo(r.args[0]) : JSON.stringify(r.args).slice(0, 80)}`;
  for (const r of todos) {
    it(titulo(r), () => {
      const fn = FUNCOES[r.fn];
      expect(fn, r.fn).toBeDefined();
      expect(executar(() => fn(r.args))).toEqual(esperado(r));
    });
  }
});
