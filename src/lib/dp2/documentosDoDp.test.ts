import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { diasDaExperiencia, faltasDoDocumento, pdfDaFichaDeRegistro, pdfDoContratoDeExperiencia, type DadosDoDocumento } from "./documentosDoDp";

const dados = (extra: Partial<DadosDoDocumento> = {}): DadosDoDocumento => ({
  empresa: "Panificadora",
  documentoDaEmpresa: "48.291.730/0001-15",
  enderecoDaEmpresa: "Rua das Flores, 120, Curitiba/PR",
  cidade: "Curitiba",
  colaborador: "Joana Ribeiro",
  cpf: "123.456.789-09",
  rg: "12.345.678-9",
  pis: "123.45678.90-1",
  ctps: "1234567/0010",
  nascimento: "1995-04-20",
  endereco: "Rua A, 10",
  escolaridade: "Ensino médio",
  admissao: "2027-03-01",
  cargo: "Auxiliar de padaria",
  cbo: "848305",
  salario: 2000,
  tipoSalario: "MENSAL",
  horasMensais: 220,
  jornada: "Segunda a sexta, 08:00 às 17:48, 1h de intervalo",
  matricula: "001",
  categoria: "101",
  dataTermino: "2027-04-14",
  dependentes: [{ nome: "Ana", parentesco: "Filho(a)", nascimento: "2020-01-01" }],
  ...extra,
});

describe("documentos do DP", () => {
  it("dias da experiência contam a admissão e o término", () => {
    expect(diasDaExperiencia("2027-03-01", "2027-04-14")).toBe(45);
    expect(diasDaExperiencia("2027-03-01", null)).toBeNull();
  });

  it("aponta o que falta no cadastro", () => {
    expect(faltasDoDocumento("FICHA", dados())).toEqual([]);
    expect(faltasDoDocumento("FICHA", dados({ pis: null, ctps: null }))).toEqual(["CTPS", "PIS"]);
    expect(faltasDoDocumento("EXPERIENCIA", dados({ dataTermino: null }))[0]).toMatch(/término/);
    expect(faltasDoDocumento("EXPERIENCIA", dados({ dataTermino: "2027-06-30" }))[0]).toMatch(/90/);
  });

  it("os PDFs saem", async () => {
    expect((await PDFDocument.load(await pdfDaFichaDeRegistro(dados()))).getPageCount()).toBe(1);
    expect((await PDFDocument.load(await pdfDoContratoDeExperiencia(dados()))).getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
