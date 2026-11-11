import { describe, expect, it } from "vitest";
import { empresaDaTela, enderecoComEmpresa, mesPorExtensoDoPortal } from "./empresaEscolhida";

describe("empresaDaTela", () => {
  const minhas = ["a", "b"];

  it("a da URL vence a guardada", () => {
    expect(empresaDaTela("b", "a", minhas)).toBe("b");
  });

  it("sem empresa na URL, vale a guardada", () => {
    expect(empresaDaTela(undefined, "a", minhas)).toBe("a");
  });

  it("empresa de fora do acesso não vale, nem na URL nem no cookie", () => {
    expect(empresaDaTela("outra", undefined, minhas)).toBeNull();
    expect(empresaDaTela(undefined, "outra", minhas)).toBeNull();
    // A da URL é de outro cliente: cai na guardada, que é do acesso.
    expect(empresaDaTela("outra", "a", minhas)).toBe("a");
  });

  it("parâmetro repetido na URL é ignorado", () => {
    expect(empresaDaTela(["a", "b"], null, minhas)).toBeNull();
  });

  it("sem nada escolhido, nenhuma", () => {
    expect(empresaDaTela(undefined, null, minhas)).toBeNull();
    expect(empresaDaTela("", "", minhas)).toBeNull();
  });
});

describe("enderecoComEmpresa", () => {
  it("leva a empresa e o que deve ser mantido", () => {
    expect(enderecoComEmpresa("/portal/dre", "x", { mes: "2026-10", ano: undefined, regime: "competencia" })).toBe(
      "/portal/dre?empresa=x&mes=2026-10&regime=competencia"
    );
  });

  it("sem empresa, a tela abre em todas", () => {
    expect(enderecoComEmpresa("/portal", null)).toBe("/portal");
    expect(enderecoComEmpresa("/portal/documentos", null, { competencia: "2026-10" })).toBe("/portal/documentos?competencia=2026-10");
  });

  it("não deixa o `manter` trocar a empresa", () => {
    expect(enderecoComEmpresa("/portal", "x", { empresa: "y" })).toBe("/portal?empresa=x");
  });
});

describe("mesPorExtensoDoPortal", () => {
  it("diz o mês como o cliente fala", () => {
    expect(mesPorExtensoDoPortal("2026-10")).toBe("outubro de 2026");
    expect(mesPorExtensoDoPortal("2026-03")).toBe("março de 2026");
  });

  it("o que não é mês volta como veio", () => {
    expect(mesPorExtensoDoPortal("2026-13")).toBe("2026-13");
  });
});
