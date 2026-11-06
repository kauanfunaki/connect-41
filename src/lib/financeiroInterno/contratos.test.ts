import { describe, expect, it } from "vitest";
import { contratoSchema, custoMensalEmCentavos, situacaoDaRenovacao } from "./contratos";

// Os Contratos e assinaturas do Financeiro (05/11/2026).

describe("custoMensalEmCentavos", () => {
  it("divide pelo ciclo; cancelado não pesa", () => {
    expect(custoMensalEmCentavos({ amountCents: 12_000, cycle: "MENSAL", status: "ATIVO" })).toBe(12_000);
    expect(custoMensalEmCentavos({ amountCents: 120_000, cycle: "ANUAL", status: "ATIVO" })).toBe(10_000);
    expect(custoMensalEmCentavos({ amountCents: 10_000, cycle: "TRIMESTRAL", status: "ATIVO" })).toBe(3_333);
    expect(custoMensalEmCentavos({ amountCents: 12_000, cycle: "MENSAL", status: "CANCELADO" })).toBe(0);
  });
});

describe("situacaoDaRenovacao", () => {
  const hoje = new Date(2026, 10, 5, 15, 0);
  const dia = (iso: string) => new Date(`${iso}T00:00:00Z`);
  it("vencida, em 30 dias, em dia, sem data, cancelado", () => {
    expect(situacaoDaRenovacao({ status: "ATIVO", renewalDate: dia("2026-11-04") }, hoje)).toBe("vencida");
    expect(situacaoDaRenovacao({ status: "ATIVO", renewalDate: dia("2026-11-05") }, hoje)).toBe("renova_em_breve");
    expect(situacaoDaRenovacao({ status: "ATIVO", renewalDate: dia("2026-12-05") }, hoje)).toBe("renova_em_breve");
    expect(situacaoDaRenovacao({ status: "ATIVO", renewalDate: dia("2026-12-06") }, hoje)).toBe("em_dia");
    expect(situacaoDaRenovacao({ status: "ATIVO", renewalDate: null }, hoje)).toBe("sem_data");
    expect(situacaoDaRenovacao({ status: "CANCELADO", renewalDate: dia("2026-11-04") }, hoje)).toBe("cancelado");
  });
});

describe("contratoSchema", () => {
  const base = { name: "Google Workspace", supplier: "Google", category: "SOFTWARE", amountCents: 9_000, cycle: "MENSAL", autoRenew: true };
  it("aceita o básico e limpa o vazio", () => {
    expect(contratoSchema.parse({ ...base, url: "", notes: "" })).toMatchObject({ url: null, notes: null, startDate: null });
  });
  it("recusa valor inválido, endereço sem http e fim antes do início", () => {
    expect(contratoSchema.safeParse({ ...base, amountCents: Number.NaN }).success).toBe(false);
    expect(contratoSchema.safeParse({ ...base, url: "workspace.google.com" }).success).toBe(false);
    expect(contratoSchema.safeParse({ ...base, startDate: "2026-11-05", endDate: "2026-11-01" }).success).toBe(false);
  });
});
