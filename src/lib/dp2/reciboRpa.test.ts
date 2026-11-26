import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { pdfDoRpa, resumoDoRpa } from "./reciboRpa";

const dados = {
  empresa: "Panificadora",
  documentoDaEmpresa: "48.291.730/0001-15",
  competencia: "jun/2027",
  autonomo: "Marcos Prestador",
  cpf: "529.982.247-25",
  linhas: [
    { codigo: "082", nome: "Serviço prestado (RPA)", referencia: "", tipo: "PROVENTO" as const, valor: 5000 },
    { codigo: "053", nome: "INSS", referencia: "11%", tipo: "DESCONTO" as const, valor: 550 },
    { codigo: "054", nome: "IRRF", referencia: "27,5%", tipo: "DESCONTO" as const, valor: 427.5 },
    { codigo: "058", nome: "Desconto diverso", referencia: "", tipo: "DESCONTO" as const, valor: 22.5 },
  ],
  proventos: 5000,
  descontos: 1000,
  liquido: 4000,
  inssEmpresa: 1000,
};

describe("recibo de RPA", () => {
  it("separa INSS, IRRF e outros descontos", () => {
    expect(resumoDoRpa(dados)).toEqual({ servico: 5000, inss: 550, irrf: 427.5, outros: 22.5, liquido: 4000, inssEmpresa: 1000 });
  });

  it("o PDF tem uma página", async () => {
    expect((await PDFDocument.load(await pdfDoRpa(dados))).getPageCount()).toBe(1);
  });
});
