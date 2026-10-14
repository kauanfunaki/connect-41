import { describe, expect, it } from "vitest";
import {
  arquivoDoLogo,
  contagensDoPortal,
  dataCompleta,
  diaEMes,
  diasAteOPrazo,
  empresasContratando,
  faixaPublica,
  fatosDaVaga,
  haQuantoTempo,
  iniciaisDaEmpresa,
  linksDeCompartilhamento,
  listaDoPortal,
  localLegivel,
  opcoesComContagem,
  requisitosPublicos,
  resumoDoPortal,
  seloDoPrazo,
  type VagaResumida,
} from "./apresentacao";
import { lerFiltros } from "./portal";

// O que as telas do 41 Carreiras mostram (15/10/2026). Regra: só o que existe.

const AGORA = new Date("2026-10-15T15:00:00Z"); // 15/10, meio-dia em Brasília
const dia = (iso: string) => new Date(`${iso}T00:00:00Z`); // data-calendário, como o prazo é gravado
/** O Intl separa "R$" do valor com espaço não separável. */
const sp = (t: string | null | undefined) => t?.replace(/ /g, " ") ?? t;

describe("datas relativas", () => {
  it("há quanto tempo foi publicada, em dias de Brasília", () => {
    expect(haQuantoTempo(new Date("2026-10-15T11:00:00Z"), AGORA)).toBe("hoje");
    // 14/10 às 23h30 em Brasília (02h30 UTC do dia 15) ainda é "ontem".
    expect(haQuantoTempo(new Date("2026-10-15T02:30:00Z"), AGORA)).toBe("ontem");
    expect(haQuantoTempo(new Date("2026-10-10T12:00:00Z"), AGORA)).toBe("há 5 dias");
    expect(haQuantoTempo(new Date("2026-09-15T12:00:00Z"), AGORA)).toBe("há 30 dias");
    expect(haQuantoTempo(new Date("2026-08-01T12:00:00Z"), AGORA)).toBe("há mais de um mês");
  });

  it("dd/mm e dd/mm/aaaa de uma data-calendário", () => {
    expect(diaEMes(dia("2026-10-05"))).toBe("05/10");
    expect(dataCompleta(dia("2026-01-31"))).toBe("31/01/2026");
  });
});

describe("selo de prazo", () => {
  it("só aparece com 7 dias ou menos; no último dia, diz que é o último", () => {
    expect(seloDoPrazo(null, AGORA)).toBeNull();
    expect(seloDoPrazo(dia("2026-10-23"), AGORA)).toBeNull(); // 8 dias
    expect(seloDoPrazo(dia("2026-10-22"), AGORA)).toEqual({ texto: "Inscrições até 22/10", ultimoDia: false });
    expect(seloDoPrazo(dia("2026-10-16"), AGORA)).toEqual({ texto: "Inscrições até 16/10", ultimoDia: false });
    expect(seloDoPrazo(dia("2026-10-15"), AGORA)).toEqual({ texto: "Último dia de inscrição", ultimoDia: true });
    // Prazo passado não tem selo (e a vaga já nem aparece no portal).
    expect(seloDoPrazo(dia("2026-10-14"), AGORA)).toBeNull();
  });

  it("conta os dias pelo calendário de Brasília, não pelo instante UTC", () => {
    // 15/10 às 22h em Brasília = 16/10 01h UTC: ainda é o dia 15 aqui.
    expect(diasAteOPrazo(dia("2026-10-15"), new Date("2026-10-16T01:00:00Z"))).toBe(0);
  });
});

