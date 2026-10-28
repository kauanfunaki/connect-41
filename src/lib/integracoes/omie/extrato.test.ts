import { describe, expect, it } from "vitest";
import { avisoDoQueFicouFora, dataDoExtrato, lerExtratoDoOmie, periodoDoMes } from "./extrato";

const PERIODO = { inicioKey: "2026-10-01", fimKey: "2026-10-31" };

const mov = (extra: Record<string, unknown>) => ({
  nCodLancamento: 5001,
  dDataLancamento: "15/10/2026",
  dDataConciliacao: "16/10/2026",
  cNatureza: "P",
  nValorDocumento: 1234.5,
  cTipoDocumento: "BOL",
  cNumero: "123",
  cDesCategoria: "Aluguel",
  cRazCliente: "Imobiliária Centro",
  ...extra,
});

describe("extrato da conta pelo Omie", () => {
  it("o movimento conciliado vira linha de extrato, com o sinal da natureza", () => {
    const r = lerExtratoDoOmie(
      { nCodBanco: "341", nCodAgencia: "1234", nNumConta: "56789-0", listaMovimentos: [mov({}), mov({ nCodLancamento: 5002, cNatureza: "R", nValorDocumento: "200,00" })] },
      PERIODO
    );
    expect(r.extrato.transacoes).toEqual([
      { fitId: "omie:5001", fitIdGerado: false, tipo: "DEBIT", dataKey: "2026-10-15", centavos: -123450, memo: "BOL · 123 · Aluguel", nome: "Imobiliária Centro", cheque: null },
      { fitId: "omie:5002", fitIdGerado: false, tipo: "CREDIT", dataKey: "2026-10-15", centavos: 20000, memo: "BOL · 123 · Aluguel", nome: "Imobiliária Centro", cheque: null },
    ]);
    expect(r.extrato).toMatchObject({ bancoId: "341", agencia: "1234", contaId: "56789-0", inicioKey: "2026-10-01", fimKey: "2026-10-31", saldo: null });
  });

  it("o que não foi conciliado no Omie, sem natureza, sem data ou sem código fica de fora, contado", () => {
    const r = lerExtratoDoOmie(
      {
        listaMovimentos: [
          mov({ dDataConciliacao: "" }),
          mov({ nCodLancamento: 7, cNatureza: "" }),
          mov({ nCodLancamento: 8, dDataLancamento: "" }),
          mov({ nCodLancamento: 0 }),
          mov({ nCodLancamento: 9, nValorDocumento: 0 }),
        ],
      },
      PERIODO
    );
    expect(r.extrato.transacoes).toEqual([]);
    expect(r.fora).toEqual({ naoConciliados: 1, semNatureza: 1, semData: 1, semCodigo: 1 });
    expect(r.extrato.zeradas).toBe(1);
    expect(avisoDoQueFicouFora(r.fora)).toBe("Ficaram de fora do espelho: 1 lançamento ainda não conciliado no Omie, 1 sem natureza (pagar ou receber), 1 sem data.");
  });

  it("resposta sem lista: extrato vazio", () => {
    expect(lerExtratoDoOmie({}, PERIODO).extrato.transacoes).toEqual([]);
    expect(avisoDoQueFicouFora({ naoConciliados: 0, semNatureza: 0, semData: 0, semCodigo: 3 })).toBeNull();
  });

  it("datas e período do mês", () => {
    expect(dataDoExtrato("05/02/2026")).toBe("2026-02-05");
    expect(dataDoExtrato("2026-02-05")).toBeNull();
    expect(periodoDoMes("2026-02")).toEqual({ inicial: "01/02/2026", final: "28/02/2026", inicioKey: "2026-02-01", fimKey: "2026-02-28" });
    expect(periodoDoMes("2028-02").final).toBe("29/02/2028");
  });
});
