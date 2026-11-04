import { describe, expect, it } from "vitest";
import { CONTAS_PADRAO_DAS_SAIDAS, contasDaEmpresa, linhasDasSaidas, saidasPorDia, type Saida } from "./saidas";

// O passo 6 do motor (`testes.py`, testar_saidas_por_dia): um lançamento por
// dia e por tipo, nota cancelada fora, e os códigos do motor como padrão.
const saidas: Saida[] = [
  { tipo: "cte", data: "2026-01-05", centavos: 100_00, cancelada: false },
  { tipo: "cte", data: "2026-01-05", centavos: 50_50, cancelada: false },
  { tipo: "cte", data: "2026-01-05", centavos: 999_99, cancelada: true },
  { tipo: "nfse", data: "2026-01-05", centavos: 300_00, cancelada: false },
  { tipo: "nfse", data: "2026-01-02", centavos: 20_00, cancelada: false },
];

describe("saídas do Contábil", () => {
  it("soma por dia e por tipo, sem a cancelada, em ordem de data", () => {
    expect(saidasPorDia(saidas)).toEqual([
      { data: "2026-01-02", cte: { qtd: 0, centavos: 0 }, nfse: { qtd: 1, centavos: 20_00 } },
      { data: "2026-01-05", cte: { qtd: 2, centavos: 150_50 }, nfse: { qtd: 1, centavos: 300_00 } },
    ]);
  });

  it("gera as linhas com os códigos e o complemento do motor", () => {
    expect(linhasDasSaidas(saidasPorDia(saidas), CONTAS_PADRAO_DAS_SAIDAS, "11301")).toEqual([
      { dataKey: "2026-01-02", debito: "504", credito: "411", centavos: 20_00, codigoHistorico: "2", complemento: "CFE DATA 02/01/2026", codigoFilial: "11301" },
      { dataKey: "2026-01-05", debito: "504", credito: "523", centavos: 150_50, codigoHistorico: "132", complemento: "05/01/2026", codigoFilial: "11301" },
      { dataKey: "2026-01-05", debito: "504", credito: "411", centavos: 300_00, codigoHistorico: "2", complemento: "CFE DATA 05/01/2026", codigoFilial: "11301" },
    ]);
  });

  it("troca só o tipo que a empresa gravou", () => {
    const contas = contasDaEmpresa([{ chave: "nfse", debito: "600", credito: "412", historico: "9" }]);
    expect(contas.cte).toEqual(CONTAS_PADRAO_DAS_SAIDAS.cte);
    expect(contas.nfse).toEqual({ debito: "600", credito: "412", historico: "9" });
  });

  it("não gera linha sem valor", () => {
    expect(linhasDasSaidas(saidasPorDia([{ tipo: "cte", data: "2026-01-03", centavos: 0, cancelada: false }]), CONTAS_PADRAO_DAS_SAIDAS, "")).toEqual([]);
  });
});
