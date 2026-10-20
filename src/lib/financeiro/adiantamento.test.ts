import { describe, expect, it } from "vitest";
import {
  descricaoDoAdiantamento,
  ehContaDeAdiantamento,
  saldosDoAdiantamento,
  sinalNoAdiantamento,
  tipoDoAdiantamento,
  validarNovoAdiantamento,
  validarUsoDoAdiantamento,
} from "./adiantamento";

describe("o tipo e o sinal", () => {
  it("a pagar usa o de fornecedores; a receber, o de clientes", () => {
    expect(tipoDoAdiantamento("PAGAR")).toBe("ADIANTAMENTO_FORNECEDOR");
    expect(tipoDoAdiantamento("RECEBER")).toBe("ADIANTAMENTO_CLIENTE");
    expect(ehContaDeAdiantamento("ADIANTAMENTO_CLIENTE")).toBe(true);
    expect(ehContaDeAdiantamento("CORRENTE")).toBe(false);
    expect(ehContaDeAdiantamento(null)).toBe(false);
  });

  it("entra o que se adianta, sai o que se usa", () => {
    expect(sinalNoAdiantamento("ADIANTAMENTO_FORNECEDOR", "RECEBER")).toBe(1);
    expect(sinalNoAdiantamento("ADIANTAMENTO_FORNECEDOR", "PAGAR")).toBe(-1);
    expect(sinalNoAdiantamento("ADIANTAMENTO_CLIENTE", "PAGAR")).toBe(1);
    expect(sinalNoAdiantamento("ADIANTAMENTO_CLIENTE", "RECEBER")).toBe(-1);
  });
});

describe("saldosDoAdiantamento", () => {
  it("o disponível de cada um, do maior para o menor, sem quem zerou", () => {
    const s = saldosDoAdiantamento("ADIANTAMENTO_FORNECEDOR", [
      { contraparteId: "a", contraparteNome: "A", kind: "RECEBER", centavos: 100_000 },
      { contraparteId: "a", contraparteNome: "A", kind: "PAGAR", centavos: 30_000 },
      { contraparteId: "b", contraparteNome: "B", kind: "RECEBER", centavos: 200_000 },
      { contraparteId: "c", contraparteNome: "C", kind: "RECEBER", centavos: 5_000 },
      { contraparteId: "c", contraparteNome: "C", kind: "PAGAR", centavos: 5_000 },
    ]);
    expect(s).toEqual([
      { contraparteId: "b", contraparteNome: "B", saldoCentavos: 200_000 },
      { contraparteId: "a", contraparteNome: "A", saldoCentavos: 70_000 },
    ]);
  });
});

describe("validações", () => {
  it("o adiantamento novo: valor positivo, dia que já passou", () => {
    expect(validarNovoAdiantamento({ valorCentavos: 10_000, data: "2026-10-20", hojeKey: "2026-10-20" })).toEqual({ ok: true, dataKey: "2026-10-20" });
    expect(validarNovoAdiantamento({ valorCentavos: 0, data: "2026-10-20", hojeKey: "2026-10-20" }).ok).toBe(false);
    expect(validarNovoAdiantamento({ valorCentavos: null, data: "2026-10-20", hojeKey: "2026-10-20" }).ok).toBe(false);
    const futuro = validarNovoAdiantamento({ valorCentavos: 100, data: "2026-10-21", hojeKey: "2026-10-20" });
    expect(futuro.ok).toBe(false);
    if (!futuro.ok) expect(futuro.erro).toMatch(/não pode ser futura/);
  });

  it("usar: até o disponível de quem é a conta, com o caminho", () => {
    expect(validarUsoDoAdiantamento({ usoCentavos: 5_000, disponivelCentavos: 5_000, contraparteNome: "A" })).toEqual({ ok: true });
    const passa = validarUsoDoAdiantamento({ usoCentavos: 6_000, disponivelCentavos: 5_000, contraparteNome: "A" });
    expect(passa.ok).toBe(false);
    if (!passa.ok) expect(passa.erro).toMatch(/O adiantamento de A tem R\$\s?50,00 disponível.*numa baixa à parte/);
    expect(validarUsoDoAdiantamento({ usoCentavos: 1, disponivelCentavos: 0, contraparteNome: "B" })).toEqual({ ok: false, erro: "B não tem adiantamento disponível." });
  });

  it("a descrição das pontas", () => {
    expect(descricaoDoAdiantamento("ADIANTAMENTO_FORNECEDOR", "Fornecedor X")).toBe("Adiantamento a Fornecedor X");
    expect(descricaoDoAdiantamento("ADIANTAMENTO_CLIENTE", "Cliente Y", "sinal do pedido 12")).toBe("Adiantamento de Cliente Y — sinal do pedido 12");
  });
});
