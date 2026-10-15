import { describe, expect, it } from "vitest";
import { PEDAGIO_NAS_ADMINISTRATIVAS, ehPedagio, pareceComPedagio } from "./pedagioNasAdministrativas";
import {
  deParaDaLinha,
  detalhesDaAuditoria,
  impactoNaDre,
  planejarCorrecao,
  type CategoriaLida,
  type ExcecaoLida,
  type ValorPago,
} from "./correcaoDaLinha";
import { MAPEAMENTO_PADRAO } from "./mapeamento-padrao";
import { categoriasParaCriar } from "./categoriasDoImport";
import { calcularDre, chaveDaCategoria, montarMapeamento } from "./calculo";
import { PLANO_PADRAO_41 } from "@/lib/financeiro/planoPadrao";
import { planejarCarga } from "@/lib/financeiro/carregarPlanoPadrao";

const C = PEDAGIO_NAS_ADMINISTRATIVAS;

// Pedido de 15/10/2026: "Pedágio tem que entrar na categoria DESPESAS FIXAS
// (ADMINISTRATIVAS)".
describe("o padrão novo", () => {
  it("o plano padrão da 41 põe o Pedágio nas administrativas, e o grupo do plano continua o da planilha", () => {
    expect(PLANO_PADRAO_41.find((p) => p.nome === "Pedágio")).toMatchObject({
      kind: "PAGAR",
      grupo: "CMV / CSV",
      dre: "administrativas",
    });
  });

  it("o resto do CMV / CSV do plano continua no CMV", () => {
    const doGrupo = PLANO_PADRAO_41.filter((p) => p.grupo === "CMV / CSV" && p.nome !== "Pedágio");
    expect(doGrupo.length).toBeGreaterThan(0);
    expect(doGrupo.every((p) => p.dre === "cmv")).toBe(true);
  });

  it("o de-para do Omie classifica o Pedágio nas administrativas", () => {
    const grupo = new Map(MAPEAMENTO_PADRAO.map((p) => [chaveDaCategoria(p.categoria), p.grupo]));
    expect(grupo.get(chaveDaCategoria("PEDAGIO"))).toBe("administrativas");
  });

  it("o arquivo do Omie que traz o Pedágio cria a categoria já nas administrativas", () => {
    expect(categoriasParaCriar(["Pedágio"], [], "pagamento")).toEqual([
      { name: "Pedágio", kind: "PAGAR", dreGroup: "administrativas" },
    ]);
  });

  it("na DRE, o pedágio soma nas Despesas Fixas (Administrativas), não no CMV", () => {
    const r = calcularDre([{ categoria: "Pedágio", valorCentavos: -12_345, origem: "pagamento" }], montarMapeamento(MAPEAMENTO_PADRAO));
    expect(r.porGrupo.administrativas).toBe(-12_345);
    expect(r.porGrupo.cmv).toBe(0);
  });

  it("escritório sem a categoria recebe ela já nas administrativas", () => {
    expect(planejarCarga([], PLANO_PADRAO_41).criar.find((c) => c.nome === "Pedágio")?.dre).toBe("administrativas");
  });

  it("e não corrige sozinho o que já está gravado no CMV — é o que o script faz", () => {
    const carga = planejarCarga(
      [{ id: "x", name: "Pedágio", kind: "PAGAR", planGroup: "CMV / CSV", dreGroup: "cmv" }],
      PLANO_PADRAO_41
    );
    expect(carga.completar.find((m) => m.id === "x")).toBeUndefined();
  });
});

describe("o nome da categoria", () => {
  it.each(["Pedágio", "PEDÁGIO", "pedagio", "  Pedágios ", "Pedagios"])("casa: %s", (nome) => {
    expect(ehPedagio(nome)).toBe(true);
  });

  it.each(["Vale-pedágio", "Pedágio - Sem Parar", "Pedágio e estacionamento", "Frete", "Estacionamento"])("não casa: %s", (nome) => {
    expect(ehPedagio(nome)).toBe(false);
  });

  it("o que fala de pedágio sem ser a categoria sai como parecido", () => {
    expect(pareceComPedagio("Vale-pedágio")).toBe(true);
    expect(pareceComPedagio("Pedágio - Sem Parar")).toBe(true);
    expect(pareceComPedagio("Pedágio")).toBe(false);
    expect(pareceComPedagio("Estacionamento")).toBe(false);
  });
});

