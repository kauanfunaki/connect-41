// Gabarito do leitor da consulta de pagamentos do SISPAG (scripts/contabil-core/gabarito_sispag.py):
// o que o `ler_sispag` do Contábil Core devolve para os arquivos da suíte do original e para as
// planilhas inventadas, e as funções internas (`_data`, `_decimal`, `_sem_acento`, `_mapear`).
import { describe, expect, it } from "vitest";
import { bytesDoArquivo, celula, dataJson, decJson, esperado, executar, nomeDoArquivo, registros, type Json, type Registro } from "./gabarito/ler";
import { dataDaCelula, decimalSispag, lerSispag, mapear, semAcento, type ConsultaSispag } from "./sispag";

function comoPy(c: ConsultaSispag): Json {
  return {
    conta: c.conta,
    cnpj: c.cnpj,
    pagamentos: c.pagamentos.map((p) => ({
      data: dataJson(p.data),
      valor: decJson(p.valor),
      tipo: p.tipo,
      favorecido: p.favorecido,
      documento: p.documento,
      efetuado: p.efetuado,
    })),
  };
}

const lista = (j: Json) => (Array.isArray(j) ? j : []);

const FUNCOES: Record<string, (args: Json[]) => Json> = {
  "sispag.ler_sispag": ([a]) => comoPy(lerSispag(bytesDoArquivo(a))),
  "sispag._data": ([a]) => dataJson(dataDaCelula(celula(a))),
  "sispag._decimal": ([a]) => decJson(decimalSispag(celula(a))),
  "sispag._sem_acento": ([a]) => semAcento(String(a)),
  "sispag._mapear": ([a]) => {
    const m = mapear(lista(a).map(celula));
    return m && Object.fromEntries(m);
  },
};

const todos = registros("sispag-chamadas.json");

describe("lerSispag × ler_sispag", () => {
  it("o gabarito cobre a suíte e os arquivos inventados", () => {
    const leituras = todos.filter((r) => r.fn === "sispag.ler_sispag");
    expect(leituras.length).toBeGreaterThanOrEqual(80);
    expect(leituras.filter((r) => r.result).length).toBeGreaterThanOrEqual(10);
  });

  const titulo = (r: Registro) => `${r.fn} ${r.fn.endsWith("ler_sispag") ? nomeDoArquivo(r.args[0]) : JSON.stringify(r.args).slice(0, 80)}`;
  for (const r of todos) {
    it(titulo(r), () => {
      const fn = FUNCOES[r.fn];
      expect(fn, r.fn).toBeDefined();
      expect(executar(() => fn(r.args))).toEqual(esperado(r));
    });
  }
});
