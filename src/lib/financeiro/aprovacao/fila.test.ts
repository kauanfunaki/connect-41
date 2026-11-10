import { describe, expect, it } from "vitest";
import { SITUACAO_PADRAO_DA_FILA, situacaoDaFila, whereDaFilaDeAprovacoes } from "./fila";

// O recorte da fila de /aprovacoes, que a tela e o balão da aba "Aprovações"
// das Solicitações leem do mesmo lugar (10/11/2026).

describe("situacaoDaFila", () => {
  it("abre em aguardando e reprovadas — as duas travam a baixa", () => {
    expect(situacaoDaFila(undefined)).toBe(SITUACAO_PADRAO_DA_FILA);
    expect(SITUACAO_PADRAO_DA_FILA.status).toEqual(["AGUARDANDO", "REPROVADO"]);
  });

  it("segue o ?situacao= da URL", () => {
    expect(situacaoDaFila("aguardando").status).toEqual(["AGUARDANDO"]);
    expect(situacaoDaFila("reprovadas").status).toEqual(["REPROVADO"]);
  });

  it("valor desconhecido cai na padrão", () => {
    expect(situacaoDaFila("aprovadas")).toBe(SITUACAO_PADRAO_DA_FILA);
    expect(situacaoDaFila("")).toBe(SITUACAO_PADRAO_DA_FILA);
  });
});

describe("whereDaFilaDeAprovacoes", () => {
  it("sem empresa: as contas a pagar não canceladas do escritório", () => {
    expect(whereDaFilaDeAprovacoes("t1", null)).toEqual({ tenantId: "t1", kind: "PAGAR", status: { not: "CANCELADO" } });
  });

  it("com empresa: só as dela", () => {
    expect(whereDaFilaDeAprovacoes("t1", "c1")).toEqual({ tenantId: "t1", kind: "PAGAR", status: { not: "CANCELADO" }, companyId: "c1" });
  });
});
