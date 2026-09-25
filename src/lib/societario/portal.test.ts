import { describe, expect, it } from "vitest";
import { etapasParaCliente, progressoDasEtapas, situacaoParaCliente, textoDaPrevisao } from "./portal";

describe("situacaoParaCliente", () => {
  it("cancelado e indeferido vencem a situação derivada", () => {
    expect(situacaoParaCliente("EM_ANDAMENTO", "CANCELADO")).toBe("CANCELADO");
    expect(situacaoParaCliente("EM_EXIGENCIA", "INDEFERIDO")).toBe("INDEFERIDO");
    expect(situacaoParaCliente("EM_EXIGENCIA", "EM_ANDAMENTO")).toBe("EM_EXIGENCIA");
  });
});

describe("textoDaPrevisao", () => {
  const prazo = (dias: number, min: number | null, max: number | null) =>
    ({ dias, situacao: "dentro", previstoMin: min, previstoMax: max }) as const;

  it("faixa do tipo e o que já passou, sem juízo de atraso", () => {
    expect(textoDaPrevisao(prazo(9, 4, 7), false)).toBe("Previsão de 4 a 7 dias úteis · 9 dias úteis até agora");
  });

  it("previsão de um valor só e processo concluído", () => {
    expect(textoDaPrevisao(prazo(1, 5, 5), true)).toBe("Previsão de 5 dias úteis · levou 1 dia útil");
  });

  it("fluxo variável não promete prazo", () => {
    expect(textoDaPrevisao(prazo(12, null, null), false)).toBe("Prazo depende do órgão · 12 dias úteis até agora");
  });
});

describe("etapas", () => {
  const etapas = [
    { posicao: 3, rotulo: "Alvará", orgao: "Prefeitura", status: "PENDENTE" as const },
    { posicao: 1, rotulo: "Viabilidade", orgao: null, status: "CONCLUIDA" as const },
    { posicao: 2, rotulo: "Vigilância", orgao: "Vigilância", status: "DISPENSADA" as const },
  ];

  it("some a dispensada e fica na ordem do roteiro", () => {
    expect(etapasParaCliente(etapas).map((e) => e.rotulo)).toEqual(["Viabilidade", "Alvará"]);
  });

  it("progresso conta só as que se aplicam", () => {
    expect(progressoDasEtapas(etapas)).toEqual({ feitas: 1, total: 2 });
  });
});
