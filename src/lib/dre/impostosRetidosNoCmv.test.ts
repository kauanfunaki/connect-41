import { describe, expect, it } from "vitest";
import { IMPOSTOS_RETIDOS_NO_CMV, ehImpostosRetidosServicosTomados, pareceImpostoRetido } from "./impostosRetidosNoCmv";
import {
  ACAO_DA_CORRECAO,
  deParaDaLinha as deParaDaLinhaDe,
  detalhesDaAuditoria as detalhesDaAuditoriaDe,
  impactoNaDre as impactoNaDreDe,
  planejarCorrecao as planejarCorrecaoDe,
  type Achado,
  type CategoriaLida,
  type ExcecaoLida,
  type PlanoDaCorrecao,
  type ValorPago,
} from "./correcaoDaLinha";

// A regra comum (`correcaoDaLinha.ts`) com a correção destes impostos.
const planejarCorrecao = (categorias: CategoriaLida[], excecoes: ExcecaoLida[]) =>
  planejarCorrecaoDe(IMPOSTOS_RETIDOS_NO_CMV, categorias, excecoes);
const deParaDaLinha = (a: Achado) => deParaDaLinhaDe(IMPOSTOS_RETIDOS_NO_CMV, a);
const detalhesDaAuditoria = (a: Achado) => detalhesDaAuditoriaDe(IMPOSTOS_RETIDOS_NO_CMV, a);
const impactoNaDre = (categorias: CategoriaLida[], excecoes: ExcecaoLida[], plano: PlanoDaCorrecao, valores: ValorPago[]) =>
  impactoNaDreDe(IMPOSTOS_RETIDOS_NO_CMV, categorias, excecoes, plano, valores);
import { MAPEAMENTO_PADRAO } from "./mapeamento-padrao";
import { categoriasParaCriar } from "./categoriasDoImport";
import { chaveDaCategoria } from "./calculo";
import { PLANO_PADRAO_41 } from "@/lib/financeiro/planoPadrao";
import { planejarCarga } from "@/lib/financeiro/carregarPlanoPadrao";
import { ACOES, areaDaAcao } from "@/lib/auditoria/acoes";
import { mudancasDoRegistro } from "@/lib/auditoria/metadados";

const NOME_DO_PADRAO = "Impostos Retidos Serviços Tomados (PIS/COFINS/CSLL/IRRF)";
const NOME_DA_IRRIGA = "Impostos Retidos Serviços Tomados";

describe("o padrão novo", () => {
  it("o plano padrão da 41 põe a categoria no CMV, e o grupo do plano continua Impostos", () => {
    const c = PLANO_PADRAO_41.find((p) => p.nome === NOME_DO_PADRAO);
    expect(c).toMatchObject({ kind: "PAGAR", grupo: "Impostos", dre: "cmv" });
  });

  it("nenhuma outra categoria do plano padrão saiu dos impostos", () => {
    const impostos = PLANO_PADRAO_41.filter((p) => p.dre === "impostos").map((p) => p.nome);
    expect(impostos).not.toContain(NOME_DO_PADRAO);
    expect(impostos).toContain("Impostos Federais - PIS");
    expect(impostos).toContain("Impostos Municipais - ISS");
  });

  it("o de-para do Omie classifica os dois nomes no CMV", () => {
    const grupo = new Map(MAPEAMENTO_PADRAO.map((p) => [chaveDaCategoria(p.categoria), p.grupo]));
    expect(grupo.get(chaveDaCategoria(NOME_DA_IRRIGA))).toBe("cmv");
    expect(grupo.get(chaveDaCategoria(NOME_DO_PADRAO))).toBe("cmv");
  });

  it("o arquivo do Omie que traz o nome do padrão cria a categoria já no CMV", () => {
    expect(categoriasParaCriar([NOME_DO_PADRAO], [], "pagamento")).toEqual([
      { name: NOME_DO_PADRAO, kind: "PAGAR", dreGroup: "cmv" },
    ]);
  });

  it("carregar o plano padrão de novo não desfaz a correção", () => {
    const carga = planejarCarga(
      [{ id: "x", name: NOME_DO_PADRAO, kind: "PAGAR", planGroup: "Impostos", dreGroup: "cmv" }],
      PLANO_PADRAO_41
    );
    expect(carga.completar.find((m) => m.id === "x")).toBeUndefined();
    expect(carga.criar.find((c) => c.nome === NOME_DO_PADRAO)).toBeUndefined();
  });

  it("e não corrige sozinho o que já está gravado em impostos — é o que o script faz", () => {
    const carga = planejarCarga(
      [{ id: "x", name: NOME_DO_PADRAO, kind: "PAGAR", planGroup: "Impostos", dreGroup: "impostos" }],
      PLANO_PADRAO_41
    );
    expect(carga.completar.find((m) => m.id === "x")).toBeUndefined();
  });

  it("escritório sem a categoria recebe ela já no CMV", () => {
    const carga = planejarCarga([], PLANO_PADRAO_41);
    expect(carga.criar.find((c) => c.nome === NOME_DO_PADRAO)?.dre).toBe("cmv");
  });
});

