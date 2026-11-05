import { describe, expect, it } from "vitest";
import { calcularDre, type ResultadoDoDre } from "./calculo";
import { modeloDoCodigo, opcoesDaUrl } from "./estrutura";
import { diferencasDaDre, fotoDoJson, regimeDoResultado, resultadoDaFoto, type FotoDaDre } from "./publicacao";
import { lerDreDoCliente, mesMaisRecentePublicado, type Publicacao } from "./doClientePublicado";

// A foto guarda os totais por grupo e as categorias; o portal remonta as
// linhas. Os testes partem de resultados de verdade (`calcularDre`) para a
// foto não poder divergir do que a equipe vê.

const PADRAO = modeloDoCodigo("padrao");
const RECEITA = PADRAO.grupos.find((g) => g.origem === "recebimento")!.code;
const DESPESA = PADRAO.grupos.find((g) => g.origem === "pagamento")!.code;

function resultado(receita: number, despesa: number, categoriaDaDespesa = "Aluguel"): ResultadoDoDre {
  const r: ResultadoDoDre = calcularDre([], new Map<string, string>(), opcoesDaUrl(undefined, PADRAO));
  const porGrupo = { ...r.porGrupo, [RECEITA]: receita, [DESPESA]: -despesa };
  return {
    ...r,
    porGrupo,
    porCategoria: {
      [RECEITA]: [{ categoria: "Vendas", centavos: receita, origem: "recebimento" }],
      [DESPESA]: [{ categoria: categoriaDaDespesa, centavos: -despesa, origem: "pagamento" }],
    },
  };
}

function foto(receita: number, despesa: number, extra: Partial<FotoDaDre> = {}): FotoDaDre {
  return {
    versao: 1,
    modelo: "padrao",
    caixa: regimeDoResultado(resultado(receita, despesa), receita !== 0 || despesa !== 0),
    competencia: regimeDoResultado(resultado(receita, despesa), receita !== 0 || despesa !== 0),
    ...extra,
  };
}

const linha = (r: ResultadoDoDre, code: string) => r.linhas.find((l) => l.code === code)?.centavos;

describe("a foto", () => {
  it("remonta as mesmas linhas que o cálculo da equipe", () => {
    const r = resultado(1_000_00, 400_00);
    const f: FotoDaDre = { versao: 1, modelo: "padrao", caixa: regimeDoResultado(r, true), competencia: regimeDoResultado(r, true) };
    const remontado = resultadoDaFoto(f, "caixa");
    // Os totais por grupo são os mesmos; as linhas (subtotais, percentuais)
    // saem do mesmo `montarLinhas` com as opções do cliente.
    const daEquipe = calcularDre([], new Map<string, string>(), opcoesDaUrl(undefined, PADRAO));
    expect(remontado.porGrupo).toEqual(r.porGrupo);
    expect(remontado.porCategoria).toEqual(r.porCategoria);
    expect(remontado.linhas.map((l) => l.code)).toEqual(daEquipe.linhas.map((l) => l.code));
    expect(linha(remontado, PADRAO.linhaDoResultado)).toBe(600_00);
  });

  it("volta do JSON do banco; foto estranha vira null, e não relatório errado", () => {
    const f = foto(100, 50);
    expect(fotoDoJson(JSON.parse(JSON.stringify(f)))).toEqual(f);
    expect(fotoDoJson(null)).toBeNull();
    expect(fotoDoJson({ ...f, versao: 2 })).toBeNull();
    expect(fotoDoJson({ ...f, modelo: "inventado" })).toBeNull();
    expect(fotoDoJson({ ...f, caixa: { porGrupo: {} } })).toBeNull();
    // A competência é opcional: sem ela, o regime vem vazio.
    const soCaixa: Partial<FotoDaDre> = { ...f };
    delete soCaixa.competencia;
    expect(fotoDoJson(soCaixa)?.competencia.temMovimento).toBe(false);
  });
});

