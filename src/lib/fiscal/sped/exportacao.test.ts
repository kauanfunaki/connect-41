import { describe, expect, it } from "vitest";
import { leitorDaApuracao, lerTexto, livroFiscal } from "./arquivoIcms";
import { abasDaApuracao, csvDoLivro } from "./exportacao";
import { hrefDoSped } from "./etapas";
import { ARQUIVO_ICMS_DE_TESTE } from "./arquivoIcms.fixture";

const apuracao = lerTexto(ARQUIVO_ICMS_DE_TESTE, leitorDaApuracao());
const livro = livroFiscal(apuracao);

describe("exportação da apuração", () => {
  it("monta uma aba por quadro, com as linhas do arquivo", () => {
    const abas = abasDaApuracao(apuracao, livro);
    expect(abas.map((a) => a.aba)).toEqual(["Apuração E110", "Conferências", "Ajustes E111", "Operações por CFOP", "Livro fiscal", "Débitos e créditos"]);
    for (const a of abas) for (const l of a.linhas) expect(l).toHaveLength(a.colunas.length);
    expect(abas[0].linhas[0]).toEqual(["VL_TOT_DEBITOS", "Débitos por saídas", 129600]);
    expect(abas[3].linhas).toHaveLength(8);
    expect(abas[4].linhas[0]).toEqual(["Saídas", "5102", 1200, 80000, 80000, 9600, 0, 0]);
  });

  it("gera o livro em CSV com ponto e vírgula e vírgula decimal", () => {
    const linhas = csvDoLivro(livro).replace(/^﻿/, "").trim().split("\r\n");
    expect(linhas[0]).toBe("Quadro;CFOP;Alíquota (%);Valor contábil;Base de cálculo;Imposto;Isentas;Outras");
    expect(linhas[1]).toBe("Saídas;5102;12,00;800,00;800,00;96,00;0,00;0,00");
    expect(linhas).toHaveLength(1 + livro.saidas.length + livro.entradas.length);
  });
});

describe("endereço das etapas", () => {
  it("leva a empresa e a competência", () => {
    expect(hrefDoSped("apuracao", { empresa: "e1", competencia: "2026-09" }, { vista: "livro", vazio: "" })).toBe("/fiscal/sped/apuracao?empresa=e1&competencia=2026-09&vista=livro");
    expect(hrefDoSped("gerar", {})).toBe("/fiscal/sped/gerar");
  });
});
