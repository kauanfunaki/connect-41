import { describe, expect, it } from "vitest";
import { TAMANHO_MAXIMO_NO_DRIVE, tipoNoDrive, validarArquivoDoDrive } from "./tipoDoArquivo";

const texto = (s: string) => new TextEncoder().encode(s);
const bytes = (...b: number[]) => new Uint8Array(b);
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00);
const OLE = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00);

describe("tipoNoDrive", () => {
  it("reconhece PDF, imagem e XML pelos bytes, como os anexos", () => {
    expect(tipoNoDrive("x.pdf", texto("%PDF-1.7"))).toMatchObject({ ext: "pdf", previa: true });
    expect(tipoNoDrive("x", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toMatchObject({ ext: "png", previa: true });
    expect(tipoNoDrive("x", bytes(0xff, 0xd8, 0xff, 0xe0))).toMatchObject({ ext: "jpg", previa: true });
    expect(tipoNoDrive("nota.xml", texto('<?xml version="1.0"?><nfeProc/>'))).toMatchObject({ ext: "xml", previa: false });
    expect(tipoNoDrive("x.gif", texto("GIF89a..."))).toMatchObject({ ext: "gif", previa: true });
    expect(tipoNoDrive("x.webp", texto("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "))).toMatchObject({ ext: "webp", previa: true });
  });

  it("ZIP por dentro: Word, Excel e cia. pela extensão; sem extensão conhecida, é zip", () => {
    expect(tipoNoDrive("contrato.docx", ZIP)).toMatchObject({ ext: "docx", previa: false });
    expect(tipoNoDrive("Folha.XLSX", ZIP)).toMatchObject({ ext: "xlsx" });
    expect(tipoNoDrive("pacote.zip", ZIP)).toMatchObject({ ext: "zip", mime: "application/zip" });
    expect(tipoNoDrive("disfarce.pdf", ZIP)).toMatchObject({ ext: "zip" });
  });

  it("Office antigo só entra com a extensão certa", () => {
    expect(tipoNoDrive("planilha.xls", OLE)).toMatchObject({ ext: "xls" });
    expect(tipoNoDrive("carta.doc", OLE)).toMatchObject({ ext: "doc" });
    expect(tipoNoDrive("misterio.bin", OLE)).toBeNull();
  });

  it("texto: CSV, OFX e arquivo do banco pela extensão; o resto vira txt", () => {
    expect(tipoNoDrive("extrato.ofx", texto("OFXHEADER:100\nDATA:OFXSGML"))).toMatchObject({ ext: "ofx" });
    expect(tipoNoDrive("lancamentos.csv", texto("data;valor\n01/10;10,00"))).toMatchObject({ ext: "csv", mime: "text/csv" });
    expect(tipoNoDrive("CB0910.RET", texto("02RETORNO01COBRANCA"))).toMatchObject({ ext: "ret" });
    expect(tipoNoDrive("leia.md", texto("# título"))).toMatchObject({ ext: "txt" });
  });

  it("recusa HTML e SVG, mesmo com nome de texto", () => {
    expect(tipoNoDrive("pagina.txt", texto("<html><script>alert(1)</script>"))).toBeNull();
    expect(tipoNoDrive("logo.svg", texto('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toMatchObject({ ext: "xml" });
    expect(tipoNoDrive("nota.txt", texto("  \n<!DOCTYPE html>"))).toBeNull();
  });

  it("recusa binário desconhecido (executável)", () => {
    expect(tipoNoDrive("setup.exe", bytes(0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00))).toBeNull();
  });
});

describe("validarArquivoDoDrive", () => {
  it("dá nome com a extensão do tipo conferido", () => {
    const r = validarArquivoDoDrive("C:\\Users\\ana\\Contrato social.DOCX", ZIP);
    expect(r).toMatchObject({ ok: true, nome: "Contrato social.docx" });
  });

  it("recusa vazio, acima do limite e formato não aceito", () => {
    expect(validarArquivoDoDrive("a.pdf", new Uint8Array(0)).ok).toBe(false);
    const grande = new Uint8Array(TAMANHO_MAXIMO_NO_DRIVE + 1);
    grande.set(texto("%PDF-"));
    expect(validarArquivoDoDrive("a.pdf", grande).ok).toBe(false);
    expect(validarArquivoDoDrive("a.exe", bytes(0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00)).ok).toBe(false);
  });

  it("binário sem byte nulo no começo também não passa por texto", () => {
    const controle = Uint8Array.from({ length: 200 }, (_, i) => (i % 3 === 0 ? 0x01 : 0x41));
    expect(validarArquivoDoDrive("dados.txt", controle).ok).toBe(false);
  });
});
