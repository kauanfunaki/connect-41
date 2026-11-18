import { describe, expect, it } from "vitest";
import {
  CHAVES_DO_FILTRO_SALVO, LIMITE_DE_FILTROS_SALVOS, enderecoDoFiltroSalvo, filtroAplicado, filtroSalvoSchema,
  mesmoNome, motivoParaNaoSalvar, nomeDoFiltroSchema, normalizarQueryDoFiltro, type FiltroSalvo,
} from "./filtrosSalvos";
import { lerFiltros } from "./regras";

const salvo = (nome: string, query: string, id = nome): FiltroSalvo => ({ id, nome, query });

describe("filtros salvos do Controle interno: a query", () => {
  it("põe os parâmetros sempre na mesma ordem", () => {
    expect(normalizarQueryDoFiltro("responsavel=me&tipo=BUG&situacao=PENDING"))
      .toBe("situacao=PENDING&tipo=BUG&responsavel=me");
    expect(normalizarQueryDoFiltro("?q=lista&atrasados=1&sistema=robo%3Asped&prioridade=3"))
      .toBe("prioridade=3&sistema=robo%3Asped&atrasados=1&q=lista");
  });

  it("tira página, visão, mês e o que não é filtro", () => {
    expect(normalizarQueryDoFiltro("tipo=BUG&page=3&pagina=2&visao=kanban&mes=2026-11&voltar=x&utm=1")).toBe("tipo=BUG");
    expect(normalizarQueryDoFiltro("page=2&visao=kanban")).toBe("");
  });

  it("tira valores vazios e espaços nas pontas", () => {
    expect(normalizarQueryDoFiltro("q=%20%20&tipo=&situacao=%20DONE%20")).toBe("situacao=DONE");
    expect(normalizarQueryDoFiltro("q=+bug+da+lista+")).toBe("q=bug+da+lista");
  });

  it("lê também os parâmetros da página (objeto), ignorando parâmetro repetido", () => {
    expect(normalizarQueryDoFiltro({ tipo: "BUG", situacao: ["DONE", "PENDING"], page: "4" })).toBe("tipo=BUG");
    expect(normalizarQueryDoFiltro(new URLSearchParams("responsavel=none&tipo=TEST"))).toBe("tipo=TEST&responsavel=none");
  });

  it("guarda todos os filtros que a lista lê", () => {
    const query = normalizarQueryDoFiltro("situacao=ALL&tipo=FEATURE&prioridade=2&sistema=NEW&responsavel=me&atrasados=1&q=painel");
    expect(new URLSearchParams(query).size).toBe(CHAVES_DO_FILTRO_SALVO.length);
    expect(lerFiltros(Object.fromEntries(new URLSearchParams(query)))).toMatchObject({
      status: "ALL", type: "FEATURE", priority: "2", system: "NEW", assignee: "me", overdue: true, q: "painel",
    });
  });

  it("o endereço troca os filtros e mantém a visão e o mês, sem a página", () => {
    expect(enderecoDoFiltroSalvo("tipo=BUG&responsavel=me", "visao=kanban&mes=2026-10&situacao=DONE&q=x&page=5"))
      .toBe("/controle-interno?visao=kanban&mes=2026-10&tipo=BUG&responsavel=me");
    expect(enderecoDoFiltroSalvo("tipo=BUG")).toBe("/controle-interno?tipo=BUG");
    expect(enderecoDoFiltroSalvo("")).toBe("/controle-interno");
  });

  it("diz qual salvo está aplicado só quando a URL bate exatamente", () => {
    const salvos = [salvo("Meus bugs", "tipo=BUG&responsavel=me"), salvo("Atrasados", "atrasados=1")];
    expect(filtroAplicado(salvos, "responsavel=me&tipo=BUG&page=2&visao=lista")?.nome).toBe("Meus bugs");
    expect(filtroAplicado(salvos, "tipo=BUG")).toBeUndefined();
    expect(filtroAplicado(salvos, "tipo=BUG&responsavel=me&q=lista")).toBeUndefined();
    expect(filtroAplicado(salvos, "")).toBeUndefined();
    expect(filtroAplicado([salvo("Vazio", "")], "")).toBeUndefined();
  });
});

describe("filtros salvos do Controle interno: nome e limite", () => {
  it("o nome é obrigatório, sem espaços sobrando e com até 80 caracteres", () => {
    expect(nomeDoFiltroSchema.parse("  Meus   bugs ")).toBe("Meus bugs");
    expect(nomeDoFiltroSchema.safeParse("   ").error?.issues[0].message).toBe("Dê um nome ao filtro.");
    expect(nomeDoFiltroSchema.safeParse(undefined).success).toBe(false);
    expect(nomeDoFiltroSchema.safeParse("a".repeat(80)).success).toBe(true);
    expect(nomeDoFiltroSchema.safeParse("a".repeat(81)).error?.issues[0].message).toBe("O nome deve ter até 80 caracteres.");
  });

  it("não salva sem filtro ativo e grava a query normalizada", () => {
    expect(filtroSalvoSchema.safeParse({ nome: "Tudo", query: "page=2&visao=kanban" }).error?.issues[0].message)
      .toBe("Escolha ao menos um filtro antes de salvar.");
    expect(filtroSalvoSchema.parse({ nome: "Meus", query: "responsavel=me&tipo=BUG&page=3" }))
      .toEqual({ nome: "Meus", query: "tipo=BUG&responsavel=me" });
    expect(filtroSalvoSchema.safeParse({ nome: "Longo", query: `q=${"a".repeat(2001)}` }).success).toBe(false);
  });

  it("compara nomes sem maiúscula nem acento, como o banco", () => {
    expect(mesmoNome("Meus bugs", "meus BUGS")).toBe(true);
    expect(mesmoNome("Validação", "validacao")).toBe(true);
    expect(mesmoNome("Meus bugs", "Meus bugs 2")).toBe(false);
  });

  it("barra o limite, o nome repetido e a mesma combinação", () => {
    const novo = { nome: "Novo", query: "tipo=TEST" };
    expect(motivoParaNaoSalvar([], novo)).toBeNull();
    const cheio = Array.from({ length: LIMITE_DE_FILTROS_SALVOS }, (_, i) => salvo(`F${i}`, `q=${i}`));
    expect(motivoParaNaoSalvar(cheio, novo)).toBe("Você já tem 20 filtros salvos. Exclua um para salvar outro.");
    expect(motivoParaNaoSalvar(cheio.slice(1), novo)).toBeNull();
    expect(motivoParaNaoSalvar([salvo("novo", "tipo=BUG")], novo)).toBe("Já existe um filtro salvo com o nome “novo”.");
    expect(motivoParaNaoSalvar([salvo("Testes", "tipo=TEST")], novo)).toBe("Esses filtros já estão salvos como “Testes”.");
  });
});
