import { describe, expect, it } from "vitest";
import { validarProjeto, nomeEmUso, projetoDoLancamento, casarProjeto } from "./projeto";

describe("validarProjeto", () => {
  it("normaliza espaço e recusa vazio ou longo demais", () => {
    expect(validarProjeto("  Obra   Batel ")).toEqual({ ok: true, nome: "Obra Batel" });
    expect(validarProjeto("  ").ok).toBe(false);
    expect(validarProjeto("x".repeat(121)).ok).toBe(false);
  });
});

describe("nomeEmUso", () => {
  it("compara sem acento, caixa ou espaço", () => {
    expect(nomeEmUso("obra  batel", [{ name: "Obra Batel" }])).toBe("Obra Batel");
    expect(nomeEmUso("Feira de Março", [{ name: "feira de marco" }])).toBe("feira de marco");
    expect(nomeEmUso("Outro", [{ name: "Obra Batel" }])).toBeNull();
  });
});

describe("projetoDoLancamento", () => {
  const ativo = { id: "p1", companyId: "e1", active: true };

  it("sem informado é sem projeto", () => {
    expect(projetoDoLancamento({ companyId: "e1", informadoId: null, projeto: null })).toEqual({ ok: true, projetoId: null });
  });

  it("de outra empresa ou inexistente é recusa", () => {
    expect(projetoDoLancamento({ companyId: "e2", informadoId: "p1", projeto: ativo }).ok).toBe(false);
    expect(projetoDoLancamento({ companyId: "e1", informadoId: "p9", projeto: null }).ok).toBe(false);
  });

  it("inativo é recusa — menos o que o lançamento já tinha", () => {
    const inativo = { ...ativo, active: false };
    expect(projetoDoLancamento({ companyId: "e1", informadoId: "p1", projeto: inativo }).ok).toBe(false);
    expect(projetoDoLancamento({ companyId: "e1", informadoId: "p1", projeto: inativo, atualId: "p1" })).toEqual({ ok: true, projetoId: "p1" });
  });
});

describe("casarProjeto", () => {
  const projetos = [{ id: "p1", nome: "Obra Batel" }];
  it("casa pelo nome normalizado; vazio é sem projeto; desconhecido é erro", () => {
    expect(casarProjeto(" obra batel ", projetos)).toEqual({ ok: true, projetoId: "p1" });
    expect(casarProjeto("", projetos)).toEqual({ ok: true, projetoId: null });
    expect(casarProjeto("Feira", projetos).ok).toBe(false);
  });
});
