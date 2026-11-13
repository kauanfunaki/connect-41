import { describe, expect, it } from "vitest";
import { z } from "zod";
import { resumoDaProposta } from "./aberturaCartao";

// O esquema que conferia o resumo até 13/11/2026, quando o cartão saiu do zod
// (melhoria-661). A conferência à mão tem de dar o mesmo resultado.
const resumoSchemaAntigo = z.object({
  tipo: z.string(),
  versao: z.number(),
  etapas: z.number(),
  empresa: z.string(),
  documento: z.string().nullable(),
  responsavel: z.string().nullable(),
  jaTemos: z.array(z.string()),
  aPedir: z.array(z.string()),
  emAndamento: z.number(),
});

const bom = {
  tipo: "Alteração contratual",
  versao: 3,
  etapas: 5,
  empresa: "Padaria Modelo",
  documento: "12.345.678/0001-90",
  responsavel: null,
  jaTemos: ["Contrato social"],
  aPedir: [],
  emAndamento: 0,
};

const casos: [string, unknown][] = [
  ["o resumo certo", bom],
  ["com campo a mais", { ...bom, extra: "fica de fora" }],
  ["documento e responsável nulos", { ...bom, documento: null, responsavel: null }],
  ["sem o documento", Object.fromEntries(Object.entries(bom).filter(([k]) => k !== "documento"))],
  ["responsável indefinido", { ...bom, responsavel: undefined }],
  ["versão em texto", { ...bom, versao: "3" }],
  ["versão NaN", { ...bom, versao: Number.NaN }],
  ["etapas infinitas", { ...bom, etapas: Number.POSITIVE_INFINITY }],
  ["emAndamento negativo e quebrado", { ...bom, emAndamento: -1.5 }],
  ["empresa nula", { ...bom, empresa: null }],
  ["jaTemos com número", { ...bom, jaTemos: ["a", 1] }],
  ["aPedir que não é lista", { ...bom, aPedir: "a" }],
  ["lista com buraco", { ...bom, jaTemos: [, "a"] }],
  ["resumo é lista", [bom]],
  ["resumo é texto", "resumo"],
  ["resumo nulo", null],
  ["sem resumo", undefined],
  ["resumo vazio", {}],
];

describe("resumoDaProposta (sem zod)", () => {
  it.each(casos)("dá o mesmo que o esquema antigo: %s", (_, resumo) => {
    const antigo = resumoSchemaAntigo.safeParse(resumo);
    expect(resumoDaProposta({ resumo })).toEqual(antigo.success ? antigo.data : null);
  });

  it("devolve listas novas, sem o que veio a mais", () => {
    const r = resumoDaProposta({ resumo: { ...bom, extra: 1 } });
    expect(r).not.toHaveProperty("extra");
    expect(r?.jaTemos).not.toBe(bom.jaTemos);
  });

  it("sem argumentos, nulo", () => {
    expect(resumoDaProposta(undefined)).toBeNull();
  });
});
