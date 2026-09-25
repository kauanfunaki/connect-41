import { describe, it, expect } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { competenciaPedida, linkDoAcervo, soDigitos, somarPorTipo } from "./ferramentas-fiscal";

describe("ferramentas da IA do Fiscal", () => {
  it("competência só no formato AAAA-MM", () => {
    expect(competenciaPedida({ competencia: " 2026-08 " })).toBe("2026-08");
    expect(() => competenciaPedida({ competencia: "08/2026" })).toThrow();
    expect(() => competenciaPedida({ competencia: "2026-13" })).toThrow();
    expect(() => competenciaPedida({})).toThrow();
  });

  it("documento só com dígitos", () => {
    expect(soDigitos("12.345.678/0001-90")).toBe("12345678000190");
    expect(soDigitos(null)).toBe("");
  });

  it("link da tela com os filtros que ela lê", () => {
    expect(linkDoAcervo({ empresa: "e1", competencia: "2026-08", destino: undefined })).toBe(
      "/documentos-fiscais?empresa=e1&competencia=2026-08"
    );
    expect(linkDoAcervo({})).toBe("/documentos-fiscais");
  });

  it("soma por tipo, com as canceladas à parte e fora do valor", () => {
    const g = (type: string, situation: string, n: number, v: string) => ({
      type,
      situation,
      destination: "PENDENTE",
      completude: "COMPLETO",
      _count: { _all: n },
      _sum: { amount: new Prisma.Decimal(v) },
    });
    expect(somarPorTipo([g("NFE", "AUTORIZADA", 2, "100.10"), g("NFE", "AUTORIZADA", 1, "0.20"), g("NFE", "CANCELADA", 1, "999")])).toEqual({
      NFE: { quantidade: 3, valor: 100.3, canceladas: 1 },
    });
  });
});