describe("o nome da categoria", () => {
  it.each([
    NOME_DO_PADRAO,
    NOME_DA_IRRIGA,
    "impostos retidos servicos tomados",
    "IMPOSTOS RETIDOS SERVIÇOS TOMADOS (PIS/COFINS/CSLL/IRRF)",
    "Impostos  Retidos   Serviços Tomados ( PIS / COFINS / CSLL / IRRF )",
    "Impostos Retidos Serviços Tomados - PIS/COFINS",
    "Impostos Retidos Serviços Tomados (PIS, COFINS, CSSL, IRRF)",
    "  Impostos Retidos Servicos Tomados(PIS/COFINS/CSLL/IRRF)  ",
  ])("casa: %s", (nome) => {
    expect(ehImpostosRetidosServicosTomados(nome)).toBe(true);
  });

  it.each([
    "Impostos Retidos Serviços Tomados (ISS)",
    "Impostos Retidos Serviços Tomados (PIS/COFINS/INSS)",
    "Impostos Retidos Serviços Tomadosx",
    "Impostos Retidos Serviços",
    "Impostos Federais - PIS",
    "ISS Retido",
    "Serviços Tomados",
  ])("não casa: %s", (nome) => {
    expect(ehImpostosRetidosServicosTomados(nome)).toBe(false);
  });

  it("imposto retido de outro tipo sai como parecido, a categoria não", () => {
    expect(pareceImpostoRetido("ISS Retido")).toBe(true);
    expect(pareceImpostoRetido("Retenção de INSS")).toBe(true);
    expect(pareceImpostoRetido("Impostos Retidos Serviços Tomados (ISS)")).toBe(true);
    expect(pareceImpostoRetido(NOME_DO_PADRAO)).toBe(false);
    expect(pareceImpostoRetido("Aluguel")).toBe(false);
  });
});

// Um escritório (t1) com o padrão e três empresas; outro escritório (t2) com o
// mesmo padrão já corrigido à mão.
function cenario(): { categorias: CategoriaLida[]; excecoes: ExcecaoLida[] } {
  return {
    categorias: [
      { id: "pad", tenantId: "t1", companyId: null, name: NOME_DO_PADRAO, kind: "PAGAR", dreGroup: "impostos" },
      // Irriga: o nome sem as siglas, com o rótulo digitado em vez do código.
      { id: "irr", tenantId: "t1", companyId: "irriga", name: NOME_DA_IRRIGA, kind: "PAGAR", dreGroup: "Impostos sobre Receita Bruta" },
      // Empresa que pôs a dela em outra linha de propósito.
      { id: "out", tenantId: "t1", companyId: "outra", name: "impostos retidos servicos tomados", kind: "PAGAR", dreGroup: "outras_despesas" },
      // Criada pelo Omie sem linha: fica na fila.
      { id: "sem", tenantId: "t1", companyId: "semlinha", name: NOME_DO_PADRAO, kind: "PAGAR", dreGroup: null },
      { id: "t2pad", tenantId: "t2", companyId: null, name: NOME_DO_PADRAO, kind: "PAGAR", dreGroup: "cmv" },
      // Outra categoria qualquer, que não entra.
      { id: "pis", tenantId: "t1", companyId: null, name: "Impostos Federais - PIS", kind: "PAGAR", dreGroup: "impostos" },
    ],
    excecoes: [
      // Exceção apontando para impostos: muda.
      { id: "ex1", tenantId: "t1", companyId: "comexcecao", categoryId: "pad", grupo: "impostos" },
      // Exceção deliberada para outra linha: fica.
      { id: "ex2", tenantId: "t1", companyId: "deliberada", categoryId: "pad", grupo: "administrativas" },
      // Exceção de outra categoria: não é desta correção.
      { id: "ex3", tenantId: "t1", companyId: "comexcecao", categoryId: "pis", grupo: "cmv" },
    ],
  };
}

