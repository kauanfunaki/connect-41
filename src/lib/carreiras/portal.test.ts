import { describe, it, expect } from "vitest";
import { faixaSalarialLegivel, validarFaixa, lerFiltros, filtrarVagas, opcoesDosFiltros, temFiltro, hojeEmBrasilia, beneficiosDaVaga, localDaVaga, paginar, urlDaLista, urlDaListaEm, publicadaHa, whereDasVagasDoPortal, type VagaDoPortal } from "./portal";

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
      uf: "",
      modalidade: "REMOTO",
      contrato: "",
      area: "",
    });
    expect(temFiltro(lerFiltros({}))).toBe(false);
  });

  it("UF: duas letras, em maiúsculas; o resto é descartado", () => {
    expect(lerFiltros({ uf: " pr " }).uf).toBe("PR");
    expect(lerFiltros({ uf: "Paraná" }).uf).toBe("");
    expect(lerFiltros({ uf: "P1" }).uf).toBe("");
    expect(temFiltro(lerFiltros({ uf: "SC" }))).toBe(true);
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
      ufs: [],
      areas: ["Departamento Pessoal", "Fiscal"],
      modalidades: ["PRESENCIAL", "HIBRIDO", "REMOTO"],
      contratos: ["CLT", "ESTAGIO"],
    });
  });
});

// 41 Carreiras (14/10/2026): vagas de empresas clientes em mais de uma cidade
// e estado — a busca acha pela cidade, e a UF vira filtro.
describe("busca e filtro por local", () => {
  const vagas = [
    vaga({ title: "Analista Fiscal", empresa: "Metalúrgica Iguaçu", cidade: "Curitiba", uf: "PR" }),
    vaga({ title: "Auxiliar Fiscal", empresa: "Comercial Norte", cidade: "Joinville", uf: "SC" }),
    vaga({ title: "Assistente de DP", empresa: "Metalúrgica Iguaçu", cidade: "São José dos Pinhais", uf: "PR" }),
  ];
  const titulos = (f: Record<string, string>) => filtrarVagas(vagas, lerFiltros(f)).map((v) => v.title);

  it("a busca acha por cargo, empresa e cidade, sem acento", () => {
    expect(titulos({ q: "fiscal joinville" })).toEqual(["Auxiliar Fiscal"]);
    expect(titulos({ q: "metalurgica" })).toEqual(["Analista Fiscal", "Assistente de DP"]);
    expect(titulos({ q: "sao jose" })).toEqual(["Assistente de DP"]);
  });

  it("filtra pela UF, junto com os outros filtros", () => {
    expect(titulos({ uf: "pr" })).toEqual(["Analista Fiscal", "Assistente de DP"]);
    expect(titulos({ uf: "SC", q: "fiscal" })).toEqual(["Auxiliar Fiscal"]);
    expect(titulos({ uf: "RS" })).toEqual([]);
  });

  it("oferece as UFs que existem, sem repetir", () => {
    expect(opcoesDosFiltros(vagas).ufs).toEqual(["PR", "SC"]);
  });
});

describe("2ª leva", () => {
  it("hoje em Brasília vira a data-calendário do dia daqui", () => {
    // 01h UTC do dia 25 ainda é dia 24 em Brasília.
    expect(hojeEmBrasilia(new Date("2026-09-25T01:00:00Z")).toISOString()).toBe("2026-09-24T00:00:00.000Z");
    expect(hojeEmBrasilia(new Date("2026-09-25T04:00:00Z")).toISOString()).toBe("2026-09-25T00:00:00.000Z");
  });

  it("benefícios: um por linha, sem marcador", () => {
    expect(beneficiosDaVaga("- Vale-refeição\n\n• Plano de saúde\r\n* Home office às sextas\n  ")).toEqual([
      "Vale-refeição",
      "Plano de saúde",
      "Home office às sextas",
    ]);
    expect(beneficiosDaVaga(null)).toEqual([]);
  });

  it("local próprio da vaga ganha da cidade da empresa", () => {
    const company = { city: "Curitiba", stateCode: "PR" };
    expect(localDaVaga({ workCity: "Joinville", workStateCode: "SC", company })).toEqual({ cidade: "Joinville", uf: "SC" });
    expect(localDaVaga({ workCity: " ", workStateCode: null, company })).toEqual({ cidade: "Curitiba", uf: "PR" });
  });

  it("paginação corta em 20 e segura página fora da faixa", () => {
    const lista = Array.from({ length: 45 }, (_, i) => i);
    expect(paginar(lista, "2")).toMatchObject({ pagina: 2, totalDePaginas: 3 });
    expect(paginar(lista, "2").itens[0]).toBe(20);
    expect(paginar(lista, "9").pagina).toBe(3);
    expect(paginar(lista, "abc").pagina).toBe(1);
    expect(paginar([], "3")).toMatchObject({ pagina: 1, totalDePaginas: 1, itens: [] });
  });

  it("o link da página mantém os filtros", () => {
    expect(urlDaLista("41tech", lerFiltros({ q: "fiscal", modalidade: "REMOTO" }), 2)).toBe("/carreiras/41tech?q=fiscal&modalidade=REMOTO&pagina=2");
    expect(urlDaLista("41tech", lerFiltros({}))).toBe("/carreiras/41tech");
  });

  // No endereço do 41 Carreiras a lista é a `/`.
  it("o mesmo link a partir da `/` do 41 Carreiras, com a UF", () => {
    expect(urlDaListaEm("/", lerFiltros({ q: "fiscal", uf: "PR" }), 3)).toBe("/?q=fiscal&uf=PR&pagina=3");
    expect(urlDaListaEm("/", lerFiltros({}))).toBe("/");
  });
});

describe("as vagas que o portal mostra", () => {
  it("só do escritório, publicadas, abertas e dentro do prazo", () => {
    const agora = new Date("2026-10-14T12:00:00Z");
    expect(whereDasVagasDoPortal("t-41", agora)).toEqual({
      tenantId: "t-41",
      isPublic: true,
      status: "ABERTA",
      OR: [{ applicationDeadline: null }, { applicationDeadline: { gte: new Date("2026-10-14T00:00:00Z") } }],
    });
  });
});

describe("publicadaHa", () => {
  const agora = new Date("2026-10-14T15:00:00Z"); // 12h em Brasília

  it("conta em dias de calendário de Brasília", () => {
    expect(publicadaHa(new Date("2026-10-14T03:30:00Z"), agora)).toBe("Publicada hoje");
    // 01h UTC do dia 14 ainda é dia 13 em Brasília.
    expect(publicadaHa(new Date("2026-10-14T01:00:00Z"), agora)).toBe("Publicada ontem");
    expect(publicadaHa(new Date("2026-10-09T20:00:00Z"), agora)).toBe("Publicada há 5 dias");
    expect(publicadaHa(new Date("2026-09-14T15:00:00Z"), agora)).toBe("Publicada há 30 dias");
  });

  it("passado de um mês, para de contar; data no futuro é hoje", () => {
    expect(publicadaHa(new Date("2026-08-01T15:00:00Z"), agora)).toBe("Publicada há mais de um mês");
    expect(publicadaHa(new Date("2026-10-20T15:00:00Z"), agora)).toBe("Publicada hoje");
  });
});
