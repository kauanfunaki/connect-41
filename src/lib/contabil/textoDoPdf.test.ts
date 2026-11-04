import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { paginasDoPdf, textoDaPagina } from "./textoDoPdf";

describe("textoDaPagina", () => {
  it("junta o que está na mesma altura, da esquerda para a direita, com um espaço entre palavras", () => {
    expect(textoDaPagina([
      { str: "R$ 1.000,00", x: 300, y: 700.5, width: 60 },
      { str: "Valor:", x: 50, y: 701, width: 30 },
      { str: "RECIBO", x: 50, y: 750, width: 40 },
      { str: "Nº", x: 95, y: 750, width: 10 },
      { str: "  ", x: 110, y: 750, width: 5 },
    ])).toBe("RECIBO Nº\nValor: R$ 1.000,00");
  });

  it("pedaços colados formam uma palavra só; página sem texto volta vazia", () => {
    expect(textoDaPagina([{ str: "CP", x: 10, y: 10, width: 12 }, { str: "F", x: 22.5, y: 10, width: 5 }])).toBe("CPF");
    expect(textoDaPagina([])).toBe("");
  });
});

describe("paginasDoPdf", () => {
  it("lê um PDF de verdade, página a página", async () => {
    const pdf = await PDFDocument.create();
    const fonte = await pdf.embedFont(StandardFonts.Helvetica);
    const p1 = pdf.addPage([595, 842]);
    p1.drawText("RECIBO DE PAGAMENTO A AUTONOMO", { x: 50, y: 780, size: 12, font: fonte });
    p1.drawText("Nome: JOAO DA SILVA", { x: 50, y: 750, size: 10, font: fonte });
    p1.drawText("CPF: 111.222.333-44", { x: 320, y: 750, size: 10, font: fonte });
    pdf.addPage([595, 842]);
    const paginas = await paginasDoPdf(await pdf.save());
    expect(paginas).toEqual(["RECIBO DE PAGAMENTO A AUTONOMO\nNome: JOAO DA SILVA CPF: 111.222.333-44", ""]);
  });
});
