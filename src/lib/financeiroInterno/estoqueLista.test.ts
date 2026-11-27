import { describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { abaixoDoMinimo, precisaConferir } from "./estoque";
import { corteDaConferencia, whereDaBusca, whereDoRecorte } from "./estoqueLista";

// A lista do Estoque paginada no banco (27/11/2026, melhoria-571): o `where` de
// cada recorte precisa separar os mesmos itens que as regras puras separavam.

const minimo = { modelName: "InventoryItem", name: "minQuantity" } as unknown as Prisma.IntFieldRefInput<"InventoryItem">;
const hoje = new Date("2026-11-27T12:00:00Z");

describe("whereDoRecorte", () => {
  it("todos e baixados dividem o estoque pela baixa", () => {
    expect(whereDoRecorte("todos", hoje, minimo)).toEqual({ status: { not: "BAIXADO" } });
    expect(whereDoRecorte("baixados", hoje, minimo)).toEqual({ status: "BAIXADO" });
  });

  it("com alguém é em uso ou emprestado", () => {
    expect(whereDoRecorte("com-alguem", hoje, minimo)).toEqual({ status: { in: ["EM_USO", "EMPRESTADO"] } });
  });

  it("a repor compara a quantidade com a coluna do mínimo, só de material ativo", () => {
    expect(whereDoRecorte("repor", hoje, minimo)).toEqual({
      status: { not: "BAIXADO" },
      kind: "material",
      minQuantity: { not: null },
      quantity: { lt: minimo },
    });
    // As mesmas condições da regra pura.
    expect(abaixoDoMinimo({ kind: "material", status: "DISPONIVEL", quantity: 2, minQuantity: 5 })).toBe(true);
    expect(abaixoDoMinimo({ kind: "material", status: "BAIXADO", quantity: 2, minQuantity: 5 })).toBe(false);
    expect(abaixoDoMinimo({ kind: "material", status: "DISPONIVEL", quantity: 2, minQuantity: null })).toBe(false);
  });

  it("a conferir usa a última conferência, ou o cadastro se nunca conferido", () => {
    const corte = corteDaConferencia(hoje);
    expect(whereDoRecorte("conferir", hoje, minimo)).toEqual({
      status: { not: "BAIXADO" },
      OR: [{ lastCheckedAt: { lte: corte } }, { lastCheckedAt: null, createdAt: { lte: corte } }],
    });
    // O corte é a borda da regra pura: no corte entra, um milissegundo depois não.
    expect(precisaConferir({ status: "DISPONIVEL", lastCheckedAt: corte, createdAt: corte }, hoje)).toBe(true);
    expect(precisaConferir({ status: "DISPONIVEL", lastCheckedAt: new Date(corte.getTime() + 1), createdAt: corte }, hoje)).toBe(false);
  });
});

describe("whereDaBusca", () => {
  it("sem termo não filtra", () => {
    expect(whereDaBusca("   ")).toEqual({});
  });

  it("procura o termo em cada campo da linha", () => {
    const w = whereDaBusca("  toner ");
    expect(w.OR).toHaveLength(6);
    expect(w.OR).toContainEqual({ name: { contains: "toner" } });
    expect(w.OR).toContainEqual({ holderName: { contains: "toner" } });
  });

  it("corta o termo em 100 caracteres", () => {
    const w = whereDaBusca("x".repeat(300));
    expect((w.OR as { name?: { contains: string } }[])[0].name!.contains).toHaveLength(100);
  });
});
