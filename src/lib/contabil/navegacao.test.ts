import { describe, expect, it } from "vitest";
import { ETAPAS_DO_CONTABIL, SECOES_DO_CONTABIL, etapaDaSecao } from "./navegacao";

// As etapas do de-para e lançamentos (03/11/2026): cada seção antiga cai numa
// etapa, e a ordem é a do trabalho do mês.
describe("etapas do Contábil", () => {
  it("segue a ordem do trabalho do mês", () => {
    expect(ETAPAS_DO_CONTABIL.map((e) => e.chave)).toEqual(["entradas", "pendencias", "depara", "lancamentos"]);
  });

  it("põe cada seção antiga na sua etapa", () => {
    expect(etapaDaSecao("entradas").chave).toBe("entradas");
    expect(etapaDaSecao("pendencias").chave).toBe("pendencias");
    expect(etapaDaSecao("regras").chave).toBe("depara");
    expect(etapaDaSecao("configuracao").chave).toBe("depara");
    expect(etapaDaSecao("lancamentos").chave).toBe("lancamentos");
    expect(etapaDaSecao("visao").chave).toBe("lancamentos");
  });

  it("abre a primeira etapa quando a seção não existe", () => {
    expect(etapaDaSecao("gerar").chave).toBe("entradas");
  });

  it("não repete seção entre etapas", () => {
    expect(new Set(SECOES_DO_CONTABIL).size).toBe(SECOES_DO_CONTABIL.length);
  });
});
