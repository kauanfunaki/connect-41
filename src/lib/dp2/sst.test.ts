import { describe, expect, it } from "vitest";
import { lerAmbiente, lerEntregaDeEpi, lerEpi, pdfDaFichaDeEpi, situacaoDoCa } from "./sst";

describe("cadastros de SST", () => {
  it("lê o ambiente com os agentes da Tabela 24", () => {
    expect(lerAmbiente({ nome: " Produção ", atividade: "Opera o forno", agentes: "02.01.006, 01.18.001; 02.01.006", usaEpc: "2", usaEpi: "x" })).toEqual({
      ok: true,
      ambiente: { nome: "Produção", atividade: "Opera o forno", agentes: ["02.01.006", "01.18.001"], usaEpc: "2", usaEpi: "0" },
    });
    expect(lerAmbiente({ nome: "", atividade: "", agentes: "", usaEpc: "0", usaEpi: "0" })).toMatchObject({ ok: false });
    expect(lerAmbiente({ nome: "Escritório", atividade: "", agentes: "0118001", usaEpc: "0", usaEpi: "0" })).toMatchObject({ ok: false, erro: expect.stringMatching(/0118001/) });
  });

  it("lê o EPI e avisa da validade do CA", () => {
    expect(lerEpi({ nome: "Luva térmica", ca: "CA 12.345", validadeCa: "2027-12-31" })).toEqual({ ok: true, epi: { nome: "Luva térmica", ca: "12345", validadeCa: "2027-12-31" } });
    expect(lerEpi({ nome: "Luva", ca: "", validadeCa: "" })).toMatchObject({ ok: false });
    expect(situacaoDoCa(null, "2027-06-01").tom).toBe("sem");
    expect(situacaoDoCa("2027-05-31", "2027-06-01").tom).toBe("vencido");
    expect(situacaoDoCa("2027-06-20", "2027-06-01")).toEqual({ tom: "vence", texto: "CA vence em 19 dia(s) (20/06/2027)" });
    expect(situacaoDoCa("2028-01-01", "2027-06-01").tom).toBe("ok");
  });

  it("não registra entrega com o CA vencido na data", () => {
    expect(lerEntregaDeEpi({ data: "2027-06-10", quantidade: "" }, { validadeCa: "2027-12-31" })).toEqual({ ok: true, entrega: { data: "2027-06-10", quantidade: 1 } });
    expect(lerEntregaDeEpi({ data: "2027-06-10", quantidade: "2" }, { validadeCa: "2027-06-01" })).toMatchObject({ ok: false, erro: expect.stringMatching(/venceu/) });
    expect(lerEntregaDeEpi({ data: "2027-06-10", quantidade: "0" }, { validadeCa: null })).toMatchObject({ ok: false });
  });

  it("monta a ficha de entrega em PDF, com várias páginas quando precisa", async () => {
    const linhas = Array.from({ length: 50 }, (_, i) => ({ data: "2027-06-10", epi: `Luva térmica ${i}`, ca: "12345", quantidade: 1 }));
    const pdf = await pdfDaFichaDeEpi(linhas, { colaborador: "Joana", cpf: null, empresa: "Panificadora", documentoDaEmpresa: null, funcao: "Padeira" });
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe("%PDF-");
    const { PDFDocument } = await import("pdf-lib");
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(1);
  });
});

describe("médicos do ASO", () => {
  it("valida nome, CRM e UF", async () => {
    const { lerMedico } = await import("./sst");
    expect(lerMedico({ nome: " Dra. Ana ", crm: "CRM 12.345", uf: "pr" })).toEqual({ ok: true, medico: { nome: "Dra. Ana", crm: "12345", uf: "PR" } });
    expect(lerMedico({ nome: "Dra. Ana", crm: "", uf: "PR" })).toMatchObject({ ok: false });
    expect(lerMedico({ nome: "Dra. Ana", crm: "123", uf: "XX" })).toMatchObject({ ok: false, erro: expect.stringMatching(/UF/) });
  });
});
