import { describe, expect, it } from "vitest";
import { chaveDoDia, grupoDoDia, hora, tempoRelativo } from "./tempo";

// 02/10/2026, 15h em São Paulo (18h UTC).
const AGORA = new Date("2026-10-02T18:00:00Z");

describe("tempo das notificações", () => {
  it("hoje e ontem pelo dia de São Paulo, não pelo UTC", () => {
    // 02/10 às 01h UTC ainda é 01/10, 22h, em São Paulo: é "Ontem".
    expect(grupoDoDia(new Date("2026-10-02T01:00:00Z"), AGORA)).toBe("Ontem");
    expect(grupoDoDia(new Date("2026-10-02T04:00:00Z"), AGORA)).toBe("Hoje");
    expect(chaveDoDia(new Date("2026-10-02T01:00:00Z"))).toBe("2026-10-01");
  });

  it("dias mais antigos com dia da semana e mês", () => {
    expect(grupoDoDia(new Date("2026-09-28T15:00:00Z"), AGORA)).toMatch(/^Seg.*28.*set/);
  });

  it("tempo relativo", () => {
    expect(tempoRelativo(new Date("2026-10-02T17:59:40Z"), AGORA)).toBe("agora");
    expect(tempoRelativo(new Date("2026-10-02T17:40:00Z"), AGORA)).toBe("há 20 min");
    expect(tempoRelativo(new Date("2026-10-02T15:00:00Z"), AGORA)).toBe("há 3 h");
    expect(tempoRelativo(new Date("2026-10-01T17:30:00Z"), AGORA)).toBe("ontem, 14:30");
    expect(tempoRelativo(new Date("2026-09-20T12:00:00Z"), AGORA)).toMatch(/20.*set/);
  });

  it("hora no fuso de São Paulo", () => {
    expect(hora(new Date("2026-10-02T17:05:00Z"))).toBe("14:05");
  });
});