describe("planejarCorrecao", () => {
  it("muda só o que está em impostos — padrão, categoria da empresa e exceção", () => {
    const { categorias, excecoes } = cenario();
    const p = planejarCorrecao(categorias, excecoes);
    expect(p.mudar.map((a) => [a.tabela, a.id, a.onde])).toEqual([
      ["categoria", "pad", "plano do escritório"],
      ["categoria", "irr", "plano da empresa"],
      ["excecao", "ex1", "exceção da empresa"],
    ]);
    expect(p.mudar.every((a) => a.grupo === "impostos")).toBe(true);
  });

  it("o que já está no CMV, em outra linha ou sem linha fica — e é relatado", () => {
    const { categorias, excecoes } = cenario();
    const p = planejarCorrecao(categorias, excecoes);
    expect(p.jaNoDestino.map((a) => a.id)).toEqual(["t2pad"]);
    expect(p.outraLinha.map((a) => a.id)).toEqual(["out", "ex2"]);
    expect(p.semLinha.map((a) => a.id)).toEqual(["sem"]);
  });

  it("texto que a DRE não reconhece não é tratado como impostos", () => {
    const p = planejarCorrecao(
      [{ id: "a", tenantId: "t1", companyId: null, name: NOME_DO_PADRAO, kind: "PAGAR", dreGroup: "Impostos diversos" }],
      []
    );
    expect(p.mudar).toEqual([]);
    expect(p.outraLinha.map((a) => a.valor)).toEqual(["Impostos diversos"]);
  });

  it("rodar de novo depois de aplicar não acha nada para mudar", () => {
    const { categorias, excecoes } = cenario();
    const p = planejarCorrecao(categorias, excecoes);
    const trocadas = new Set(p.mudar.map((a) => a.id));
    const depois = planejarCorrecao(
      categorias.map((c) => (trocadas.has(c.id) ? { ...c, dreGroup: "cmv" } : c)),
      excecoes.map((e) => (trocadas.has(e.id) ? { ...e, grupo: "cmv" } : e))
    );
    expect(depois.mudar).toEqual([]);
    expect(depois.jaNoDestino.map((a) => a.id).sort()).toEqual(["ex1", "irr", "pad", "t2pad"]);
    expect(depois.outraLinha.map((a) => a.id)).toEqual(["out", "ex2"]);
  });
});

describe("a auditoria da troca", () => {
  it("o código tem frase em português, é edição e fica no BPO", () => {
    expect(ACOES[ACAO_DA_CORRECAO]).toEqual({ tipo: "editou", frase: "corrigiu a linha da DRE da categoria" });
    expect(areaDaAcao(ACAO_DA_CORRECAO)).toBe("bpo");
  });

  it("os detalhes mostram o \"de → para\" da linha da DRE na linha do tempo", () => {
    const { categorias, excecoes } = cenario();
    const p = planejarCorrecao(categorias, excecoes);
    const irriga = p.mudar.find((a) => a.id === "irr")!;
    const detalhes = detalhesDaAuditoria(irriga);
    expect(detalhes).toMatchObject({
      nome: NOME_DA_IRRIGA,
      companyId: "irriga",
      onde: "plano da empresa",
      linhaDaDre: "Impostos sobre Receita Bruta → CMV sobre Receita Bruta",
      gravadoAntes: "Impostos sobre Receita Bruta",
    });
    expect(detalhes.motivo.length).toBeLessThanOrEqual(140);
    expect(mudancasDoRegistro(ACAO_DA_CORRECAO, detalhes)).toEqual([
      { campo: "Linha da DRE", de: "Impostos sobre Receita Bruta", para: "CMV sobre Receita Bruta" },
    ]);
  });

  it("a do padrão do escritório não leva empresa", () => {
    const { categorias, excecoes } = cenario();
    const padrao = planejarCorrecao(categorias, excecoes).mudar.find((a) => a.id === "pad")!;
    expect(detalhesDaAuditoria(padrao)).not.toHaveProperty("companyId");
    expect(deParaDaLinha(padrao)).toBe("Impostos sobre Receita Bruta → CMV sobre Receita Bruta");
  });
});

