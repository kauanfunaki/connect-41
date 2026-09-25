import { describe, expect, it } from "vitest";
import { juntarBaixas, lerContasCorrentes, ligarContas, mapearLinhaDeConta, type BaixaDoOmie } from "./conciliacao";
import { lerCursor } from "./sincronizacaoFinanceiro";

// Formato visto na resposta real de 25/09 (ER Dias), com valores trocados.
function linha(detalhes: Record<string, unknown> = {}) {
  return {
    detalhes: {
      cGrupo: "CONTA_CORRENTE_PAG",
      cOrigem: "BAXP",
      cStatus: "PAGO",
      cNatureza: "P",
      nCodTitulo: 7001,
      nCodBaixa: 8001,
      nCodCC: 4242,
      nCodMovCC: 9001,
      nValorMovCC: -150.25,
      dDtPagamento: "03/08/2026",
      dDtCredito: "03/08/2026",
      dDtConcilia: "04/08/2026",
      cHrConcilia: "08:17:35",
      cCodCateg: "2.05.04",
      ...detalhes,
    },
    resumo: { nValPago: 150.25 },
  };
}

describe("mapearLinhaDeConta", () => {
  it("baixa conciliada", () => {
    expect(mapearLinhaDeConta(linha())).toEqual({
      tipo: "baixa",
      omieTitleId: "7001",
      baixaId: "8001",
      contaId: "4242",
      valor: 150.25,
      pagamento: new Date("2026-08-03T12:00:00-03:00"),
      conciliadoEm: new Date("2026-08-04T08:17:35-03:00"),
    });
  });

  it("baixa ainda não conciliada", () => {
    expect(mapearLinhaDeConta(linha({ dDtConcilia: "", cHrConcilia: "" }))).toMatchObject({ tipo: "baixa", conciliadoEm: null });
  });

  it("transferência sem título vira lançamento de conta, com competência do pagamento", () => {
    const r = mapearLinhaDeConta(
      linha({ nCodTitulo: 0, nCodBaixa: undefined, cOrigem: "TRAR", cNatureza: "R", nValorMovCC: 500, cCodCateg: "0.01.01" })
    );
    expect(r).toMatchObject({
      tipo: "avulso",
      transferencia: true,
      movimentoId: "9001",
      kind: "RECEBER",
      valor: 500,
      competencia: "2026-08",
      categoriaCodigo: "0.01.01",
    });
  });

  it("tarifa lançada do extrato (EXTP) entra como lançamento de conta, não transferência", () => {
    expect(
      mapearLinhaDeConta(linha({ nCodTitulo: 0, nCodBaixa: undefined, cOrigem: "EXTP", nCodCliente: 0, cCPFCNPJCliente: "" }))
    ).toMatchObject({ tipo: "avulso", transferencia: false, kind: "PAGAR", contraparteCodigo: null, categoriaCodigo: "2.05.04" });
  });

  it("sem título e sem código de movimento fica de fora", () => {
    expect(mapearLinhaDeConta(linha({ nCodTitulo: 0, nCodMovCC: 0 }))).toEqual({ fora: "sem_movimento" });
  });

  it("sem valor fica de fora", () => {
    expect(mapearLinhaDeConta(linha({ nValorMovCC: 0 }))).toEqual({ fora: "sem_valor" });
  });
});

describe("juntarBaixas", () => {
  const b = (x: Partial<BaixaDoOmie>): BaixaDoOmie => ({
    tipo: "baixa",
    omieTitleId: "1",
    baixaId: "b1",
    contaId: "c1",
    valor: 100,
    pagamento: new Date("2026-08-01T12:00:00-03:00"),
    conciliadoEm: new Date("2026-08-02T10:00:00-03:00"),
    ...x,
  });

  it("parcial: soma, fica com a última, conciliado só se todas estiverem", () => {
    const [t] = juntarBaixas([
      b({ baixaId: "b2", contaId: "c2", valor: 40, pagamento: new Date("2026-08-10T12:00:00-03:00"), conciliadoEm: null }),
      b({ valor: 60 }),
    ]);
    expect(t).toEqual({ omieTitleId: "1", baixaId: "b2", contaId: "c2", valor: 100, conciliadoEm: null });
  });

  it("todas conciliadas: a data mais recente", () => {
    const [t] = juntarBaixas([
      b({ conciliadoEm: new Date("2026-08-05T10:00:00-03:00") }),
      b({ baixaId: "b2", conciliadoEm: new Date("2026-08-03T10:00:00-03:00") }),
    ]);
    expect(t.conciliadoEm).toEqual(new Date("2026-08-05T10:00:00-03:00"));
  });
});

describe("contas correntes", () => {
  const omie = lerContasCorrentes([
    { nCodCC: 1, tipo_conta_corrente: "CX", codigo_banco: "999", descricao: "Caixa" },
    { nCodCC: 2, tipo_conta_corrente: "CC", codigo_banco: "33", numero_conta_corrente: "013.000.123-4", descricao: "Santander", inativo: "N" },
    { nCodCC: 3, tipo_conta_corrente: "CC", codigo_banco: "237", numero_conta_corrente: "55555-0", descricao: "Bradesco", inativo: "N" },
    { nCodCC: 4, tipo_conta_corrente: "CC", codigo_banco: "237", numero_conta_corrente: "55555-0", descricao: "Bradesco velho", inativo: "S" },
    { nCodCC: 5, tipo_conta_corrente: "CC", codigo_banco: "341", numero_conta_corrente: "777", descricao: "Itaú A", inativo: "N" },
    { nCodCC: 6, tipo_conta_corrente: "CC", codigo_banco: "341", numero_conta_corrente: "777", descricao: "Itaú B", inativo: "N" },
  ]);

  it("lê só conta corrente, com banco de 3 dígitos e número sem zero à esquerda", () => {
    expect(omie.map((c) => c.id)).toEqual(["2", "3", "4", "5", "6"]);
    expect(omie[0]).toMatchObject({ banco: "033", conta: "130001234", numero: "013.000.123-4", rotulo: "Santander" });
  });

  it("liga por banco e número, com ou sem dígito; ativa ganha da inativa; empate não liga", () => {
    const ligadas = ligarContas(
      [
        { id: "a", bankCode: "033", accountDigits: "13000123" }, // sem o dígito
        { id: "b", bankCode: "237", accountDigits: "555550" },
        { id: "c", bankCode: "341", accountDigits: "777" }, // duas no Omie
        { id: "d", bankCode: "001", accountDigits: "123" },
      ],
      omie
    );
    expect(ligadas.get("a")?.id).toBe("2");
    expect(ligadas.get("b")?.id).toBe("3");
    expect(ligadas.has("c")).toBe(false);
    expect(ligadas.has("d")).toBe(false);
  });

  it("duas contas do Connect para a mesma do Omie: nenhuma liga", () => {
    const ligadas = ligarContas(
      [
        { id: "a", bankCode: "237", accountDigits: "555550" },
        { id: "b", bankCode: "237", accountDigits: "55555" },
      ],
      omie
    );
    expect(ligadas.size).toBe(0);
  });
});

describe("lerCursor", () => {
  it("fase e página; número puro é da versão anterior", () => {
    expect(lerCursor(null)).toEqual({ fase: "t", pagina: 1 });
    expect(lerCursor("7")).toEqual({ fase: "t", pagina: 7 });
    expect(lerCursor("c:3")).toEqual({ fase: "c", pagina: 3 });
    expect(lerCursor("lixo")).toEqual({ fase: "t", pagina: 1 });
  });
});
