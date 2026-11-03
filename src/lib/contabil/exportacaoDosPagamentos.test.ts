import { describe, expect, it } from "vitest";
import { txtDaDominio } from "@/lib/financeiro/dominio/planilha";
import { PlanoDeFornecedores, montarPagamentos, type Pagamento } from "./pagamentos";
import { COLUNAS_DAS_PENDENCIAS, COLUNAS_DOS_LANCAMENTOS, csv, csvDasPendencias, csvDosLancamentos, historicoNaDominio, linhasDosPagamentos, nomeDoArquivoDosPagamentos } from "./exportacaoDosPagamentos";

const fatura: Pagamento = {
  tipo: "fatura", categoria: "fatura_aluguel_veiculo", nome: "ARVAL BRASIL LTDA.", documento: "", numero: "F1", dataPagamento: "2026-01-10", competencia: "2026-01",
  brutoCentavos: 123450, liquidoCentavos: 123450, retencoes: null, arquivo: "", pagina: 3,
};
const plano = new PlanoDeFornecedores([{ classificacao: "2.1.3.01.1020", reduzido: "2344", nome: "ARVAL BRASIL LTDA" }]);

describe("testar_planilha_dominio_do_passo5", () => {
  const rel = montarPagamentos([fatura], { categorias: { fatura_aluguel_veiculo: { codigoDebito: "1153", contaCredito: "" } }, plano });

  it("fatura sem CNPJ: D 1153, C 2344 (ARVAL), hist. 134 + nº + nome, sempre na filial da matriz", () => {
    expect(linhasDosPagamentos(rel.lancamentos, "11301")).toEqual([
      { dataKey: "2026-01-10", debito: "1153", credito: "2344", centavos: 123450, codigoHistorico: "134", complemento: "F1 ARVAL BRASIL LTDA", codigoFilial: "11301" },
    ]);
  });

  it(".txt no modelo: cabeçalho da Domínio e vírgula decimal", () => {
    const texto = txtDaDominio(linhasDosPagamentos(rel.lancamentos, "11301")).toString("latin1");
    expect(texto.startsWith("Data;Cód. Conta Debito;")).toBe(true);
    expect(texto).toContain(";1234,50;");
  });

  it("o nome do arquivo é o do motor", () => {
    expect(nomeDoArquivoDosPagamentos("11.111.111/0001-01", "2026-01", "xlsx")).toBe("lancamentos_pagamentos_11111111000101_2026-01.xlsx");
  });
});

describe("os CSVs do passo 5", () => {
  it("lançamentos: as colunas do motor, conta e nome do plano no fim, valor com vírgula", () => {
    const rel = montarPagamentos([fatura], { categorias: { fatura_aluguel_veiculo: { codigoDebito: "1153", contaCredito: "" } }, plano });
    const [cabecalho, linha] = csvDosLancamentos(rel.lancamentos, (c) => (c === "2344" ? "2.1.3.01.1020 — ARVAL BRASIL LTDA" : "")).replace(/^﻿/, "").split("\n");
    expect(cabecalho).toBe(COLUNAS_DOS_LANCAMENTOS.join(";"));
    expect(linha.split(";")).toEqual([
      "1153", "2344", "1234,50", "2026-01-10", "134", "F1 ARVAL BRASIL LTDA", "[histórico 134 não carregado] F1 ARVAL BRASIL LTDA",
      "nome igual no plano de contas", "fatura", "fatura_aluguel_veiculo", "", "ARVAL BRASIL LTDA.", "2026-01",
      "planilha do BPO · nota F1", "", "1153", "FORA DO PLANO", "2344", "2.1.3.01.1020 — ARVAL BRASIL LTDA",
    ]);
  });

  it("pendências: a conta a preencher vai em branco, com o motivo e a sugestão", () => {
    const rel = montarPagamentos([{ ...fatura, documento: "99888777000166" }], { categorias: { fatura_aluguel_veiculo: { codigoDebito: "1153", contaCredito: "" } }, plano });
    const [cabecalho, linha] = csvDasPendencias(rel.pendencias).replace(/^﻿/, "").split("\n");
    expect(cabecalho).toBe(COLUNAS_DAS_PENDENCIAS.join(";"));
    const campos = linha.split(";");
    expect(campos.slice(0, 4)).toEqual(["conta_credito", "99888777000166", "ARVAL BRASIL LTDA.", ""]);
    expect(campos[5]).toBe("2344 - ARVAL BRASIL LTDA");
    expect(campos.slice(8, 10)).toEqual(["1", "1234,50"]);
  });

  it("campo livre não quebra a coluna nem vira fórmula", () => {
    expect(csv(["a", "b"], [["COM. DE PECAS; FILIAL 2", "=HYPERLINK()"]])).toBe('﻿a;b\n"COM. DE PECAS; FILIAL 2";\'=HYPERLINK()');
  });

  it("histórico na Domínio: sem código, o complemento; com descrição conhecida, a frase inteira", () => {
    expect(historicoNaDominio("", "RECIBO X")).toBe("RECIBO X");
    expect(historicoNaDominio("134", "F1 X", new Map([["134", "FATURA Nº"]]))).toBe("FATURA Nº F1 X");
  });
});
