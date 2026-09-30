import { describe, expect, it } from "vitest";
import { lerLista, opcoesDeRegime, ondeDoRegime, opcoesDeLocal, ondeDoLocal, valorDoLocal } from "./filtrosDaListaDeEmpresas";

const SIMPLES_A = "Simples Nacional - Comércio ou Serviço - Com Pró-labore - Com Funcionários";
const SIMPLES_B = "Simples Nacional - Serviço - Sem Pró-labore";
const PRESUMIDO_SM = "Lucro Presumido - Sem Movimento";

describe("lerLista", () => {
  it("aceita ausente, um valor e valor repetido", () => {
    expect(lerLista(undefined)).toEqual([]);
    expect(lerLista("a")).toEqual(["a"]);
    expect(lerLista(["a", "b"])).toEqual(["a", "b"]);
  });
});

describe("regime", () => {
  it("agrupa as variações brutas pelo resumo e soma as contagens", () => {
    const opcoes = opcoesDeRegime([
      { taxRegime: SIMPLES_A, n: 3 },
      { taxRegime: SIMPLES_B, n: 2 },
      { taxRegime: PRESUMIDO_SM, n: 1 },
      { taxRegime: null, n: 4 },
    ]);
    expect(opcoes).toEqual([
      { valor: "Lucro Presumido · sem movimento", rotulo: "Lucro Presumido · sem movimento", n: 1 },
      { valor: "Simples Nacional", rotulo: "Simples Nacional", n: 5 },
      { valor: "", rotulo: "(vazio)", n: 4 },
    ]);
  });

  it("filtra por todas as variações brutas do resumo escolhido", () => {
    expect(ondeDoRegime(["Simples Nacional"], [SIMPLES_A, SIMPLES_B, PRESUMIDO_SM, null])).toEqual({
      OR: [{ taxRegime: { in: [SIMPLES_A, SIMPLES_B] } }],
    });
  });

  it("\"(vazio)\" pega nulo e texto vazio", () => {
    expect(ondeDoRegime([""], [SIMPLES_A])).toEqual({ OR: [{ taxRegime: null }, { taxRegime: "" }] });
  });

  it("valor que não existe mais na base não vira \"tudo\"", () => {
    expect(ondeDoRegime(["Regime que sumiu"], [SIMPLES_A])).toEqual({ id: { in: [] } });
  });

  it("sem escolha, sem filtro", () => {
    expect(ondeDoRegime([], [SIMPLES_A])).toEqual({});
  });
});

describe("localização", () => {
  it("mostra CIDADE/UF e casa os dois campos no where", () => {
    const opcoes = opcoesDeLocal([
      { city: "CURITIBA", stateCode: "PR", n: 10 },
      { city: null, stateCode: null, n: 2 },
      { city: null, stateCode: "SC", n: 1 },
    ]);
    expect(opcoes.map((o) => o.rotulo)).toEqual(["CURITIBA/PR", "SC", "(vazio)"]);
    expect(ondeDoLocal([valorDoLocal("CURITIBA", "PR"), ""])).toEqual({
      OR: [
        { city: "CURITIBA", stateCode: "PR" },
        { city: null, stateCode: null },
      ],
    });
  });
});
