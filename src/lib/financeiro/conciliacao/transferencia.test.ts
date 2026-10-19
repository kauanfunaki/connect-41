import { describe, expect, it } from "vitest";
import {
  ehCategoriaDeTransferencia,
  escolherCategoriaDeTransferencia,
  validarOutraConta,
  descricaoDaTransferencia,
  linhaDaOutraPonta,
} from "./transferencia";

describe("ehCategoriaDeTransferencia", () => {
  it("pelo nome, sem acento nem caixa", () => {
    expect(ehCategoriaDeTransferencia("Transferencia entre contas - mesma titularidade")).toBe(true);
    expect(ehCategoriaDeTransferencia("TRANSFERÊNCIA ENTRE CONTAS")).toBe(true);
    // Aporte e empréstimo também ficam fora da DRE, mas não são transferência.
    expect(ehCategoriaDeTransferencia("Aporte Societário")).toBe(false);
    expect(ehCategoriaDeTransferencia("Entrada de Transferência")).toBe(false);
  });
});

describe("escolherCategoriaDeTransferencia", () => {
  const padrao = { id: "p", name: "Transferencia entre contas - mesma titularidade", companyId: null, active: true };
  const daEmpresa = { id: "e", name: "Transferência entre contas", companyId: "c1", active: true };

  it("a da empresa vence a do padrão; a ativa vence a inativa", () => {
    expect(escolherCategoriaDeTransferencia([padrao, daEmpresa])?.id).toBe("e");
    expect(escolherCategoriaDeTransferencia([{ ...daEmpresa, active: false }, padrao])?.id).toBe("p");
  });

  it("sem nenhuma, nulo — quem chama cria", () => {
    expect(escolherCategoriaDeTransferencia([{ id: "x", name: "Aluguel", companyId: null, active: true }])).toBeNull();
  });
});

describe("validarOutraConta", () => {
  const origem = { id: "a", companyId: "c1" };
  it("da mesma empresa, ativa e outra", () => {
    expect(validarOutraConta(origem, { id: "b", companyId: "c1", active: true })).toEqual({ ok: true });
    expect(validarOutraConta(origem, { id: "a", companyId: "c1", active: true }).ok).toBe(false);
    expect(validarOutraConta(origem, { id: "b", companyId: "c2", active: true }).ok).toBe(false);
    expect(validarOutraConta(origem, { id: "b", companyId: "c1", active: false }).ok).toBe(false);
    expect(validarOutraConta(origem, null).ok).toBe(false);
  });
});

describe("descricaoDaTransferencia", () => {
  it("para na saída, de na entrada", () => {
    expect(descricaoDaTransferencia("PAGAR", "Itaú 12287-0")).toBe("Transferência para Itaú 12287-0");
    expect(descricaoDaTransferencia("RECEBER", "Bradesco 999")).toBe("Transferência de Bradesco 999");
  });
});

describe("linhaDaOutraPonta", () => {
  const estaLinha = { centavos: -500_00, dataKey: "2026-10-15" };

  it("valor oposto e até 3 dias: a única vira a outra ponta", () => {
    const outras = [
      { id: "x", centavos: 500_00, dataKey: "2026-10-16" },
      { id: "y", centavos: 499_99, dataKey: "2026-10-15" },
      { id: "z", centavos: 500_00, dataKey: "2026-10-25" },
    ];
    expect(linhaDaOutraPonta(outras, estaLinha)?.id).toBe("x");
  });

  it("mesmo sinal não é espelho", () => {
    expect(linhaDaOutraPonta([{ id: "x", centavos: -500_00, dataKey: "2026-10-15" }], estaLinha)).toBeNull();
  });

  it("duas iguais: não escolhe", () => {
    const outras = [
      { id: "x", centavos: 500_00, dataKey: "2026-10-15" },
      { id: "w", centavos: 500_00, dataKey: "2026-10-17" },
    ];
    expect(linhaDaOutraPonta(outras, estaLinha)).toBeNull();
  });
});
