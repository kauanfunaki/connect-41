import { describe, expect, it } from "vitest";
import {
  enderecoComFiltro,
  filtrosAtivos,
  lerFiltro,
  mesesDeVencimento,
  opcoesDeSituacao,
  passaNoFiltro,
  type ContaFiltravel,
} from "./filtroDasContas";

const conta = (c: Partial<ContaFiltravel> = {}): ContaFiltravel => ({
  situacao: "A_VENCER",
  vencimentoKey: "2026-11-20",
  contraparteNome: "Papelaria Exemplo",
  descricao: "Material de escritório",
  empresaNome: "Empresa A",
  categoriaNome: "Despesas gerais",
  ...c,
});

const SEM_FILTRO = { situacao: null, vencimento: null };

describe("lerFiltro", () => {
  it("lê situação e mês válidos", () => {
    expect(lerFiltro(new URLSearchParams("situacao=vencida&vencimento=2026-10"))).toEqual({ situacao: "vencida", vencimento: "2026-10" });
  });

  it("ignora valor que não existe, como sem filtro", () => {
    expect(lerFiltro(new URLSearchParams("situacao=toString&vencimento=outubro"))).toEqual(SEM_FILTRO);
    expect(lerFiltro(new URLSearchParams(""))).toEqual(SEM_FILTRO);
  });
});

describe("passaNoFiltro", () => {
  it("sem filtro e sem busca, tudo passa", () => {
    expect(passaNoFiltro(conta(), SEM_FILTRO)).toBe(true);
  });

  it("'Em aberto' junta vencida, vence hoje e a vencer, e deixa a paga de fora", () => {
    const aberto = { situacao: "aberto" as const, vencimento: null };
    expect(passaNoFiltro(conta({ situacao: "VENCIDA" }), aberto)).toBe(true);
    expect(passaNoFiltro(conta({ situacao: "VENCE_HOJE" }), aberto)).toBe(true);
    expect(passaNoFiltro(conta({ situacao: "A_VENCER" }), aberto)).toBe(true);
    expect(passaNoFiltro(conta({ situacao: "PAGA" }), aberto)).toBe(false);
  });

  it("situação exata", () => {
    expect(passaNoFiltro(conta({ situacao: "VENCIDA" }), { situacao: "vencida", vencimento: null })).toBe(true);
    expect(passaNoFiltro(conta({ situacao: "VENCE_HOJE" }), { situacao: "vencida", vencimento: null })).toBe(false);
    expect(passaNoFiltro(conta({ situacao: "PAGA" }), { situacao: "paga", vencimento: null })).toBe(true);
  });

  it("mês do vencimento", () => {
    expect(passaNoFiltro(conta(), { situacao: null, vencimento: "2026-11" })).toBe(true);
    expect(passaNoFiltro(conta(), { situacao: null, vencimento: "2026-10" })).toBe(false);
  });

  it("busca sem acento e sem caixa, no fornecedor, descrição, empresa e categoria", () => {
    expect(passaNoFiltro(conta(), SEM_FILTRO, "PAPELARIA")).toBe(true);
    expect(passaNoFiltro(conta(), SEM_FILTRO, "escritorio")).toBe(true);
    expect(passaNoFiltro(conta(), SEM_FILTRO, "empresa a")).toBe(true);
    expect(passaNoFiltro(conta(), SEM_FILTRO, "gerais")).toBe(true);
    expect(passaNoFiltro(conta(), SEM_FILTRO, "aluguel")).toBe(false);
    expect(passaNoFiltro(conta({ descricao: null, categoriaNome: null }), SEM_FILTRO, "material")).toBe(false);
  });

  it("busca e filtros se somam", () => {
    expect(passaNoFiltro(conta({ situacao: "PAGA" }), { situacao: "vencida", vencimento: null }, "papelaria")).toBe(false);
  });
});

describe("apoio do painel", () => {
  it("meses distintos, do mais recente para o mais antigo", () => {
    expect(mesesDeVencimento([{ vencimentoKey: "2026-10-05" }, { vencimentoKey: "2026-11-20" }, { vencimentoKey: "2026-10-30" }])).toEqual([
      "2026-11",
      "2026-10",
    ]);
  });

  it("conta os filtros ligados", () => {
    expect(filtrosAtivos(SEM_FILTRO)).toBe(0);
    expect(filtrosAtivos({ situacao: "paga", vencimento: "2026-10" })).toBe(2);
  });

  it("a conta paga chama 'Recebidas' em Contas a receber", () => {
    expect(opcoesDeSituacao(true).at(-1)?.label).toBe("Pagas");
    expect(opcoesDeSituacao(false).at(-1)?.label).toBe("Recebidas");
  });

  it("monta o endereço trocando só o recorte", () => {
    const atual = new URLSearchParams("situacao=vencida&outra=1");
    expect(enderecoComFiltro("/portal/pagar", atual, { vencimento: "2026-10" })).toBe("/portal/pagar?situacao=vencida&outra=1&vencimento=2026-10");
    expect(enderecoComFiltro("/portal/pagar", atual, { situacao: null })).toBe("/portal/pagar?outra=1");
    expect(enderecoComFiltro("/portal/pagar", new URLSearchParams("situacao=paga"), { situacao: null })).toBe("/portal/pagar");
  });
});
