import { describe, expect, it } from "vitest";
import { algumaTemRegra, encargosDoLote, separarLote, validarDiaDoLote } from "./lote";

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

// Juros e multa no lote (22/10/2026): cada conta pela regra dela, pelo
// vencimento dela e pelo dia do lote.
describe("encargosDoLote", () => {
  const regra = { multa: 20_000, jurosAoMes: 10_000, desconto: 50_000 }; // 2%, 1% a.m., 5%

  it("soma juros e multa das atrasadas e o desconto das em dia, cada uma pela sua regra", () => {
    const r = encargosDoLote(
      [
        { id: "atrasada", saldoCentavos: 100_000, vencimentoKey: "2026-09-22", regra }, // 30 dias: multa 20,00 + juros 10,00
        { id: "em-dia", saldoCentavos: 10_000, vencimentoKey: "2026-10-30", regra }, // desconto 5,00
        { id: "sem-regra", saldoCentavos: 50_000, vencimentoKey: "2026-09-01", regra: null },
        { id: "so-juros", saldoCentavos: 30_000, vencimentoKey: "2026-10-12", regra: { multa: 0, jurosAoMes: 30_000, desconto: 0 } }, // 10 dias de 3% a.m. = 3,00
      ],
      "2026-10-22"
    );
    expect(r.porConta.get("atrasada")).toEqual({ diasDeAtraso: 30, multaCentavos: 2_000, jurosCentavos: 1_000, descontoCentavos: 0 });
    expect(r.porConta.get("em-dia")).toMatchObject({ descontoCentavos: 500 });
    expect(r.porConta.has("sem-regra")).toBe(false);
    expect(r).toMatchObject({ jurosCentavos: 1_300, multaCentavos: 2_000, descontoCentavos: 500, contasComEncargos: 3 });
  });

  it("a data do lote muda tudo: no vencimento não há juros", () => {
    const r = encargosDoLote([{ id: "a", saldoCentavos: 100_000, vencimentoKey: "2026-10-22", regra: { ...regra, desconto: 0 } }], "2026-10-22");
    expect(r.contasComEncargos).toBe(0);
    expect(r.jurosCentavos + r.multaCentavos + r.descontoCentavos).toBe(0);
  });

  it("a opção nasce ligada só quando alguma conta tem regra", () => {
    expect(algumaTemRegra([{ regra: null }, { regra }])).toBe(true);
    expect(algumaTemRegra([{ regra: null }])).toBe(false);
  });
});
