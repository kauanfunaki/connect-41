import { describe, expect, it } from "vitest";
import { PAUSA_DEPOIS_DAS_FALHAS_MS, pedidoDaIE, resultadoDaIESchema, vigilanciaPodeSeguir } from "./inscricaoEstadual";

// A vigilância da IE pelo robô (30/10/2026): o que vai para a máquina e
// quando a rodada para sozinha.

describe("pedidoDaIE", () => {
  it("manda só os dígitos, e o CNPJ só quando tem 14", () => {
    expect(pedidoDaIE("123.45678-90", "11.444.777/0001-61")).toEqual({ inscricao: "1234567890", cnpj: "11444777000161" });
    expect(pedidoDaIE("1234567890", "123")).toEqual({ inscricao: "1234567890", cnpj: null });
    expect(pedidoDaIE("1234567890", null)).toEqual({ inscricao: "1234567890", cnpj: null });
  });
});

describe("resultadoDaIESchema", () => {
  it("pede o texto da situação", () => {
    expect(resultadoDaIESchema.safeParse({ situacao: " ATIVO " }).data).toEqual({ situacao: "ATIVO" });
    expect(resultadoDaIESchema.safeParse({ situacao: "" }).success).toBe(false);
    expect(resultadoDaIESchema.safeParse({}).success).toBe(false);
  });
});

describe("vigilanciaPodeSeguir", () => {
  const agora = new Date("2026-10-30T12:00:00Z");
  const horasAtras = (h: number) => new Date(agora.getTime() - h * 3_600_000);
  const falha = (h: number) => ({ status: "PRECISA_DE_GENTE", finishedAt: horasAtras(h) });
  const feita = (h: number) => ({ status: "CONCLUIDA", finishedAt: horasAtras(h) });

  it("segue com poucas tarefas ou com alguma que deu certo", () => {
    expect(vigilanciaPodeSeguir([], agora)).toBe(true);
    expect(vigilanciaPodeSeguir([falha(1), falha(2)], agora)).toBe(true);
    expect(vigilanciaPodeSeguir([falha(1), feita(2), falha(3)], agora)).toBe(true);
  });

  it("para um dia depois de três falhas seguidas", () => {
    expect(vigilanciaPodeSeguir([falha(1), falha(2), falha(3)], agora)).toBe(false);
    expect(vigilanciaPodeSeguir([falha(PAUSA_DEPOIS_DAS_FALHAS_MS / 3_600_000), falha(25), falha(26)], agora)).toBe(true);
  });
});
