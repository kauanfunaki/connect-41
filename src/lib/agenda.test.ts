import { describe, expect, it } from "vitest";
import {
  DIAS_DA_LISTA_DE_PRAZOS,
  agendaDayKeys,
  agendaTitle,
  diaDaListaLabel,
  intervaloLabel,
  lerVisaoDaAgenda,
  parseAgendaView,
  shiftAgendaDate,
} from "./agenda";

// A visão Prazos da Agenda (10/11/2026): a lista do que vence, de um dia a 30 dias depois.

describe("visões da Agenda", () => {
  it("lê a visão da URL ou do banco; o que não é visão é nulo", () => {
    expect(lerVisaoDaAgenda("prazos")).toBe("prazos");
    expect(lerVisaoDaAgenda("mes")).toBe("mes");
    expect(lerVisaoDaAgenda("ano")).toBeNull();
    expect(lerVisaoDaAgenda(null)).toBeNull();
  });

  it("sem visão na URL, vale o padrão dado (o da pessoa e do setor); sem padrão, Semana", () => {
    expect(parseAgendaView(undefined, "prazos")).toBe("prazos");
    expect(parseAgendaView("dia", "prazos")).toBe("dia");
    expect(parseAgendaView(undefined)).toBe("semana");
  });

  it("Prazos cobre o dia de referência e os 30 seguintes, e as setas andam o mesmo tanto", () => {
    const dias = agendaDayKeys("prazos", "2026-11-10");
    expect(dias).toHaveLength(DIAS_DA_LISTA_DE_PRAZOS);
    expect(dias[0]).toBe("2026-11-10");
    expect(dias.at(-1)).toBe("2026-12-10");
    expect(shiftAgendaDate("prazos", "2026-11-10", 1)).toBe("2026-12-11");
    expect(shiftAgendaDate("prazos", "2026-11-10", -1)).toBe("2026-10-10");
  });

  it("o título do período, com o ano nos dois lados quando vira o ano", () => {
    expect(agendaTitle("prazos", "2026-11-10")).toBe("10 de novembro a 10 de dezembro de 2026");
    expect(intervaloLabel("2026-12-20", "2027-01-19")).toBe("20 de dezembro de 2026 a 19 de janeiro de 2027");
  });

  it("o título de cada dia da lista", () => {
    expect(diaDaListaLabel("2026-11-10")).toBe("Terça, 10 de novembro");
    expect(diaDaListaLabel("2026-11-14")).toBe("Sábado, 14 de novembro");
  });
});
