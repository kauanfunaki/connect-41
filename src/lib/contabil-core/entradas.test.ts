import { describe, expect, test } from "vitest";
import { agenciaSchema, classificacaoManualSchema, contaSchema, contraparteSchema, exportacaoSchema, regraSchema } from "./entradas";

const ID = "9A8B7C6D-5E4F-4A3B-8C2D-1E0F9A8B7C6D";

describe("entradas das telas do Contábil Core", () => {
  test("agência: código COMPE vira sigla, dígito vazio vira nulo, letra na agência é recusada", () => {
    expect(agenciaSchema.parse({ bancoSigla: " 756 ", agencia: "1234", numero: "98765", digito: "" })).toEqual({
      bancoSigla: "SICOOB",
      agencia: "1234",
      numero: "98765",
      digito: null,
      contaContabilId: null,
    });
    expect(agenciaSchema.safeParse({ bancoSigla: "BB", agencia: "12A", numero: "1" }).success).toBe(false);
  });

  test("conta: código com pontos, alias PL e tipo inválido", () => {
    expect(contaSchema.parse({ codigo: "2.3.01", descricao: " Capital ", tipo: "PL", contaNumero: "1026" })).toMatchObject({
      codigo: "2.3.01",
      descricao: "Capital",
      tipo: "patrimonio_liquido",
      tipoSa: "A",
      contaNumero: 1026,
    });
    expect(contaSchema.safeParse({ codigo: "2.a", descricao: "xx", tipo: "ativo" }).success).toBe(false);
    expect(contaSchema.safeParse({ codigo: "2", descricao: "xx", tipo: "qualquer" }).success).toBe(false);
  });

  test("contraparte: documento com máscara vira só dígitos; 12 dígitos é recusado", () => {
    expect(contraparteSchema.parse({ tipo: "Fornecedor", documento: "09.033.833/0001-23", razaoSocial: "Acme", contaContabilId: ID })).toMatchObject({
      tipo: "fornecedor",
      documento: "09033833000123",
      contaContabilId: ID.toLowerCase(),
    });
    expect(contraparteSchema.safeParse({ tipo: "cliente", documento: "123456789012", razaoSocial: "Acme", contaContabilId: ID }).success).toBe(false);
  });

  test("regra: sem agência vale para todos os bancos; D/C obrigatório", () => {
    expect(regraSchema.parse({ contaId: ID, agenciaId: "", descricao: "Tarifa", historico: " TARIFA ", dc: "d", manterHistorico: "on" })).toMatchObject({
      agenciaId: null,
      historico: "TARIFA",
      dc: "D",
      tipo: "automatica",
      manterHistorico: true,
    });
    expect(regraSchema.safeParse({ contaId: ID, descricao: "Tarifa", historico: "TARIFA", dc: "X" }).success).toBe(false);
  });

  test("classificação manual: histórico obrigatório sem manter o do banco; ids repetidos saem; teto de 200", () => {
    expect(classificacaoManualSchema.safeParse({ transacaoIds: [ID], contaId: ID, descricao: "" }).success).toBe(false);
    expect(classificacaoManualSchema.parse({ transacaoIds: [ID, ID.toLowerCase()], contaId: ID, manterHistorico: true }).transacaoIds).toHaveLength(1);
    // Como no Pydantic, o teto vale para a lista enviada, antes de tirar os repetidos.
    expect(classificacaoManualSchema.safeParse({ transacaoIds: Array(201).fill(ID), contaId: ID, descricao: "ALUGUEL" }).success).toBe(false);
    const muitos = Array.from({ length: 201 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect(classificacaoManualSchema.safeParse({ transacaoIds: muitos, contaId: ID, descricao: "ALUGUEL" }).success).toBe(false);
  });

  test("exportação: competência AAAA-MM com mês válido e formato fechado", () => {
    expect(exportacaoSchema.safeParse({ mes: "2026-13", formato: "txt" }).success).toBe(false);
    expect(exportacaoSchema.safeParse({ mes: "2026-01", formato: "xlsx" }).success).toBe(false);
    expect(exportacaoSchema.parse({ mes: "2026-01", formato: "txt" })).toMatchObject({ usarHistoricoExtrato: false, incluirContasInativas: false });
  });
});
