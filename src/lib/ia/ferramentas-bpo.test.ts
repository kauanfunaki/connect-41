import { describe, it, expect } from "vitest";
import { competenciaOpcional, exigirModulo, link, reais } from "./ferramentas-bpo";

const ctx = (modulos?: string) => ({
  tenantId: "t1",
  userId: "u",
  escopo: (modulos === undefined ? {} : { modulos }) as Record<string, string>,
});

describe("ferramentas da IA do BPO", () => {
  it("cada tela tem a sua porta: quem opera contas a pagar não herda o DRE", () => {
    expect(() => exigirModulo(ctx("bpo_contas_pagar"), "bpo_contas_pagar")).not.toThrow();
    expect(() => exigirModulo(ctx("bpo_contas_pagar"), "bpo_dre")).toThrow("/dre");
    expect(() => exigirModulo(ctx(), "bpo_contas_pagar")).toThrow();
  });

  it("competência opcional, mas no formato", () => {
    expect(competenciaOpcional({ competencia: "" })).toBeUndefined();
    expect(competenciaOpcional({ competencia: "2026-09" })).toBe("2026-09");
    expect(() => competenciaOpcional({ competencia: "9/2026" })).toThrow();
  });

  it("centavos viram reais e o link leva os filtros", () => {
    expect(reais(123456)).toBe(1234.56);
    expect(link("/pagar", { empresa: "e1", competencia: undefined, recorte: "vencidas" })).toBe("/pagar?empresa=e1&recorte=vencidas");
  });
});
