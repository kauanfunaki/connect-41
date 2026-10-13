import { describe, expect, it } from "vitest";
import { duracaoDoLancamento, lerLancamentoDeHoras } from "./edicao";

const form = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};

describe("lerLancamentoDeHoras", () => {
  it("horas com vírgula e minutos somam", () => {
    const r = lerLancamentoDeHoras(form({ horas: "1,5", minutos: "10", dia: "2026-10-13", nota: " revisão " }));
    expect(r).toEqual({ ok: true, minutos: 100, dia: new Date(Date.UTC(2026, 9, 13, 12)), nota: "revisão" });
  });

  it("dia vazio mantém o dia que já estava (null) e nota vazia vira null", () => {
    const r = lerLancamentoDeHoras(form({ horas: "0", minutos: "45", dia: "", nota: "" }));
    expect(r).toEqual({ ok: true, minutos: 45, dia: null, nota: null });
  });

  it("recusa zero, negativo, mais de 16 horas e texto", () => {
    expect(lerLancamentoDeHoras(form({ horas: "0", minutos: "0" })).ok).toBe(false);
    expect(lerLancamentoDeHoras(form({ horas: "-1", minutos: "0" })).ok).toBe(false);
    expect(lerLancamentoDeHoras(form({ horas: "16", minutos: "1" })).ok).toBe(false);
    expect(lerLancamentoDeHoras(form({ horas: "duas", minutos: "0" })).ok).toBe(false);
  });

  it("recusa data que não existe", () => {
    expect(lerLancamentoDeHoras(form({ horas: "1", dia: "2026-02-30" }))).toEqual({ ok: false, error: "Data inválida." });
  });
});

describe("duracaoDoLancamento", () => {
  it("formata como as listas mostram", () => {
    expect(duracaoDoLancamento(45)).toBe("45min");
    expect(duracaoDoLancamento(120)).toBe("2h");
    expect(duracaoDoLancamento(90)).toBe("1h30min");
  });
});
