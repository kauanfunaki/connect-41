import { describe, expect, it } from "vitest";
import { competenciasDoAno, nomeNoLote, resumoDoLote } from "./lote";

const linha = { dataKey: "2026-01-05", debito: "504", credito: "523", centavos: 100, codigoHistorico: "132", complemento: "05/01/2026", codigoFilial: "" };

describe("lote do ano", () => {
  it("tem as doze competências do ano", () => {
    expect(competenciasDoAno(2026)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]);
  });

  it("põe cada arquivo na pasta do mês, com o nome da exportação avulsa", () => {
    expect(nomeNoLote("saidas", "12345678000190", "2026-01", "xlsx")).toBe("2026-01/lancamentos_saidas_12345678000190_2026-01.xlsx");
  });

  it("resume o que saiu, o que ficou pendente e o erro", () => {
    expect(resumoDoLote([{ competencia: "2026-01", passos: [
      { passo: "nfe", linhas: [linha], pendencias: 0 },
      { passo: "cte", linhas: [linha], pendencias: 2 },
      { passo: "nfse", linhas: [], pendencias: 1 },
      { passo: "saidas", linhas: [], pendencias: 0 },
      { passo: "pagamentos", linhas: [], pendencias: 0, erro: "falhou; de novo" },
    ] }])).toBe([
      "competencia;passo;situacao;lancamentos;pendencias;detalhe",
      "2026-01;Entradas NF-e;gerado;1;0;",
      "2026-01;Entradas CT-e;gerado com pendências;1;2;",
      "2026-01;Entradas NFS-e;só pendências;0;1;",
      "2026-01;Saídas;sem lançamentos;0;0;",
      "2026-01;Pagamentos sem nota;ERRO;0;0;falhou  de novo",
    ].join("\r\n") + "\r\n");
  });
});
