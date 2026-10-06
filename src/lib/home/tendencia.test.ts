import { describe, expect, it } from "vitest";
import {
  diasEntre,
  escolherComparacao,
  montarSelo,
  montarTendencia,
  pontosDaLinha,
  quantoMudou,
  tomDaVariacao,
  type Foto,
} from "./tendencia";
import { METRICAS } from "./metricas";

// 06/10/2026 é uma terça-feira.
const HOJE = "2026-10-06";
const foto = (dia: string, valor: number): Foto => ({ dia, valor });

describe("diasEntre", () => {
  it("conta dias de calendário, atravessando o mês", () => {
    expect(diasEntre("2026-09-29", HOJE)).toBe(7);
    expect(diasEntre("2026-10-05", HOJE)).toBe(1);
    expect(diasEntre(HOJE, HOJE)).toBe(0);
  });
});

describe("escolherComparacao", () => {
  it("prefere a foto de 7 dias atrás", () => {
    const fotos = [foto("2026-10-05", 10), foto("2026-09-29", 20), foto("2026-09-30", 30)];
    expect(escolherComparacao(fotos, HOJE)).toEqual({ valor: 20, dias: 7 });
  });

  it("aceita de 5 a 9 dias, ficando com a mais perto de 7 (no empate, a mais antiga)", () => {
    expect(escolherComparacao([foto("2026-10-01", 5), foto("2026-09-26", 10)], HOJE)).toEqual({ valor: 5, dias: 5 });
    expect(escolherComparacao([foto("2026-10-01", 5), foto("2026-09-30", 6)], HOJE)).toEqual({ valor: 6, dias: 6 });
    expect(escolherComparacao([foto("2026-09-30", 6), foto("2026-09-28", 8)], HOJE)).toEqual({ valor: 8, dias: 8 });
    expect(escolherComparacao([foto("2026-10-01", 5), foto("2026-09-27", 9)], HOJE)).toEqual({ valor: 9, dias: 9 });
  });

  it("sem foto da semana, a mais recente dos últimos 4 dias", () => {
    expect(escolherComparacao([foto("2026-10-02", 1), foto("2026-10-05", 2)], HOJE)).toEqual({ valor: 2, dias: 1 });
    // Segunda-feira olhando a sexta: 3 dias.
    expect(escolherComparacao([foto("2026-10-02", 1)], "2026-10-05")).toEqual({ valor: 1, dias: 3 });
  });

  it("sem histórico (ou só com a foto de hoje, ou velho demais), nada", () => {
    expect(escolherComparacao([], HOJE)).toBeNull();
    expect(escolherComparacao([foto(HOJE, 3)], HOJE)).toBeNull();
    expect(escolherComparacao([foto("2026-09-20", 3)], HOJE)).toBeNull();
    expect(escolherComparacao([foto("2026-10-05", Number.NaN)], HOJE)).toBeNull();
  });
});

describe("quantoMudou", () => {
  it("contagem: a diferença, sem sinal", () => {
    expect(quantoMudou(6, 10, "contagem")).toBe("4");
    expect(quantoMudou(1_250, 10, "contagem")).toBe("1.240");
    expect(quantoMudou(7, 7, "contagem")).toBeNull();
  });

  it("dinheiro: o percentual, arredondado, sem NaN nem divisão por zero", () => {
    expect(quantoMudou(112_000, 100_000, "moeda")).toBe("12%");
    expect(quantoMudou(100_400, 100_000, "moeda")).toBe("<1%");
    expect(quantoMudou(50_000_000, 100, "moeda")).toBe(">999%");
    // Partindo de zero não há percentual: vai a diferença em reais, curta.
    const deZero = quantoMudou(120_000, 0, "moeda")!;
    expect(deZero).toMatch(/^R\$\s1,2\smil$/);
    expect(deZero).not.toContain("NaN");
    expect(quantoMudou(0, 0, "moeda")).toBeNull();
  });
});

