import { describe, expect, it } from "vitest";
import { leituraDoTempoPorEtapa, tempoPorEtapa, type EtapaConcluida } from "./tempoPorEtapa";

// Tempo por etapa (04/11/2026), o quinto relatório do Societário.

const e = (tipoNome: string, posicao: number, etapa: string, diasUteis: number): EtapaConcluida => ({ tipoNome, posicao, etapa, diasUteis });

describe("tempo por etapa", () => {
  it("mediana e máximo por tipo e etapa, na ordem do roteiro; o tipo com mais etapas primeiro", () => {
    const linhas = tempoPorEtapa([
      e("Baixa", 1, "DBE", 2),
      e("Abertura", 2, "Junta", 9),
      e("Abertura", 2, "Junta", 5),
      e("Abertura", 2, "Junta", 12),
      e("Abertura", 1, "Viabilidade", 1),
      e("Abertura", 1, "Viabilidade", 2),
    ]);
    expect(linhas.map((l) => [l.tipoNome, l.etapa, l.concluidas, l.medianaDias, l.maximoDias])).toEqual([
      ["Abertura", "Viabilidade", 2, 1.5, 2],
      ["Abertura", "Junta", 3, 9, 12],
      ["Baixa", "DBE", 1, 2, 2],
    ]);
  });

  it("a leitura aponta a etapa mais demorada com amostra de pelo menos 3", () => {
    const linhas = tempoPorEtapa([e("Abertura", 2, "Junta", 9), e("Abertura", 2, "Junta", 5), e("Abertura", 2, "Junta", 12), e("Baixa", 1, "Receita", 30)]);
    expect(leituraDoTempoPorEtapa(linhas)).toBe("A etapa que mais demora é “Junta”, em Abertura: 9 dias úteis em mediana (3 concluídas, a mais longa com 12 dias úteis).");
    expect(leituraDoTempoPorEtapa([])).toContain("Nenhuma etapa");
  });
});
