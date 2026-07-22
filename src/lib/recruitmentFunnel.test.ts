import { describe, expect, it } from "vitest";
import { computeFunnelConversion, stageIndex } from "./recruitmentFunnel";

describe("stageIndex", () => {
  it("ordena as etapas", () => {
    expect(stageIndex("TRIAGEM")).toBe(0);
    expect(stageIndex("CONTRATADO")).toBe(4);
    expect(stageIndex("desconhecido")).toBe(0);
  });
});

describe("computeFunnelConversion", () => {
  it("mede quantos alcançaram cada etapa, preservando reprovados", () => {
    const stats = computeFunnelConversion([
      { stage: "TRIAGEM", status: "EM_ANDAMENTO" },
      { stage: "ENTREVISTA", status: "EM_ANDAMENTO" },
      { stage: "ENTREVISTA", status: "REPROVADO" }, // reprovado na entrevista: alcançou triagem+entrevista
      { stage: "CONTRATADO", status: "CONTRATADO" },
    ]);

    expect(stats.total).toBe(4);
    const [triagem, entrevista, teste, , contratado] = stats.stages;
    expect(triagem!.reached).toBe(4); // todos passaram por triagem
    expect(entrevista!.reached).toBe(3); // 2 em entrevista + 1 contratado
    expect(teste!.reached).toBe(1); // só o contratado
    expect(contratado!.reached).toBe(1);
    expect(triagem!.conversionPct).toBe(100);
    expect(entrevista!.conversionPct).toBe(75);
  });

  it("current ignora reprovados/desistentes na coluna", () => {
    const stats = computeFunnelConversion([
      { stage: "ENTREVISTA", status: "EM_ANDAMENTO" },
      { stage: "ENTREVISTA", status: "REPROVADO" },
      { stage: "ENTREVISTA", status: "DESISTENTE" },
    ]);
    const entrevista = stats.stages.find((s) => s.stage === "ENTREVISTA")!;
    expect(entrevista.current).toBe(1); // só o ativo
    expect(entrevista.reached).toBe(3); // mas os 3 alcançaram a etapa
  });

  it("conta os desfechos", () => {
    const stats = computeFunnelConversion([
      { stage: "CONTRATADO", status: "CONTRATADO" },
      { stage: "PROPOSTA", status: "REPROVADO" },
      { stage: "TRIAGEM", status: "DESISTENTE" },
    ]);
    expect(stats.contratados).toBe(1);
    expect(stats.reprovados).toBe(1);
    expect(stats.desistentes).toBe(1);
  });

  it("lida com funil vazio", () => {
    const stats = computeFunnelConversion([]);
    expect(stats.total).toBe(0);
    expect(stats.stages.every((s) => s.conversionPct === 0)).toBe(true);
  });
});
