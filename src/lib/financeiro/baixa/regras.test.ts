import { describe, expect, it } from "vitest";
import { validarBaixa, saldoEmAberto, estadoDaConta, categoriaDaParte, ehCategoriaDaParte, movimentosDaBaixa, planoDoEspelho, type BaixaNoEspelho } from "./regras";

const HOJE = "2026-10-19";

describe("validarBaixa", () => {
  it("baixa cheia, sem encargos: quita e o total é o principal", () => {
    expect(validarBaixa({ data: "2026-10-15", principal: "1.000,00" }, 100_000, HOJE)).toEqual({
      ok: true,
      dados: { dataKey: "2026-10-15", principalCentavos: 100_000, jurosCentavos: 0, multaCentavos: 0, descontoCentavos: 0, caixaCentavos: 100_000, quita: true },
    });
  });

  it("com multa e juros, o total passa do principal e a conta quita", () => {
    const r = validarBaixa({ data: "2026-10-15", principal: "1000", juros: "3,00", multa: "20,00" }, 100_000, HOJE);
    expect(r).toMatchObject({ ok: true, dados: { caixaCentavos: 102_300, quita: true } });
  });

  it("parcial: menos que o saldo não quita", () => {
    expect(validarBaixa({ data: "2026-10-15", principal: "400" }, 100_000, HOJE)).toMatchObject({ ok: true, dados: { quita: false, caixaCentavos: 40_000 } });
  });

  it("desconto reduz o total; desconto de 100% deixa total zero", () => {
    expect(validarBaixa({ data: "2026-10-15", principal: "100", desconto: "10" }, 10_000, HOJE)).toMatchObject({ ok: true, dados: { caixaCentavos: 9_000 } });
    expect(validarBaixa({ data: "2026-10-15", principal: "100", desconto: "100" }, 10_000, HOJE)).toMatchObject({ ok: true, dados: { caixaCentavos: 0 } });
  });

  it("recusas: data futura, acima do saldo, zero, desconto maior que o total, sem saldo, texto ilegível", () => {
    expect(validarBaixa({ data: "2026-10-20", principal: "10" }, 1_000, HOJE)).toMatchObject({ ok: false, erro: expect.stringMatching(/agendamento/) });
    expect(validarBaixa({ data: "2026-10-15", principal: "10,01" }, 1_000, HOJE)).toMatchObject({ ok: false, erro: expect.stringMatching(/saldo/) });
    expect(validarBaixa({ data: "2026-10-15", principal: "0" }, 1_000, HOJE).ok).toBe(false);
    expect(validarBaixa({ data: "2026-10-15", principal: "10", desconto: "10,01" }, 1_000, HOJE)).toMatchObject({ ok: false, erro: expect.stringMatching(/desconto/) });
    expect(validarBaixa({ data: "2026-10-15", principal: "10" }, 0, HOJE)).toMatchObject({ ok: false, erro: expect.stringMatching(/saldo/) });
    expect(validarBaixa({ data: "2026-10-15", principal: "10", juros: "abc" }, 1_000, HOJE).ok).toBe(false);
    expect(validarBaixa({ data: "", principal: "10" }, 1_000, HOJE).ok).toBe(false);
  });
});

describe("saldoEmAberto", () => {
  it("nunca negativo", () => {
    expect(saldoEmAberto(1_000, 400)).toBe(600);
    expect(saldoEmAberto(1_000, 1_200)).toBe(0);
  });
});

