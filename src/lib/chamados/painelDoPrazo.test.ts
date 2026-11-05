import { describe, expect, it } from "vitest";
import { duracao, painelDoPrazo, quandoCurto, type CicloDoPainel } from "./painelDoPrazo";

// Quinta, 05/11/2026. Brasília é UTC-3: 12:20 aqui = 15:20Z.
const agora = new Date("2026-11-05T15:20:00Z");
const ciclo = (c: Partial<CicloDoPainel> = {}): CicloDoPainel => ({
  openedAt: "2026-11-04T19:40:00Z", // quarta 16:40
  firstResponseDueAt: "2026-11-05T11:40:00Z",
  resolutionDueAt: "2026-11-05T17:30:00Z", // quinta 14:30
  firstResponseAt: "2026-11-04T20:02:00Z", // 22 min depois
  resolvedAt: null, pausedAt: null, pausedMinutes: 0, manualDeadline: false, ...c,
});

describe("faixa do prazo no cartão Atendimento", () => {
  it("escreve o prazo em dia curto, no relógio de Brasília", () => {
    expect(quandoCurto(new Date("2026-11-05T17:30:00Z"), agora)).toBe("hoje, 14:30");
    expect(quandoCurto(new Date("2026-11-06T12:00:00Z"), agora)).toBe("amanhã, 09:00");
    expect(quandoCurto(new Date("2026-11-04T20:00:00Z"), agora)).toBe("ontem, 17:00");
    expect(quandoCurto(new Date("2026-11-12T13:00:00Z"), agora)).toBe("12/11, 10:00");
    expect(quandoCurto(new Date("2027-01-12T13:00:00Z"), agora)).toBe("12/01/2027, 10:00");
  });
  it("formata a duração", () => {
    expect(duracao(45)).toBe("45 min");
    expect(duracao(120)).toBe("2 h");
    expect(duracao(130)).toBe("2 h 10 min");
  });
  it("no prazo: o que falta em horas úteis e a primeira resposta", () => {
    const p = painelDoPrazo(ciclo(), "EM_ANDAMENTO", agora);
    expect(p.titulo).toBe("Resolver até hoje, 14:30");
    expect(p.restante).toBe("faltam 2 h 10 min úteis");
    expect(p.primeiraResposta).toBe("primeira resposta em 22 min");
    // 80 min úteis na quarta + 4 h 20 na quinta = 340 usados de 470.
    expect(p.usado).toBeCloseTo(340 / 470, 3);
    expect(p.tom).toBe("ok");
    expect(p.rotulo).toBe("No prazo");
  });
  it("perto do prazo vira atenção, com o texto junto", () => {
    const p = painelDoPrazo(ciclo(), "EM_ANDAMENTO", new Date("2026-11-05T16:45:00Z"));
    expect(p.restante).toBe("faltam 45 min úteis");
    expect(p.tom).toBe("atencao");
    expect(p.rotulo).toBe("Perto do prazo");
  });
  it("prazo vencido: atrasado, barra cheia", () => {
    const p = painelDoPrazo(ciclo(), "EM_ANDAMENTO", new Date("2026-11-05T18:10:00Z"));
    expect(p.restante).toBe("atrasado há 40 min úteis");
    expect(p).toMatchObject({ tom: "perigo", rotulo: "Atrasado", usado: 1 });
  });
  it("noite e fim de semana não contam no que falta", () => {
    // Quinta 18:00 → prazo sexta 10:00: só 2 h úteis.
    const p = painelDoPrazo(ciclo({ resolutionDueAt: "2026-11-06T13:00:00Z" }), "EM_ANDAMENTO", new Date("2026-11-05T21:00:00Z"));
    expect(p.restante).toBe("faltam 2 h úteis");
  });
  it("pausado, ajustado, sem primeira resposta", () => {
    const p = painelDoPrazo(ciclo({ pausedAt: "2026-11-05T14:00:00Z", manualDeadline: true, firstResponseAt: null }), "AGUARDANDO_USUARIO", agora);
    expect(p.titulo).toBe("Resolver até hoje, 14:30 (ajustado)");
    expect(p.restante).toBe("SLA pausado desde hoje, 11:00");
    expect(p.primeiraResposta).toBe("primeira resposta atrasada (era até hoje, 08:40)");
    expect(p).toMatchObject({ tom: "pausado", rotulo: "Pausado" });
  });
  it("resolvido dentro e fora do prazo", () => {
    expect(painelDoPrazo(ciclo({ resolvedAt: "2026-11-05T16:00:00Z" }), "RESOLVIDO", agora)).toMatchObject({ titulo: "Resolvido hoje, 13:00", tom: "resolvido", rotulo: "Resolvido no prazo" });
    expect(painelDoPrazo(ciclo({ resolvedAt: "2026-11-05T19:00:00Z" }), "RESOLVIDO", agora)).toMatchObject({ tom: "perigo", rotulo: "Resolvido fora do prazo" });
  });
  it("sem ciclo: o SLA ainda não começou, sem barra", () => {
    expect(painelDoPrazo(undefined, "NA_FILA", agora)).toMatchObject({ titulo: "SLA ainda não começou", usado: null });
    expect(painelDoPrazo(undefined, "CANCELADO", agora)).toMatchObject({ titulo: "Chamado encerrado", usado: null });
  });
});
