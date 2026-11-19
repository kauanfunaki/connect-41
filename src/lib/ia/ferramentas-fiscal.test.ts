import { describe, it, expect } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { competenciaPedida, linkDoAcervo, resumoDosAjustesIbsCbs, soDigitos, somarPorTipo } from "./ferramentas-fiscal";

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

  it("separa as notas de crédito e de débito da reforma, com IBS e CBS (19/11/2026)", () => {
    const g = (finalidade: string | null, situation: string, n: number, v: string, ibs: string | null, cbs: string | null) => ({
      type: "NFE",
      situation,
      destination: "IGNORADO",
      completude: "COMPLETO",
      finalidade,
      _count: { _all: n },
      _sum: { amount: new Prisma.Decimal(v), valorIbs: ibs === null ? null : new Prisma.Decimal(ibs), valorCbs: cbs === null ? null : new Prisma.Decimal(cbs) },
    });
    expect(resumoDosAjustesIbsCbs([g("1", "AUTORIZADA", 4, "1000", null, null), g(null, "AUTORIZADA", 1, "5", null, null)])).toBeNull();
    expect(
      resumoDosAjustesIbsCbs([
        g("1", "AUTORIZADA", 4, "1000", null, null),
        g("5", "AUTORIZADA", 2, "30.00", "0.20", "1.80"),
        g("6", "AUTORIZADA", 1, "12.30", "0.10", null),
        g("6", "CANCELADA", 1, "999", "9", "9"),
      ])
    ).toMatchObject({ notasDeCredito: 2, notasDeDebito: 1, valor: 42.3, ibs: 0.3, cbs: 1.8 });
  });
});

describe("busca de empresa da IA", () => {
  it("usa todas as palavras que diferenciam, sem as vazias", async () => {
    const { palavrasDaEmpresa } = await import("./ferramentas-fiscal");
    expect(palavrasDaEmpresa("BLD LOGISTICA LTDA - Filial 14")).toEqual(["bld", "logistica", "filial", "14"]);
    expect(palavrasDaEmpresa("Transportes da Serra e Cia")).toEqual(["transportes", "serra", "cia"]);
  });
});
