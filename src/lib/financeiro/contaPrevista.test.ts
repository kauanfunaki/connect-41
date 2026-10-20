import { describe, expect, it } from "vitest";
import { contaPrevistaDoLancamento, contaPrevistaEmComum, contaSugeridaNaBaixa, nomeDaContaBancaria } from "./contaPrevista";

describe("contaPrevistaDoLancamento", () => {
  const conta = { id: "cc1", companyId: "e1", active: true };

  it("vazia é sem conta; a da empresa e ativa vale", () => {
    expect(contaPrevistaDoLancamento({ companyId: "e1", informadoId: null, conta: null })).toEqual({ ok: true, contaId: null });
    expect(contaPrevistaDoLancamento({ companyId: "e1", informadoId: "cc1", conta })).toEqual({ ok: true, contaId: "cc1" });
  });

  it("recusa a de outra empresa e a que não existe", () => {
    expect(contaPrevistaDoLancamento({ companyId: "e2", informadoId: "cc1", conta }).ok).toBe(false);
    expect(contaPrevistaDoLancamento({ companyId: "e1", informadoId: "cc9", conta: null }).ok).toBe(false);
  });

  it("inativa: só se já era a da conta", () => {
    const inativa = { ...conta, active: false };
    expect(contaPrevistaDoLancamento({ companyId: "e1", informadoId: "cc1", conta: inativa })).toEqual({
      ok: false,
      erro: "Conta corrente inativa — escolha outra ou reative em Banco e caixa.",
    });
    expect(contaPrevistaDoLancamento({ companyId: "e1", informadoId: "cc1", conta: inativa, atualId: "cc1" })).toEqual({ ok: true, contaId: "cc1" });
  });
});

describe("a sugestão da baixa", () => {
  const contas = [
    { id: "cc1", nome: "Itaú 1" },
    { id: "cc2", nome: "Bradesco 2" },
  ];

  it("em lote, só quando todas as contas da empresa preveem a mesma", () => {
    expect(contaPrevistaEmComum(["cc1", "cc1"])).toBe("cc1");
    expect(contaPrevistaEmComum(["cc1", "cc2"])).toBeNull();
    expect(contaPrevistaEmComum(["cc1", null])).toBeNull();
    expect(contaPrevistaEmComum([])).toBeNull();
  });

  it("a prevista, se ainda ativa; senão a única conta da empresa", () => {
    expect(contaSugeridaNaBaixa(contas, "cc2")).toBe("cc2");
    expect(contaSugeridaNaBaixa(contas, "desativada")).toBe("");
    expect(contaSugeridaNaBaixa(contas, null)).toBe("");
    expect(contaSugeridaNaBaixa([contas[0]!], null)).toBe("cc1");
  });

  it("o nome da conta nos seletores", () => {
    expect(nomeDaContaBancaria({ nickname: "Itaú", accountNumber: "12345-6" })).toBe("Itaú 12345-6");
  });
});
