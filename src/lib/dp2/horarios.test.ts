import { describe, expect, it } from "vitest";
import { diasPorExtenso, horasDoHorario, lerHorario } from "./horarios";

const ler = (extra: Partial<Parameters<typeof lerHorario>[0]> = {}) =>
  lerHorario({ nome: "Comercial", dias: ["0", "1", "2", "3", "4"], entrada: "08:00", saida: "17:48", intervalo: "60", tipoJornada: "9", ...extra });

describe("horários", () => {
  it("segunda a sexta, 08:00 às 17:48 com 1 h: 8,8 h por dia, 44 por semana, 220 por mês", () => {
    const r = ler();
    if (!r.ok) throw new Error(r.erro);
    expect(r.horario.dias).toBe("1111100");
    expect(horasDoHorario(r.horario)).toEqual({ diarias: 8.8, semanais: 44, mensais: 220, descricao: "Segunda a sexta, 08:00 às 17:48, 1h de intervalo" });
  });

  it("turno que vira o dia e seis dias por semana", () => {
    const r = ler({ nome: "Noite", dias: ["0", "1", "2", "3", "4", "5"], entrada: "22:00", saida: "5:20", intervalo: "60" });
    if (!r.ok) throw new Error(r.erro);
    // 22:00 → 05:20 = 7h20 − 1 h = 6h20 = 6,33 h; × 6 = 38 h.
    expect(horasDoHorario(r.horario)).toMatchObject({ diarias: 6.33, semanais: 38, mensais: 190 });
  });

  it("dias por extenso", () => {
    expect(diasPorExtenso("1111110")).toBe("Segunda a sábado");
    expect(diasPorExtenso("1010100")).toBe("Segunda, quarta e sexta");
    expect(diasPorExtenso("0000011")).toBe("Sábado e domingo");
  });

  it("recusa horário que não fecha", () => {
    expect(ler({ nome: " " })).toMatchObject({ ok: false });
    expect(ler({ dias: [] })).toMatchObject({ ok: false, erro: expect.stringMatching(/dias/) });
    expect(ler({ entrada: "8h" })).toMatchObject({ ok: false, erro: expect.stringMatching(/HH:MM/) });
    expect(ler({ entrada: "08:00", saida: "08:30", intervalo: "60" })).toMatchObject({ ok: false, erro: expect.stringMatching(/intervalo/) });
  });
});
