import { describe, expect, it } from "vitest";
import {
  assinaturas,
  centavosDigitados,
  comAcompanhamento,
  correcoesDoBanco,
  csvDasPendencias,
  empresaDoMotor,
  fechamentoDoMotor,
  nomeDoArquivo,
  regimeSugerido,
  toleranciaEmCentavos,
  validarFechamento,
} from "./fechamento";
import type { Achado } from "./motor/tipos";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("cadastro do fechamento", () => {
  it("aceita o formulário completo e completa enquadramento e finalidade", () => {
    const r = validarFechamento({ companyId: "c1", inicio: "2026-01-01", fim: "2026-06-30", regime: "Simples Nacional" });
    expect(r).toEqual({
      ok: true,
      dados: { companyId: "c1", inicio: "2026-01-01", fim: "2026-06-30", regime: "Simples Nacional", enquadramento: "A confirmar", finalidade: "Revisão do fechamento" },
    });
  });

  it("recusa período invertido, data inexistente, regime fora da lista e finalidade longa", () => {
    const base = { companyId: "c1", inicio: "2026-01-01", fim: "2026-06-30", regime: "Lucro Real" };
    expect(validarFechamento({ ...base, inicio: "2026-07-01" })).toMatchObject({ ok: false });
    expect(validarFechamento({ ...base, fim: "2026-02-30" })).toMatchObject({ ok: false });
    expect(validarFechamento({ ...base, regime: "Lucro" })).toMatchObject({ ok: false, erro: "Escolha o regime tributário." });
    expect(validarFechamento({ ...base, companyId: "" })).toMatchObject({ ok: false, erro: "Escolha a empresa." });
    expect(validarFechamento({ ...base, finalidade: "x".repeat(121) })).toMatchObject({ ok: false });
    expect(validarFechamento({ ...base, inicio: "2026-06-30", fim: "2026-06-30" })).toMatchObject({ ok: true });
  });

  it("sugere o regime pelo cadastro, e o que não tem rótulo certo fica a confirmar", () => {
    expect(regimeSugerido("SIMPLES_NACIONAL")).toBe("Simples Nacional");
    expect(regimeSugerido("MEI")).toBe("MEI / SIMEI");
    expect(regimeSugerido("IMUNE_ISENTA")).toBe("Não informado");
    expect(regimeSugerido(null)).toBe("Não informado");
  });

  it("tolerância em reais vira centavos, de 0 a R$ 100,00", () => {
    expect(toleranciaEmCentavos("0,01")).toBe(1);
    expect(toleranciaEmCentavos("1")).toBe(100);
    expect(toleranciaEmCentavos("100,00")).toBe(10000);
    expect(toleranciaEmCentavos("100,01")).toBeNull();
    expect(toleranciaEmCentavos("-1")).toBeNull();
    expect(toleranciaEmCentavos("abc")).toBeNull();
  });
});

