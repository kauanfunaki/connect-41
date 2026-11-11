import { describe, expect, it } from "vitest";
import {
  empresaAtivaDoPortal,
  empresaDaTela,
  empresaGuardadaNoNavegador,
  enderecoComEmpresa,
  mesPorExtensoDoPortal,
} from "./empresaEscolhida";

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

describe("empresaGuardadaNoNavegador", () => {
  it("acha o cookie da empresa no meio dos outros", () => {
    expect(empresaGuardadaNoNavegador("tema=escuro; portal_empresa=abc%20d; outro=1")).toBe("abc d");
    expect(empresaGuardadaNoNavegador("portal_empresa=x")).toBe("x");
  });

  it("sem o cookie, vazio ou estragado, nenhuma", () => {
    expect(empresaGuardadaNoNavegador("")).toBeNull();
    expect(empresaGuardadaNoNavegador("tema=escuro")).toBeNull();
    expect(empresaGuardadaNoNavegador("portal_empresa=")).toBeNull();
    expect(empresaGuardadaNoNavegador("portal_empresa=%E0%A4%A")).toBeNull();
    // Nome que só começa igual não é o cookie.
    expect(empresaGuardadaNoNavegador("portal_empresa_velho=x")).toBeNull();
  });
});

describe("empresaAtivaDoPortal", () => {
  const duas = [
    { id: "a", nome: "Empresa A" },
    { id: "b", nome: "Empresa B" },
  ];

  it("a guardada, com o nome", () => {
    expect(empresaAtivaDoPortal(null, "b", duas)).toEqual({ id: "b", nome: "Empresa B" });
  });

  it("a da URL vence a guardada, como nas telas", () => {
    expect(empresaAtivaDoPortal("a", "b", duas)?.id).toBe("a");
  });

  it("empresa fora do acesso, nada escolhido ou uma empresa só: nenhuma", () => {
    expect(empresaAtivaDoPortal(null, "outra", duas)).toBeNull();
    expect(empresaAtivaDoPortal(null, null, duas)).toBeNull();
    expect(empresaAtivaDoPortal(null, "a", [duas[0]])).toBeNull();
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