describe("tomDaVariacao", () => {
  it("subir é ruim no que é melhor menor (vencidas, atrasadas)", () => {
    expect(tomDaVariacao(3, "menor-e-melhor")).toBe("ruim");
    expect(tomDaVariacao(-3, "menor-e-melhor")).toBe("bom");
  });

  it("subir é bom no que é melhor maior (recebido)", () => {
    expect(tomDaVariacao(3, "maior-e-melhor")).toBe("bom");
    expect(tomDaVariacao(-3, "maior-e-melhor")).toBe("ruim");
  });

  it("volume e mudança zero são neutros", () => {
    expect(tomDaVariacao(3, "neutro")).toBe("neutro");
    expect(tomDaVariacao(0, "menor-e-melhor")).toBe("neutro");
  });
});

describe("montarSelo", () => {
  it("▲ 12% em 7 dias, vermelho, no dinheiro vencido que subiu", () => {
    const s = montarSelo(112_000, { valor: 100_000, dias: 7 }, METRICAS.pagar_vencido);
    expect(s).toEqual({ seta: "▲", texto: "12% em 7 dias", tom: "ruim", descricao: "Subiu 12% em 7 dias — piorou." });
  });

  it("▼ 4 desde ontem, verde, nas tarefas atrasadas que caíram", () => {
    const s = montarSelo(6, { valor: 10, dias: 1 }, METRICAS.tarefas_atrasadas);
    expect(s).toMatchObject({ seta: "▼", texto: "4 desde ontem", tom: "bom" });
  });

  it("volume que subiu fica cinza, sem juízo", () => {
    const s = montarSelo(9, { valor: 6, dias: 7 }, METRICAS.vagas_abertas)!;
    expect(s).toMatchObject({ seta: "▲", texto: "3 em 7 dias", tom: "neutro" });
    expect(s.descricao).toBe("Subiu 3 em 7 dias.");
  });

  it("sem mudança", () => {
    expect(montarSelo(5, { valor: 5, dias: 1 }, METRICAS.processos_estourados)).toMatchObject({ seta: "=", texto: "igual a ontem", tom: "neutro" });
    expect(montarSelo(5, { valor: 5, dias: 7 }, METRICAS.processos_estourados)!.texto).toBe("sem mudança em 7 dias");
  });

  it("valor inválido não vira selo", () => {
    expect(montarSelo(Number.NaN, { valor: 5, dias: 1 }, METRICAS.processos_estourados)).toBeNull();
  });
});

describe("pontosDaLinha", () => {
  it("as fotos da janela e o valor de hoje ao vivo, com x pelo calendário", () => {
    const pontos = pontosDaLinha([foto("2026-09-26", 4), foto("2026-10-01", 8), foto(HOJE, 99)], HOJE, 6)!;
    expect(pontos.map((p) => [p.dia, p.valor])).toEqual([
      ["2026-09-26", 4],
      ["2026-10-01", 8],
      [HOJE, 6], // a foto de hoje é trocada pelo valor ao vivo
    ]);
    expect(pontos.map((p) => p.x)).toEqual([0, 0.5, 1]);
    expect(pontos.map((p) => p.y)).toEqual([0, 1, 0.5]);
  });

  it("menos de três pontos não é linha; fora da janela não entra", () => {
    expect(pontosDaLinha([foto("2026-10-05", 4)], HOJE, 6)).toBeNull();
    expect(pontosDaLinha([foto("2026-08-01", 4), foto("2026-10-05", 4)], HOJE, 6)).toBeNull();
  });

  it("nada mudou: linha reta no meio, sem divisão por zero", () => {
    const pontos = pontosDaLinha([foto("2026-10-04", 3), foto("2026-10-05", 3)], HOJE, 3)!;
    expect(pontos.every((p) => p.y === 0.5)).toBe(true);
  });
});

describe("montarTendencia", () => {
  it("sem histórico, nada — o painel fica como era", () => {
    expect(montarTendencia([], HOJE, 10, METRICAS.pagar_vencido)).toBeNull();
  });

  it("com a foto de ontem: selo, mas ainda sem linha", () => {
    const t = montarTendencia([foto("2026-10-05", 8)], HOJE, 10, METRICAS.tarefas_atrasadas)!;
    expect(t.selo?.texto).toBe("2 desde ontem");
    expect(t.linha).toBeNull();
  });

  it("com fotos antigas e nenhuma recente: linha, mas sem selo", () => {
    const t = montarTendencia([foto("2026-09-10", 8), foto("2026-09-20", 9)], HOJE, 10, METRICAS.tarefas_atrasadas)!;
    expect(t.selo).toBeNull();
    expect(t.linha).toHaveLength(3);
  });
});
