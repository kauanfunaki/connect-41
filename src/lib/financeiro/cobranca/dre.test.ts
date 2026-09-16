import { describe, expect, it } from "vitest";
import { contaNaDreEconomica, ajustesDaCobranca, resumoDaCobrancaNaDre } from "./dre";
import { calcularDreEconomica, valorDaLinha, type LancamentoFinanceiro } from "@/lib/dre/economica";
import { montarMapeamento } from "@/lib/dre/calculo";

const mapeamento = montarMapeamento([
  { categoria: "Vendas", grupo: "receita_bruta" },
  { categoria: "Aluguel", grupo: "administrativas" },
]);

const venda = (centavos: number, x: Partial<LancamentoFinanceiro> = {}): LancamentoFinanceiro => ({
  kind: "RECEBER",
  status: "CONFERIDO",
  centavos,
  categoria: "Vendas",
  ...x,
});

describe("contaNaDreEconomica", () => {
  it("renegociado e perdido contam; cancelado comum e parcela não", () => {
    expect(contaNaDreEconomica({ status: "CONFERIDO" })).toBe(true);
    expect(contaNaDreEconomica({ status: "CANCELADO", closeReason: "RENEGOCIADO" })).toBe(true);
    expect(contaNaDreEconomica({ status: "CANCELADO", closeReason: "PERDA" })).toBe(true);
    expect(contaNaDreEconomica({ status: "CANCELADO", closeReason: null })).toBe(false);
    expect(contaNaDreEconomica({ status: "CANCELADO", closeReason: "CANCELADO" })).toBe(false);
    expect(contaNaDreEconomica({ status: "PAGO", parcelaDeAcordo: true })).toBe(false);
    expect(contaNaDreEconomica({ status: "CONFERIDO", parcelaDeAcordo: true })).toBe(false);
  });
});

describe("DRE econômica antes e depois de um acordo", () => {
  // Maio: duas vendas de R$ 1.000 e R$ 500 e um aluguel. Em setembro as duas
  // vendas, vencidas, viram um acordo de R$ 1.650 em 3 parcelas (acréscimo de
  // R$ 150), e a primeira parcela é paga.
  const maioAntes: LancamentoFinanceiro[] = [venda(100_000), venda(50_000), { kind: "PAGAR", status: "PAGO", centavos: 30_000, categoria: "Aluguel" }];
  const maioDepois: LancamentoFinanceiro[] = [
    venda(100_000, { status: "CANCELADO", closeReason: "RENEGOCIADO" }),
    venda(50_000, { status: "CANCELADO", closeReason: "RENEGOCIADO" }),
    { kind: "PAGAR", status: "PAGO", centavos: 30_000, categoria: "Aluguel" },
  ];
  const acordo = { competencia: "2026-09", status: "ATIVO" as const, originalCentavos: 150_000, acordadoCentavos: 165_000 };
  const setembroParcelas: LancamentoFinanceiro[] = [
    venda(55_000, { status: "PAGO", parcelaDeAcordo: true }),
    venda(55_000, { parcelaDeAcordo: true }),
  ];

  it("a receita e o resultado de maio não mudam", () => {
    const antes = calcularDreEconomica(maioAntes, mapeamento);
    const depois = calcularDreEconomica(maioDepois, mapeamento, undefined, ajustesDaCobranca([acordo], [], "2026-05"));
    expect(valorDaLinha(depois.resultado, "receita_bruta")).toBe(150_000);
    expect(valorDaLinha(depois.resultado, "receita_bruta")).toBe(valorDaLinha(antes.resultado, "receita_bruta"));
    expect(valorDaLinha(depois.resultado, "fluxo_de_caixa_livre")).toBe(valorDaLinha(antes.resultado, "fluxo_de_caixa_livre"));
    expect(depois.lancamentos).toBe(antes.lancamentos);
  });

  it("em setembro as parcelas não são receita, e o acréscimo entra em outras receitas", () => {
    const setembro = calcularDreEconomica(setembroParcelas, mapeamento, undefined, ajustesDaCobranca([acordo], [], "2026-09"));
    expect(valorDaLinha(setembro.resultado, "receita_bruta")).toBe(0);
    expect(valorDaLinha(setembro.resultado, "outras_receitas")).toBe(15_000);
    expect(valorDaLinha(setembro.resultado, "fluxo_de_caixa_livre")).toBe(15_000);
    expect(setembro.resultado.diferencaDeFechamento).toBe(0);
    expect(setembro.cobranca).toEqual({ acrescimosDeAcordo: 15_000, descontosDeAcordo: 0, perdas: 0 });
  });

  it("desconto vai para outras despesas, negativo; acordo desfeito não entra", () => {
    const comDesconto = { ...acordo, acordadoCentavos: 120_000 };
    const ajustes = ajustesDaCobranca([comDesconto], [], "2026-09");
    const r = calcularDreEconomica([], mapeamento, undefined, ajustes);
    expect(valorDaLinha(r.resultado, "outras_despesas")).toBe(-30_000);
    expect(r.cobranca.descontosDeAcordo).toBe(-30_000);
    expect(ajustesDaCobranca([{ ...comDesconto, status: "DESFEITO" }], [], "2026-09")).toEqual([]);
    expect(ajustesDaCobranca([{ ...acordo, acordadoCentavos: 150_000 }], [], "2026-09")).toEqual([]);
  });

  it("acordo quebrado continua com a diferença reconhecida", () => {
    expect(ajustesDaCobranca([{ ...acordo, status: "QUEBRADO" }], [], "2026-09")).toHaveLength(1);
  });
});

describe("DRE econômica e perda", () => {
  it("a receita original fica na competência dela, e a perda é despesa na competência da data da perda", () => {
    const junho = [venda(80_000, { status: "CANCELADO", closeReason: "PERDA" })];
    const perda = { competencia: "2026-09", centavos: 80_000 };
    const rJunho = calcularDreEconomica(junho, mapeamento, undefined, ajustesDaCobranca([], [perda], "2026-06"));
    expect(valorDaLinha(rJunho.resultado, "receita_bruta")).toBe(80_000);
    expect(valorDaLinha(rJunho.resultado, "outras_despesas")).toBe(0);

    const rSetembro = calcularDreEconomica([], mapeamento, undefined, ajustesDaCobranca([], [perda], "2026-09"));
    expect(valorDaLinha(rSetembro.resultado, "outras_despesas")).toBe(-80_000);
    expect(valorDaLinha(rSetembro.resultado, "gerador_de_caixa")).toBe(0);
    expect(valorDaLinha(rSetembro.resultado, "fluxo_de_caixa_livre")).toBe(-80_000);
    expect(rSetembro.cobranca.perdas).toBe(-80_000);
  });

  it("perda revertida some: sem registro de perda, nada entra", () => {
    expect(ajustesDaCobranca([], [], "2026-09")).toEqual([]);
    expect(resumoDaCobrancaNaDre([])).toEqual({ acrescimosDeAcordo: 0, descontosDeAcordo: 0, perdas: 0 });
  });
});
