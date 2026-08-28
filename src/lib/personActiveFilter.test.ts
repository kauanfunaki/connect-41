import { describe, it, expect } from "vitest";
import {
  resolvePersonActiveFilter,
  personActiveWhere,
  estaOcultandoInativos,
  situacaoSelecionada,
  SITUACAO_TODOS,
  SITUACAO_INATIVOS,
} from "./personActiveFilter";

describe("resolvePersonActiveFilter", () => {
  it("sem parâmetro, mostra só os ativos", () => {
    expect(resolvePersonActiveFilter(undefined)).toEqual({ kind: "ativos" });
    expect(resolvePersonActiveFilter("")).toEqual({ kind: "ativos" });
    expect(resolvePersonActiveFilter("   ")).toEqual({ kind: "ativos" });
  });

  it("'todos' e 'inativos' são respeitados", () => {
    expect(resolvePersonActiveFilter(SITUACAO_TODOS)).toEqual({ kind: "todos" });
    expect(resolvePersonActiveFilter(SITUACAO_INATIVOS)).toEqual({ kind: "inativos" });
  });

  it("valor desconhecido cai no padrão em vez de zerar a lista", () => {
    expect(resolvePersonActiveFilter("BANANA")).toEqual({ kind: "ativos" });
    expect(resolvePersonActiveFilter("Todos")).toEqual({ kind: "ativos" }); // maiúscula não vale
  });
});

describe("personActiveWhere", () => {
  it("o padrão traz só active = true", () => {
    expect(personActiveWhere({ kind: "ativos" })).toEqual({ active: true });
  });

  it("dá para ver só os inativos", () => {
    expect(personActiveWhere({ kind: "inativos" })).toEqual({ active: false });
  });

  it("'todos' não restringe nada", () => {
    expect(personActiveWhere({ kind: "todos" })).toEqual({});
  });
});

describe("sinalização na UI", () => {
  it("só o padrão está escondendo gente", () => {
    expect(estaOcultandoInativos({ kind: "ativos" })).toBe(true);
    expect(estaOcultandoInativos({ kind: "inativos" })).toBe(false);
    expect(estaOcultandoInativos({ kind: "todos" })).toBe(false);
  });

  it("situacaoSelecionada devolve o que o menu marca", () => {
    expect(situacaoSelecionada({ kind: "ativos" })).toBe("");
    expect(situacaoSelecionada({ kind: "inativos" })).toBe(SITUACAO_INATIVOS);
    expect(situacaoSelecionada({ kind: "todos" })).toBe(SITUACAO_TODOS);
  });
});