describe("estadoDaConta", () => {
  const conta = { valorCentavos: 100_000, status: "CONFERIDO" as const };

  it("sem baixa: como estava", () => {
    expect(estadoDaConta(conta, [])).toEqual({ baixadoCentavos: 0, quitada: false, ultimaDataKey: null, status: "CONFERIDO" });
  });

  it("parcial continua em aberto, sem data de pagamento", () => {
    expect(estadoDaConta(conta, [{ principalCentavos: 40_000, dataKey: "2026-10-05" }])).toEqual({
      baixadoCentavos: 40_000,
      quitada: false,
      ultimaDataKey: null,
      status: "CONFERIDO",
    });
  });

  it("quitada em duas vezes: paga, com a data da última", () => {
    const r = estadoDaConta(conta, [
      { principalCentavos: 60_000, dataKey: "2026-10-12" },
      { principalCentavos: 40_000, dataKey: "2026-10-05" },
    ]);
    expect(r).toEqual({ baixadoCentavos: 100_000, quitada: true, ultimaDataKey: "2026-10-12", status: "PAGO" });
  });

  it("paga que perdeu a baixa volta a conferida; provisória que recebeu parcial continua provisória", () => {
    expect(estadoDaConta({ ...conta, status: "PAGO" }, [{ principalCentavos: 10_000, dataKey: "2026-10-05" }]).status).toBe("CONFERIDO");
    expect(estadoDaConta({ ...conta, status: "PROVISORIO" }, [{ principalCentavos: 10_000, dataKey: "2026-10-05" }]).status).toBe("PROVISORIO");
  });

  it("cancelada continua cancelada", () => {
    expect(estadoDaConta({ ...conta, status: "CANCELADO" }, []).status).toBe("CANCELADO");
  });
});

describe("categoriaDaParte", () => {
  it("conta a pagar: juros e multa são despesa; desconto obtido é receita", () => {
    expect(categoriaDaParte("PAGAR", "encargos")).toEqual({ nome: "Juros pagos para Fornecedores", kind: "PAGAR", dreGroup: "outras_despesas" });
    expect(categoriaDaParte("PAGAR", "desconto")).toMatchObject({ kind: "RECEBER", dreGroup: "outras_receitas" });
  });

  it("conta a receber: juros e multa recebidos são receita; desconto concedido é despesa", () => {
    expect(categoriaDaParte("RECEBER", "encargos")).toMatchObject({ kind: "RECEBER", dreGroup: "outras_receitas" });
    expect(categoriaDaParte("RECEBER", "desconto")).toMatchObject({ kind: "PAGAR", dreGroup: "outras_despesas" });
  });

  it("casa pelo nome sem acento nem caixa", () => {
    expect(ehCategoriaDaParte("juros pagos para fornecedores", categoriaDaParte("PAGAR", "encargos"))).toBe(true);
    expect(ehCategoriaDaParte("Juros sobre empréstimos", categoriaDaParte("PAGAR", "encargos"))).toBe(false);
  });
});

describe("movimentosDaBaixa", () => {
  const base = { categoryId: "cat", interestCategoryId: "jur", discountCategoryId: "desc" };

  it("conta a pagar: principal e encargos saem, desconto entra — a soma é o total pago", () => {
    const m = movimentosDaBaixa({ ...base, kind: "PAGAR", principalCentavos: 100_000, jurosCentavos: 300, multaCentavos: 2_000, descontoCentavos: 500 });
    expect(m).toEqual([
      { kind: "PAGAR", centavos: 100_000, categoryId: "cat", parte: "principal" },
      { kind: "PAGAR", centavos: 2_300, categoryId: "jur", parte: "encargos" },
      { kind: "RECEBER", centavos: 500, categoryId: "desc", parte: "desconto" },
    ]);
    const liquido = m.reduce((s, x) => s + (x.kind === "PAGAR" ? x.centavos : -x.centavos), 0);
    expect(liquido).toBe(101_800);
  });

  it("sem encargos nem desconto: só o principal", () => {
    expect(movimentosDaBaixa({ ...base, kind: "RECEBER", principalCentavos: 1_000, jurosCentavos: 0, multaCentavos: 0, descontoCentavos: 0 })).toHaveLength(1);
  });

  it("conta a receber: desconto concedido sai", () => {
    const m = movimentosDaBaixa({ ...base, kind: "RECEBER", principalCentavos: 1_000, jurosCentavos: 0, multaCentavos: 0, descontoCentavos: 100 });
    expect(m[1]).toEqual({ kind: "PAGAR", centavos: 100, categoryId: "desc", parte: "desconto" });
  });
});

