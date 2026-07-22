import { describe, expect, it } from "vitest";
import { buildS2200Preview, relationshipToTpDep, type S2200Input } from "./esocialS2200";

const baseInput: S2200Input = {
  cpf: null, name: "Fulano de Tal", birthDate: null, rg: null, pis: null, ctps: null, ctpsSerie: null,
  zipCode: null, addressStreet: null, addressNumber: null, addressComplement: null, neighborhood: null, city: null, stateCode: null,
  admissionDate: null, cargoName: null, salary: null, workShift: null, weeklyWorkHours: null,
  includeSalary: true, dependentes: [],
};

describe("relationshipToTpDep", () => {
  it("mapeia parentescos para códigos tpDep do eSocial", () => {
    expect(relationshipToTpDep("CONJUGE")).toMatch(/^01/);
    expect(relationshipToTpDep("COMPANHEIRO")).toMatch(/^01/);
    expect(relationshipToTpDep("FILHO")).toMatch(/^03/);
    expect(relationshipToTpDep("ENTEADO")).toMatch(/^03/);
    expect(relationshipToTpDep("PAIS")).toMatch(/^09/);
    expect(relationshipToTpDep("OUTRO")).toMatch(/^99/);
    expect(relationshipToTpDep("qualquer-coisa")).toMatch(/^99/);
  });
});

describe("buildS2200Preview", () => {
  it("conta o nome como preenchido e o resto como pendente quando só há nome", () => {
    const preview = buildS2200Preview(baseInput);
    expect(preview.filledCount).toBe(1); // só o nome
    expect(preview.pendingCount).toBeGreaterThan(0);
    expect(preview.groups.length).toBe(4);
  });

  it("marca a remuneração como restrita (não conta como pendente) sem permissão", () => {
    const preview = buildS2200Preview({ ...baseInput, salary: "3500.00", includeSalary: false });
    const contrato = preview.groups.find((g) => g.title === "Contrato de trabalho")!;
    const rem = contrato.fields.find((f) => f.label === "Remuneração")!;
    expect(rem.restricted).toBe(true);
    expect(rem.value).toBeNull();
  });

  it("exibe a remuneração formatada em pt-BR com permissão", () => {
    const preview = buildS2200Preview({ ...baseInput, salary: "3500.5", includeSalary: true });
    const rem = preview.groups.find((g) => g.title === "Contrato de trabalho")!.fields.find((f) => f.label === "Remuneração")!;
    expect(rem.restricted).toBeUndefined();
    expect(rem.value).toBe("R$ 3.500,50");
  });

  it("monta a lista de dependentes com tpDep e flags", () => {
    const preview = buildS2200Preview({
      ...baseInput,
      dependentes: [{ name: "Filho Um", relationship: "FILHO", birthDate: null, cpf: null, isIRDependent: true, isSalarioFamilia: false }],
    });
    expect(preview.dependentes).toHaveLength(1);
    expect(preview.dependentes[0]).toMatchObject({ nome: "Filho Um", irrf: true, sf: false });
    expect(preview.dependentes[0]!.tpDep).toMatch(/^03/);
  });
});
