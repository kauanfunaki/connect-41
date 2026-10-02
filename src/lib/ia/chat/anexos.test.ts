import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { lerAnexos, paginasDoPdf, planilhaComoTexto } from "./anexos";
import { conferirEscolha, linhaDosAnexos, MAX_BYTES_DOS_ANEXOS, separarAnexos, tipoDoArquivo } from "./anexos-regras";
import { blocoAnthropic } from "@/lib/ia/conversa";
import { blocoOpenAi } from "@/lib/ia/conversa-openai";

const bytes = (texto: string) => new Uint8Array(Buffer.from(texto, "latin1"));

/** Um PDF mínimo com `n` páginas — só a estrutura que a contagem enxerga. */
function pdfCom(n: number): Uint8Array {
  const paginas = Array.from({ length: n }, (_, i) => `${i + 3} 0 obj << /Type /Page /Parent 2 0 R >> endobj`).join("\n");
  return bytes(`%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Count ${n} >> endobj\n${paginas}\n%%EOF`);
}

async function xlsx(linhas: unknown[][], aba = "Extrato"): Promise<Uint8Array> {
  const livro = new ExcelJS.Workbook();
  const planilha = livro.addWorksheet(aba);
  for (const l of linhas) planilha.addRow(l);
  return new Uint8Array(await livro.xlsx.writeBuffer());
}

