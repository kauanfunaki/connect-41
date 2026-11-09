import { describe, expect, it } from "vitest";
import { CAMINHO_DO_PROCEC, descricaoComProcec } from "./roteiroDoAlvara";

// O PROCEC como caminho alternativo da etapa do alvará (item do Controle
// interno de 15/09, feito em 09/11/2026).

describe("descricaoComProcec", () => {
  it("etapa sem descrição ganha o caminho do PROCEC", () => {
    expect(descricaoComProcec(null)).toBe(CAMINHO_DO_PROCEC);
    expect(descricaoComProcec("   ")).toBe(CAMINHO_DO_PROCEC);
  });

  it("o que o escritório já escreveu fica, e o caminho vem depois", () => {
    expect(descricaoComProcec("Conferir a taxa antes.")).toBe(`Conferir a taxa antes. ${CAMINHO_DO_PROCEC}`);
  });

  it("rodar de novo não repete o texto", () => {
    expect(descricaoComProcec(CAMINHO_DO_PROCEC)).toBeNull();
    expect(descricaoComProcec("Usar o procec quando falhar.")).toBeNull();
  });

  it("não passa do teto da coluna", () => {
    expect(CAMINHO_DO_PROCEC.length).toBeLessThanOrEqual(1000);
    expect(() => descricaoComProcec("x".repeat(900))).toThrow(/1000 caracteres/);
  });

  it("diz quando, onde e o que registrar", () => {
    expect(CAMINHO_DO_PROCEC).toMatch(/não integrar por erro na Junta/);
    expect(CAMINHO_DO_PROCEC).toMatch(/PROCEC/);
    expect(CAMINHO_DO_PROCEC).toMatch(/e-Cidadão/);
    expect(CAMINHO_DO_PROCEC).toMatch(/registre o número/);
  });
});
