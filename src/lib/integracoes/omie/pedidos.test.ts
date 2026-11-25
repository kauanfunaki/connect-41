import { describe, expect, it } from "vitest";
import { lerEtapas, lerPedido, vencimentoDaParcela } from "./pedidos";

const pedido = (extra: { cabecalho?: object; total_pedido?: object; infoCadastro?: object; lista_parcelas?: object } = {}) => ({
  cabecalho: { codigo_pedido: 9100000001, numero_pedido: "1042", codigo_cliente: 77, data_previsao: "08/12/2026", etapa: "20", ...extra.cabecalho },
  total_pedido: { valor_mercadorias: 900, valor_total_pedido: 1000, ...extra.total_pedido },
  infoCadastro: { faturado: "N", cancelado: "N", devolvido: "N", ...extra.infoCadastro },
  ...(extra.lista_parcelas ? { lista_parcelas: extra.lista_parcelas } : {}),
});

describe("pedidos do Omie", () => {
  it("lê o cabeçalho e, sem parcelas, uma parcela só na previsão", () => {
    expect(lerPedido(pedido())).toEqual({
      omieOrderId: "9100000001",
      number: "1042",
      stageCode: "20",
      customerCode: "77",
      forecastKey: "2026-12-08",
      totalCentavos: 100000,
      installments: [{ vencimento: null, dias: 0, centavos: 100000 }],
      aberto: true,
    });
  });

  it("lê as parcelas pelo valor ou pelo percentual, com a data ou os dias", () => {
    const p = lerPedido(
      pedido({
        lista_parcelas: {
          parcela: [
            { numero_parcela: 1, valor: 400, data_vencimento: "22/12/2026" },
            { numero_parcela: 2, percentual: 60, quantidade_dias: 60 },
          ],
        },
      })
    )!;
    expect(p.installments).toEqual([
      { vencimento: "2026-12-22", dias: null, centavos: 40000 },
      { vencimento: null, dias: 60, centavos: 60000 },
    ]);
    expect(vencimentoDaParcela(p.forecastKey, p.installments[1]!)).toBe("2027-02-06");
    expect(vencimentoDaParcela(p.forecastKey, p.installments[0]!)).toBe("2026-12-22");
  });

  it("faturado, cancelado, devolvido ou encerrado não está aberto", () => {
    expect(lerPedido(pedido({ infoCadastro: { faturado: "S" } }))!.aberto).toBe(false);
    expect(lerPedido(pedido({ infoCadastro: { cancelado: "S" } }))!.aberto).toBe(false);
    expect(lerPedido(pedido({ cabecalho: { encerrado: "S" } }))!.aberto).toBe(false);
  });

  it("sem código do pedido não há pedido; sem previsão, a parcela sem data não tem vencimento", () => {
    expect(lerPedido({ cabecalho: {} })).toBeNull();
    const p = lerPedido(pedido({ cabecalho: { data_previsao: "" } }))!;
    expect(vencimentoDaParcela(p.forecastKey, p.installments[0]!)).toBeNull();
  });

  it("as etapas de todas as operações, uma por código", () => {
    expect(
      lerEtapas([
        { cCodOperacao: "11", etapas: [{ cCodigo: "10", cDescricao: "Orçamento", cInativo: "N" }, { cCodigo: "20", cDescricao: "Em produção", cInativo: "N" }] },
        { cCodOperacao: "12", etapas: [{ cCodigo: "20", cDescricao: "Outra", cInativo: "N" }, { cCodigo: "50", cDescricao: "", cDescrPadrao: "Faturar", cInativo: "S" }] },
      ])
    ).toEqual([
      { code: "10", name: "Orçamento", inactive: false },
      { code: "20", name: "Em produção", inactive: false },
      { code: "50", name: "Faturar", inactive: true },
    ]);
  });
});
