import { describe, expect, it } from "vitest";
import { camposDoFormulario, lerLancamentoPorRubrica, MAXIMO_POR_LANCAMENTO, totaisPorRubrica } from "./lancamentoPorRubrica";

const nomes: Record<string, string> = { ana: "Ana", bia: "Bia", caio: "Caio", davi: "Davi", eva: "Eva" };
const nomeDe = (id: string) => nomes[id] ?? id;

describe("lançar por rubrica e em grupo (funcionalidade-767, 1.1)", () => {
  it("lê os campos item_<pessoa> do formulário e ignora o resto", () => {
    const fd = new FormData();
    fd.set("competenciaId", "c1");
    fd.set("rubricaId", "grat");
    fd.set("item_ana", "200,00");
    fd.set("item_bia", "");
    fd.set("item_", "1");
    expect(camposDoFormulario(fd.entries())).toEqual([
      { personId: "ana", texto: "200,00" },
      { personId: "bia", texto: "" },
    ]);
  });

  it("valor: só quem foi preenchido entra", () => {
    const r = lerLancamentoPorRubrica(
      [
        { personId: "ana", texto: "200,00" },
        { personId: "bia", texto: "  " },
        { personId: "caio", texto: "1.234,56" },
      ],
      false,
      nomeDe
    );
    expect(r).toEqual({
      ok: true,
      itens: [
        { personId: "ana", quantidade: null, valor: 200 },
        { personId: "caio", quantidade: null, valor: 1234.56 },
      ],
    });
  });

  it("horas: vão em quantidade", () => {
    const r = lerLancamentoPorRubrica([{ personId: "ana", texto: "10,5" }], true, nomeDe);
    expect(r).toEqual({ ok: true, itens: [{ personId: "ana", quantidade: 10.5, valor: null }] });
  });

  it("nada preenchido é erro", () => {
    expect(lerLancamentoPorRubrica([{ personId: "ana", texto: "" }], false, nomeDe)).toEqual({ ok: false, erro: "Preencha o valor de ao menos um colaborador." });
    expect(lerLancamentoPorRubrica([], true, nomeDe)).toEqual({ ok: false, erro: "Preencha as horas ou os dias de ao menos um colaborador." });
  });

  it("tudo ou nada: aponta quem está errado e não lança ninguém", () => {
    const r = lerLancamentoPorRubrica(
      [
        { personId: "ana", texto: "100" },
        { personId: "bia", texto: "abc" },
        { personId: "caio", texto: "0" },
        { personId: "davi", texto: "-5" },
        { personId: "eva", texto: "x" },
      ],
      false,
      nomeDe
    );
    expect(r).toEqual({ ok: false, erro: "Valor inválido para Bia, Caio, Davi e mais 1. Nada foi lançado." });
  });

  it("a mesma pessoa repetida conta uma vez", () => {
    const r = lerLancamentoPorRubrica(
      [
        { personId: "ana", texto: "100" },
        { personId: "ana", texto: "300" },
      ],
      false,
      nomeDe
    );
    expect(r).toEqual({ ok: true, itens: [{ personId: "ana", quantidade: null, valor: 100 }] });
  });

  it("tem um limite por envio", () => {
    const campos = Array.from({ length: MAXIMO_POR_LANCAMENTO + 1 }, (_, i) => ({ personId: `p${i}`, texto: "1" }));
    expect(lerLancamentoPorRubrica(campos, false, nomeDe).ok).toBe(false);
  });
});

describe("consulta por rubrica (funcionalidade-767, 1.1)", () => {
  const grat = { id: "grat", codigo: "201", nome: "Gratificação", tipo: "PROVENTO" };
  const he = { id: "he", codigo: "150", nome: "Horas extras 50%", tipo: "PROVENTO" };
  const plano = { id: "plano", codigo: "1010", nome: "Plano de saúde", tipo: "DESCONTO" };

  it("soma lançamentos e fixas por rubrica, em ordem de código", () => {
    const t = totaisPorRubrica(
      [
        { personId: "ana", quantidade: null, valor: "500.00", rubrica: grat },
        { personId: "ana", quantidade: "10.5", valor: null, rubrica: he },
        { personId: "bia", quantidade: "4", valor: null, rubrica: he },
        { personId: "bia", quantidade: "2", valor: null, rubrica: he },
      ],
      [
        { personId: "caio", quantidade: null, valor: 200, rubrica: grat },
        { personId: "bia", quantidade: null, valor: 189.9, rubrica: plano },
      ]
    );
    expect(t).toEqual([
      { rubricaId: "he", codigo: "150", nome: "Horas extras 50%", tipo: "PROVENTO", pessoas: 2, lancamentos: 3, fixas: 0, quantidade: 16.5, valor: null },
      { rubricaId: "grat", codigo: "201", nome: "Gratificação", tipo: "PROVENTO", pessoas: 2, lancamentos: 2, fixas: 1, quantidade: null, valor: 700 },
      { rubricaId: "plano", codigo: "1010", nome: "Plano de saúde", tipo: "DESCONTO", pessoas: 1, lancamentos: 1, fixas: 1, quantidade: null, valor: 189.9 },
    ]);
  });

  it("sem nada no mês, lista vazia", () => {
    expect(totaisPorRubrica([], [])).toEqual([]);
  });
});
