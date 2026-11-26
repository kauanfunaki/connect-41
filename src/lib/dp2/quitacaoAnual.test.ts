import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { montarTermo, pdfDoTermo } from "./quitacaoAnual";

const comp = (competencia: string, salario: number, he = 0) => ({
  competencia,
  tipo: "MENSAL",
  fgts: (salario + he) * 0.08,
  itens: [
    { codigo: "001", nome: "Salário", tipo: "PROVENTO", valor: salario },
    ...(he ? [{ codigo: "002", nome: "HE 50%", tipo: "PROVENTO", valor: he }] : []),
    { codigo: "053", nome: "INSS", tipo: "DESCONTO", valor: salario * 0.08 },
    { codigo: "900", nome: "FGTS do mês", tipo: "INFORMATIVA", valor: salario * 0.08 },
  ],
});

describe("montarTermo", () => {
  it("soma o ano por rubrica, fora as informativas e as de outro ano", () => {
    const t = montarTermo(2027, [comp("2027-01", 3000), comp("2027-02", 3000, 200), comp("2026-12", 9999)]);
    expect(t.meses).toEqual(["2027-01", "2027-02"]);
    expect(t.proventos).toEqual([
      { codigo: "001", nome: "Salário", tipo: "PROVENTO", valor: 6000 },
      { codigo: "002", nome: "HE 50%", tipo: "PROVENTO", valor: 200 },
    ]);
    expect(t.descontos).toEqual([{ codigo: "053", nome: "INSS", tipo: "DESCONTO", valor: 480 }]);
    expect(t).toMatchObject({ totalProventos: 6200, totalDescontos: 480, liquido: 5720, fgts: 496 });
  });

  it("o PDF sai com uma página para um ano comum", async () => {
    const t = montarTermo(2027, Array.from({ length: 12 }, (_, i) => comp(`2027-${String(i + 1).padStart(2, "0")}`, 3000, 100)));
    const pdf = await PDFDocument.load(await pdfDoTermo(t, { colaborador: "Joana Ribeiro", cpf: "123.456.789-09", admissao: "2024-05-11", empresa: "Panificadora", documentoDaEmpresa: "48.291.730/0001-15", sindicato: null }));
    expect(pdf.getPageCount()).toBe(1);
  });
});
