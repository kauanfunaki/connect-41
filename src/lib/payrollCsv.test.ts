import { describe, expect, it } from "vitest";
import { parseBrDecimal, parseIntCell, parsePayrollCsv } from "./payrollCsv";

describe("parseBrDecimal", () => {
  it("converte formato pt-BR com milhar e decimal", () => {
    expect(parseBrDecimal("1.234,56")).toBe("1234.56");
  });
  it("converte decimal simples com vírgula", () => {
    expect(parseBrDecimal("3500,00")).toBe("3500.00");
  });
  it("aceita formato já com ponto decimal", () => {
    expect(parseBrDecimal("3500.00")).toBe("3500.00");
  });
  it("retorna null para vazio/indefinido", () => {
    expect(parseBrDecimal("")).toBeNull();
    expect(parseBrDecimal(undefined)).toBeNull();
  });
  it("retorna null para texto não numérico", () => {
    expect(parseBrDecimal("abc")).toBeNull();
  });
});

describe("parseIntCell", () => {
  it("parseia inteiro válido", () => {
    expect(parseIntCell("22")).toBe(22);
  });
  it("retorna null para vazio", () => {
    expect(parseIntCell("")).toBeNull();
    expect(parseIntCell(undefined)).toBeNull();
  });
});

describe("parsePayrollCsv", () => {
  it("mapeia colunas por nome, tolerando acento/caixa/ordem diferente", () => {
    const csv = [
      "Salário Bruto;CPF;Faltas;Observações",
      "3500,00;123.456.789-00;1;Sem pendências",
      "2800,50;987.654.321-00;0;",
    ].join("\n");

    const { rows, fatalError } = parsePayrollCsv(csv);
    expect(fatalError).toBeNull();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      rowNumber: 2,
      cpf: "123.456.789-00",
      grossSalary: "3500.00",
      missedDays: 1,
      notes: "Sem pendências",
    });
    expect(rows[1]).toMatchObject({
      rowNumber: 3,
      cpf: "987.654.321-00",
      grossSalary: "2800.50",
      missedDays: 0,
      notes: null,
    });
  });

  it("retorna erro fatal quando falta a coluna CPF", () => {
    const { fatalError } = parsePayrollCsv("Salário Bruto\n1000\n");
    expect(fatalError).toMatch(/CPF/);
  });

  it("retorna erro fatal quando falta a coluna Salário Bruto", () => {
    const { fatalError } = parsePayrollCsv("CPF\n123\n");
    expect(fatalError).toMatch(/Salário Bruto/);
  });

  it("retorna erro fatal para arquivo sem cabeçalho", () => {
    const { fatalError } = parsePayrollCsv("");
    expect(fatalError).not.toBeNull();
  });

  it("deixa campos opcionais como null quando ausentes do CSV", () => {
    const { rows } = parsePayrollCsv("CPF,Salário Bruto\n123,1000\n");
    expect(rows[0]).toMatchObject({
      workedDays: null,
      vacationDays: null,
      overtimeHours: null,
      thirteenthSalary: null,
      notes: null,
    });
  });
});
