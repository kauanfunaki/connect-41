import { describe, expect, it } from "vitest";
import {
  funisDoLancamentoNaConsulta,
  funisDosLancamentosDaUrl,
  situacaoDoLancamento,
  temFunilNoLancamento,
  whereDaSituacaoDoLancamento,
  whereDoFunilDoLancamento,
  whereDosFunisDosLancamentos,
} from "./paginaDeLancamentos";

// O que se testa (27/11/2026, melhoria-571): a lista de Lançamentos passou a
// ser paginada no servidor, e os funis das colunas a filtrar pela URL, como em
// Contas a pagar e a receber. O funil vira `where` sem brigar com a base, a
// situação do funil é a mesma do selo da linha, e nada da URL vira "tudo".

const dia = (key: string) => new Date(`${key}T00:00:00-03:00`);

describe("os funis da URL", () => {
  it("lê um valor ou vários, sem repetir, e só o que vale para a coluna", () => {
    expect(
      funisDosLancamentosDaUrl({
        tipo: ["PAGAR", "PAGAR", "OUTRO"],
        situacao: "pago",
        vencimento: ["2026-11-05", "05/11/2026"],
        categoria: ["", "cat-1"],
        empresa: "e1",
      })
    ).toEqual({ tipo: ["PAGAR"], situacao: ["pago"], vencimento: ["2026-11-05"], categoria: ["", "cat-1"] });
  });

  it("parâmetro presente sem nada válido fica vazio — não vira 'tudo'", () => {
    const funis = funisDosLancamentosDaUrl({ situacao: "inventada" });
    expect(funis).toEqual({ situacao: [] });
    expect(temFunilNoLancamento(funis)).toBe(true);
    expect(whereDosFunisDosLancamentos(funis)).toEqual([{ id: { in: [] } }]);
  });

  it("sem funil, nada a filtrar", () => {
    expect(temFunilNoLancamento({})).toBe(false);
    expect(whereDosFunisDosLancamentos({})).toEqual([]);
  });

  it("volta para a URL repetido, para a paginação não perder o filtro", () => {
    const q = new URLSearchParams({ empresa: "e1" });
    funisDoLancamentoNaConsulta({ tipo: ["PAGAR", "RECEBER"], centro: [""] }, q);
    expect(q.toString()).toBe("empresa=e1&tipo=PAGAR&tipo=RECEBER&centro=");
  });
});

describe("o where de cada funil", () => {
  it("tipo pelo lado da conta", () => {
    expect(whereDoFunilDoLancamento("tipo", ["RECEBER"])).toEqual({ kind: { in: ["RECEBER"] } });
  });

  it("vencimento pelo dia em São Paulo, como em Contas", () => {
    expect(whereDoFunilDoLancamento("vencimento", ["2026-11-05"])).toEqual({
      OR: [{ dueDate: { gte: dia("2026-11-05"), lt: dia("2026-11-06") } }],
    });
  });

  it("categoria com o vazio é 'sem categoria'", () => {
    expect(whereDoFunilDoLancamento("categoria", ["", "cat-1"])).toEqual({ OR: [{ categoryId: { in: ["cat-1"] } }, { categoryId: null }] });
  });

  it("cada funil num item do AND, e a cascata deixa o da própria coluna de fora", () => {
    const funis = { tipo: ["PAGAR"], contraparte: ["c1"] };
    expect(whereDosFunisDosLancamentos(funis)).toEqual([{ kind: { in: ["PAGAR"] } }, { counterpartyId: { in: ["c1"] } }]);
    expect(whereDosFunisDosLancamentos(funis, "tipo")).toEqual([{ counterpartyId: { in: ["c1"] } }]);
  });
});

describe("a situação do funil é a do selo da linha", () => {
  it("renegociado e perda pelo fechamento, o resto pelo status", () => {
    expect(situacaoDoLancamento({ status: "CANCELADO", closeReason: "RENEGOCIADO" })).toBe("renegociado");
    expect(situacaoDoLancamento({ status: "CANCELADO", closeReason: "PERDA" })).toBe("perda");
    expect(situacaoDoLancamento({ status: "CANCELADO", closeReason: "CANCELADO" })).toBe("cancelado");
    expect(situacaoDoLancamento({ status: "PROVISORIO", closeReason: null })).toBe("conferir");
    expect(situacaoDoLancamento({ status: "CONFERIDO", closeReason: null })).toBe("aberto");
    expect(situacaoDoLancamento({ status: "PAGO", closeReason: null })).toBe("pago");
  });

  it("o where não confunde o cancelado comum com o renegociado", () => {
    expect(whereDaSituacaoDoLancamento("cancelado")).toEqual({ status: "CANCELADO", OR: [{ closeReason: null }, { closeReason: "CANCELADO" }] });
    expect(whereDaSituacaoDoLancamento("renegociado")).toEqual({ closeReason: "RENEGOCIADO" });
    expect(whereDoFunilDoLancamento("situacao", ["aberto", "perda"])).toEqual({
      OR: [{ status: "CONFERIDO", OR: [{ closeReason: null }, { closeReason: "CANCELADO" }] }, { closeReason: "PERDA" }],
    });
  });
});
