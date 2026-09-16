import { describe, expect, it } from "vitest";
import { tipoPelosBytes, sanearNomeDoArquivo, validarAnexo, TAMANHO_MAXIMO_DO_ANEXO } from "./anexo";

const texto = (s: string) => new TextEncoder().encode(s);
const bytes = (...b: number[]) => new Uint8Array(b);

describe("tipoPelosBytes", () => {
  it("reconhece PDF, PNG e JPEG pela assinatura", () => {
    expect(tipoPelosBytes(texto("%PDF-1.7\n..."))?.ext).toBe("pdf");
    expect(tipoPelosBytes(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))?.ext).toBe("png");
    expect(tipoPelosBytes(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))?.mime).toBe("image/jpeg");
  });

  it("reconhece XML com declaração, com BOM, com espaço antes e sem declaração", () => {
    expect(tipoPelosBytes(texto('<?xml version="1.0"?><nfeProc/>'))?.ext).toBe("xml");
    expect(tipoPelosBytes(bytes(0xef, 0xbb, 0xbf, ...texto("<?xml version='1.0'?>")))?.ext).toBe("xml");
    expect(tipoPelosBytes(texto("\r\n  <?XML version='1.0'?>"))?.ext).toBe("xml");
    expect(tipoPelosBytes(texto("<nfeProc versao='4.00'>"))?.ext).toBe("xml");
  });

  it("recusa HTML, texto solto, executável e arquivo curto demais", () => {
    expect(tipoPelosBytes(texto("<!DOCTYPE html><html>"))).toBeNull();
    expect(tipoPelosBytes(texto("<html><body>"))).toBeNull();
    expect(tipoPelosBytes(texto("nome;valor\n1;2"))).toBeNull();
    expect(tipoPelosBytes(texto("MZ\u0090"))).toBeNull();
    expect(tipoPelosBytes(texto("%PD"))).toBeNull();
    expect(tipoPelosBytes(bytes(0x89, 0x50, 0x4e))).toBeNull();
  });

  it("não confia na extensão: HTML chamado de .pdf continua recusado", () => {
    expect(validarAnexo("boleto.pdf", texto("<html>")).ok).toBe(false);
  });
});

describe("sanearNomeDoArquivo", () => {
  it("tira caminho de Windows e de Unix", () => {
    expect(sanearNomeDoArquivo("C:\\Users\\ana\\Desktop\\extrato.pdf", "pdf")).toBe("extrato.pdf");
    expect(sanearNomeDoArquivo("../../etc/passwd", "pdf")).toBe("passwd.pdf");
  });

  it("tira caracteres de controle e o ponto do começo", () => {
    const nul = String.fromCharCode(0);
    const tab = String.fromCharCode(9);
    const del = String.fromCharCode(0x7f);
    const r = sanearNomeDoArquivo(`..nota${nul}fiscal${tab}${del}agosto.xml`, "xml");
    expect(r).toBe("nota fiscal agosto.xml");
    for (const ch of r) expect(ch.codePointAt(0)! >= 0x20).toBe(true);
  });

  it("a extensão é a do conteúdo, não a do nome", () => {
    expect(sanearNomeDoArquivo("foto.jpeg", "jpg")).toBe("foto.jpg");
    expect(sanearNomeDoArquivo("comprovante.png", "pdf")).toBe("comprovante.pdf");
    expect(sanearNomeDoArquivo("sem extensao", "png")).toBe("sem extensao.png");
  });

  it("nome vazio vira 'anexo' e nome longo é cortado mantendo a extensão", () => {
    expect(sanearNomeDoArquivo("   ", "pdf")).toBe("anexo.pdf");
    expect(sanearNomeDoArquivo("...", "pdf")).toBe("anexo.pdf");
    const longo = sanearNomeDoArquivo(`${"a".repeat(300)}.pdf`, "pdf");
    expect(longo.length).toBe(120);
    expect(longo.endsWith(".pdf")).toBe(true);
  });

  it("troca caracteres que o Windows recusa", () => {
    expect(sanearNomeDoArquivo('re: "nota" <1>.pdf', "pdf")).toBe("re nota 1.pdf");
  });
});

describe("validarAnexo", () => {
  it("aceita PDF dentro do limite", () => {
    const r = validarAnexo("guia.pdf", texto("%PDF-1.4 conteudo"));
    expect(r).toMatchObject({ ok: true, nome: "guia.pdf", tipo: { mime: "application/pdf" } });
  });

  it("recusa vazio e acima de 10 MB", () => {
    expect(validarAnexo("a.pdf", new Uint8Array(0)).ok).toBe(false);
    const grande = new Uint8Array(TAMANHO_MAXIMO_DO_ANEXO + 1);
    grande.set(texto("%PDF-"));
    expect(validarAnexo("a.pdf", grande).ok).toBe(false);
    const noLimite = new Uint8Array(TAMANHO_MAXIMO_DO_ANEXO);
    noLimite.set(texto("%PDF-"));
    expect(validarAnexo("a.pdf", noLimite).ok).toBe(true);
  });
});
