import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { COLUNAS_DA_DOMINIO, contaReduzidaValida, txtDaDominio, xlsxDaDominio, type LinhaDaDominio } from "./planilha";

const linha: LinhaDaDominio = {
  dataKey: "2026-10-15",
  debito: "341",
  credito: "7",
  centavos: 123456,
  codigoHistorico: "",
  complemento: "PAGTO IMOBILIÁRIA",
  codigoFilial: "11314",
};

describe("xlsxDaDominio", () => {
  it("a aba Planilha1, o cabeçalho do modelo e as células como o SPED Generator grava", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await xlsxDaDominio([linha])) as never);
    const aba = wb.getWorksheet("Planilha1")!;
    expect((aba.getRow(1).values as unknown[]).slice(1)).toEqual([...COLUNAS_DA_DOMINIO]);
    const valores = (aba.getRow(2).values as unknown[]).slice(1);
    expect(valores.slice(0, 8)).toEqual(["2026-10-15", "341", "7", 1234.56, "", "PAGTO IMOBILIÁRIA", "", "11314"]);
  });
});

describe("txtDaDominio", () => {
  it("';', CRLF em toda linha, valor com vírgula e ISO-8859-1", () => {
    const b = txtDaDominio([linha]);
    const texto = b.toString("latin1");
    expect(texto).toBe(`${COLUNAS_DA_DOMINIO.join(";")}\r\n2026-10-15;341;7;1234,56;;PAGTO IMOBILIÁRIA;;11314;;\r\n`);
    // "Á" em latin-1 é um byte só.
    expect(b.includes(Buffer.from([0xc1]))).toBe(true);
  });
});

describe("contaReduzidaValida", () => {
  it("só o código reduzido, em dígitos", () => {
    expect(contaReduzidaValida(" 341 ")).toBe("341");
    expect(contaReduzidaValida("2.1.3.01")).toBeNull();
    expect(contaReduzidaValida("")).toBeNull();
  });
});
