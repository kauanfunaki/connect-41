import { describe, expect, it } from "vitest";
import { aceitaArquivo, extensoesDoAccept, formatosDoAccept } from "./fileSize";

describe("accept por extensão e por tipo MIME", () => {
  it("extensão continua como sempre", () => {
    expect(aceitaArquivo("extrato.pdf", ".pdf")).toBe(true);
    expect(aceitaArquivo("extrato.PDF", ".pdf")).toBe(true);
    expect(aceitaArquivo("foto.png", ".pdf")).toBe(false);
    expect(formatosDoAccept(".pdf,.jpg,.jpeg")).toBe("PDF, JPG, JPEG");
  });

  it("tipo MIME vira as extensões dele — antes recusava tudo", () => {
    expect(aceitaArquivo("contrato.pdf", "application/pdf")).toBe(true);
    expect(aceitaArquivo("planilha.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(true);
    expect(aceitaArquivo("nota.xml", "text/xml")).toBe(true);
    expect(aceitaArquivo("foto.jpg", "application/pdf")).toBe(false);
  });

  it("image/* aceita as imagens comuns e aparece como 'imagens'", () => {
    expect(aceitaArquivo("foto.heic", "image/*")).toBe(true);
    expect(aceitaArquivo("foto.webp", "image/*,application/pdf")).toBe(true);
    expect(aceitaArquivo("planilha.csv", "image/*")).toBe(false);
    expect(formatosDoAccept("image/*,application/pdf")).toBe("imagens, PDF");
  });

  it("não mostra o MIME cru", () => {
    expect(formatosDoAccept("application/pdf")).toBe("PDF");
    expect(formatosDoAccept("application/zip")).toBe("ZIP");
    expect(extensoesDoAccept("image/svg+xml")).toEqual(["svg"]);
  });

  it("sem accept, aceita tudo", () => {
    expect(aceitaArquivo("qualquer.bin", "")).toBe(true);
  });
});
