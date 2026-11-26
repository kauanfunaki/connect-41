import { describe, expect, it } from "vitest";
import { lerConfiguracao, paramsDaConfiguracao } from "./tabelaDinamica";
import {
  LIMITE_DE_MODELOS_PESSOAIS,
  configuracaoDoModelo,
  lerParametrosDoModelo,
  modeloAplicado,
  motivoParaNaoSalvar,
  novoModeloSchema,
  parametrosDoModelo,
  periodoSugerido,
  podeExcluirModelo,
  podeRenomearModelo,
  resumoDoModelo,
} from "./modelosDaTabela";

const HOJE = "2026-11-25";
const conf = (p: Record<string, string>, hoje = HOJE) => lerConfiguracao(p, hoje);

describe("parâmetros que o modelo guarda", () => {
  const tela = conf({ base: "contas", linhas: "grupo,categoria", coluna: "competencia", medida: "saldo", tipo: "PAGAR", situacao: "abertas", de: "2026-01", ate: "2026-03" });

  it("a montagem vai sempre; filtros e período só quando pedidos", () => {
    expect(parametrosDoModelo(tela, { periodo: "relativo", comFiltros: false })).toEqual({
      base: "contas",
      linhas: "grupo,categoria",
      coluna: "competencia",
      medida: "saldo",
    });
    expect(parametrosDoModelo(tela, { periodo: "fixo", comFiltros: true })).toEqual({
      base: "contas",
      linhas: "grupo,categoria",
      coluna: "competencia",
      medida: "saldo",
      tipo: "PAGAR",
      situacao: "abertas",
      de: "2026-01",
      ate: "2026-03",
    });
  });

  it("todo o histórico, fixo, guarda `periodo=todos`", () => {
    const semPeriodo = conf({ periodo: "todos" });
    expect(parametrosDoModelo(semPeriodo, { periodo: "fixo", comFiltros: true })).toMatchObject({ periodo: "todos" });
  });
});

describe("o JSON do banco não é confiável", () => {
  it("só chaves conhecidas, só texto curto", () => {
    expect(lerParametrosDoModelo({ base: "baixas", linhas: 3, hack: "x", medida: "a".repeat(500), tipo: "RECEBER" })).toEqual({
      base: "baixas",
      tipo: "RECEBER",
    });
    expect(lerParametrosDoModelo(null)).toEqual({});
    expect(lerParametrosDoModelo(["base"])).toEqual({});
    expect(lerParametrosDoModelo("base=contas")).toEqual({});
  });

  it("valor inválido cai no padrão, como num link antigo", () => {
    const m = { parametros: { base: "contas", linhas: "inexistente", coluna: "pagamento", medida: "liquido" }, periodo: "relativo" as const, comFiltros: true };
    const c = configuracaoDoModelo(m, conf({}), HOJE);
    expect(c.linhas).toEqual(["categoria"]);
    expect(c.coluna).toBeNull(); // "pagamento" não vale nas contas
    expect(c.medida).toBe("valor");
  });
});

describe("aplicar um modelo", () => {
  const atual = conf({ base: "contas", tipo: "RECEBER", situacao: "vencidas", de: "2025-01", ate: "2025-12" });

  it("período relativo: os últimos 6 meses de hoje", () => {
    const m = { parametros: { base: "contas", linhas: "categoria", coluna: "nenhuma", medida: "valor" }, periodo: "relativo" as const, comFiltros: true };
    expect(configuracaoDoModelo(m, atual, "2026-11-25").filtros).toMatchObject({ de: "2026-06", ate: "2026-11" });
    // Anda com o calendário.
    expect(configuracaoDoModelo(m, atual, "2027-02-01").filtros).toMatchObject({ de: "2026-09", ate: "2027-02" });
  });

  it("período fixo: o de/até guardado", () => {
    const m = { parametros: { base: "contas", linhas: "categoria", coluna: "nenhuma", medida: "valor", de: "2026-01", ate: "2026-03" }, periodo: "fixo" as const, comFiltros: true };
    expect(configuracaoDoModelo(m, atual, HOJE).filtros).toMatchObject({ de: "2026-01", ate: "2026-03" });
  });

  it("com os filtros guardados, eles trocam os da tela; sem eles, ficam os da tela", () => {
    const base = { base: "contas", linhas: "categoria", coluna: "nenhuma", medida: "valor" };
    const comFiltros = configuracaoDoModelo({ parametros: { ...base, tipo: "PAGAR" }, periodo: "relativo", comFiltros: true }, atual, HOJE);
    expect(comFiltros.filtros).toMatchObject({ tipo: "PAGAR", situacao: "todas" });
    const semFiltros = configuracaoDoModelo({ parametros: base, periodo: "relativo", comFiltros: false }, atual, HOJE);
    expect(semFiltros.filtros).toMatchObject({ tipo: "RECEBER", situacao: "vencidas" });
  });

  it("filtro que só as contas têm não sobra num modelo de baixas", () => {
    const m = { parametros: { base: "baixas", linhas: "categoria", coluna: "pagamento", medida: "valor" }, periodo: "relativo" as const, comFiltros: false };
    const c = configuracaoDoModelo(m, atual, HOJE);
    expect(c.base).toBe("baixas");
    expect(c.filtros).toMatchObject({ tipo: "RECEBER", situacao: "todas", periodoPor: "competencia" });
  });

  it("o modelo aplicado é o que daria a tabela da tela", () => {
    const meu = { id: "a", parametros: { base: "contas", linhas: "grupo", coluna: "competencia", medida: "valor" }, periodo: "relativo" as const, comFiltros: true };
    const outro = { id: "b", parametros: { base: "baixas", linhas: "categoria", coluna: "pagamento", medida: "valor" }, periodo: "relativo" as const, comFiltros: true };
    const tela = configuracaoDoModelo(meu, conf({}), HOJE);
    expect(modeloAplicado([outro, meu], tela, HOJE)?.id).toBe("a");
    // Mexeu na tabela: deixa de estar aplicado.
    expect(modeloAplicado([outro, meu], { ...tela, medida: "saldo" }, HOJE)).toBeUndefined();
    // O endereço do modelo, lido de novo, é a mesma tabela.
    expect(lerConfiguracao(Object.fromEntries(paramsDaConfiguracao(tela)), HOJE)).toEqual(tela);
  });
});

