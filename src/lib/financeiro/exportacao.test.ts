import { describe, expect, it } from "vitest";
import { celula, csvDasContas, data, reais, recorteDaUrl } from "./exportacao";
import type { LinhaDaConta } from "./data";

// Com o resto da linha que a lista ganhar depois (outros PRs do lote D), o
// molde continua valendo: o CSV lê só os campos daqui.
const linha = (o: Partial<LinhaDaConta> = {}): LinhaDaConta => ({
  id: "c1",
  situacao: "VENCIDA",
  valorCentavos: 123456,
  vencimentoKey: "2026-10-05",
  vencimento: new Date("2026-10-05T15:00:00Z"),
  pagoEm: null,
  competencia: "2026-09",
  descricao: 'Aluguel "outubro"',
  empresaId: "e1",
  empresaNome: "BLD Comércio",
  contraparteNome: "Imobiliária Centro",
  categoriaNome: "Aluguel",
  status: "CONFERIDO",
  approvalStatus: "NAO_REQUER",
  documentoId: null,
  closeReason: null,
  parcelaDeAcordo: false,
  centroDeCustoId: null,
  centroDeCustoNome: null,
  projetoNome: null,
  baixadoCentavos: 23456,
  numeroDocumento: "4512",
  emissao: new Date("2026-09-28T15:00:00Z"),
  ...o,
}) as LinhaDaConta;
const diaDe = (d: Date) => d.toISOString().slice(0, 10);

describe("as células", () => {
  it("reais com vírgula, sem milhar, com sinal", () => {
    expect(reais(123456)).toBe("1234,56");
    expect(reais(5)).toBe("0,05");
    expect(reais(-1000)).toBe("-10,00");
  });

  it("data no formato do Excel brasileiro", () => {
    expect(data("2026-10-05")).toBe("05/10/2026");
    expect(data(null)).toBe("");
  });

  it("texto entre aspas, aspas dobradas, e fórmula vira texto", () => {
    expect(celula('Ele disse "oi"')).toBe('"Ele disse ""oi"""');
    expect(celula("=HYPERLINK(\"x\")")).toBe('"\'=HYPERLINK(""x"")"');
    expect(celula("-10")).toBe('"\'-10"');
    expect(celula(null)).toBe('""');
  });
});

describe("csvDasContas", () => {
  it("cabeçalho do lado certo, uma linha por conta, BOM e CRLF", () => {
    const csv = csvDasContas([linha()], "PAGAR", { diaDe });
    expect(csv.startsWith("﻿")).toBe(true);
    const [cab, l1] = csv.slice(1).split("\r\n");
    expect(cab!.split(";")[2]).toBe("Fornecedor");
    expect(l1).toBe(
      '05/10/2026;"Vencida";"Imobiliária Centro";"BLD Comércio";"Aluguel";"";"";09/2026;"4512";28/09/2026;"Aluguel ""outubro""";1234,56;234,56;1000,00;;""'
    );
    expect(csvDasContas([linha()], "RECEBER", { diaDe }).split("\r\n")[0]!.split(";")[2]).toBe("Cliente");
  });

  it("renegociada e perda dizem o nome; cancelada não tem saldo; paga leva o dia", () => {
    const csv = csvDasContas(
      [
        linha({ situacao: "CANCELADA", closeReason: "RENEGOCIADO" }),
        linha({ situacao: "PAGA", baixadoCentavos: 123456, pagoEm: new Date("2026-10-06T15:00:00Z"), approvalStatus: "APROVADO" }),
      ],
      "PAGAR",
      { diaDe }
    );
    const [, renegociada, paga] = csv.split("\r\n");
    expect(renegociada).toContain('"Renegociada"');
    expect(renegociada!.split(";")[13]).toBe("0,00");
    expect(paga!.split(";")[13]).toBe("0,00");
    expect(paga!.split(";")[14]).toBe("06/10/2026");
    expect(paga!.split(";")[15]).toBe('"Aprovada"');
  });

  it("lista no teto avisa na última linha", () => {
    const csv = csvDasContas([linha()], "PAGAR", { diaDe, limitada: true });
    expect(csv.split("\r\n").at(-1)).toMatch(/limitada a 20\.000 contas/);
  });
});

describe("recorteDaUrl", () => {
  it("só os recortes do lado, e todas no resto", () => {
    expect(recorteDaUrl("PAGAR", "avencer")).toBe("avencer");
    expect(recorteDaUrl("PAGAR", "abertas")).toBe("todas");
    expect(recorteDaUrl("RECEBER", "abertas")).toBe("abertas");
    expect(recorteDaUrl("RECEBER", null)).toBe("todas");
  });
});
