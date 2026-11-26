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

describe("ficha de atualização da CTPS (funcionalidade-776)", () => {
  it("sai em PDF com as anotações", async () => {
    const { pdfDaFichaDaCtps } = await import("./documentosDoDp");
    const pdf = await pdfDaFichaDaCtps(
      {
        empresa: "Panificadora", documentoDaEmpresa: null, enderecoDaEmpresa: null, cidade: null, colaborador: "Joana", cpf: null, rg: null, pis: null, ctps: null, nascimento: null,
        endereco: null, escolaridade: null, admissao: "2024-05-11", cargo: "Padeira", cbo: null, salario: 3000, tipoSalario: "MENSAL", horasMensais: 220, jornada: null, matricula: null,
        categoria: "101", dataTermino: null, dependentes: [],
      },
      {
        alteracoes: [{ data: "2027-03-01", de: 3000, para: 3150, motivo: "Convenção 2027" }],
        ferias: [{ aquisitivoInicio: "2024-05-11", aquisitivoFim: "2025-05-10", inicio: "2025-07-01", dias: 30, abono: 0 }],
        afastamentos: [{ inicio: "2026-02-01", fim: "2026-02-20", motivo: "doença" }],
        contribuicoes: [{ competencia: "2027-03", valor: 100 }],
        transferencias: [],
      }
    );
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe("%PDF-");
  });
});

describe("movimentação de empregados (funcionalidade-776)", () => {
  it("resume entradas e saídas e sai em PDF", async () => {
    const { pdfDaMovimentacao, resumoDaMovimentacao } = await import("./documentosDoDp");
    const movs = [
      { data: "2027-06-02", nome: "Ana", tipo: "ADMISSAO" as const, detalhe: "Padeira" },
      { data: "2027-06-16", nome: "Joana", tipo: "TRANSFERIDO_PARA" as const, detalhe: "Filial" },
      { data: "2027-06-20", nome: "Bia", tipo: "AFASTAMENTO" as const, detalhe: "doença" },
    ];
    expect(resumoDaMovimentacao(movs, 6)).toEqual({ ativosNoInicio: 6, entraram: 1, sairam: 1, ativosNoFim: 6 });
    const pdf = await pdfDaMovimentacao({ empresa: "Panificadora", documento: null, de: "2027-06-01", ate: "2027-06-30" }, movs, 6);
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe("%PDF-");
  });
});