describe("diálogo e menu", () => {
  it("sugere o relativo quando a tela está no período padrão", () => {
    expect(periodoSugerido(conf({}), HOJE)).toBe("relativo");
    expect(periodoSugerido(conf({ de: "2026-01", ate: "2026-03" }), HOJE)).toBe("fixo");
    expect(periodoSugerido(conf({ periodo: "todos" }), HOJE)).toBe("fixo");
  });

  it("o resumo diz o período e se os filtros são os da tela", () => {
    expect(resumoDoModelo({ parametros: {}, periodo: "relativo", comFiltros: true }, HOJE)).toBe("Últimos 6 meses");
    expect(resumoDoModelo({ parametros: { periodo: "todos" }, periodo: "fixo", comFiltros: false }, HOJE)).toBe("Todo o histórico · filtros da tela");
  });

  it("o nome vem aparado e é obrigatório", () => {
    const ok = novoModeloSchema.safeParse({ nome: "  Despesas   do mês ", quemVe: "eu", periodo: "fixo", comFiltros: true, query: "base=contas" });
    expect(ok.success && ok.data.nome).toBe("Despesas do mês");
    expect(novoModeloSchema.safeParse({ nome: "   ", quemVe: "eu", periodo: "fixo", comFiltros: true, query: "" }).success).toBe(false);
    expect(novoModeloSchema.safeParse({ nome: "x", quemVe: "todos", periodo: "fixo", comFiltros: true, query: "" }).success).toBe(false);
  });
});

describe("quem mexe no modelo", () => {
  const pessoal = { criadoPorId: "ana", setor: null };
  const doSetor = { criadoPorId: "ana", setor: "bpo" };

  it("renomear: só quem criou", () => {
    expect(podeRenomearModelo("ana", doSetor)).toBe(true);
    expect(podeRenomearModelo("bia", doSetor)).toBe(false);
  });

  it("excluir: quem criou; no do setor, também a coordenação", () => {
    expect(podeExcluirModelo({ userId: "ana", gereOSetor: false }, pessoal)).toBe(true);
    expect(podeExcluirModelo({ userId: "bia", gereOSetor: true }, pessoal)).toBe(false);
    expect(podeExcluirModelo({ userId: "bia", gereOSetor: false }, doSetor)).toBe(false);
    expect(podeExcluirModelo({ userId: "bia", gereOSetor: true }, doSetor)).toBe(true);
  });
});

describe("motivo para não salvar", () => {
  it("nome repetido no grupo, sem distinguir maiúscula nem acento", () => {
    expect(motivoParaNaoSalvar([{ id: "1", nome: "Despesas" }], "despésas", "eu")).toMatch(/Você já tem um modelo chamado/);
    expect(motivoParaNaoSalvar([{ id: "1", nome: "Despesas" }], "Despesas", "setor")).toMatch(/O setor já tem/);
    expect(motivoParaNaoSalvar([{ id: "1", nome: "Despesas" }], "Receitas", "eu")).toBeNull();
  });

  it("renomear para o próprio nome não conta como repetido, e o limite não barra", () => {
    const cheios = Array.from({ length: LIMITE_DE_MODELOS_PESSOAIS }, (_, i) => ({ id: String(i), nome: `M${i}` }));
    expect(motivoParaNaoSalvar(cheios, "Novo", "eu")).toMatch(/Você já tem 30 modelos/);
    expect(motivoParaNaoSalvar(cheios, "m0", "eu", "0")).toBeNull();
  });
});
