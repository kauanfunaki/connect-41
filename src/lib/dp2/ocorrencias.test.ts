import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { diasDeSuspensaoNoMes, fimDaSuspensao, lerOcorrencia, pdfDaOcorrencia, textoDoDocumento } from "./ocorrencias";

const motivo = "Faltou sem justificativa em 10/03/2027 e 11/03/2027.";

describe("lerOcorrencia", () => {
  it("advertência não tem dias; suspensão pede de 1 a 30", () => {
    expect(lerOcorrencia({ tipo: "ADVERTENCIA", data: "2027-03-12", dias: "5", motivo })).toEqual({ ok: true, ocorrencia: { tipo: "ADVERTENCIA", data: "2027-03-12", dias: 0, motivo } });
    expect(lerOcorrencia({ tipo: "SUSPENSAO", data: "2027-03-15", dias: "3", motivo })).toMatchObject({ ok: true, ocorrencia: { dias: 3 } });
    expect(lerOcorrencia({ tipo: "SUSPENSAO", data: "2027-03-15", dias: "31", motivo })).toMatchObject({ ok: false, erro: expect.stringMatching(/474/) });
    expect(lerOcorrencia({ tipo: "SUSPENSAO", data: "2027-03-15", dias: "", motivo })).toMatchObject({ ok: false });
    expect(lerOcorrencia({ tipo: "ADVERTENCIA", data: "2027-03-12", dias: "", motivo: "curto" })).toMatchObject({ ok: false, erro: expect.stringMatching(/motivo/) });
  });
});

describe("dias de suspensão no mês", () => {
  it("conta os dias corridos dentro do mês, inclusive a que passa de um mês para o outro", () => {
    const s = [{ tipo: "SUSPENSAO" as const, data: "2027-03-30", dias: 5 }];
    expect(fimDaSuspensao(s[0])).toBe("2027-04-03");
    expect(diasDeSuspensaoNoMes(s, 2027, 3)).toBe(2);
    expect(diasDeSuspensaoNoMes(s, 2027, 4)).toBe(3);
    expect(diasDeSuspensaoNoMes([...s, { tipo: "ADVERTENCIA" as const, data: "2027-04-01", dias: 0 }], 2027, 4)).toBe(3);
    expect(diasDeSuspensaoNoMes(s, 2027, 5)).toBe(0);
  });
});

describe("documento", () => {
  it("o texto da suspensão diz o período e que não é remunerado; o PDF tem uma página", async () => {
    const o = { tipo: "SUSPENSAO" as const, data: "2027-03-15", dias: 3, motivo };
    const t = textoDoDocumento(o, { colaborador: "Joana Ribeiro", empresa: "Panificadora", cidade: "Curitiba" });
    expect(t[0]).toContain("por 3 dia(s), de 15/03/2027 a 17/03/2027");
    expect(t[0]).toContain("não serão remunerados");
    expect(t[3]).toBe("Curitiba, 15/03/2027.");
    const pdf = await PDFDocument.load(await pdfDaOcorrencia(o, { colaborador: "Joana Ribeiro", cpf: "123.456.789-09", empresa: "Panificadora", documentoDaEmpresa: null }));
    expect(pdf.getPageCount()).toBe(1);
  });
});
