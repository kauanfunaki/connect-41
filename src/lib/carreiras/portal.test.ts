import { describe, it, expect } from "vitest";
import { faixaSalarialLegivel, validarFaixa, lerFiltros, filtrarVagas, opcoesDosFiltros, temFiltro, type VagaDoPortal } from "./portal";

// Intl usa espaço não separável entre "R$" e o número.
const semNbsp = (t: string) => t.replace(/ /g, " ");

describe("faixaSalarialLegivel", () => {
  it("escreve a faixa como o candidato lê", () => {
    expect(semNbsp(faixaSalarialLegivel({ salaryMin: 3000, salaryMax: 4500, showSalary: true }))).toBe("R$ 3.000 a R$ 4.500");
    expect(semNbsp(faixaSalarialLegivel({ salaryMin: 3000, salaryMax: null, showSalary: true }))).toBe("A partir de R$ 3.000");
    expect(semNbsp(faixaSalarialLegivel({ salaryMin: null, salaryMax: 4500, showSalary: true }))).toBe("Até R$ 4.500");
    expect(semNbsp(faixaSalarialLegivel({ salaryMin: 3000, salaryMax: 3000, showSalary: true }))).toBe("R$ 3.000");
  });
  it("sem a chave ligada, não mostra valor nenhum", () => {
    expect(faixaSalarialLegivel({ salaryMin: 3000, salaryMax: 4500, showSalary: false })).toBe("A combinar");
  });
});

describe("validarFaixa", () => {
  it("aceita o formato brasileiro e ponto decimal", () => {
    expect(validarFaixa("3.500,00", "4500.5", true)).toEqual({ ok: true, salaryMin: 3500, salaryMax: 4500.5, showSalary: true });
    expect(validarFaixa("", "", false)).toEqual({ ok: true, salaryMin: null, salaryMax: null, showSalary: false });
  });
  it("recusa faixa invertida, valor inválido e mostrar sem valor", () => {
    expect(validarFaixa("5000", "3000", true).ok).toBe(false);
    expect(validarFaixa("abc", "", false).ok).toBe(false);
    expect(validarFaixa("-1", "", false).ok).toBe(false);
    expect(validarFaixa("", "", true).ok).toBe(false);
  });
});

describe("lerFiltros", () => {
  it("descarta modalidade e contrato desconhecidos", () => {
    expect(lerFiltros({ q: " analista ", modalidade: "remoto", contrato: "xpto", cidade: "Curitiba" })).toEqual({
      busca: "analista",
      cidade: "Curitiba",
      modalidade: "REMOTO",
      contrato: "",
      area: "",
    });
    expect(temFiltro(lerFiltros({}))).toBe(false);
  });
});

const vaga = (p: Partial<VagaDoPortal>): VagaDoPortal => ({
  title: "Vaga",
  publicDescription: null,
  empresa: "41 Contábil",
  cidade: "Curitiba",
  area: null,
  workMode: null,
  contractType: null,
  ...p,
});

describe("filtrarVagas", () => {
  const vagas = [
    vaga({ title: "Analista Fiscal", area: "Fiscal", workMode: "HIBRIDO", contractType: "CLT" }),
    vaga({ title: "Assistente de DP", area: "Departamento Pessoal", cidade: "São José dos Pinhais", workMode: "PRESENCIAL", contractType: "CLT" }),
    vaga({ title: "Estagiário", publicDescription: "Apoio à área fiscal e contábil", workMode: "REMOTO", contractType: "ESTAGIO" }),
    vaga({ title: "Vaga antiga, sem modalidade" }),
  ];

  it("busca cada palavra, sem acento e sem caixa, em título, descrição e área", () => {
    expect(filtrarVagas(vagas, lerFiltros({ q: "fiscal" })).map((v) => v.title)).toEqual(["Analista Fiscal", "Estagiário"]);
    expect(filtrarVagas(vagas, lerFiltros({ q: "contabil apoio" })).map((v) => v.title)).toEqual(["Estagiário"]);
  });

  it("cidade, área, modalidade e contrato", () => {
    expect(filtrarVagas(vagas, lerFiltros({ cidade: "sao jose dos pinhais" })).map((v) => v.title)).toEqual(["Assistente de DP"]);
    expect(filtrarVagas(vagas, lerFiltros({ modalidade: "REMOTO" })).map((v) => v.title)).toEqual(["Estagiário"]);
    expect(filtrarVagas(vagas, lerFiltros({ contrato: "CLT", area: "fiscal" })).map((v) => v.title)).toEqual(["Analista Fiscal"]);
  });

  it("sem filtro, a vaga sem modalidade continua na lista", () => {
    expect(filtrarVagas(vagas, lerFiltros({}))).toHaveLength(4);
  });

  it("só oferece opção que tem resultado", () => {
    expect(opcoesDosFiltros(vagas)).toEqual({
      cidades: ["Curitiba", "São José dos Pinhais"],
      areas: ["Departamento Pessoal", "Fiscal"],
      modalidades: ["PRESENCIAL", "HIBRIDO", "REMOTO"],
      contratos: ["CLT", "ESTAGIO"],
    });
  });
});
