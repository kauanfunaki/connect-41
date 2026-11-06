import { describe, expect, it } from "vitest";
import {
  ESCALAR_APOS_MS,
  PRAZO_DA_ASSISTENCIA_MS,
  QUADRO_PARADO_MS,
  aceitaClique,
  cliqueNaJanela,
  cliqueSchema,
  dentroDoHorarioComercial,
  estadoDaAssistencia,
  precisaEscalar,
  prazoDaAssistencia,
} from "./assistencia";

// Horário de Brasília = UTC-3. 06/11/2026 é uma sexta; 07/11, sábado.
const em = (iso: string) => new Date(iso);

describe("dentroDoHorarioComercial", () => {
  it("segunda a sexta, das 8h às 18h de Brasília", () => {
    expect(dentroDoHorarioComercial(em("2026-11-06T11:00:00Z"))).toBe(true); // sexta 8h00
    expect(dentroDoHorarioComercial(em("2026-11-06T10:59:59Z"))).toBe(false); // sexta 7h59
    expect(dentroDoHorarioComercial(em("2026-11-06T20:59:59Z"))).toBe(true); // sexta 17h59
    expect(dentroDoHorarioComercial(em("2026-11-06T21:00:00Z"))).toBe(false); // sexta 18h00
    expect(dentroDoHorarioComercial(em("2026-11-07T15:00:00Z"))).toBe(false); // sábado 12h
    expect(dentroDoHorarioComercial(em("2026-11-08T15:00:00Z"))).toBe(false); // domingo 12h
    expect(dentroDoHorarioComercial(em("2026-11-09T12:00:00Z"))).toBe(true); // segunda 9h
  });
  it("a virada do dia é a de Brasília, não a de UTC", () => {
    // Sexta 22h em Brasília já é sábado 01h em UTC: fora, pelos dois motivos.
    expect(dentroDoHorarioComercial(em("2026-11-07T01:00:00Z"))).toBe(false);
    // Segunda 0h30 em UTC ainda é domingo 21h30 em Brasília.
    expect(dentroDoHorarioComercial(em("2026-11-09T00:30:00Z"))).toBe(false);
  });
});

describe("prazo e escalada", () => {
  const inicio = em("2026-11-06T14:00:00Z");
  it("o prazo é de 10 minutos", () => {
    expect(prazoDaAssistencia(inicio).getTime() - inicio.getTime()).toBe(PRAZO_DA_ASSISTENCIA_MS);
    expect(PRAZO_DA_ASSISTENCIA_MS).toBe(10 * 60 * 1000);
  });
  it("chama o setor depois de 2 min sem clique, uma vez só", () => {
    const s = { startedAt: inicio, escalatedAt: null, clicks: 0, endedAt: null };
    expect(precisaEscalar(s, new Date(inicio.getTime() + ESCALAR_APOS_MS - 1))).toBe(false);
    expect(precisaEscalar(s, new Date(inicio.getTime() + ESCALAR_APOS_MS))).toBe(true);
    expect(precisaEscalar({ ...s, escalatedAt: inicio }, new Date(inicio.getTime() + 5 * 60_000))).toBe(false);
  });
  it("não chama o setor se quem pediu já está clicando, ou se a sessão acabou", () => {
    const depois = new Date(inicio.getTime() + 5 * 60_000);
    expect(precisaEscalar({ startedAt: inicio, escalatedAt: null, clicks: 1, endedAt: null }, depois)).toBe(false);
    expect(precisaEscalar({ startedAt: inicio, escalatedAt: null, clicks: 0, endedAt: depois }, depois)).toBe(false);
  });
});

describe("estadoDaAssistencia", () => {
  const inicio = em("2026-11-06T14:00:00Z");
  const aberta = { deadlineAt: prazoDaAssistencia(inicio), endedAt: null, outcome: null };
  const agora = new Date(inicio.getTime() + 60_000);
  it("sem quadro ainda, esperando a tela", () => {
    expect(estadoDaAssistencia(aberta, null, agora)).toBe("aguardando_tela");
  });
  it("quadro recente é ao vivo; parado há mais de 15 s, sem sinal", () => {
    expect(estadoDaAssistencia(aberta, new Date(agora.getTime() - 1_000), agora)).toBe("ao_vivo");
    expect(estadoDaAssistencia(aberta, new Date(agora.getTime() - QUADRO_PARADO_MS - 1), agora)).toBe("sem_sinal");
  });
  it("passou do prazo sem o fim chegar: expirada", () => {
    expect(estadoDaAssistencia(aberta, agora, new Date(aberta.deadlineAt.getTime() + 1))).toBe("expirada");
  });
  it("encerrada pelo robô, pelo resultado", () => {
    expect(estadoDaAssistencia({ ...aberta, endedAt: agora, outcome: "resolvido" }, agora, agora)).toBe("resolvida");
    expect(estadoDaAssistencia({ ...aberta, endedAt: agora, outcome: "prazo" }, agora, agora)).toBe("expirada");
    expect(estadoDaAssistencia({ ...aberta, endedAt: agora, outcome: "desistiu" }, agora, agora)).toBe("encerrada");
  });
  it("só aceita clique com a sessão aberta e a tela chegando", () => {
    expect(aceitaClique("ao_vivo")).toBe(true);
    expect(aceitaClique("sem_sinal")).toBe(true);
    for (const e of ["aguardando_tela", "resolvida", "expirada", "encerrada"] as const) expect(aceitaClique(e)).toBe(false);
  });
});

describe("clique", () => {
  it("só fração do quadro, de 0 a 1 — nada de tecla nem texto", () => {
    expect(cliqueSchema.safeParse({ x: 0.5, y: 0.25 }).success).toBe(true);
    expect(cliqueSchema.safeParse({ x: 1.2, y: 0.5 }).success).toBe(false);
    expect(cliqueSchema.safeParse({ x: -0.1, y: 0.5 }).success).toBe(false);
    expect(cliqueSchema.safeParse({ x: "0.5", y: 0.5 }).success).toBe(false);
    expect(cliqueSchema.parse({ x: 0.5, y: 0.5, tecla: "Enter" })).toEqual({ x: 0.5, y: 0.5 });
  });
  it("vira coordenada da janela do robô, dentro dela", () => {
    const janela = { largura: 1280, altura: 720 };
    expect(cliqueNaJanela({ x: 0.5, y: 0.5 }, janela)).toEqual({ x: 640, y: 360 });
    expect(cliqueNaJanela({ x: 0, y: 0 }, janela)).toEqual({ x: 0, y: 0 });
    // A borda direita e a de baixo ficam no último pixel, não fora da janela.
    expect(cliqueNaJanela({ x: 1, y: 1 }, janela)).toEqual({ x: 1279, y: 719 });
  });
});
