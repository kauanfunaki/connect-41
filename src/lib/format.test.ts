import { describe, expect, it } from "vitest";
import {
  formatarCompetencia,
  formatarHoras,
  formatarNumero,
  formatarReais,
  formatarReaisDeCentavos,
  formatInstantDateTime,
  formatInstantDateTimeComSegundos,
} from "./format";

// O Intl separa "R$" do valor com espaço sem quebra; o teste lê como espaço.
const semNbsp = (s: string) => s.replace(/ /g, " ");

describe("formatInstantDateTime", () => {
  const instante = new Date("2026-10-03T12:00:05Z"); // 09:00:05 em Brasília

  it("sem opções, mostra dia e hora sem os segundos", () => {
    expect(formatInstantDateTime(instante)).toBe("03/10/2026, 09:00");
  });

  it("respeita as opções de quem chama", () => {
    expect(formatInstantDateTime(instante, { hour: "2-digit", minute: "2-digit" })).toBe("09:00");
    expect(formatInstantDateTime(instante, { dateStyle: "short", timeStyle: "medium" })).toBe("03/10/2026, 09:00:05");
  });

  it("opção que não escolhe partes não tira o padrão", () => {
    expect(formatInstantDateTime(instante, { hour12: false })).toBe("03/10/2026, 09:00");
  });

  it("a versão com segundos, para registro", () => {
    expect(formatInstantDateTimeComSegundos(instante)).toBe("03/10/2026, 09:00:05");
  });
});

describe("formatarReais", () => {
  it("formata em pt-BR com milhar e centavos", () => {
    expect(semNbsp(formatarReais(3500.5))).toBe("R$ 3.500,50");
    expect(semNbsp(formatarReais(0))).toBe("R$ 0,00");
    expect(semNbsp(formatarReais(-12.3))).toBe("-R$ 12,30");
  });

  it("vazio ou inválido vira travessão, não zero", () => {
    expect(formatarReais(null)).toBe("—");
    expect(formatarReais(undefined)).toBe("—");
    expect(formatarReais(Number.NaN)).toBe("—");
  });

  it("centavos", () => {
    expect(semNbsp(formatarReaisDeCentavos(123456))).toBe("R$ 1.234,56");
    expect(formatarReaisDeCentavos(null)).toBe("—");
  });
});

describe("formatarNumero e formatarHoras", () => {
  it("usa vírgula e milhar", () => {
    expect(formatarNumero(8.25, 2)).toBe("8,25");
    expect(formatarNumero(1234)).toBe("1.234");
    expect(formatarHoras(3.5)).toBe("3,5 h");
  });
});

describe("formatarCompetencia", () => {
  it("AAAA-MM vira Mês/AA", () => {
    expect(formatarCompetencia("2026-10")).toBe("Out/26");
    expect(formatarCompetencia("2027-01")).toBe("Jan/27");
  });

  it("o que não é competência volta como veio", () => {
    expect(formatarCompetencia("2026-13")).toBe("2026-13");
    expect(formatarCompetencia("")).toBe("");
  });
});
