import { describe, it, expect } from "vitest";
import { recorteDasCandidaturasDoSetor, recorteDasVagas } from "./ferramentas-recrutamento-setor";

const ctx = (setores?: string) => ({ tenantId: "t1", userId: "u", escopo: setores === undefined ? {} : { setores } });

describe("recorte da IA do Recrutamento", () => {
  it("vaga só do tenant e dos setores em que a pessoa atua", () => {
    expect(recorteDasVagas(ctx("recrutamento,dp"))).toEqual({ tenantId: "t1", sectorCode: { in: ["recrutamento", "dp"] } });
  });
  it("candidatura herda o mesmo recorte, pela vaga", () => {
    expect(recorteDasCandidaturasDoSetor(ctx("recrutamento"))).toEqual({
      tenantId: "t1",
      vaga: { tenantId: "t1", sectorCode: { in: ["recrutamento"] } },
    });
  });
  it("sem setor no recorte, recusa em vez de ler o tenant inteiro", () => {
    expect(() => recorteDasVagas(ctx())).toThrow();
    expect(() => recorteDasVagas(ctx(""))).toThrow();
  });
});
