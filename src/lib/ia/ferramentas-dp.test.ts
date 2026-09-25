import { describe, it, expect } from "vitest";
import { exigirModuloDoDp, podeVerSensivel, recorteDeColaborador, FERRAMENTAS_DE_DP } from "./ferramentas-dp";

const ctx = (escopo: Record<string, string>) => ({ tenantId: "t1", userId: "u", escopo });

describe("ferramentas da IA do DP", () => {
  it("cada tela tem a sua porta", () => {
    expect(() => exigirModuloDoDp(ctx({ modulos: "dp_colaboradores" }), "dp_colaboradores")).not.toThrow();
    expect(() => exigirModuloDoDp(ctx({ modulos: "dp_colaboradores" }), "dp_afastamentos")).toThrow("/afastamentos");
    expect(() => exigirModuloDoDp(ctx({}), "dp_colaboradores")).toThrow();
  });

  it("campo sensível só com o grupo liberado por quem abriu o chat", () => {
    expect(podeVerSensivel(ctx({ sensiveis: "SALARIO" }), "SALARIO")).toBe(true);
    expect(podeVerSensivel(ctx({ sensiveis: "SALARIO" }), "DADOS_MEDICOS")).toBe(false);
    expect(podeVerSensivel(ctx({}), "SALARIO")).toBe(false);
  });

  it("colaborador é sempre do tenant e do tipo colaborador", () => {
    expect(recorteDeColaborador(ctx({}), null)).toEqual({ tenantId: "t1", type: "COLABORADOR" });
    expect(recorteDeColaborador(ctx({}), "e1")).toEqual({ tenantId: "t1", type: "COLABORADOR", currentCompanyId: "e1" });
  });

  it("nenhuma ferramenta aceita tenantId, e todas são só leitura", () => {
    for (const reg of Object.values(FERRAMENTAS_DE_DP)) {
      const props = (reg.def.parametros as { properties?: Record<string, unknown> }).properties ?? {};
      expect(Object.keys(props)).not.toContain("tenantId");
      expect(reg.def.natureza).toBe("leitura");
    }
  });
});
