import { describe, expect, test } from "vitest";
import {
  agenciaChave,
  codigoAtivo,
  contraparteChaveAtiva,
  decisaoSemRegra,
  hashAtivo,
  historicoNormalizado,
  registroChaveAtiva,
  registroChavePadraoAtiva,
  regraChaveAtiva,
} from "./chaves";

const vivo = { deletedAt: null };
const apagado = { deletedAt: new Date("2026-11-09T12:00:00Z") };

describe("colunas de unicidade (índices parciais do PostgreSQL)", () => {
  test("transação: o hash só ocupa o lugar enquanto a linha vive", () => {
    expect(hashAtivo({ ...vivo, hashDedup: "abc" })).toBe("abc");
    // Cancelar a importação é soft delete: o mesmo extrato tem de poder entrar de novo (migration 0033).
    expect(hashAtivo({ ...apagado, hashDedup: "abc" })).toBeNull();
  });

  test("plano de contas: código comparado byte a byte, não pela collation do MySQL", () => {
    expect(codigoAtivo({ ...vivo, codigo: "1.1.B.abc" })).not.toBe(codigoAtivo({ ...vivo, codigo: "1.1.b.ABC" }));
    expect(codigoAtivo({ ...vivo, codigo: "1.1" })).toBe(codigoAtivo({ ...vivo, codigo: "1.1" }));
    expect(codigoAtivo({ ...apagado, codigo: "1.1" })).toBeNull();
  });

  test("regra: histórico normalizado é strip + minúsculas, com acento preservado", () => {
    expect(historicoNormalizado("  TARIFA Pacote ")).toBe("tarifa pacote");
    expect(historicoNormalizado("AÇÃO")).toBe("ação");
  });

  test("regra: escopo da agência e escopo global não colidem, e regra inativa sai", () => {
    const base = { ...vivo, ativa: true, historicoNormalizado: "tarifa" };
    const global = regraChaveAtiva({ ...base, agenciaId: null });
    const daAgencia = regraChaveAtiva({ ...base, agenciaId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d" });
    expect(global).toMatch(/^[0-9a-f]{64}$/);
    expect(global).not.toBe(daAgencia);
    // Duas globais com o mesmo histórico colidem (era o índice `…_global`).
    expect(regraChaveAtiva({ ...base, agenciaId: null })).toBe(global);
    expect(regraChaveAtiva({ ...base, agenciaId: null, ativa: false })).toBeNull();
    expect(regraChaveAtiva({ ...base, ...apagado, agenciaId: null })).toBeNull();
    // Acento faz diferença, como no PostgreSQL.
    expect(regraChaveAtiva({ ...base, agenciaId: null, historicoNormalizado: "tarifá" })).not.toBe(global);
  });

  test("contraparte: o mesmo documento pode ser fornecedor e cliente (ADR-016)", () => {
    const f = contraparteChaveAtiva({ ...vivo, ativa: true, documento: "09033833000123", tipo: "fornecedor" });
    const c = contraparteChaveAtiva({ ...vivo, ativa: true, documento: "09033833000123", tipo: "cliente" });
    expect(f).not.toBe(c);
    expect(contraparteChaveAtiva({ ...vivo, ativa: false, documento: "09033833000123", tipo: "cliente" })).toBeNull();
  });

  test("agência: sigla com caixa diferente é outra conta, como no PostgreSQL", () => {
    expect(agenciaChave({ bancoSigla: "ITAU", agencia: "1", numero: "2" })).not.toBe(agenciaChave({ bancoSigla: "itau", agencia: "1", numero: "2" }));
    // O separador impede que ("1", "23") e ("12", "3") virem a mesma chave.
    expect(agenciaChave({ bancoSigla: "BB", agencia: "1", numero: "23" })).not.toBe(agenciaChave({ bancoSigla: "BB", agencia: "12", numero: "3" }));
  });

  test("registro: uma perna D e uma C por lançamento; composição manual pode ter vários pares", () => {
    const perna = { ...vivo, transacaoId: "t", lancamentoId: "l1", dc: "D" as const, ordemComposicao: null };
    expect(registroChaveAtiva(perna)).toBe("l1:D");
    expect(registroChavePadraoAtiva(perna)).toBe("D");
    expect(registroChavePadraoAtiva({ ...perna, ordemComposicao: 1 })).toBeNull();
    expect(registroChaveAtiva({ ...perna, ordemComposicao: 1 })).toBe("l1:D");
    expect(registroChaveAtiva({ ...perna, ...apagado })).toBeNull();
    // Lançamento manual sem transação não entra na regra.
    expect(registroChaveAtiva({ ...perna, transacaoId: null })).toBeNull();
  });

  test("decisão: só a `sem_regra` ocupa a vaga da transação", () => {
    expect(decisaoSemRegra({ resultado: "sem_regra", transacaoId: "t" })).toBe("t");
    expect(decisaoSemRegra({ resultado: "associada", transacaoId: "t" })).toBeNull();
    expect(decisaoSemRegra({ resultado: "erro", transacaoId: "t" })).toBeNull();
  });
});
