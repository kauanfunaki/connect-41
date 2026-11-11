import { describe, expect, it } from "vitest";
import { casarEmpresas, dataSemFuso, json, manualVence, mapearVinculos, quemNoAditiva } from "./mapear";

describe("carga do Aditiva", () => {
  const aditiva = [
    { id: "a1", cnpj: "11.222.333/0001-81", razao_social: "ALFA" },
    { id: "a2", cnpj: "11.222.333/0002-62", razao_social: "ALFA FILIAL" },
    { id: "a3", cnpj: "99.999.999/0001-91", razao_social: "SEM PAR" },
    { id: "a4", cnpj: "22.333.444/0001-55", razao_social: "DUPLICADA" },
  ];
  const connect = [
    { id: "c1", cnpj: "11222333000181" },
    { id: "c2", cnpj: "11.222.333/0002-62" },
    { id: "c3", cnpj: "22333444000155" },
    { id: "c4", cnpj: "22333444000155" },
    { id: "c5", cnpj: null },
  ];

  it("casa pelo CNPJ inteiro, com ou sem máscara; filial é outra empresa", () => {
    const r = casarEmpresas(aditiva, connect);
    expect(r.porId.get("a1")).toBe("c1");
    expect(r.porId.get("a2")).toBe("c2");
    expect(r.semPar.map((e) => e.id)).toEqual(["a3"]);
    expect(r.ambiguas.map((e) => e.id)).toEqual(["a4"]);
  });

  it("vínculo: ignorado vem sem empresa; empresa sem par fica de fora", () => {
    const quando = new Date("2026-10-01T12:00:00Z");
    const { porId } = casarEmpresas(aditiva, connect);
    const r = mapearVinculos(
      [
        { nome_pasta: "ALFA", company_id: "a1", tipo: "confirmado", vinculado_em: quando },
        { nome_pasta: "SCANNER", company_id: null, tipo: "ignorado", vinculado_em: quando },
        { nome_pasta: "SEM PAR", company_id: "a3", tipo: "auto", vinculado_em: quando },
        { nome_pasta: "ESTRANHO", company_id: "a1", tipo: "outro", vinculado_em: quando },
      ],
      porId,
    );
    expect(r.gravar).toEqual([
      { nomePasta: "ALFA", companyId: "c1", tipo: "confirmado", vinculadoEm: quando },
      { nomePasta: "SCANNER", companyId: null, tipo: "ignorado", vinculadoEm: quando },
    ]);
    expect(r.semEmpresa.map((v) => v.nome_pasta)).toEqual(["SEM PAR"]);
  });

  it("quem fez: a conta do setor com a origem", () => {
    expect(quemNoAditiva("societario")).toBe("Societário (Aditiva Pronto)");
    expect(quemNoAditiva("controladoria")).toBe("Controladoria (Aditiva Pronto)");
    expect(quemNoAditiva("")).toBe("Aditiva Pronto");
  });

  it("o valor à mão do Aditiva só vence o do Connect se for mais novo", () => {
    const antes = new Date("2026-10-01T00:00:00Z");
    const depois = new Date("2026-11-12T00:00:00Z");
    expect(manualVence(antes, null)).toBe(true);
    expect(manualVence(antes, depois)).toBe(false);
    expect(manualVence(depois, antes)).toBe(true);
  });

  it("data do DATE e JSON em texto", () => {
    expect(dataSemFuso("2026-02-10")?.toISOString()).toBe("2026-02-10T00:00:00.000Z");
    expect(dataSemFuso(null)).toBeNull();
    expect(json('["A","B"]', [])).toEqual(["A", "B"]);
    expect(json("não é json", [] as string[])).toEqual([]);
    expect(json(["X"], [])).toEqual(["X"]);
  });
});