// Um escritório (t1) com o plano padrão carregado antes da mudança e três
// empresas; outro escritório (t2) já corrigido à mão.
function cenario(): { categorias: CategoriaLida[]; excecoes: ExcecaoLida[] } {
  return {
    categorias: [
      { id: "pad", tenantId: "t1", companyId: null, name: "Pedágio", kind: "PAGAR", dreGroup: "cmv" },
      // Do Omie, com o rótulo digitado em vez do código.
      { id: "omie", tenantId: "t1", companyId: "transp", name: "PEDAGIO", kind: "PAGAR", dreGroup: "CMV sobre Receita Bruta" },
      // Empresa que pôs o dela em outra linha de propósito.
      { id: "out", tenantId: "t1", companyId: "outra", name: "pedágio", kind: "PAGAR", dreGroup: "comerciais" },
      { id: "t2pad", tenantId: "t2", companyId: null, name: "Pedágio", kind: "PAGAR", dreGroup: "administrativas" },
      // Outra do CMV, que não entra.
      { id: "pneu", tenantId: "t1", companyId: null, name: "Pneus", kind: "PAGAR", dreGroup: "cmv" },
    ],
    excecoes: [
      { id: "ex1", tenantId: "t1", companyId: "comexcecao", categoryId: "pad", grupo: "cmv" },
      { id: "ex2", tenantId: "t1", companyId: "deliberada", categoryId: "pad", grupo: "outras_despesas" },
    ],
  };
}

describe("a correção do que já está gravado", () => {
  it("muda só o que está no CMV — padrão, categoria da empresa e exceção", () => {
    const { categorias, excecoes } = cenario();
    const p = planejarCorrecao(C, categorias, excecoes);
    expect(p.mudar.map((a) => [a.tabela, a.id])).toEqual([
      ["categoria", "pad"],
      ["categoria", "omie"],
      ["excecao", "ex1"],
    ]);
    expect(p.jaNoDestino.map((a) => a.id)).toEqual(["t2pad"]);
    expect(p.outraLinha.map((a) => a.id)).toEqual(["out", "ex2"]);
  });

  it("a auditoria diz CMV → Administrativas, com motivo que cabe na linha do tempo", () => {
    const { categorias, excecoes } = cenario();
    const omie = planejarCorrecao(C, categorias, excecoes).mudar.find((a) => a.id === "omie")!;
    expect(deParaDaLinha(C, omie)).toBe("CMV sobre Receita Bruta → Despesas Fixas (Administrativas)");
    const detalhes = detalhesDaAuditoria(C, omie);
    expect(detalhes).toMatchObject({ nome: "PEDAGIO", companyId: "transp", gravadoAntes: "CMV sobre Receita Bruta" });
    expect(detalhes.motivo.length).toBeLessThanOrEqual(140);
  });

  it("conta o que sai do CMV e entra nas administrativas, e nada depois de aplicado", () => {
    const { categorias, excecoes } = cenario();
    const pago = (companyId: string, centavos: number, alvo: { categoryId: string } | { nome: string }): ValorPago => ({
      tenantId: "t1",
      companyId,
      ano: 2026,
      mes: 9,
      centavos,
      origem: "pagamento",
      ...alvo,
    });
    const valores = [
      pago("comum", -1_000, { categoryId: "pad" }),
      pago("comexcecao", -200, { categoryId: "pad" }),
      pago("deliberada", -9_999, { categoryId: "pad" }),
      pago("transp", -300, { nome: "Pedágio" }),
    ];
    const plano = planejarCorrecao(C, categorias, excecoes);
    expect(impactoNaDre(C, categorias, excecoes, plano, valores)).toEqual([
      { tenantId: "t1", companyId: "comexcecao", ano: 2026, mes: 9, centavos: -200 },
      { tenantId: "t1", companyId: "comum", ano: 2026, mes: 9, centavos: -1_000 },
      { tenantId: "t1", companyId: "transp", ano: 2026, mes: 9, centavos: -300 },
    ]);

    const trocadas = new Set(plano.mudar.map((a) => a.id));
    const cats = categorias.map((c) => (trocadas.has(c.id) ? { ...c, dreGroup: "administrativas" } : c));
    const exc = excecoes.map((e) => (trocadas.has(e.id) ? { ...e, grupo: "administrativas" } : e));
    expect(planejarCorrecao(C, cats, exc).mudar).toEqual([]);
    expect(impactoNaDre(C, cats, exc, planejarCorrecao(C, cats, exc), valores)).toEqual([]);
  });
});
