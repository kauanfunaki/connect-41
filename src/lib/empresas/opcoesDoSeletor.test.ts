import { describe, expect, it } from "vitest";
import { opcoesDeEmpresa } from "./opcoesDoSeletor";
import { casaComABusca } from "@/components/shared/SearchableSelect";

describe("opcoesDeEmpresa", () => {
  it("põe cada filial recuada logo abaixo da sua matriz, em ordem de nome", () => {
    const opcoes = opcoesDeEmpresa([
      { id: "f2", nome: "Zeta Filial", matrizId: "m1" },
      { id: "m2", nome: "beta" },
      { id: "m1", nome: "Alfa" },
      { id: "f1", nome: "Alfa Filial", parentCompanyId: "m1" },
    ]);
    expect(opcoes.map((o) => [o.value, o.recuo])).toEqual([
      ["m1", false],
      ["f1", true],
      ["f2", true],
      ["m2", false],
    ]);
  });

  it("deixa solta a filial cuja matriz não está na lista", () => {
    const [o] = opcoesDeEmpresa([{ id: "f1", nome: "Filial", matrizId: "fora" }]);
    expect(o.recuo).toBe(false);
  });

  it("leva logo, CNPJ formatado na descrição e só os dígitos na busca", () => {
    const [o] = opcoesDeEmpresa([{ id: "a", name: "Acme", logoUrl: "/logo.png", cnpj: "12345678000190" }]);
    expect(o).toMatchObject({
      label: "Acme",
      imagem: "/logo.png",
      descricao: "12.345.678/0001-90",
      busca: "12345678000190",
    });
  });

  it("sem logo nem CNPJ, fica sem imagem e sem descrição", () => {
    const [o] = opcoesDeEmpresa([{ id: "a", nome: "Acme" }]);
    expect(o.imagem).toBeNull();
    expect(o.descricao).toBeUndefined();
  });
});

describe("casaComABusca", () => {
  const acme = { value: "a", label: "Acme Comércio", busca: "12345678000190" };

  it("acha pelo nome, sem diferenciar maiúscula", () => {
    expect(casaComABusca(acme, "comércio")).toBe(true);
    expect(casaComABusca(acme, "padaria")).toBe(false);
  });

  it("acha pelo CNPJ com ou sem pontuação, a partir de 3 dígitos", () => {
    expect(casaComABusca(acme, "12.345.678")).toBe(true);
    expect(casaComABusca(acme, "0001-90")).toBe(true);
    expect(casaComABusca(acme, "12")).toBe(false);
  });

  it("texto com letra não cai na busca por dígito", () => {
    expect(casaComABusca(acme, "Padaria 123")).toBe(false);
  });

  it("busca vazia casa com tudo", () => {
    expect(casaComABusca(acme, "  ")).toBe(true);
  });
});
