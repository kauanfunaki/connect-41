import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { conferirModelo, preencherModelo } from "./docx";

/** Um .docx mínimo com os parágrafos dados (cada item da lista interna é um pedaço de texto do Word). */
function docx(paragrafos: string[][]): Buffer {
  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
  );
  const corpo = paragrafos.map((runs) => `<w:p>${runs.map((t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`).join("")}</w:p>`).join("");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${corpo}</w:body></w:document>`
  );
  return zip.generate({ type: "nodebuffer" });
}

const textoDe = (bytes: Buffer) => new PizZip(bytes).file("word/document.xml")!.asText().replace(/<[^>]+>/g, "");

const MODELO = docx([["CONTRATANTE: ", "{CONTRATANTE_", "TEXTO}"], ["{DATA_DOCUMENTO}"], ["{NOME_SOCIO_ASSINATURA}"]]);

describe("o modelo do termo", () => {
  it("aceita o modelo do Aditiva, mesmo com o campo partido em pedaços pelo Word", () => {
    expect(conferirModelo(MODELO)).toEqual({ ok: true, avisos: [] });
  });

  it("recusa o que não é .docx e o modelo sem o parágrafo do contratante", () => {
    expect(conferirModelo(Buffer.from("%PDF-1.4 qualquer coisa"))).toMatchObject({ ok: false });
    expect(conferirModelo(Buffer.alloc(0))).toEqual({ ok: false, erro: "O arquivo está vazio." });
    expect(conferirModelo(docx([["{DATA_DOCUMENTO}"]]))).toMatchObject({ ok: false, erro: expect.stringContaining("{CONTRATANTE_TEXTO}") });
  });

  it("recusa campo mal escrito, dizendo qual", () => {
    const r = conferirModelo(docx([["{CONTRATANTE_TEXTO}"], ["{DATA_DOCUMENTO"]]));
    expect(r.ok).toBe(false);
  });

  it("avisa do campo que falta e do desconhecido", () => {
    const r = conferirModelo(docx([["{CONTRATANTE_TEXTO} {VALOR}"]]));
    expect(r).toMatchObject({ ok: true });
    if (r.ok) {
      expect(r.avisos).toContain("O modelo não tem {DATA_DOCUMENTO}.");
      expect(r.avisos.at(-1)).toContain("{VALOR}");
    }
  });

  it("preenche os três campos e deixa o desconhecido em branco", () => {
    const saida = preencherModelo(docx([["{CONTRATANTE_", "TEXTO}"], ["{DATA_DOCUMENTO}"], ["{NOME_SOCIO_ASSINATURA}|{VALOR}|"]]), {
      CONTRATANTE_TEXTO: "EMPRESA & CIA LTDA, pessoa jurídica",
      DATA_DOCUMENTO: "Curitiba, 12 de novembro de 2026.",
      NOME_SOCIO_ASSINATURA: "FULANO DE TAL",
    });
    const texto = textoDe(saida);
    expect(texto).toContain("EMPRESA &amp; CIA LTDA, pessoa jurídica");
    expect(texto).toContain("Curitiba, 12 de novembro de 2026.");
    expect(texto).toContain("FULANO DE TAL||");
    expect(texto).not.toContain("{");
  });
});
