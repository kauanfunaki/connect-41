import { describe, expect, it } from "vitest";
import { custoDaHora, diagnosticarCarteira, resumirHoras, type Apontamento } from "./custo";
import type { Catalogo, ParametrosPreco } from "@/lib/valora/motor";

const catalogo: Catalogo = {
  setores: [
    { codigo: "FIS", nome: "Fiscal", capacidadeHorasMes: 100, custoMensal: 6000, fatorCalibracao: 1 },
    { codigo: "DP", nome: "DP", capacidadeHorasMes: 100, custoMensal: 0, fatorCalibracao: 1 },
  ],
  atividades: [],
  complexidades: [],
  campos: [],
};
const parametros: ParametrosPreco = { despesasFixasMes: 2000, variaveisPct: 10, margemAlvoPct: 20, margemPisoPct: 0, descontoMaximoPct: 10 };
const custoDe = (s: string) => custoDaHora(catalogo, parametros, s);

describe("custo da hora pelo Valora", () => {
  it("direto pela equipe do setor, mais o rateio das despesas fixas sobre a capacidade de todos", () => {
    // 6000 / 100 h = 60/h; rateio 2000 / 200 h = 10/h.
    expect(custoDe("fiscal")).toEqual({ direto: 60, rateio: 10, total: 70 });
  });

  it("setor sem custo informado no Valora, ou sem par no Valora, não tem custo", () => {
    expect(custoDe("dp")).toBeNull();
    expect(custoDe("bpo")).toBeNull();
  });
});

describe("horas de operação", () => {
  const aps: Apontamento[] = [
    { setor: "fiscal", userId: "ana", minutos: 120, companyId: "c1" },
    { setor: "fiscal", userId: "bia", minutos: 60, companyId: "c1" },
    { setor: "bpo", userId: "ana", minutos: 30, companyId: null },
  ];

  it("soma por setor e por pessoa; hora sem custo não entra no custo, mas é contada à parte", () => {
    const r = resumirHoras(aps, custoDe);
    expect(r.total).toEqual({ minutos: 210, custo: 210 });
    expect(r.minutosSemCusto).toBe(30);
    expect(r.porSetor).toEqual([
      { setor: "fiscal", minutos: 180, custo: 210 },
      { setor: "bpo", minutos: 30, custo: null },
    ]);
    expect(r.porPessoa[0]).toEqual({ userId: "ana", minutos: 150, custo: 140 });
  });
});

describe("diagnóstico da carteira", () => {
  it("honorário líquido das variáveis contra o custo real por mês; pior margem primeiro", () => {
    const linhas = diagnosticarCarteira(
      [
        { companyId: "c1", cliente: "Alfa", honorario: 1000, alvo: 1200 },
        { companyId: "c2", cliente: "Beta", honorario: 500, alvo: 400 },
        { companyId: "c3", cliente: "Sem horas", honorario: 800, alvo: null },
      ],
      [
        // Alfa: 30 h de Fiscal em 3 meses = 10 h/mês = R$ 700/mês.
        { setor: "fiscal", userId: "ana", minutos: 1800, companyId: "c1" },
        // Beta: 3 h de Fiscal em 3 meses = 1 h/mês = R$ 70/mês, e hora de DP sem custo.
        { setor: "fiscal", userId: "ana", minutos: 180, companyId: "c2" },
        { setor: "dp", userId: "bia", minutos: 60, companyId: "c2" },
      ],
      custoDe,
      parametros,
      3
    );
    expect(linhas.map((l) => l.cliente)).toEqual(["Alfa", "Beta"]);
    expect(linhas[0]).toMatchObject({ horasMes: 10, custoMes: 700, liquido: 900, margemPct: 20, temHoraSemCusto: false });
    expect(linhas[1].temHoraSemCusto).toBe(true);
    expect(linhas[1].margemPct).toBeCloseTo(76);
  });
});