describe("fatos da vaga — só os que existem", () => {
  const base = {
    contractType: null,
    workMode: null,
    cidade: null,
    uf: null,
    salaryMin: null,
    salaryMax: null,
    showSalary: false,
    area: null,
    quantity: 1,
    applicationDeadline: null,
  };

  it("vaga sem nada preenchido: nenhum fato (nada de 'A combinar' nem '—')", () => {
    expect(fatosDaVaga(base)).toEqual([]);
  });

  it("todos os campos: na ordem da grade", () => {
    const fatos = fatosDaVaga({
      ...base,
      contractType: "CLT",
      workMode: "HIBRIDO",
      cidade: "Curitiba",
      uf: "PR",
      salaryMin: 3000,
      salaryMax: 4500,
      showSalary: true,
      area: "Fiscal",
      quantity: 2,
      applicationDeadline: dia("2026-10-31"),
    });
    expect(fatos.map((f) => [f.chave, sp(f.valor)])).toEqual([
      ["contrato", "CLT"],
      ["modelo", "Híbrido"],
      ["local", "Curitiba – PR"],
      ["salario", "R$ 3.000 a R$ 4.500"],
      ["area", "Fiscal"],
      ["quantidade", "2 vagas"],
      ["prazo", "31/10/2026"],
    ]);
  });

  it("a faixa salarial só com a chave ligada e algum valor", () => {
    expect(fatosDaVaga({ ...base, salaryMin: 3000, salaryMax: 4500, showSalary: false }).some((f) => f.chave === "salario")).toBe(false);
    expect(faixaPublica({ salaryMin: null, salaryMax: null, showSalary: true })).toBeNull();
    expect(sp(faixaPublica({ salaryMin: 3000, salaryMax: null, showSalary: true }))).toBe("A partir de R$ 3.000");
    expect(sp(faixaPublica({ salaryMin: null, salaryMax: 4500, showSalary: true }))).toBe("Até R$ 4.500");
    expect(sp(faixaPublica({ salaryMin: 4000, salaryMax: 4000, showSalary: true }))).toBe("R$ 4.000");
  });

  it("uma vaga só não vira o fato 'Vagas'", () => {
    expect(fatosDaVaga({ ...base, quantity: 1 }).some((f) => f.chave === "quantidade")).toBe(false);
  });
});

describe("pequenas peças", () => {
  it("o local: cidade e UF, um dos dois, ou nada", () => {
    expect(localLegivel("Curitiba", "PR")).toBe("Curitiba – PR");
    expect(localLegivel("Curitiba", null)).toBe("Curitiba");
    expect(localLegivel(null, "PR")).toBe("PR");
    expect(localLegivel(" ", null)).toBeNull();
  });

  it("as iniciais da empresa, sem 'Ltda' nem 'de'", () => {
    expect(iniciaisDaEmpresa("Metalúrgica Iguaçu Ltda")).toBe("MI");
    expect(iniciaisDaEmpresa("Comércio de Peças Norte")).toBe("PN");
    expect(iniciaisDaEmpresa("BLD")).toBe("B");
    expect(iniciaisDaEmpresa("41 Contábil")).toBe("4C");
  });

  it("os links de compartilhar levam o endereço da vaga", () => {
    const l = linksDeCompartilhamento("https://carreiras.41contabil.com.br/vagas/v1", "Analista Fiscal", "Metalúrgica Iguaçu");
    expect(l.linkedin).toBe("https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fcarreiras.41contabil.com.br%2Fvagas%2Fv1");
    expect(decodeURIComponent(l.whatsapp.split("?text=")[1]!)).toBe("Vaga: Analista Fiscal — Metalúrgica Iguaçu\nhttps://carreiras.41contabil.com.br/vagas/v1");
  });

  it("o logo da empresa: só o arquivo que o Connect gravou, nada de caminho de fora", () => {
    expect(arquivoDoLogo("/api/company-logos/3f2a-91.png?v=1712345")).toEqual({ nome: "3f2a-91.png", tipo: "image/png" });
    expect(arquivoDoLogo("/api/company-logos/abc.webp")).toEqual({ nome: "abc.webp", tipo: "image/webp" });
    for (const ruim of [null, "", "/api/company-logos/../../etc/passwd", "/api/company-logos/a.svg", "https://outro.site/logo.png", "/api/workspace-logos/t.png"]) {
      expect(arquivoDoLogo(ruim), String(ruim)).toBeNull();
    }
  });
});

