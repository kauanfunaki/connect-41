import { describe, expect, it } from "vitest";
import {
  seniorityIndex,
  agruparPorFamilia,
  detectarDegrausInvertidos,
  normalizarNome,
  detectarDivergenciasNome,
  SEM_FAMILIA,
  type CargoLike,
} from "./cargoMatriz";

function cargo(over: Partial<CargoLike> & { id: string; name: string }): CargoLike {
  return {
    family: null,
    seniority: null,
    area: null,
    companyName: "Empresa A",
    peopleCount: 0,
    salaryRangeMin: null,
    salaryRangeMid: null,
    salaryRangeMax: null,
    ...over,
  };
}

describe("seniorityIndex", () => {
  it("respeita a ordem da trilha", () => {
    expect(seniorityIndex("JUNIOR")).toBeLessThan(seniorityIndex("PLENO"));
    expect(seniorityIndex("PLENO")).toBeLessThan(seniorityIndex("SENIOR"));
    expect(seniorityIndex("SENIOR")).toBeLessThan(seniorityIndex("GERENCIA"));
  });

  it("sem nível retorna -1", () => {
    expect(seniorityIndex(null)).toBe(-1);
  });
});

describe("agruparPorFamilia", () => {
  it("agrupa por família e ordena pela trilha", () => {
    const groups = agruparPorFamilia([
      cargo({ id: "3", name: "Analista Sênior", family: "Contábil", seniority: "SENIOR" }),
      cargo({ id: "1", name: "Analista Júnior", family: "Contábil", seniority: "JUNIOR" }),
      cargo({ id: "2", name: "Analista Pleno", family: "Contábil", seniority: "PLENO" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.cargos.map((c) => c.id)).toEqual(["1", "2", "3"]);
  });

  it("cargo sem nível vai pro fim do grupo", () => {
    const groups = agruparPorFamilia([
      cargo({ id: "sem", name: "Coordenador", family: "Fiscal", seniority: null }),
      cargo({ id: "jr", name: "Analista", family: "Fiscal", seniority: "JUNIOR" }),
    ]);
    expect(groups[0]!.cargos.map((c) => c.id)).toEqual(["jr", "sem"]);
  });

  it("cargos sem família caem num grupo próprio, sempre por último", () => {
    const groups = agruparPorFamilia([
      cargo({ id: "x", name: "Avulso" }),
      cargo({ id: "y", name: "Analista", family: "Contábil" }),
    ]);
    expect(groups.map((g) => g.family)).toEqual(["Contábil", SEM_FAMILIA]);
    expect(groups[1]!.label).toBe("Sem família definida");
  });

  it("soma o headcount da família", () => {
    const groups = agruparPorFamilia([
      cargo({ id: "a", name: "A", family: "TI", peopleCount: 3 }),
      cargo({ id: "b", name: "B", family: "TI", peopleCount: 2 }),
    ]);
    expect(groups[0]!.totalPessoas).toBe(5);
  });
});

describe("detectarDegrausInvertidos", () => {
  it("acusa quando o nível mais alto paga menos", () => {
    const ordenados = [
      cargo({ id: "jr", name: "Júnior", seniority: "JUNIOR", salaryRangeMin: 3000 }),
      cargo({ id: "pl", name: "Pleno", seniority: "PLENO", salaryRangeMin: 2500 }),
    ];
    const problemas = detectarDegrausInvertidos(ordenados);
    expect(problemas).toHaveLength(1);
    expect(problemas[0]!.cargo.id).toBe("pl");
    expect(problemas[0]!.anterior.id).toBe("jr");
  });

  it("trilha coerente não acusa nada", () => {
    const problemas = detectarDegrausInvertidos([
      cargo({ id: "jr", name: "Júnior", seniority: "JUNIOR", salaryRangeMin: 2500 }),
      cargo({ id: "pl", name: "Pleno", seniority: "PLENO", salaryRangeMin: 3500 }),
      cargo({ id: "sr", name: "Sênior", seniority: "SENIOR", salaryRangeMin: 5000 }),
    ]);
    expect(problemas).toHaveLength(0);
  });

  it("ignora cargos do MESMO nível com faixas diferentes", () => {
    const problemas = detectarDegrausInvertidos([
      cargo({ id: "a", name: "Analista A", seniority: "PLENO", salaryRangeMin: 4000 }),
      cargo({ id: "b", name: "Analista B", seniority: "PLENO", salaryRangeMin: 3000 }),
    ]);
    expect(problemas).toHaveLength(0);
  });

  it("ignora cargo sem nível ou sem faixa", () => {
    const problemas = detectarDegrausInvertidos([
      cargo({ id: "jr", name: "Júnior", seniority: "JUNIOR", salaryRangeMin: 3000 }),
      cargo({ id: "sem-faixa", name: "Pleno", seniority: "PLENO", salaryRangeMin: null }),
      cargo({ id: "sem-nivel", name: "Outro", seniority: null, salaryRangeMin: 100 }),
    ]);
    expect(problemas).toHaveLength(0);
  });
});

describe("normalizarNome", () => {
  it("ignora acento, caixa e pontuação", () => {
    expect(normalizarNome("Analista Contábil")).toBe("analista contabil");
    expect(normalizarNome("ANALISTA  CONTABIL")).toBe("analista contabil");
    expect(normalizarNome("Analista-Contábil")).toBe("analista contabil");
  });
});

describe("detectarDivergenciasNome", () => {
  it("acusa grafias diferentes do mesmo cargo", () => {
    const d = detectarDivergenciasNome([
      { name: "Analista Contábil", companyName: "A" },
      { name: "Analista Contabil", companyName: "B" },
    ]);
    expect(d).toHaveLength(1);
    expect(d[0]!.variantes).toHaveLength(2);
  });

  it("mesma grafia repetida entre empresas NÃO é divergência", () => {
    const d = detectarDivergenciasNome([
      { name: "Analista Contábil", companyName: "A" },
      { name: "Analista Contábil", companyName: "B" },
    ]);
    expect(d).toHaveLength(0);
  });

  it("cargos diferentes não são agrupados", () => {
    const d = detectarDivergenciasNome([
      { name: "Analista Contábil", companyName: "A" },
      { name: "Analista Fiscal", companyName: "A" },
    ]);
    expect(d).toHaveLength(0);
  });
});
