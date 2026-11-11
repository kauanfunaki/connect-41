import { existsSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { disposicaoDoAnexo, ehArquivoGuardado, ehDesenhoDoDrawio, nomeDoAnexo, tamanhoLegivel, tipoDoAnexo } from "./arquivos";
import { TELAS_DO_CONNECT, ehTelaDoConnect, telaDoConnect, telasParaEscolher } from "./telas";

// Os anexos e as telas do Repositório de fluxos (10/11/2026).

const texto = (s: string) => new TextEncoder().encode(s);
const bytes = (...b: number[]) => new Uint8Array(b);

describe("tipo do anexo pelos bytes", () => {
  it("PDF, PNG, JPG e WEBP pela assinatura, com qualquer nome", () => {
    expect(tipoDoAnexo(texto("%PDF-1.7\n..."), "fluxo.png")).toMatchObject({ ext: "pdf", previa: true });
    expect(tipoDoAnexo(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0), "a.pdf")).toMatchObject({ ext: "png" });
    expect(tipoDoAnexo(bytes(0xff, 0xd8, 0xff, 0xe0), "a")).toMatchObject({ ext: "jpg", mime: "image/jpeg" });
    expect(tipoDoAnexo(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50), "a")).toMatchObject({ ext: "webp" });
  });

  it(".drawio só com raiz <mxfile>, e só com o nome .drawio", () => {
    const desenho = texto('<?xml version="1.0" encoding="UTF-8"?>\n<!-- exportado -->\n<mxfile host="app.diagrams.net"><diagram id="x">abc</diagram></mxfile>');
    expect(tipoDoAnexo(desenho, "Admissão.drawio")).toEqual({ mime: "application/vnd.jgraph.mxfile", ext: "drawio", previa: false });
    expect(tipoDoAnexo(texto("\uFEFF  <mxfile><diagram/></mxfile>"), "a.DRAWIO")).toMatchObject({ ext: "drawio" });
    expect(tipoDoAnexo(desenho, "admissao.xml")).toBeNull();
    expect(tipoDoAnexo(texto("<html><script>alert(1)</script></html>"), "a.drawio")).toBeNull();
    expect(tipoDoAnexo(texto("<mxfileX/>"), "a.drawio")).toBeNull();
    expect(ehDesenhoDoDrawio(bytes(0x3c, 0x6d, 0x78, 0, 0x66))).toBe(false);
    expect(tipoDoAnexo(texto("MZ executável"), "a.exe")).toBeNull();
  });

  it("nome da lista sem pasta nem controle, com a extensão do tipo", () => {
    expect(nomeDoAnexo("C:\\Users\\x\\Fluxo de admissão.PDF", "pdf")).toBe("Fluxo de admissão.pdf");
    expect(nomeDoAnexo("foto.jpeg", "jpg")).toBe("foto.jpeg");
    expect(nomeDoAnexo("../../etc/passwd\u0000", "png")).toBe("passwd.png");
    expect(nomeDoAnexo("", "drawio")).toBe("arquivo.drawio");
    expect(nomeDoAnexo(`${"a".repeat(300)}.pdf`, "pdf")).toHaveLength(200);
  });

  it("o nome no disco é sempre o uuid com a extensão", () => {
    // Montado na hora: identificador literal em teste barra o PR no GitGuardian.
    const id = ["a".repeat(8), "b".repeat(4), "c".repeat(4), "d".repeat(4), "e".repeat(12)].join("-");
    expect(ehArquivoGuardado(`${id}.pdf`)).toBe(true);
    expect(ehArquivoGuardado(`../${id}.pdf`)).toBe(false);
    expect(ehArquivoGuardado(`${id}.exe`)).toBe(false);
  });

  it("baixar com acento e abrir no navegador", () => {
    expect(disposicaoDoAnexo("Admissão (v2).pdf", false)).toBe(`attachment; filename="Admissao (v2).pdf"; filename*=UTF-8''Admiss%C3%A3o%20%28v2%29.pdf`);
    expect(disposicaoDoAnexo("a.png", true).startsWith("inline;")).toBe(true);
    expect(tamanhoLegivel(340 * 1024)).toBe("340 KB");
    expect(tamanhoLegivel(1.25 * 1024 * 1024)).toBe("1,3 MB");
  });
});

describe("telas do Connect para a etapa", () => {
  it("cada endereço é de uma tela que existe, uma vez só", () => {
    const enderecos = TELAS_DO_CONNECT.map((t) => t.href);
    expect(new Set(enderecos).size).toBe(enderecos.length);
    for (const t of TELAS_DO_CONNECT) {
      expect(t.href.startsWith("/"), t.href).toBe(true);
      expect(existsSync(path.join("src", "app", "(app)", ...t.href.split("/").filter(Boolean))), t.href).toBe(true);
    }
  });

  it("acha pelo endereço e não aceita o que não é do catálogo", () => {
    expect(telaDoConnect("/admissoes")?.rotulo).toBeTruthy();
    expect(ehTelaDoConnect("/fluxos")).toBe(true);
    expect(ehTelaDoConnect("/admissoes/123")).toBe(false);
    expect(ehTelaDoConnect("https://exemplo.com")).toBe(false);
  });

  it("o editor oferece as gerais, as dos módulos ligados e a que já está em uso", () => {
    const so = telasParaEscolher(new Set(["bpo_contas_pagar"]), ["/admissoes"]).map((t) => t.href);
    expect(so).toContain("/pagar");
    expect(so).toContain("/empresas");
    expect(so).toContain("/admissoes");
    expect(so).not.toContain("/receber");
  });
});