describe("requisitos que o candidato lê", () => {
  it("obrigatórios × desejáveis, só o texto (sem o peso da triagem)", () => {
    const r = requisitosPublicos([
      { id: "r1", tipo: "OBRIGATORIO", texto: "Experiência com folha de pagamento", peso: 3 },
      { id: "r2", tipo: "DESEJAVEL", texto: "Conhecimento do sistema Domínio", peso: 1 },
      { id: "r3", tipo: "OBRIGATORIO", texto: "  Ensino   superior em Contabilidade ", peso: 2 },
    ]);
    expect(r).toEqual({
      obrigatorios: ["Experiência com folha de pagamento", "Ensino superior em Contabilidade"],
      desejaveis: ["Conhecimento do sistema Domínio"],
    });
  });

  it("o que não tem o formato é descartado; repetido aparece uma vez", () => {
    expect(requisitosPublicos(null)).toEqual({ obrigatorios: [], desejaveis: [] });
    expect(requisitosPublicos("x")).toEqual({ obrigatorios: [], desejaveis: [] });
    expect(requisitosPublicos([null, { texto: "" }, { texto: "Excel" }, { texto: "excel" }])).toEqual({ obrigatorios: [], desejaveis: ["Excel"] });
  });
});

// ─── A capa e a lista ───────────────────────────────────────────────────────

type V = VagaResumida & {
  title: string;
  publicDescription: string | null;
  applicationDeadline: Date | null;
};

function vaga(p: Partial<V> & { id: string }): V {
  return {
    companyId: "c1",
    empresa: "Metalúrgica Iguaçu",
    cidade: "Curitiba",
    uf: "PR",
    area: "Fiscal",
    workMode: "HIBRIDO",
    contractType: "CLT",
    openedAt: new Date("2026-10-10T12:00:00Z"),
    temLogo: false,
    title: "Analista Fiscal",
    publicDescription: null,
    applicationDeadline: null,
    ...p,
  };
}

const VAGAS: V[] = [
  vaga({ id: "v1", openedAt: new Date("2026-10-14T12:00:00Z"), applicationDeadline: dia("2026-10-30") }),
  vaga({ id: "v2", title: "Auxiliar de DP", area: "Departamento Pessoal", companyId: "c2", empresa: "Comercial Norte", cidade: "Joinville", uf: "SC", workMode: "PRESENCIAL", temLogo: true, openedAt: new Date("2026-10-12T12:00:00Z"), applicationDeadline: dia("2026-10-20") }),
  vaga({ id: "v3", title: "Estagiário Contábil", area: "Contábil", workMode: "REMOTO", contractType: "ESTAGIO", openedAt: new Date("2026-10-13T12:00:00Z") }),
  vaga({ id: "v4", title: "Analista de DP", area: "Departamento Pessoal", companyId: "c2", empresa: "Comercial Norte", cidade: "São José dos Pinhais", uf: "PR", openedAt: new Date("2026-10-01T12:00:00Z") }),
];

describe("os números da capa", () => {
  it("vagas, empresas e o dia da vaga mais nova (em Brasília)", () => {
    const r = resumoDoPortal(VAGAS)!;
    expect(r.vagas).toBe(4);
    expect(r.empresas).toBe(2);
    expect(diaEMes(r.ultimaPublicacao)).toBe("14/10");
  });

  it("sem vaga, nada de número zero", () => {
    expect(resumoDoPortal([])).toBeNull();
  });
});

