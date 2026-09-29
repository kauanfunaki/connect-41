import { describe, expect, it } from "vitest";
import { calcularQualidade, type LinhaDeQualidade } from "./propostas";

const AGORA = new Date("2026-09-29T15:00:00Z");
const linha = (p: Partial<LinhaDeQualidade>): LinhaDeQualidade => ({
  agentCode: "varredura_do_societario",
  status: "APROVADA",
  confidence: "ALTA",
  createdAt: new Date("2026-09-10T15:00:00Z"),
  custoCentavos: 10,
  ...p,
});

describe("painel de qualidade das propostas", () => {
  it("taxas contam só as revisadas; pendente não entra na conta", () => {
    const [q] = calcularQualidade(
      [linha({}), linha({ status: "EDITADA" }), linha({ status: "REJEITADA", confidence: "BAIXA" }), linha({ status: "PENDENTE", custoCentavos: null })],
      AGORA
    );
    expect(q).toMatchObject({ total: 4, pendentes: 1, aprovadas: 1, editadas: 1, rejeitadas: 1, custoCentavos: 30 });
    expect(q.taxaDeEdicao).toBeCloseTo(1 / 3);
    expect(q.taxaDeRejeicao).toBeCloseTo(1 / 3);
    expect(q.confianca).toEqual({ ALTA: 3, MEDIA: 0, BAIXA: 1 });
  });

  it("sem nenhuma revisada, as taxas ficam vazias em vez de zero", () => {
    const [q] = calcularQualidade([linha({ status: "PENDENTE" })], AGORA);
    expect(q.taxaDeEdicao).toBeNull();
  });

  it("seis meses sempre, do mais antigo ao atual, no fuso de São Paulo", () => {
    const [q] = calcularQualidade(
      // 01/09 às 01h UTC ainda é 31/08 em São Paulo.
      [linha({ createdAt: new Date("2026-09-01T01:00:00Z") }), linha({ createdAt: new Date("2026-04-20T12:00:00Z") })],
      AGORA
    );
    expect(q.porMes.map((m) => m.mes)).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
    expect(q.porMes.map((m) => m.total)).toEqual([1, 0, 0, 0, 1, 0]);
  });

  it("um bloco por agente, o mais usado primeiro", () => {
    const r = calcularQualidade([linha({}), linha({ agentCode: "leitor_de_contrato_social" }), linha({ agentCode: "leitor_de_contrato_social" })], AGORA);
    expect(r.map((q) => q.agentCode)).toEqual(["leitor_de_contrato_social", "varredura_do_societario"]);
  });
});