describe("ponte com o motor", () => {
  it("empresa e fechamento no formato do motor", () => {
    expect(empresaDoMotor({ id: "c1", name: "Empresa A", cnpj: "20.474.000/0001-00", cnaePrincipal: null })).toEqual({
      id: "c1",
      name: "Empresa A",
      cnpj: "20.474.000/0001-00",
      sector: "Não informado",
    });
    const f = fechamentoDoMotor({
      id: "f1",
      companyId: "c1",
      inicio: new Date("2026-01-01T00:00:00Z"),
      fim: new Date("2026-06-30T00:00:00Z"),
      regime: "Não informado",
      enquadramento: "A confirmar",
      finalidade: "Revisão do fechamento",
    });
    expect(f).toEqual({ id: "f1", companyId: "c1", start: "2026-01-01", end: "2026-06-30", regime: "Não informado", framework: "A confirmar", purpose: "Revisão do fechamento" });
  });

  it("correções do banco: só chave de documento e campo do motor, em centavos inteiros", () => {
    expect(correcoesDoBanco({ [`${ID}:3`]: { closing: 100, debit: 1.5, outro: 2 }, "x:1": { closing: 1 }, [`${ID}:4`]: {} })).toEqual({
      [`${ID}:3`]: { closing: 100 },
    });
    expect(correcoesDoBanco(null)).toEqual({});
    expect(correcoesDoBanco([1])).toEqual({});
  });

  it("valor digitado vira centavos; vazio não corrige", () => {
    expect(centavosDigitados("-1.234,56")).toBe(-123456);
    expect(centavosDigitados("R$ 10")).toBe(1000);
    expect(centavosDigitados("")).toBeUndefined();
    expect(centavosDigitados("1,234")).toBeNull();
  });

  it("assinaturas mudam com o regime, com um documento desligado, com correção e com a tolerância", () => {
    const co = empresaDoMotor({ id: "c1", name: "Empresa A", cnpj: "1" });
    const cl = { id: "f1", companyId: "c1", start: "2026-01-01", end: "2026-06-30", regime: "Lucro Real", framework: "A confirmar", purpose: "x" };
    const docs = [{ id: ID, sha256: "a".repeat(64), extraidoEm: new Date("2026-11-06T10:00:00Z"), ativo: true }];
    const base = assinaturas(co, cl, docs, {}, 1);
    expect(base.contexto).toMatch(/^[0-9a-f]{64}$/);
    expect(assinaturas(co, { ...cl, regime: "Lucro Presumido" }, docs, {}, 1).contexto).not.toBe(base.contexto);
    expect(assinaturas(co, cl, [{ ...docs[0], ativo: false }], {}, 1).entradas).not.toBe(base.entradas);
    expect(assinaturas(co, cl, docs, { [`${ID}:0`]: { closing: 1 } }, 1).entradas).not.toBe(base.entradas);
    expect(assinaturas(co, cl, docs, {}, 2).entradas).not.toBe(base.entradas);
    expect(assinaturas(co, cl, docs, {}, 1)).toEqual(base);
  });
});

describe("acompanhamento e exportação", () => {
  const achado: Achado = {
    id: "G01",
    title: "Pendência",
    area: "Fornecedores",
    severity: "Alta",
    value: 439981.94,
    kind: "Indício para revisão",
    rule: "R16",
    source: "Razão",
    fact: '=SOMA(A1) "aspas"',
    meaning: "",
    action: "Obter razão",
    impact: "A confirmar",
    owner: "Contabilidade",
    status: "Aberto",
    before: 0,
    after: 0,
  };

  it("o acompanhamento gravado vale por cima do achado; sem ele, fica o do motor", () => {
    expect(comAcompanhamento(achado, { responsavel: "Fulana", estado: "Em análise", nota: "Pedi o extrato" })).toMatchObject({
      owner: "Fulana",
      status: "Em análise",
      nota: "Pedi o extrato",
    });
    expect(comAcompanhamento(achado, { responsavel: " ", estado: "", nota: null })).toMatchObject({ owner: "Contabilidade", status: "Aberto", nota: "" });
    expect(comAcompanhamento(achado, undefined)).toMatchObject({ owner: "Contabilidade", status: "Aberto", nota: "" });
  });

  it("CSV das pendências com BOM, ponto e vírgula, aspas dobradas e fórmula neutralizada", () => {
    const csv = csvDasPendencias("Empresa A", [achado]);
    expect(csv.startsWith("﻿\"ID\";\"Empresa\"")).toBe(true);
    const linha = csv.split("\r\n")[1];
    expect(linha).toBe(
      '"G01";"Empresa A";"Fornecedores";"Alta";"Indício para revisão";"439981.94";"Razão";"\'=SOMA(A1) ""aspas""";"Obter razão";"Contabilidade";"Aberto"',
    );
    expect(csvDasPendencias("E", [{ ...achado, value: 0 }]).split("\r\n")[1]).toContain('"Indício para revisão";"";"Razão"');
  });

  it("nome de arquivo sem acento nem barra", () => {
    expect(nomeDoArquivo("Revisão Empresa/A 2026", "md")).toBe("Revisao_Empresa_A_2026.md");
    expect(nomeDoArquivo("***", "csv")).toBe("revisao.csv");
  });
});
