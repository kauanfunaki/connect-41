import { describe, expect, it } from "vitest";
import { planejarCarga } from "./carregarPlanoPadrao";
import { PLANO_PADRAO_41 } from "./planoPadrao";
import { grupoDeTexto } from "@/lib/dre/mapeamento";

describe("PLANO_PADRAO_41", () => {
  it("toda linha da DRE é um grupo que a DRE conhece (ou fica de propósito sem linha)", () => {
    for (const c of PLANO_PADRAO_41) {
      if (c.dre) expect(grupoDeTexto(c.dre), c.nome).toBe(c.dre);
    }
    expect(PLANO_PADRAO_41.filter((c) => !c.dre).map((c) => c.nome)).toEqual(["Cartão de Crédito"]);
  });

  it("não repete nome no mesmo lado", () => {
    const chaves = PLANO_PADRAO_41.map((c) => `${c.kind}|${c.nome.toLowerCase()}`);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("tem despesas e receitas", () => {
    expect(PLANO_PADRAO_41.filter((c) => c.kind === "PAGAR").length).toBe(166);
    expect(PLANO_PADRAO_41.filter((c) => c.kind === "RECEBER").length).toBe(23);
  });
});

describe("planejarCarga", () => {
  const padrao = [
    { kind: "PAGAR" as const, grupo: "Outros custos administrativos", nome: "Energia Elétrica", dre: "administrativas" },
    { kind: "PAGAR" as const, grupo: "Impostos", nome: "Impostos Federais - PIS", dre: "impostos" },
    { kind: "RECEBER" as const, grupo: "Receitas Diretas", nome: "Vendas de Produtos", dre: "receita_bruta" },
  ];

  it("cria o que falta e não mexe no que o escritório já decidiu", () => {
    const r = planejarCarga(
      [
        // já classificada à mão em outra linha: fica como está
        { id: "a", name: "Energia elétrica", kind: "PAGAR", planGroup: null, dreGroup: "comerciais" },
        // existe sem grupo nem linha: ganha os dois
        { id: "b", name: "Impostos Federais - PIS", kind: "PAGAR", planGroup: null, dreGroup: null },
      ],
      padrao
    );
    expect(r.criar.map((c) => c.nome)).toEqual(["Vendas de Produtos"]);
    expect(r.completar).toEqual([
      { id: "a", planGroup: "Outros custos administrativos" },
      { id: "b", planGroup: "Impostos", dreGroup: "impostos" },
    ]);
  });

  it("o mesmo nome do outro lado é outra categoria", () => {
    const r = planejarCarga([{ id: "x", name: "Vendas de Produtos", kind: "PAGAR", planGroup: "G", dreGroup: "cmv" }], padrao);
    expect(r.criar.map((c) => c.nome)).toContain("Vendas de Produtos");
  });

  it("rodar de novo não cria nada", () => {
    const existentes = padrao.map((p, i) => ({ id: String(i), name: p.nome, kind: p.kind, planGroup: p.grupo, dreGroup: p.dre }));
    const r = planejarCarga(existentes, padrao);
    expect(r).toEqual({ criar: [], completar: [], jaCompletas: 3 });
  });
});
