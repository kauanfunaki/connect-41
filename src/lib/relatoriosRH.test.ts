import { describe, expect, it } from "vitest";
import {
  daysUntil,
  classificarFerias,
  calcularValidade,
  classificarTreinamento,
  classificarDistorcao,
  FERIAS_JANELA_DIAS,
  TREINAMENTO_JANELA_DIAS,
} from "./relatoriosRH";

const HOJE = new Date("2026-08-05T00:00:00Z");

describe("daysUntil", () => {
  it("conta dias corridos e ignora a hora do dia", () => {
    expect(daysUntil(new Date("2026-08-10T00:00:00Z"), HOJE)).toBe(5);
    expect(daysUntil(new Date("2026-08-10T23:59:00Z"), HOJE)).toBe(5);
    expect(daysUntil(new Date("2026-08-01T00:00:00Z"), HOJE)).toBe(-4);
  });
});

describe("classificarFerias", () => {
  it("período concessivo no passado = VENCIDA", () => {
    const r = classificarFerias(new Date("2026-07-01T00:00:00Z"), null, HOJE, FERIAS_JANELA_DIAS);
    expect(r.situacao).toBe("VENCIDA");
    expect(r.diasParaVencer).toBeLessThan(0);
  });

  it("dentro da janela e sem data marcada = A_VENCER", () => {
    const r = classificarFerias(new Date("2026-09-01T00:00:00Z"), null, HOJE, FERIAS_JANELA_DIAS);
    expect(r.situacao).toBe("A_VENCER");
  });

  it("com data de início marcada = PROGRAMADA, mesmo perto do vencimento", () => {
    const r = classificarFerias(
      new Date("2026-08-20T00:00:00Z"),
      new Date("2026-08-10T00:00:00Z"),
      HOJE,
      FERIAS_JANELA_DIAS
    );
    expect(r.situacao).toBe("PROGRAMADA");
  });

  it("vencida tem prioridade sobre programada", () => {
    const r = classificarFerias(
      new Date("2026-07-01T00:00:00Z"),
      new Date("2026-09-01T00:00:00Z"),
      HOJE,
      FERIAS_JANELA_DIAS
    );
    expect(r.situacao).toBe("VENCIDA");
  });

  it("fora da janela = EM_DIA", () => {
    const r = classificarFerias(new Date("2027-06-01T00:00:00Z"), null, HOJE, FERIAS_JANELA_DIAS);
    expect(r.situacao).toBe("EM_DIA");
  });

  it("sem período concessivo não quebra", () => {
    expect(classificarFerias(null, null, HOJE, FERIAS_JANELA_DIAS).situacao).toBe("EM_DIA");
    expect(classificarFerias(null, new Date("2026-09-01T00:00:00Z"), HOJE, FERIAS_JANELA_DIAS).situacao).toBe("PROGRAMADA");
  });
});

describe("calcularValidade", () => {
  it("soma os meses de validade", () => {
    expect(calcularValidade(new Date("2026-01-15T00:00:00Z"), 12)?.toISOString().slice(0, 10)).toBe("2027-01-15");
    expect(calcularValidade(new Date("2026-11-10T00:00:00Z"), 3)?.toISOString().slice(0, 10)).toBe("2027-02-10");
  });

  it("sem validade definida retorna null", () => {
    expect(calcularValidade(new Date("2026-01-15T00:00:00Z"), null)).toBeNull();
    expect(calcularValidade(new Date("2026-01-15T00:00:00Z"), 0)).toBeNull();
  });
});

describe("classificarTreinamento", () => {
  it("quem não concluiu fica PENDENTE, sem validade a expirar", () => {
    const r = classificarTreinamento("CONVOCADO", new Date("2024-01-01T00:00:00Z"), 12, HOJE, TREINAMENTO_JANELA_DIAS);
    expect(r.situacao).toBe("PENDENTE");
    expect(r.validadeAte).toBeNull();
  });

  it("concluído com validade estourada = VENCIDO", () => {
    const r = classificarTreinamento("CONCLUIDO", new Date("2025-01-01T00:00:00Z"), 12, HOJE, TREINAMENTO_JANELA_DIAS);
    expect(r.situacao).toBe("VENCIDO");
    expect(r.diasParaVencer).toBeLessThan(0);
  });

  it("concluído dentro da janela = A_VENCER", () => {
    // validade em 2026-09-01 → 27 dias de HOJE
    const r = classificarTreinamento("REALIZADO", new Date("2025-09-01T00:00:00Z"), 12, HOJE, TREINAMENTO_JANELA_DIAS);
    expect(r.situacao).toBe("A_VENCER");
  });

  it("concluído longe do vencimento = VALIDO", () => {
    const r = classificarTreinamento("CONCLUIDO", new Date("2026-06-01T00:00:00Z"), 24, HOJE, TREINAMENTO_JANELA_DIAS);
    expect(r.situacao).toBe("VALIDO");
  });

  it("treinamento sem validade nunca vence", () => {
    const r = classificarTreinamento("CONCLUIDO", new Date("2020-01-01T00:00:00Z"), null, HOJE, TREINAMENTO_JANELA_DIAS);
    expect(r.situacao).toBe("SEM_VALIDADE");
    expect(r.diasParaVencer).toBeNull();
  });
});

describe("classificarDistorcao", () => {
  it("salário abaixo do mínimo da faixa", () => {
    const r = classificarDistorcao(2000, 2500, 4000, true);
    expect(r.tipo).toBe("ABAIXO_FAIXA");
    expect(r.desvioPct).toBe(-20);
  });

  it("salário acima do máximo da faixa", () => {
    const r = classificarDistorcao(5000, 2500, 4000, true);
    expect(r.tipo).toBe("ACIMA_FAIXA");
    expect(r.desvioPct).toBe(25);
  });

  it("dentro da faixa não é distorção", () => {
    expect(classificarDistorcao(3000, 2500, 4000, true).tipo).toBe("SEM_FAIXA");
  });

  it("limites da faixa não são distorção", () => {
    expect(classificarDistorcao(2500, 2500, 4000, true).tipo).toBe("SEM_FAIXA");
    expect(classificarDistorcao(4000, 2500, 4000, true).tipo).toBe("SEM_FAIXA");
  });

  it("sem cargo ou sem faixa não classifica", () => {
    expect(classificarDistorcao(3000, 2500, 4000, false).tipo).toBe("SEM_CARGO");
    expect(classificarDistorcao(3000, null, null, true).tipo).toBe("SEM_FAIXA");
    expect(classificarDistorcao(null, 2500, 4000, true).tipo).toBe("SEM_FAIXA");
  });

  it("faixa só com mínimo ainda detecta quem está abaixo", () => {
    expect(classificarDistorcao(1000, 2500, null, true).tipo).toBe("ABAIXO_FAIXA");
  });
});