// O que se testa (19/10, revisão do lote C): o Omie só mexe nas baixas dele, e
// nunca na que alguém conciliou aqui com o extrato.
describe("planoDoEspelho", () => {
  const DIA = Date.parse("2026-10-07T18:30:00Z");
  const OUTRO = Date.parse("2026-10-20T15:00:00Z");
  const baixa = (o: Partial<BaixaNoEspelho>): BaixaNoEspelho => ({ id: "b1", origem: "OMIE", principalCentavos: 100_000, paidAtMs: DIA, chave: null, vinculo: null, ...o });
  const pago = { pagoCentavos: 100_000, paidAtMs: DIA };
  const aberto = { pagoCentavos: 0, paidAtMs: null };

  it("paga no Omie e sem baixa aqui: nasce a cheia", () => {
    expect(planoDoEspelho([], pago)).toMatchObject({ criar: [{ chave: null, principalCentavos: 100_000, paidAtMs: DIA }], atualizar: [], apagar: [], conflito: false, baixadoCentavos: 100_000 });
  });

  it("igual ao Omie: nada a fazer", () => {
    expect(planoDoEspelho([baixa({})], pago)).toMatchObject({ criar: [], atualizar: [], apagar: [], conflito: false });
  });

  it("parcial feita aqui e o Omie dá por paga: a do Omie é só o resto", () => {
    const p = planoDoEspelho([baixa({ id: "m", origem: "MANUAL", principalCentavos: 40_000 })], pago);
    expect(p).toMatchObject({ criar: [{ principalCentavos: 60_000 }], baixadoCentavos: 100_000 });
  });

  it("paga aqui pelo botão e em aberto no Omie: a daqui fica, sem conflito", () => {
    const p = planoDoEspelho([baixa({ id: "m", origem: "MANUAL" })], aberto);
    expect(p).toMatchObject({ criar: [], atualizar: [], apagar: [], conflito: false, baixadoCentavos: 100_000 });
  });

  it("estorno no Omie: a baixa dele sai, e a ligada pela conciliação do Omie sai do extrato junto", () => {
    expect(planoDoEspelho([baixa({ vinculo: { peloOmie: true } })], aberto)).toMatchObject({ apagar: [{ id: "b1", desvincular: true }], conflito: false, baixadoCentavos: 0 });
    expect(planoDoEspelho([baixa({ origem: "MIGRACAO" })], aberto)).toMatchObject({ apagar: [{ id: "b1", desvincular: false }] });
  });

  it("estorno no Omie de baixa conciliada aqui com o extrato: não mexe, é conflito", () => {
    const p = planoDoEspelho([baixa({ origem: "MIGRACAO", vinculo: { peloOmie: false } })], aberto);
    expect(p).toMatchObject({ criar: [], atualizar: [], apagar: [], conflito: true, baixadoCentavos: 100_000 });
  });

  it("o Omie muda valor ou dia: a baixa dele acompanha — a conciliada aqui, não", () => {
    const outroDia = { pagoCentavos: 120_000, paidAtMs: OUTRO };
    expect(planoDoEspelho([baixa({ vinculo: { peloOmie: true } })], outroDia)).toMatchObject({
      atualizar: [{ id: "b1", principalCentavos: 120_000, paidAtMs: OUTRO, desvincular: true }],
    });
    const presa = planoDoEspelho([baixa({ vinculo: { peloOmie: false } })], outroDia);
    expect(presa).toMatchObject({ criar: [{ principalCentavos: 20_000 }], atualizar: [], conflito: false });
  });

  it("baixas daqui acima do valor do Omie: conflito só com a do Omie presa", () => {
    const menor = { pagoCentavos: 80_000, paidAtMs: DIA };
    expect(planoDoEspelho([baixa({ vinculo: { peloOmie: false } })], menor)).toMatchObject({ apagar: [], conflito: true });
    expect(planoDoEspelho([baixa({ origem: "MANUAL" })], menor)).toMatchObject({ apagar: [], conflito: false });
  });

  // As parciais do Omie (fila do BPO, 19/10).
  const parcial = (baixas?: { chave: string; principalCentavos: number; paidAtMs: number }[]) => ({ pagoCentavos: 70_000, paidAtMs: OUTRO, baixas });

  it("parcial no Omie, sem baixa aqui: uma baixa por pagamento de lá, cada uma no seu dia", () => {
    const p = planoDoEspelho([], parcial([{ chave: "11", principalCentavos: 30_000, paidAtMs: DIA }, { chave: "12", principalCentavos: 40_000, paidAtMs: OUTRO }]));
    expect(p.criar).toEqual([
      { chave: "11", principalCentavos: 30_000, paidAtMs: DIA },
      { chave: "12", principalCentavos: 40_000, paidAtMs: OUTRO },
    ]);
    expect(p.baixadoCentavos).toBe(70_000);
  });

  it("parcial sem as baixas uma a uma: o pago vira uma baixa só, no dia do último pagamento", () => {
    expect(planoDoEspelho([], parcial()).criar).toEqual([{ chave: null, principalCentavos: 70_000, paidAtMs: OUTRO }]);
  });

  it("leitura seguinte: casa pelo código, não duplica, e a que o Omie estornou sai", () => {
    const ja = [baixa({ id: "x", chave: "11", principalCentavos: 30_000, paidAtMs: DIA }), baixa({ id: "y", chave: "12", principalCentavos: 40_000, paidAtMs: OUTRO })];
    expect(planoDoEspelho(ja, parcial([{ chave: "11", principalCentavos: 30_000, paidAtMs: DIA }, { chave: "12", principalCentavos: 40_000, paidAtMs: OUTRO }]))).toMatchObject({
      criar: [],
      atualizar: [],
      apagar: [],
    });
    const semA12 = planoDoEspelho(ja, { pagoCentavos: 30_000, paidAtMs: DIA, baixas: [{ chave: "11", principalCentavos: 30_000, paidAtMs: DIA }] });
    expect(semA12).toMatchObject({ criar: [], atualizar: [], apagar: [{ id: "y", desvincular: false }], baixadoCentavos: 30_000 });
  });

  it("a baixa cheia de antes vira a primeira das parciais, com o código", () => {
    const p = planoDoEspelho([baixa({ id: "cheia", chave: null, principalCentavos: 70_000, paidAtMs: OUTRO })], parcial([{ chave: "11", principalCentavos: 30_000, paidAtMs: DIA }, { chave: "12", principalCentavos: 40_000, paidAtMs: OUTRO }]));
    expect(p.atualizar).toEqual([{ chave: "11", principalCentavos: 30_000, paidAtMs: DIA, id: "cheia", desvincular: false }]);
    expect(p.criar).toEqual([{ chave: "12", principalCentavos: 40_000, paidAtMs: OUTRO }]);
  });

  it("o título fecha no Omie depois das parciais: as parciais ficam no dia delas, o resto entra no último", () => {
    const ja = [baixa({ id: "x", chave: "11", principalCentavos: 30_000, paidAtMs: DIA })];
    const p = planoDoEspelho(ja, { pagoCentavos: 100_000, paidAtMs: OUTRO });
    expect(p).toMatchObject({ atualizar: [], apagar: [], baixadoCentavos: 100_000 });
    expect(p.criar).toEqual([{ chave: null, principalCentavos: 70_000, paidAtMs: OUTRO }]);
    // Parciais com código acima do que o Omie diz pago (estorno de uma): sem as
    // baixas de lá, volta a uma baixa só.
    expect(planoDoEspelho(ja, { pagoCentavos: 20_000, paidAtMs: OUTRO })).toMatchObject({ atualizar: [{ id: "x", chave: null, principalCentavos: 20_000 }] });
  });

  it("parcial no Omie com parcial feita aqui: não separa, só completa o que falta", () => {
    const p = planoDoEspelho([baixa({ id: "m", origem: "MANUAL", principalCentavos: 30_000 })], parcial([{ chave: "11", principalCentavos: 30_000, paidAtMs: DIA }, { chave: "12", principalCentavos: 40_000, paidAtMs: OUTRO }]));
    expect(p.criar).toEqual([{ chave: null, principalCentavos: 40_000, paidAtMs: OUTRO }]);
  });
});
