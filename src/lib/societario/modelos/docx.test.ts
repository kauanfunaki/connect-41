import PizZip from "pizzip";
import { describe, expect, it } from "vitest";
import { camposDoModelo, conferirModelo, modeloDeExemplo, montarDocx, preencherModelo } from "./docx";

// O .docx dos modelos do Societário (funcionalidade-891, 27/11/2026): os
// modelos de teste são feitos aqui mesmo (montarDocx), sem arquivo no git.

const texto = (buf: Buffer) =>
  [...new PizZip(buf).file("word/document.xml")!.asText().matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("|");

describe("conferir o modelo", () => {
  it("aceita com campo do Connect e devolve os campos usados", () => {
    const r = conferirModelo(montarDocx(["Contrato de {EMPRESA_RAZAO_SOCIAL}", "{#SOCIOS}{NOME}{/SOCIOS}"]));
    expect(r).toEqual({ ok: true, campos: ["EMPRESA_RAZAO_SOCIAL", "SOCIOS", "NOME"], avisos: [] });
  });
  it("campo desconhecido vira aviso", () => {
    const r = conferirModelo(montarDocx(["{EMPRESA_CNPJ} e {CAMPO_INVENTADO}"]));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.avisos[0]).toContain("{CAMPO_INVENTADO}");
  });
  it("recusa arquivo que não é .docx, vazio, sem campo do Connect ou com lista sem fechar", () => {
    expect(conferirModelo(new Uint8Array())).toEqual({ ok: false, erro: "O arquivo está vazio." });
    expect(conferirModelo(Buffer.from("não sou um zip"))).toMatchObject({ ok: false, erro: expect.stringContaining(".docx") });
    expect(conferirModelo(montarDocx(["Texto sem campo nenhum"]))).toMatchObject({ ok: false, erro: expect.stringContaining("nenhum campo") });
    expect(conferirModelo(montarDocx(["{#SOCIOS}{NOME}"]))).toMatchObject({ ok: false, erro: expect.stringContaining("não fecha") });
    expect(conferirModelo(montarDocx(["{EMPRESA_CNPJ"]))).toMatchObject({ ok: false });
  });
});

describe("preencher", () => {
  it("troca os campos e repete o parágrafo para cada sócio", () => {
    const modelo = montarDocx(["Empresa: {EMPRESA_RAZAO_SOCIAL}", "{#SOCIOS}", "Sócio: {NOME}", "{/SOCIOS}", "Fim"]);
    const r = preencherModelo(modelo, { EMPRESA_RAZAO_SOCIAL: "EMPRESA EXEMPLO LTDA", SOCIOS: [{ NOME: "JOÃO" }, { NOME: "ANA" }] });
    expect(texto(r)).toBe("Empresa: EMPRESA EXEMPLO LTDA|Sócio: JOÃO|Sócio: ANA|Fim");
  });
  it("campo sem dado sai em branco", () => {
    expect(texto(preencherModelo(montarDocx(["NIRE: {EMPRESA_NIRE}."]), {}))).toBe("NIRE: .");
  });
  it("escapa o texto do cadastro", () => {
    expect(texto(preencherModelo(montarDocx(["{EMPRESA_RAZAO_SOCIAL}"]), { EMPRESA_RAZAO_SOCIAL: "A & B <LTDA>" }))).toBe("A &amp; B &lt;LTDA&gt;");
  });
});

describe("modelo de exemplo", () => {
  it("é um modelo válido, sem aviso, com os campos de todos os grupos", () => {
    const exemplo = modeloDeExemplo();
    const r = conferirModelo(exemplo);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.avisos).toEqual([]);
    for (const c of ["EMPRESA_RAZAO_SOCIAL", "CAPITAL_SOCIAL_EXTENSO", "SOCIOS", "NOME", "CAPITAL_EXTENSO", "ADVOGADO_OAB", "TESTEMUNHA2_TEXTO", "LOCAL_E_DATA"]) {
      expect(r.campos).toContain(c);
    }
    expect(camposDoModelo(exemplo)).toEqual(r.campos);
  });
  it("preenche sem erro", () => {
    expect(() => preencherModelo(modeloDeExemplo(), { SOCIOS: [{ NOME: "JOÃO" }] })).not.toThrow();
  });
});
