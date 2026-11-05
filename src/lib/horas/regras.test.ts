import { describe, expect, it } from "vitest";
import { diasDeAtraso, rastroDoDia, recusaDoLancamentoAtrasado, seloDaOrigem } from "./regras";

// Horas sem depender da boa-fé (04/11/2026, lote D dos ajustes de 03/11).

describe("o lançamento atrasado", () => {
  it("conta os dias de calendário", () => {
    expect(diasDeAtraso("2026-11-04", "2026-11-04")).toBe(0);
    expect(diasDeAtraso("2026-10-28", "2026-11-04")).toBe(7);
    expect(diasDeAtraso("2026-11-05", "2026-11-04")).toBe(-1);
  });

  it("até 7 dias qualquer um lança; depois, só a coordenação", () => {
    expect(recusaDoLancamentoAtrasado("2026-10-28", "2026-11-04", false)).toBeNull();
    expect(recusaDoLancamentoAtrasado("2026-10-27", "2026-11-04", false)).toContain("coordenação");
    expect(recusaDoLancamentoAtrasado("2026-09-01", "2026-11-04", true)).toBeNull();
  });
});

describe("os selos da lista", () => {
  it("origem, correção e o cronômetro esquecido", () => {
    expect(seloDaOrigem("CRONOMETRO", false, 90)).toEqual({ texto: "cronômetro", alerta: false });
    expect(seloDaOrigem("CRONOMETRO", false, 300)).toEqual({ texto: "cronômetro longo — confira", alerta: true });
    expect(seloDaOrigem("CRONOMETRO", true, 300).texto).toBe("cronômetro, corrigido");
    expect(seloDaOrigem("MANUAL", true, 60).texto).toBe("à mão, corrigido");
    expect(seloDaOrigem(null, false, 60).texto).toBe("antes de 04/11");
  });

  it("o rastro do dia", () => {
    expect(rastroDoDia(0)).toEqual({ texto: "sem ação registrada no processo neste dia", alerta: true });
    expect(rastroDoDia(1).texto).toBe("1 ação no processo neste dia");
    expect(rastroDoDia(4).texto).toBe("4 ações no processo neste dia");
  });
});
