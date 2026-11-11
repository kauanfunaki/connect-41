import { describe, expect, it } from "vitest";
import { ladoNoPortal, nomeDoPdfNoPortal, raizesDoDocumento, rotaDoPdfNoPortal, temPdfNoPortal } from "./documentoNoPortal";
import { competenciaPorExtenso, TIPO_LABEL, TIPO_LABEL_PORTAL, TIPO_SIGLA_PORTAL } from "./rotulos";

describe("documento fiscal no portal", () => {
  it("só oferece PDF de nota do motor com XML guardado", () => {
    expect(temPdfNoPortal({ origin: "SPED", renderizavel: true })).toBe(true);
    expect(temPdfNoPortal({ origin: "SPED", renderizavel: false })).toBe(false);
    // Upload tem `renderizavel` verdadeiro por padrão, mas não guarda arquivo.
    expect(temPdfNoPortal({ origin: "UPLOAD", renderizavel: true })).toBe(false);
    expect(temPdfNoPortal({ origin: "OMIE", renderizavel: true })).toBe(false);
  });

  it("a rota do PDF escapa o id", () => {
    expect(rotaDoPdfNoPortal("abc")).toBe("/portal/documentos/abc/pdf");
    expect(rotaDoPdfNoPortal("a/b")).toBe("/portal/documentos/a%2Fb/pdf");
  });

  it("raízes: a da empresa primeiro, depois as pontas, sem repetir e sem CPF", () => {
    expect(
      raizesDoDocumento({ empresaCnpj: "11.111.111/0001-91", issuerDocument: "11111111000272", recipientDocument: "22222222000191" })
    ).toEqual(["11111111", "22222222"]);
    expect(raizesDoDocumento({ empresaCnpj: null, issuerDocument: "12345678901", recipientDocument: null })).toEqual([]);
  });

  it("nome do arquivo só com letras, números e hífen", () => {
    expect(nomeDoPdfNoPortal({ type: "NFSE", number: "45", series: null })).toBe("nota-de-servico-45.pdf");
    expect(nomeDoPdfNoPortal({ type: "CTE", number: "7", series: "A/1" })).toBe("frete-7-A-1.pdf");
    expect(nomeDoPdfNoPortal({ type: "NFE", number: '"', series: null })).toBe("nota-de-produto.pdf");
  });

  it("venda, compra e o nome da outra ponta", () => {
    expect(ladoNoPortal("RECEBER")).toEqual({ selo: "Venda", rotuloDaContraparte: "Cliente" });
    expect(ladoNoPortal("PAGAR")).toEqual({ selo: "Compra", rotuloDaContraparte: "Fornecedor" });
    expect(ladoNoPortal("INDEFINIDA")).toEqual({ selo: null, rotuloDaContraparte: "Emitente" });
  });

  it("tipo em palavras no portal, com a sigla na dica; a equipe segue com a sigla", () => {
    expect(TIPO_LABEL_PORTAL).toEqual({ NFE: "Nota de produto", NFCE: "Nota de consumidor", CTE: "Frete", NFSE: "Nota de serviço" });
    for (const t of ["NFE", "NFCE", "CTE", "NFSE"] as const) expect(TIPO_SIGLA_PORTAL[t].startsWith(TIPO_LABEL[t])).toBe(true);
  });

  it("competência por extenso", () => {
    expect(competenciaPorExtenso("2026-10")).toBe("outubro de 2026");
    expect(competenciaPorExtenso("2026-03")).toBe("março de 2026");
    expect(competenciaPorExtenso("2026-13")).toBe("2026-13");
  });
});
