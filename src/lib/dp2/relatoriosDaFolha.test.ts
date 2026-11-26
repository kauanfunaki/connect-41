import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { planilhaDosRelatorios, resumoPorRubrica, totaisDoRelatorio, type CalculoDoRelatorio } from "./relatoriosDaFolha";

const item = (codigo: string, nome: string, tipo: string, valor: number) => ({ codigo, nome, tipo: tipo as "PROVENTO", referencia: "", valor });
const calc = (nome: string, itens: CalculoDoRelatorio["itens"], extra: Partial<CalculoDoRelatorio> = {}): CalculoDoRelatorio => ({
  nome,
  cpf: "12345678909",
  itens,
  proventos: itens.filter((i) => i.tipo === "PROVENTO").reduce((s, i) => s + i.valor, 0),
  descontos: itens.filter((i) => i.tipo === "DESCONTO").reduce((s, i) => s + i.valor, 0),
  liquido: 0,
  baseInss: 3000,
  inss: 253.41,
  baseIrrf: 2746.59,
  irrf: 0,
  baseFgts: 3000,
  fgts: 240,
  encargos: { base: 3000, inssEmpresa: 600, rat: 60, terceiros: 174, fgts: 240, total: 1074 },
  provisoes: { ferias: 250, tercoFerias: 83.33, decimo: 250, encargosFerias: 120, encargosDecimo: 90, total: 793.33 },
  ...extra,
});

const calculos = [
  calc("Joana", [item("001", "Salário", "PROVENTO", 3000), item("002", "HE 50%", "PROVENTO", 150.5), item("901", "INSS", "DESCONTO", 253.41)]),
  calc("Caio", [item("001", "Salário", "PROVENTO", 2000), item("901", "INSS", "DESCONTO", 160)], { encargos: null, provisoes: null }),
];

describe("resumoPorRubrica", () => {
  it("soma por rubrica, conta as pessoas e põe proventos antes dos descontos", () => {
    expect(resumoPorRubrica(calculos)).toEqual([
      { codigo: "001", nome: "Salário", tipo: "PROVENTO", pessoas: 2, valor: 5000 },
      { codigo: "002", nome: "HE 50%", tipo: "PROVENTO", pessoas: 1, valor: 150.5 },
      { codigo: "901", nome: "INSS", tipo: "DESCONTO", pessoas: 2, valor: 413.41 },
    ]);
  });
});

describe("totaisDoRelatorio", () => {
  it("soma encargos e provisões, com quem não tem como zero", () => {
    const t = totaisDoRelatorio(calculos);
    expect(t.proventos).toBe(5150.5);
    expect(t.encargos).toBe(1074);
    expect(t.provisoes).toBe(793.33);
    expect(t.fgts).toBe(480);
  });
});

describe("planilhaDosRelatorios", () => {
  it("gera as quatro abas, com as pessoas em ordem alfabética na analítica", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await planilhaDosRelatorios("Empresa · 06/2027", calculos)) as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Resumo", "Analítica", "Encargos", "Provisões"]);
    const analitica = wb.getWorksheet("Analítica")!;
    expect(analitica.getRow(4).getCell(1).value).toBe("Caio");
    expect(wb.getWorksheet("Resumo")!.getRow(4).getCell(5).value).toBe(5000);
    const encargos = wb.getWorksheet("Encargos")!;
    expect(encargos.getRow(encargos.rowCount).getCell(9).value).toBe(1074);
  });
});