describe("impactoNaDre", () => {
  const pago = (companyId: string, mes: number, centavos: number, alvo: { categoryId: string } | { nome: string }, origem: ValorPago["origem"] = "pagamento"): ValorPago => ({
    tenantId: "t1",
    companyId,
    ano: 2026,
    mes,
    centavos,
    origem,
    ...alvo,
  });

  it("conta o que sai de impostos e entra no CMV, por empresa e mês", () => {
    const { categorias, excecoes } = cenario();
    const plano = planejarCorrecao(categorias, excecoes);
    const r = impactoNaDre(categorias, excecoes, plano, [
      // Empresa sem exceção: segue o padrão, que muda.
      pago("comum", 8, -10000, { categoryId: "pad" }),
      pago("comum", 8, -2550, { categoryId: "pad" }),
      pago("comum", 9, -500, { categoryId: "pad" }),
      // Exceção em impostos, que também muda.
      pago("comexcecao", 9, -700, { categoryId: "pad" }),
      // Exceção deliberada em administrativas: a DRE dela não muda.
      pago("deliberada", 9, -9999, { categoryId: "pad" }),
      // O arquivo traz o nome sem as siglas, que casa com a categoria da
      // empresa — e ela está em outra linha de propósito.
      pago("outra", 9, -8888, { nome: "Impostos Retidos Serviços Tomados" }),
      // Arquivo do Omie da Irriga, pelo nome sem as siglas.
      pago("irriga", 8, -3000, { nome: "IMPOSTOS RETIDOS SERVICOS TOMADOS" }),
      // Recebimento não soma em grupo de pagamento, antes nem depois.
      pago("comum", 9, 1234, { categoryId: "pad" }, "recebimento"),
    ]);
    expect(r).toEqual([
      { tenantId: "t1", companyId: "comexcecao", ano: 2026, mes: 9, centavos: -700 },
      { tenantId: "t1", companyId: "comum", ano: 2026, mes: 8, centavos: -12550 },
      { tenantId: "t1", companyId: "comum", ano: 2026, mes: 9, centavos: -500 },
      { tenantId: "t1", companyId: "irriga", ano: 2026, mes: 8, centavos: -3000 },
    ]);
  });

  it("categoria da empresa sem linha e com o nome do padrão segue a linha do padrão — e muda junto", () => {
    // Como em `data.ts`: categoria sem grupo não entra no mapa por nome, e o
    // nome cai na do padrão. Acontece com a que o Omie criou antes de o plano
    // padrão ser carregado (25/09 × 28/09).
    const { categorias, excecoes } = cenario();
    const plano = planejarCorrecao(categorias, excecoes);
    expect(impactoNaDre(categorias, excecoes, plano, [pago("semlinha", 9, -4444, { categoryId: "sem" })])).toEqual([
      { tenantId: "t1", companyId: "semlinha", ano: 2026, mes: 9, centavos: -4444 },
    ]);
  });

  it("valor de categoria que a empresa não enxerga não conta (a DRE o põe em sem categoria)", () => {
    const { categorias, excecoes } = cenario();
    const plano = planejarCorrecao(categorias, excecoes);
    expect(impactoNaDre(categorias, excecoes, plano, [pago("comum", 9, -100, { categoryId: "irr" })])).toEqual([]);
  });

  it("depois de aplicado, nada mais muda de linha", () => {
    const { categorias, excecoes } = cenario();
    const plano = planejarCorrecao(categorias, excecoes);
    const trocadas = new Set(plano.mudar.map((a) => a.id));
    const cats = categorias.map((c) => (trocadas.has(c.id) ? { ...c, dreGroup: "cmv" } : c));
    const exc = excecoes.map((e) => (trocadas.has(e.id) ? { ...e, grupo: "cmv" } : e));
    const r = impactoNaDre(cats, exc, planejarCorrecao(cats, exc), [pago("comum", 8, -10000, { categoryId: "pad" })]);
    expect(r).toEqual([]);
  });
});
