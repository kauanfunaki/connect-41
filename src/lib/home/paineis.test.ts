import { describe, expect, it } from "vitest";
import {
  aPagarPorSemana,
  carteiraPorFaixa,
  contarFerias,
  contarTarefas,
  faixaDeVencimento,
  faixasDasPendencias,
} from "./paineis";

// 30/09/2026 é uma quarta-feira; a semana começa na segunda, 28/09.
const HOJE = "2026-09-30";

describe("faixaDeVencimento", () => {
  it("separa vencida, hoje, próximos 7 dias e depois", () => {
    expect(faixaDeVencimento("2026-09-29", HOJE)).toBe("vencida");
    expect(faixaDeVencimento("2026-09-30", HOJE)).toBe("hoje");
    expect(faixaDeVencimento("2026-10-01", HOJE)).toBe("semana");
    expect(faixaDeVencimento("2026-10-07", HOJE)).toBe("semana");
    expect(faixaDeVencimento("2026-10-08", HOJE)).toBe("depois");
  });
});

describe("carteiraPorFaixa", () => {
  it("conta e soma só o tipo pedido", () => {
    const titulos = [
      { kind: "PAGAR" as const, centavos: 1000, vencimentoKey: "2026-09-01" },
      { kind: "PAGAR" as const, centavos: 500, vencimentoKey: "2026-09-02" },
      { kind: "PAGAR" as const, centavos: 700, vencimentoKey: HOJE },
      { kind: "RECEBER" as const, centavos: 9999, vencimentoKey: "2026-09-01" },
    ];
    const f = carteiraPorFaixa(titulos, "PAGAR", HOJE);
    expect(f.vencida).toEqual({ n: 2, centavos: 1500 });
    expect(f.hoje).toEqual({ n: 1, centavos: 700 });
    expect(f.semana).toEqual({ n: 0, centavos: 0 });
    expect(carteiraPorFaixa(titulos, "RECEBER", HOJE).vencida).toEqual({ n: 1, centavos: 9999 });
  });
});

describe("aPagarPorSemana", () => {
  it("agrupa de segunda a domingo, a partir da semana de hoje, sem o vencido", () => {
    const titulos = [
      { kind: "PAGAR" as const, centavos: 100, vencimentoKey: "2026-09-28" }, // vencido (segunda desta semana)
      { kind: "PAGAR" as const, centavos: 200, vencimentoKey: HOJE },
      { kind: "PAGAR" as const, centavos: 300, vencimentoKey: "2026-10-04" }, // domingo desta semana
      { kind: "PAGAR" as const, centavos: 400, vencimentoKey: "2026-10-05" }, // segunda seguinte
      { kind: "RECEBER" as const, centavos: 999, vencimentoKey: HOJE },
      { kind: "PAGAR" as const, centavos: 500, vencimentoKey: "2026-11-09" }, // fora das seis semanas
    ];
    const semanas = aPagarPorSemana(titulos, HOJE);
    expect(semanas).toHaveLength(6);
    expect(semanas[0]).toEqual({ inicioKey: "2026-09-28", n: 2, centavos: 500 });
    expect(semanas[1]).toEqual({ inicioKey: "2026-10-05", n: 1, centavos: 400 });
    expect(semanas[5].inicioKey).toBe("2026-11-02");
    expect(semanas.reduce((s, x) => s + x.centavos, 0)).toBe(900);
  });
});

describe("faixasDasPendencias", () => {
  it("tira as vencidas das outras duas partes", () => {
    expect(faixasDasPendencias({ aguardando: 10, respondidas: 4, vencidasAguardando: 3, vencidasRespondidas: 1 })).toEqual({
      vencidas: 4,
      respondidas: 3,
      aguardando: 7,
    });
  });
});

describe("contarTarefas", () => {
  it("usa o mesmo corte do Meu dia", () => {
    const inicio = new Date("2026-09-30T00:00:00");
    const fim = new Date("2026-09-30T23:59:59.999");
    const c = contarTarefas(
      [
        { dueDate: null },
        { dueDate: new Date("2026-09-29T12:00:00") },
        { dueDate: new Date("2026-09-30T18:00:00") },
        { dueDate: new Date("2026-10-02T09:00:00") },
      ],
      inicio,
      fim
    );
    expect(c).toEqual({ atrasada: 1, hoje: 1, adiante: 1, sem_prazo: 1 });
  });
});

describe("contarFerias", () => {
  it("vencida, a vencer em 60 dias e no prazo; sem período concessivo fica no prazo", () => {
    const agora = new Date("2026-09-30T12:00:00Z");
    const c = contarFerias(
      [
        { concessivePeriodEnd: new Date("2026-09-01T00:00:00Z") },
        { concessivePeriodEnd: new Date("2026-11-15T00:00:00Z") },
        { concessivePeriodEnd: new Date("2027-03-01T00:00:00Z") },
        { concessivePeriodEnd: null },
      ],
      agora
    );
    expect(c).toEqual({ vencidas: 1, aVencer: 1, noPrazo: 2 });
  });
});