describe("empresas contratando", () => {
  it("as que mais contratam primeiro; o logo pela vaga de quem tem", () => {
    expect(empresasContratando(VAGAS)).toEqual([
      { companyId: "c1", nome: "Metalúrgica Iguaçu", vagas: 2, local: "Curitiba – PR", vagaDoLogo: null },
      { companyId: "c2", nome: "Comercial Norte", vagas: 2, local: "Joinville – SC", vagaDoLogo: "v2" },
    ].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
  });
});

describe("contagens da capa", () => {
  it("modelo e contrato na ordem fixa; áreas pelas que mais têm vaga", () => {
    const c = contagensDoPortal(VAGAS);
    expect(c.modalidades.map((m) => [m.rotulo, m.vagas])).toEqual([
      ["Presencial", 1],
      ["Híbrido", 2],
      ["Remoto", 1],
    ]);
    expect(c.contratos.map((m) => [m.rotulo, m.vagas])).toEqual([
      ["CLT", 3],
      ["Estágio", 1],
    ]);
    expect(c.areas.map((a) => [a.rotulo, a.vagas])).toEqual([
      ["Departamento Pessoal", 2],
      ["Contábil", 1],
      ["Fiscal", 1],
    ]);
    expect(c.cidades[0]).toEqual({ valor: "Curitiba", rotulo: "Curitiba – PR", vagas: 2 });
  });

  it("sem vagas, sem atalhos", () => {
    const c = contagensDoPortal([]);
    expect([c.modalidades, c.contratos, c.areas, c.cidades]).toEqual([[], [], [], []]);
  });
});

describe("a lista de vagas pela URL", () => {
  const ids = (busca: Record<string, string>) => listaDoPortal(VAGAS, busca).itens.map((v) => v.id);

  it("sem nada: as mais recentes primeiro, e a primeira aberta ao lado", () => {
    const l = listaDoPortal(VAGAS, {});
    expect(l.itens.map((v) => v.id)).toEqual(["v1", "v3", "v2", "v4"]);
    expect(l.escolhida?.id).toBe("v1");
    expect(l.temMais).toBe(false);
  });

  it("prazo acabando: as com prazo, do mais perto; depois as sem prazo, das mais novas", () => {
    expect(ids({ ordem: "prazo" })).toEqual(["v2", "v1", "v3", "v4"]);
  });

  it("filtros: busca, cidade ou estado (texto livre), modelo, contrato, área e empresa", () => {
    expect(ids({ q: "dp" })).toEqual(["v2", "v4"]);
    expect(ids({ local: "joinville" })).toEqual(["v2"]);
    expect(ids({ local: "Curitiba, PR" })).toEqual(["v1", "v3"]);
    expect(ids({ local: "parana" })).toEqual(["v1", "v3", "v4"]);
    expect(ids({ local: "sao jose" })).toEqual(["v4"]);
    expect(ids({ modalidade: "remoto" })).toEqual(["v3"]);
    expect(ids({ contrato: "CLT", area: "departamento pessoal" })).toEqual(["v2", "v4"]);
    expect(ids({ empresa: "comercial norte" })).toEqual(["v2", "v4"]);
    expect(ids({ local: "manaus" })).toEqual([]);
  });

  it("a vaga escolhida (`?vaga=`) vale se passar nos filtros; senão, a primeira", () => {
    expect(listaDoPortal(VAGAS, { vaga: "v4" }).escolhida?.id).toBe("v4");
    expect(listaDoPortal(VAGAS, { vaga: "v4", modalidade: "REMOTO" }).escolhida?.id).toBe("v3");
    expect(listaDoPortal(VAGAS, { vaga: "nao-existe" }).escolhida?.id).toBe("v1");
    expect(listaDoPortal(VAGAS, { local: "manaus" }).escolhida).toBeNull();
  });

  it("mostrar mais: `pagina=N` mostra as N primeiras levas inteiras", () => {
    const muitas = Array.from({ length: 45 }, (_, i) => vaga({ id: `x${i}`, openedAt: new Date(Date.UTC(2026, 9, 1, i)) }));
    const p1 = listaDoPortal(muitas, {});
    expect([p1.itens.length, p1.pagina, p1.temMais]).toEqual([20, 1, true]);
    const p2 = listaDoPortal(muitas, { pagina: "2" });
    expect([p2.itens.length, p2.pagina, p2.temMais]).toEqual([40, 2, true]);
    const p3 = listaDoPortal(muitas, { pagina: "9" });
    expect([p3.itens.length, p3.pagina, p3.temMais]).toEqual([45, 3, false]);
    expect(listaDoPortal(muitas, { pagina: "abc" }).itens).toHaveLength(20);
  });
});

describe("as opções dos filtros, com quantas vagas cada uma teria", () => {
  it("contadas sobre os outros filtros escolhidos", () => {
    const f = lerFiltros({ area: "Departamento Pessoal" });
    expect(opcoesComContagem(VAGAS, f, "modalidade")).toEqual([
      { valor: "PRESENCIAL", rotulo: "Presencial", vagas: 1 },
      { valor: "HIBRIDO", rotulo: "Híbrido", vagas: 1 },
    ]);
    // A própria dimensão não se filtra: as áreas continuam todas à escolha.
    expect(opcoesComContagem(VAGAS, f, "area").map((o) => o.valor)).toEqual(["Contábil", "Departamento Pessoal", "Fiscal"]);
  });
});