describe("diferencasDaDre", () => {
  it("igual ao portal: nada a publicar", () => {
    expect(diferencasDaDre(foto(1_000_00, 400_00), foto(1_000_00, 400_00))).toEqual([]);
  });

  it("um valor mudou: a linha dele e os subtotais que ele move, nos dois regimes", () => {
    const d = diferencasDaDre(foto(1_000_00, 400_00), foto(1_000_00, 450_00));
    const doCaixa = d.filter((x) => x.tipo === "linha" && x.regime === "caixa");
    expect(doCaixa.length).toBeGreaterThan(1);
    const resultadoDoMes = doCaixa.find((x) => x.tipo === "linha" && x.codigo === PADRAO.linhaDoResultado);
    expect(resultadoDoMes).toMatchObject({ noPortal: 600_00, agora: 550_00 });
    expect(d.some((x) => x.tipo === "linha" && x.regime === "competencia")).toBe(true);
  });

  it("nunca publicado: toda linha com valor é diferença, com o portal vazio", () => {
    const d = diferencasDaDre(null, foto(1_000_00, 400_00));
    expect(d.length).toBeGreaterThan(0);
    expect(d.every((x) => x.tipo === "linha" && x.noPortal === null)).toBe(true);
  });

  it("nunca publicado e sem movimento: nada", () => {
    expect(diferencasDaDre(null, foto(0, 0))).toEqual([]);
  });

  it("o mesmo total com as categorias trocadas também conta", () => {
    const portal = foto(1_000_00, 400_00);
    const agora: FotoDaDre = {
      ...portal,
      caixa: regimeDoResultado(resultado(1_000_00, 400_00, "Aluguel da loja"), true),
    };
    const d = diferencasDaDre(portal, agora);
    expect(d).toEqual([{ tipo: "categorias", regime: "caixa", grupo: DESPESA, rotulo: PADRAO.grupos.find((g) => g.code === DESPESA)!.label }]);
  });

  it("o modelo da DRE trocado aparece como diferença própria", () => {
    const d = diferencasDaDre(foto(100, 50), foto(100, 50, { modelo: "por_area" }));
    expect(d[0]).toEqual({ tipo: "modelo", noPortal: "padrao", agora: "por_area" });
  });
});

// ─── O que o portal lê ──────────────────────────────────────────────────────

function pub(competencia: string, f: FotoDaDre, publicadoEm = new Date("2026-11-03T15:00:00Z")): Publicacao {
  return { competencia, foto: f, inicial: false, publicadoEm, publicadoPorNome: "Equipe" };
}
const mapa = (...lista: Publicacao[]) => new Map(lista.map((p) => [p.competencia, p]));

describe("lerDreDoCliente", () => {
  const set = pub("2026-09", foto(800_00, 300_00), new Date("2026-10-05T12:00:00Z"));
  const out = pub("2026-10", foto(1_000_00, 400_00), new Date("2026-11-03T12:00:00Z"));

  it("sem mês pedido, abre no mais recente publicado — e não no mais recente ao vivo", () => {
    const l = lerDreDoCliente(mapa(set, out), {}, "caixa");
    expect(l.tipo === "mes" && l.mes).toBe("2026-10");
    expect(mesMaisRecentePublicado(mapa(set).values(), "caixa")).toBe("2026-09");
  });

  it("o mês publicado: o resultado da foto, o anterior publicado e o dia da publicação", () => {
    const l = lerDreDoCliente(mapa(set, out), { mes: "2026-10" }, "caixa");
    if (l.tipo !== "mes" || !l.publicada) throw new Error("esperava o mês publicado");
    expect(linha(l.publicada.resultado, PADRAO.linhaDoResultado)).toBe(600_00);
    expect(l.publicada.anterior && linha(l.publicada.anterior, PADRAO.linhaDoResultado)).toBe(500_00);
    expect(l.publicada.atualizadaEm).toEqual(new Date("2026-11-03T12:00:00Z"));
  });

  it("o mês que a equipe ainda não publicou não mostra nada ao cliente", () => {
    const l = lerDreDoCliente(mapa(set), { mes: "2026-10" }, "caixa");
    expect(l).toEqual({ tipo: "mes", mes: "2026-10", publicada: null });
  });

  it("sem anterior publicado, sem comparação", () => {
    const l = lerDreDoCliente(mapa(out), { mes: "2026-10" }, "caixa");
    expect(l.tipo === "mes" && l.publicada?.anterior).toBeNull();
  });

  it("nenhum mês publicado", () => {
    expect(lerDreDoCliente(new Map(), {}, "caixa")).toEqual({ tipo: "nenhum" });
  });

  it("o ano inteiro: os meses publicados lado a lado, atualizado na publicação mais recente", () => {
    const l = lerDreDoCliente(mapa(set, out, pub("2025-12", foto(5_00, 0))), { ano: 2026 }, "caixa");
    if (l.tipo !== "ano" || !l.anual) throw new Error("esperava o ano");
    expect(l.anual.mesesComMovimento).toBe(2);
    expect(l.atualizadaEm).toEqual(new Date("2026-11-03T12:00:00Z"));
    const total = l.anual.colunas.find((c) => c.rotulo === "Ano");
    expect(total && linha({ linhas: total.linhas } as ResultadoDoDre, PADRAO.linhaDoResultado)).toBe(1_100_00);
  });

  it("o regime da aba: competência lê a parte de competência da foto", () => {
    const soCaixa: FotoDaDre = { ...foto(1_000_00, 400_00), competencia: { porGrupo: {}, porCategoria: {}, temMovimento: false } };
    const l = lerDreDoCliente(mapa(pub("2026-10", soCaixa)), { mes: "2026-10" }, "competencia");
    expect(l.tipo === "mes" && l.publicada?.temMovimento).toBe(false);
  });
});
