import { describe, expect, test } from "vitest";
import { dec } from "./decimal";
import { linhasDoDominio, type PartidaParaExportar } from "./exportacao";
import { linhasParaTxt } from "./dominio";

const contas = new Map([
  ["despesa", { contaNumero: 1026, codigo: "3.4.2.05.0009", descricao: "Tarifas" }],
  ["banco", { contaNumero: null, codigo: "1.1.B.9a8b7c6d5e4f4a3b", descricao: "Conta bancária SICOOB 1234 98765" }],
]);

function par(lancamentoId: string, transacaoId: string | null, historico: string, extrato = "TARIFA PACOTE"): PartidaParaExportar[] {
  const base = { lancamentoId, transacaoId, valor: dec("15.90"), historico, historicoExtrato: extrato, dataLancamento: "2026-01-05" };
  return [
    { ...base, id: `${lancamentoId}-d`, contaId: "despesa", dc: "D" },
    { ...base, id: `${lancamentoId}-c`, contaId: "banco", dc: "C" },
  ];
}

describe("arquivo de lançamentos do Domínio", () => {
  test("débito e crédito na mesma linha, código reduzido e prefixo pela direção da transação", () => {
    const r = linhasDoDominio(par("l1", "t1", "TARIFA BANCARIA"), contas, new Map([["t1", "D"]]), false);
    expect(r.linhas).toEqual([
      expect.objectContaining({ Data: "05/01/2026", "Cód. Conta Debito": "1026", "Cód. Conta Credito": "1.1.B.9a8b7c6d5e4f4a3b", "Complemento Histórico": "PGTO REF TARIFA BANCARIA" }),
    ]);
    // A conta sintética do banco não tem código reduzido: entra no aviso.
    expect(r.contasSemCodigoAbreviado).toEqual(["1.1.B.9a8b7c6d5e4f4a3b (Conta bancária SICOOB 1234 98765)"]);
    expect(linhasParaTxt(r.linhas)).toBe("﻿05/01/2026;1026;1.1.B.9a8b7c6d5e4f4a3b;15,9;;PGTO REF TARIFA BANCARIA;;;;\r\n");
  });

  test("a opção de usar a linha do banco troca o histórico, e o recebimento leva VALOR REF", () => {
    const r = linhasDoDominio(par("l1", "t1", "RECEBIMENTO", "pix recebido cliente"), contas, new Map([["t1", "C"]]), true);
    expect(r.linhas[0]["Complemento Histórico"]).toBe("VALOR REF PIX RECEBIDO CLIENTE");
  });

  test("lançamento sem transação de origem: sem prefixo, porque não há direção para decidir", () => {
    expect(linhasDoDominio(par("l1", null, "ajuste manual"), contas, new Map(), false).linhas[0]["Complemento Histórico"]).toBe("AJUSTE MANUAL");
    // Com a opção ligada, a linha do banco ainda substitui o histórico (como no original); só o prefixo não vem.
    expect(linhasDoDominio(par("l1", null, "ajuste manual"), contas, new Map(), true).linhas[0]["Complemento Histórico"]).toBe("TARIFA PACOTE");
  });

  test("composição (vários lançamentos da mesma transação): cada um com o seu histórico, sem prefixo", () => {
    const r = linhasDoDominio([...par("l1", "t1", "JUROS"), ...par("l2", "t1", "PRINCIPAL")], contas, new Map([["t1", "D"]]), true);
    expect(r.linhas.map((l) => l["Complemento Histórico"])).toEqual(["JUROS", "PRINCIPAL"]);
  });

  test("lançamento sem as duas pernas não cabe no layout e é contado", () => {
    const r = linhasDoDominio([par("l1", "t1", "X")[0]], contas, new Map([["t1", "D"]]), false);
    expect(r).toMatchObject({ linhas: [], lancamentosSemPar: 1 });
  });
});
