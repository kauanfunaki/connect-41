import { describe, expect, it } from "vitest";
import { lerFormularioDaTaxa } from "./taxa-form";

// Lançar a taxa do processo pela tela (30/10/2026).

const base = { processId: "p1", description: "Taxa da Junta Comercial", amount: "R$ 1.234,56", dueDate: "2026-11-10", protocolId: "", paidAt: "" };

describe("lerFormularioDaTaxa", () => {
  it("lê o valor como o setor digita e as datas do campo", () => {
    const r = lerFormularioDaTaxa(base);
    expect(r).toEqual({
      ok: true,
      dados: { processId: "p1", description: "Taxa da Junta Comercial", amountCents: 123_456, dueDate: expect.any(Date), protocolId: null, paidAt: null },
    });
  });

  it("guarda a tentativa e o pagamento quando vêm", () => {
    const r = lerFormularioDaTaxa({ ...base, protocolId: "prot-2", paidAt: "2026-11-05" });
    expect(r.ok && r.dados.protocolId).toBe("prot-2");
    expect(r.ok && r.dados.paidAt).toBeInstanceOf(Date);
  });

  it("recusa sem descrição, sem valor, valor zero ou negativo e data inválida", () => {
    expect(lerFormularioDaTaxa({ ...base, description: " " }).ok).toBe(false);
    expect(lerFormularioDaTaxa({ ...base, amount: "" }).ok).toBe(false);
    expect(lerFormularioDaTaxa({ ...base, amount: "0,00" }).ok).toBe(false);
    expect(lerFormularioDaTaxa({ ...base, amount: "-10" }).ok).toBe(false);
    expect(lerFormularioDaTaxa({ ...base, dueDate: "10/11/2026" }).ok).toBe(false);
    expect(lerFormularioDaTaxa({ ...base, description: "x".repeat(161) }).ok).toBe(false);
  });

  it("vencimento em branco é aceito: nem toda guia vem com data", () => {
    const r = lerFormularioDaTaxa({ ...base, dueDate: "" });
    expect(r.ok && r.dados.dueDate).toBeNull();
  });
});