describe("anexo do chat — regras", () => {
  it("reconhece o tipo pela extensão ou pelo mime", () => {
    expect(tipoDoArquivo("Extrato.PDF", "")).toBe("pdf");
    expect(tipoDoArquivo("foto", "image/jpeg")).toBe("jpeg");
    expect(tipoDoArquivo("nota.jpg", "")).toBe("jpeg");
    expect(tipoDoArquivo("balancete.xlsx", "")).toBe("xlsx");
    expect(tipoDoArquivo("contas.csv", "")).toBe("csv");
    expect(tipoDoArquivo("contrato.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBeNull();
    // xls antigo não é lido pelo exceljs: fica de fora.
    expect(tipoDoArquivo("antigo.xls", "application/vnd.ms-excel")).toBeNull();
  });

  it("a conversa guarda só o nome — e a tela separa de volta", () => {
    const gravado = `confere?\n\n${linhaDosAnexos([{ nome: "a.pdf" }, { nome: "b.png" }])}`;
    expect(gravado).toBe("confere?\n\n📎 a.pdf · 📎 b.png");
    expect(separarAnexos(gravado)).toEqual({ texto: "confere?", anexos: ["a.pdf", "b.png"] });
    expect(separarAnexos("pergunta sem arquivo")).toEqual({ texto: "pergunta sem arquivo", anexos: [] });
    // 📎 no meio do texto da pessoa não é anexo.
    expect(separarAnexos("o 📎 do chat\nfunciona?").anexos).toEqual([]);
  });

  it("o navegador barra antes de mandar: quantidade, tamanho e tipo", () => {
    const f = (name: string, size = 10, type = "") => ({ name, size, type });
    expect(conferirEscolha([f("a.pdf"), f("b.png")])).toBeNull();
    expect(conferirEscolha([f("a.pdf"), f("b.pdf"), f("c.pdf"), f("d.pdf")])).toMatch(/Até 3 arquivos/);
    expect(conferirEscolha([f("a.pdf", MAX_BYTES_DOS_ANEXOS), f("b.pdf", 1)])).toMatch(/10 MB/);
    expect(conferirEscolha([f("a.pdf"), f("contrato.docx")])).toMatch(/"contrato\.docx" não é PDF/);
  });
});

describe("anexo do chat — leitura no servidor", () => {
  it("conta as páginas do PDF sem confundir com o nó /Pages", () => {
    expect(paginasDoPdf(pdfCom(1))).toBe(1);
    expect(paginasDoPdf(pdfCom(7))).toBe(7);
  });

  it("PDF e imagem vão como estão; CSV vira texto", async () => {
    const r = await lerAnexos([
      { nome: "extrato.pdf", mime: "application/pdf", bytes: pdfCom(2) },
      { nome: "nota.png", mime: "image/png", bytes: bytes("PNG") },
      { nome: "contas.csv", mime: "text/csv", bytes: new Uint8Array(Buffer.from("data;valor\n01/10;150,00", "utf8")) },
    ]);
    expect("anexos" in r).toBe(true);
    if (!("anexos" in r)) return;
    expect(r.anexos[0]).toEqual({ nome: "extrato.pdf", tipo: "pdf", base64: Buffer.from(pdfCom(2)).toString("base64") });
    expect(r.anexos[1]).toMatchObject({ nome: "nota.png", tipo: "imagem", mime: "image/png" });
    expect(r.anexos[2]).toEqual({ nome: "contas.csv", tipo: "texto", texto: "data;valor\n01/10;150,00" });
  });

  it("recusa PDF longo, tipo estranho, excesso de arquivos e de tamanho", async () => {
    expect(await lerAnexos([{ nome: "livro.pdf", mime: "application/pdf", bytes: pdfCom(31) }])).toEqual({
      erro: '"livro.pdf" tem 31 páginas — o limite é 30.',
    });
    expect(await lerAnexos([{ nome: "x.exe", mime: "application/octet-stream", bytes: bytes("MZ") }])).toMatchObject({ erro: expect.stringMatching(/não é PDF/) });
    const um = { nome: "a.csv", mime: "text/csv", bytes: bytes("a") };
    expect(await lerAnexos([um, um, um, um])).toEqual({ erro: "Até 3 arquivos por pergunta." });
    expect(await lerAnexos([{ ...um, bytes: new Uint8Array(MAX_BYTES_DOS_ANEXOS + 1) }])).toEqual({ erro: "Os arquivos passam de 10 MB juntos." });
  });

  it("nome com quebra de linha não vira linha nova na conversa", async () => {
    const r = await lerAnexos([{ nome: "a\nb.csv", mime: "text/csv", bytes: bytes("x") }]);
    expect("anexos" in r && r.anexos[0].nome).toBe("a b.csv");
  });

  it("planilha vira linhas separadas por ';', com a aba em cima", async () => {
    const texto = await planilhaComoTexto(await xlsx([["Data", "Histórico", "Valor"], [new Date(Date.UTC(2026, 9, 1)), "Tarifa; pacote", 32.5]]));
    expect(texto).toBe("# Extrato\nData;Histórico;Valor\n2026-10-01;Tarifa  pacote;32.5");
  });

  it("planilha ilegível é recusada com o nome", async () => {
    expect(await lerAnexos([{ nome: "quebrada.xlsx", mime: "", bytes: bytes("não é zip") }])).toEqual({
      erro: 'Não consegui ler a planilha "quebrada.xlsx".',
    });
  });

  it("planilha grande é cortada em 300 linhas, com aviso ao modelo", async () => {
    const linhas = (await planilhaComoTexto(await xlsx(Array.from({ length: 500 }, (_, i) => [i + 1])))).split("\n");
    expect(linhas).toHaveLength(301); // 300 + o aviso
    expect(linhas[299]).toBe("299");
    expect(linhas[300]).toMatch(/cortado/);
  });
});

describe("anexo do chat — formato de cada provedor", () => {
  const pdf = { nome: "extrato.pdf", tipo: "pdf" as const, base64: "JVBERi0=" };
  const imagem = { nome: "nota.jpg", tipo: "imagem" as const, mime: "image/jpeg" as const, base64: "/9j/" };
  const texto = { nome: "contas.csv", tipo: "texto" as const, texto: "a;b" };

  it("Anthropic: documento, imagem e texto", () => {
    expect(blocoAnthropic(pdf)).toEqual({ type: "document", source: { type: "base64", media_type: "application/pdf", data: "JVBERi0=" }, title: "extrato.pdf" });
    expect(blocoAnthropic(imagem)).toEqual({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "/9j/" } });
    expect(blocoAnthropic(texto)).toEqual({ type: "text", text: 'Conteúdo do arquivo "contas.csv" anexado pela pessoa:\na;b' });
  });

  it("OpenAI: arquivo, imagem e texto em data URL", () => {
    expect(blocoOpenAi(pdf)).toEqual({ type: "input_file", filename: "extrato.pdf", file_data: "data:application/pdf;base64,JVBERi0=" });
    expect(blocoOpenAi(imagem)).toEqual({ type: "input_image", image_url: "data:image/jpeg;base64,/9j/" });
    expect(blocoOpenAi(texto)).toEqual({ type: "input_text", text: 'Conteúdo do arquivo "contas.csv" anexado pela pessoa:\na;b' });
  });
});
