import { describe, expect, it } from "vitest";
import { STATUS, PRIORIDADES } from "./regras";
import { TOM_DA_PRIORIDADE, TOM_DA_SITUACAO, slaAtrasado } from "./tons";

const agora = new Date("2026-10-30T15:00:00Z");
const antes = new Date("2026-10-29T15:00:00Z");
const depois = new Date("2026-10-31T15:00:00Z");

describe("tons do chamado", () => {
  it("toda situação e toda prioridade têm tom", () => {
    for (const s of STATUS) expect(TOM_DA_SITUACAO[s]).toBeTruthy();
    for (const p of PRIORIDADES) expect(TOM_DA_PRIORIDADE[p]).toBeTruthy();
  });

  it("urgente não tem o mesmo tom de baixa", () => {
    expect(TOM_DA_PRIORIDADE.URGENTE).not.toBe(TOM_DA_PRIORIDADE.BAIXA);
  });
});

describe("SLA atrasado", () => {
  const ciclo = (c: Partial<{ resolutionDueAt: Date; resolvedAt: Date | null; pausedAt: Date | null }>) => ({
    resolutionDueAt: antes,
    resolvedAt: null,
    pausedAt: null,
    ...c,
  });

  it("prazo vencido num chamado em andamento", () => {
    expect(slaAtrasado("EM_ANDAMENTO", ciclo({}), agora)).toBe(true);
  });

  it("prazo ainda por vir", () => {
    expect(slaAtrasado("EM_ANDAMENTO", ciclo({ resolutionDueAt: depois }), agora)).toBe(false);
  });

  it("SLA pausado não conta como atraso", () => {
    expect(slaAtrasado("STANDBY", ciclo({ pausedAt: antes }), agora)).toBe(false);
  });

  it("chamado encerrado ou ciclo resolvido não estão atrasados", () => {
    expect(slaAtrasado("RESOLVIDO", ciclo({}), agora)).toBe(false);
    expect(slaAtrasado("EM_ANDAMENTO", ciclo({ resolvedAt: agora }), agora)).toBe(false);
  });

  it("sem ciclo (ainda na fila), sem atraso", () => {
    expect(slaAtrasado("NA_FILA", undefined, agora)).toBe(false);
  });
});
