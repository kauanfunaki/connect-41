import { describe, expect, it } from "vitest";
import { formatarDecorrido, segundosDesde } from "./datetime";

describe("formatarDecorrido", () => {
  it("mostra M:SS antes de uma hora", () => {
    expect(formatarDecorrido(0)).toBe("0:00");
    expect(formatarDecorrido(9)).toBe("0:09");
    expect(formatarDecorrido(65)).toBe("1:05");
    expect(formatarDecorrido(3599)).toBe("59:59");
  });

  it("passa a H:MM:SS a partir de uma hora", () => {
    expect(formatarDecorrido(3600)).toBe("1:00:00");
    expect(formatarDecorrido(3661)).toBe("1:01:01");
    // Cronômetro esquecido ligado no dia anterior — precisa continuar legível.
    expect(formatarDecorrido(90061)).toBe("25:01:01");
  });

  it("trata negativo e fração como zero e piso", () => {
    expect(formatarDecorrido(-5)).toBe("0:00");
    expect(formatarDecorrido(59.9)).toBe("0:59");
  });
});

describe("segundosDesde", () => {
  const inicio = "2026-09-09T12:00:00.000Z";

  it("conta os segundos cheios desde o instante do servidor", () => {
    expect(segundosDesde(inicio, Date.parse("2026-09-09T12:00:00.000Z"))).toBe(0);
    expect(segundosDesde(inicio, Date.parse("2026-09-09T12:00:59.999Z"))).toBe(59);
    expect(segundosDesde(inicio, Date.parse("2026-09-09T13:30:00.000Z"))).toBe(5400);
  });

  it("nunca devolve negativo — o relógio do navegador pode estar adiantado", () => {
    expect(segundosDesde(inicio, Date.parse("2026-09-09T11:59:57.000Z"))).toBe(0);
  });

  it("devolve 0 para data inválida em vez de NaN", () => {
    expect(segundosDesde("nao e uma data", Date.now())).toBe(0);
  });
});
