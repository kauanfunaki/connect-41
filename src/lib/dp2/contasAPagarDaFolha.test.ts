import { describe, expect, it } from "vitest";
import { antecipadoAoDiaUtil, categoriaDaConta, contasDaFolha, diaUtilDoMes } from "./contasAPagarDaFolha";

describe("vencimentos", () => {
  it("5º dia útil conta o sábado e pula domingo e feriado", () => {
    // Julho/2027: 1 qui, 2 sex, 3 sáb, 5 seg, 6 ter.
    expect(diaUtilDoMes(2027, 7, 5)).toBe("2027-07-06");
    // Janeiro/2027: 1º é feriado (sex); 2 sáb, 4 seg, 5 ter, 6 qua, 7 qui.
    expect(diaUtilDoMes(2027, 1, 5)).toBe("2027-01-07");
  });

  it("dia 20 no fim de semana antecipa para a sexta", () => {
    // 20/06/2027 é domingo.
    expect(antecipadoAoDiaUtil(2027, 6, 20)).toBe("2027-06-18");
    expect(antecipadoAoDiaUtil(2027, 7, 20)).toBe("2027-07-20");
  });
});

describe("contasDaFolha", () => {
  it("monta líquidos, DARF (INSS + IRRF), FGTS e PIS com vencimento no mês seguinte", () => {
    const c = contasDaFolha({ ano: 2027, mes: 6, liquido: 16145.73, inssARecolher: 5000.5, irrfARecolher: 1049.27, pisARecolher: 0, fgts: 763.82 });
    expect(c.map((x) => [x.tipo, x.valor, x.vencimento, x.chave])).toEqual([
      ["LIQUIDOS", 16145.73, "2027-07-06", "DP2 2027-06 LIQUIDOS"],
      ["DARF", 6049.77, "2027-07-20", "DP2 2027-06 DARF"],
      ["FGTS", 763.82, "2027-07-20", "DP2 2027-06 FGTS"],
    ]);
  });

  it("dezembro vence em janeiro do ano seguinte", () => {
    const c = contasDaFolha({ ano: 2026, mes: 12, liquido: 100, inssARecolher: 0, irrfARecolher: 0, pisARecolher: 10, fgts: 0 });
    expect(c.map((x) => x.tipo)).toEqual(["LIQUIDOS", "PIS"]);
    expect(c[0].vencimento.startsWith("2027-01")).toBe(true);
  });
});

describe("categoriaDaConta", () => {
  const categorias = [
    { id: "a", name: "Salários e ordenados", companyId: null },
    { id: "b", name: "Salários", companyId: "empresa" },
    { id: "c", name: "FGTS", companyId: null },
    { id: "d", name: "INSS sobre folha", companyId: null },
  ];
  it("prefere a da empresa e cai na do escritório; sem nenhuma, nula", () => {
    const [liq, darf, fgts] = contasDaFolha({ ano: 2027, mes: 6, liquido: 1, inssARecolher: 1, irrfARecolher: 0, pisARecolher: 1, fgts: 1 });
    expect(categoriaDaConta(liq, categorias)).toBe("b");
    expect(categoriaDaConta(darf, categorias)).toBe("d");
    expect(categoriaDaConta(fgts, categorias)).toBe("c");
    expect(categoriaDaConta({ categoria: /pis/i }, categorias)).toBeNull();
  });
});
