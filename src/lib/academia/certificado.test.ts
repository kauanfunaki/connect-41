import { describe, expect, it } from "vitest";
import { linhasDoCertificado, pdfDoCertificado, type DadosDoCertificado } from "./certificado";

// O certificado de destaque (10/11/2026): o que o papel diz e que o PDF sai.

const dados: DadosDoCertificado = {
  nome: "Pessoa Exemplo de Tal", escritorio: "Escritório Exemplo", posicao: 2, teste: "digitacao", mes: "2026-10",
  ppm: 71, acertos: null, total: null, precisao: 97.4, emitidoEm: new Date("2026-11-02T15:00:00Z"),
};

describe("certificado de destaque", () => {
  it("diz a colocação, o ranking do mês e os números do teste", () => {
    const c = linhasDoCertificado(dados);
    expect(c.subtitulo).toBe("Ranking de Digitação — outubro de 2026");
    expect(c.colocacao).toBe("2º LUGAR");
    expect(c.caixas).toEqual([
      { valor: "71 PPM", rotulo: "PALAVRAS POR MINUTO" },
      { valor: "97,4%", rotulo: "PRECISÃO" },
    ]);
    expect(c.rodape).toContain("emitido em 2 de novembro de 2026");
    expect(c.arquivo).toBe("certificado-digitacao-2026-10-2lugar.pdf");
  });

  it("na lógica, os acertos", () => {
    const c = linhasDoCertificado({ ...dados, teste: "logica", ppm: null, acertos: 26, total: 30, precisao: 86.7 });
    expect(c.caixas[0]).toEqual({ valor: "26 de 30", rotulo: "ACERTOS" });
  });

  it("o PDF sai, com acento e nome comprido", async () => {
    const pdf = await pdfDoCertificado({ ...dados, nome: "Pessoa Fictícia de Nome Comprido Demais para a Linha do Certificado" });
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
