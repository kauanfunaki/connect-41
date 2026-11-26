import { describe, expect, it } from "vitest";
import { lerAlocacao, rotuloDoTomador, tomadorNoMes } from "./alocacao";

const base = { tipo: "CESSAO", tomadorCnpj: "11.222.333/0001-81", tomadorNome: "Hospital Bom Pastor", inicio: "2027-03-01", fim: "" };

describe("alocação por tomador", () => {
  it("valida tipo, CNPJ, nome e período", () => {
    expect(lerAlocacao(base)).toEqual({ ok: true, alocacao: { tipo: "CESSAO", tomadorCnpj: "11222333000181", tomadorNome: "Hospital Bom Pastor", inicio: "2027-03-01", fim: null } });
    expect(lerAlocacao({ ...base, tipo: "X" })).toMatchObject({ ok: false });
    expect(lerAlocacao({ ...base, tomadorCnpj: "11.222.333/0001-00" })).toMatchObject({ ok: false, erro: expect.stringMatching(/CNPJ/) });
    expect(lerAlocacao({ ...base, fim: "2027-02-01" })).toMatchObject({ ok: false, erro: expect.stringMatching(/antes/) });
  });

  it("o tomador do mês é a alocação que pega o mês, a mais recente quando há duas", () => {
    const a = [
      { personId: "p1", tipo: "CESSAO" as const, tomadorCnpj: "11222333000181", tomadorNome: "A", inicio: "2027-01-01", fim: "2027-03-10" },
      { personId: "p1", tipo: "CESSAO" as const, tomadorCnpj: "11222333000181", tomadorNome: "B", inicio: "2027-03-11", fim: null },
      { personId: "p2", tipo: "TEMPORARIO" as const, tomadorCnpj: "11222333000181", tomadorNome: "C", inicio: "2027-05-01", fim: null },
    ];
    expect(tomadorNoMes(a, "2027-02").get("p1")?.tomadorNome).toBe("A");
    expect(tomadorNoMes(a, "2027-03").get("p1")?.tomadorNome).toBe("B");
    expect(tomadorNoMes(a, "2027-03").has("p2")).toBe(false);
    expect(rotuloDoTomador(a[0])).toBe("A · 11.222.333/0001-81");
  });
});
