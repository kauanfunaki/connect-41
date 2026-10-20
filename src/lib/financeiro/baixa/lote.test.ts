import { describe, expect, it } from "vitest";
import { separarLote, validarDiaDoLote } from "./lote";

// O que se testa (19/10): no lote só entra conta com saldo, viva e liberada
// na aprovação — e o dia segue a regra da baixa de uma conta.
describe("separarLote", () => {
  const conta = (o: Partial<Parameters<typeof separarLote>[0][number]>) => ({
    id: "a",
    contraparteNome: "Fornecedor",
    empresaId: "e1",
    status: "CONFERIDO" as const,
    saldoCentavos: 10_000,
    bloqueio: null,
    ...o,
  });

  it("separa as que entram das que ficam, com o motivo", () => {
    const r = separarLote([
      conta({ id: "aberta" }),
      conta({ id: "provisoria", status: "PROVISORIO" }),
      conta({ id: "paga", status: "PAGO", saldoCentavos: 0 }),
      conta({ id: "cancelada", status: "CANCELADO" }),
      conta({ id: "aguardando", bloqueio: "Aguardando aprovação — a baixa só é liberada depois." }),
    ]);
    expect(r.entram.map((c) => c.id)).toEqual(["aberta", "provisoria"]);
    expect(r.ficam).toEqual([
      { id: "paga", contraparteNome: "Fornecedor", motivo: "já está paga" },
      { id: "cancelada", contraparteNome: "Fornecedor", motivo: "cancelada" },
      { id: "aguardando", contraparteNome: "Fornecedor", motivo: "Aguardando aprovação — a baixa só é liberada depois." },
    ]);
  });

  it("a parcial entra pelo saldo", () => {
    expect(separarLote([conta({ saldoCentavos: 6_000 })]).entram[0]!.saldoCentavos).toBe(6_000);
  });
});

describe("validarDiaDoLote", () => {
  it("aceita hoje e antes, recusa futuro e vazio", () => {
    expect(validarDiaDoLote("2026-10-19", "2026-10-19")).toEqual({ ok: true, dataKey: "2026-10-19" });
    expect(validarDiaDoLote("2026-10-01", "2026-10-19")).toMatchObject({ ok: true });
    expect(validarDiaDoLote("2026-10-20", "2026-10-19")).toMatchObject({ ok: false });
    expect(validarDiaDoLote("", "2026-10-19")).toMatchObject({ ok: false });
  });
});
