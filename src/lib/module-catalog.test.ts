import { describe, expect, it } from "vitest";
import {
  MODULE_CATALOG,
  MODULE_ROUTES,
  ORDEM_DOS_GRUPOS,
  agruparModulos,
  getModuleDef,
  getModulesForSector,
} from "./module-catalog";
import { DEFAULT_SECTORS } from "./sector-constants";

// O comentário do próprio `module-catalog.ts` conta o defeito que estes testes
// existem para impedir: "duas cópias de um de-para é como um módulo novo aparece
// no menu e não abre". O catálogo e as rotas são essas duas cópias.

describe("catálogo de módulos", () => {
  it("todo módulo tem rota", () => {
    const semRota = MODULE_CATALOG.filter((m) => !MODULE_ROUTES[m.code]).map((m) => m.code);
    expect(semRota).toEqual([]);
  });

  it("toda rota pertence a um módulo do catálogo", () => {
    const orfas = Object.keys(MODULE_ROUTES).filter((code) => !getModuleDef(code));
    expect(orfas).toEqual([]);
  });

  it("código de módulo não se repete", () => {
    const codes = MODULE_CATALOG.map((m) => m.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  // Módulo apontando para setor inexistente some da sidebar sem erro nenhum:
  // `getModulesForSector` só devolve lista vazia.
  it("todo módulo aponta para um setor que existe", () => {
    const setores = new Set(DEFAULT_SECTORS.map((s) => s.code));
    const forasteiros = MODULE_CATALOG.filter((m) => !setores.has(m.sectorCode)).map(
      (m) => `${m.code} -> ${m.sectorCode}`
    );
    expect(forasteiros).toEqual([]);
  });

  it("rota começa com barra", () => {
    const tortas = Object.entries(MODULE_ROUTES).filter(([, r]) => !r.startsWith("/"));
    expect(tortas).toEqual([]);
  });

  it("Documentos Fiscais entrou no setor fiscal", () => {
    const fiscais = getModulesForSector("fiscal").map((m) => m.code);
    expect(fiscais).toContain("fiscal_documentos");
  });

  // As telas novas derivam o setor do catálogo (`getModuleDef(MODULE).sectorCode`)
  // em vez de cravar "societario": se o módulo sumir ou mudar de setor, é aqui
  // que precisa quebrar primeiro, e não num `!` em produção.
  it("as visões do Societário estão no catálogo, no setor societário", () => {
    for (const code of ["societario_minha_area", "societario_prazos", "societario_relatorios"]) {
      expect(getModuleDef(code)?.sectorCode).toBe("societario");
    }
  });

  // Nasce desligado de propósito: a tela é a etapa 3 e o acervo depende da
  // ponte com o SPED. Ligar antes entregaria uma rota que ainda não existe.
  // A conciliação é BPO operacional, ligada por padrão como contas e fluxo:
  // sem ela o fluxo de caixa continua sem saldo bancário para ancorar.
  it("Conciliação bancária está no BPO, em /conciliacao, ligada por padrão", () => {
    expect(getModuleDef("bpo_conciliacao")).toMatchObject({ sectorCode: "bpo", defaultEnabled: true });
    expect(MODULE_ROUTES.bpo_conciliacao).toBe("/conciliacao");
  });

  // As duas primeiras telas em que o cliente escreve pelo portal. Ligadas por
  // padrão: sem alçada cadastrada nada entra em aprovação, e pendência só existe
  // quando alguém abre uma.
  it("Pendências e Aprovações estão no BPO, com rota, ligadas por padrão", () => {
    expect(getModuleDef("bpo_pendencias")).toMatchObject({ sectorCode: "bpo", defaultEnabled: true });
    expect(getModuleDef("bpo_aprovacoes")).toMatchObject({ sectorCode: "bpo", defaultEnabled: true });
    expect(MODULE_ROUTES.bpo_pendencias).toBe("/pendencias");
    expect(MODULE_ROUTES.bpo_aprovacoes).toBe("/aprovacoes");
  });

  // A régua de e-mail é que nasce desligada (por tenant); a fila só lê vencidos.
  it("Cobrança está no BPO, em /cobranca, ligada por padrão", () => {
    expect(getModuleDef("bpo_cobranca")).toMatchObject({ sectorCode: "bpo", defaultEnabled: true, label: "Cobrança" });
    expect(MODULE_ROUTES.bpo_cobranca).toBe("/cobranca");
  });

  // Entrega de DRE como a econômica e as análises: nasce desligada.
  it("Orçamento está no BPO, em /dre/orcamento, desligado por padrão", () => {
    expect(getModuleDef("dre_orcamento")).toMatchObject({ sectorCode: "bpo", defaultEnabled: false, label: "Orçamento" });
    expect(MODULE_ROUTES.dre_orcamento).toBe("/dre/orcamento");
  });

  it("Documentos Fiscais nasce desligado", () => {
    expect(getModuleDef("fiscal_documentos")?.defaultEnabled).toBe(false);
  });
});

// Grupo fora da ordem não aparece na sidebar nem no hub do setor: `agruparModulos`
// percorre `ORDEM_DOS_GRUPOS`, então o item cairia num grupo que ninguém desenha.
// É a mesma classe de defeito das duas cópias do de-para, uma casa adiante.
describe("grupos dos módulos", () => {
  it("todo grupo usado está na ordem de exibição", () => {
    const fora = MODULE_CATALOG.filter((m) => !ORDEM_DOS_GRUPOS.includes(m.group)).map((m) => `${m.code} -> ${m.group}`);
    expect(fora).toEqual([]);
  });

  it("agrupar não perde módulo, e respeita a ordem dos grupos", () => {
    for (const setor of new Set(MODULE_CATALOG.map((m) => m.sectorCode))) {
      const modulos = getModulesForSector(setor);
      const grupos = agruparModulos(modulos);
      expect(grupos.flatMap((g) => g.itens.map((i) => i.code)).sort()).toEqual(modulos.map((m) => m.code).sort());
      const posicoes = grupos.map((g) => ORDEM_DOS_GRUPOS.indexOf(g.grupo));
      expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b));
    }
  });

  it("código fora do catálogo não desaparece do menu", () => {
    const grupos = agruparModulos([{ code: "modulo_que_nao_existe" }]);
    expect(grupos).toEqual([{ grupo: "Apoio", itens: [{ code: "modulo_que_nao_existe" }] }]);
  });

  it("o BPO abre pelas contas, e o resultado vem depois do operacional", () => {
    const grupos = agruparModulos(getModulesForSector("bpo")).map((g) => g.grupo);
    expect(grupos[0]).toBe("Contas");
    expect(grupos.indexOf("Resultado")).toBeGreaterThan(grupos.indexOf("Banco e caixa"));
    // Quinze telas em cinco ou seis grupos: é o que tira a lista única da sidebar.
    expect(grupos.length).toBeGreaterThanOrEqual(5);
  });
});
