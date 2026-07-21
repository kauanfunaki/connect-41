import { describe, expect, it } from "vitest";
import { normalizeHeader, parseCsv } from "./csv";

describe("parseCsv", () => {
  it("parseia CSV com vírgula", () => {
    const { headers, rows } = parseCsv("CPF,Salário Bruto\n123,1000\n456,2000\n");
    expect(headers).toEqual(["CPF", "Salário Bruto"]);
    expect(rows).toEqual([
      ["123", "1000"],
      ["456", "2000"],
    ]);
  });

  it("parseia CSV com ponto-e-vírgula (export pt-BR)", () => {
    const { headers, rows } = parseCsv("CPF;Salário Bruto\n123;1.500,00\n");
    expect(headers).toEqual(["CPF", "Salário Bruto"]);
    expect(rows).toEqual([["123", "1.500,00"]]);
  });

  it("respeita campos entre aspas com delimitador dentro", () => {
    const { rows } = parseCsv('CPF,Observações\n123,"Contém, vírgula"\n');
    expect(rows).toEqual([["123", "Contém, vírgula"]]);
  });

  it("trata aspas duplas escapadas dentro de um campo entre aspas", () => {
    const { rows } = parseCsv('CPF,Observações\n123,"Ela disse ""oi"""\n');
    expect(rows).toEqual([["123", 'Ela disse "oi"']]);
  });

  it("remove BOM e ignora linhas em branco", () => {
    const { headers, rows } = parseCsv("﻿CPF,Valor\n\n123,10\n\n");
    expect(headers).toEqual(["CPF", "Valor"]);
    expect(rows).toEqual([["123", "10"]]);
  });

  it("lida com CRLF", () => {
    const { headers, rows } = parseCsv("CPF,Valor\r\n123,10\r\n");
    expect(headers).toEqual(["CPF", "Valor"]);
    expect(rows).toEqual([["123", "10"]]);
  });

  it("retorna headers vazios para texto vazio", () => {
    const { headers, rows } = parseCsv("");
    expect(headers).toEqual([]);
    expect(rows).toEqual([]);
  });
});

describe("normalizeHeader", () => {
  it("remove acentos, pontuação e normaliza para minúsculo", () => {
    expect(normalizeHeader("Salário Bruto")).toBe("salariobruto");
    expect(normalizeHeader("13º Salário")).toBe("13salario");
    expect(normalizeHeader("  CPF  ")).toBe("cpf");
  });
});
