import { describe, expect, it } from "vitest";
import { agenciaChave, codigoAtivo, contraparteChaveAtiva, decisaoSemRegra, hashAtivo, regraChaveAtiva, registroChaveAtiva, registroChavePadraoAtiva } from "../motor/chaves";
import * as mapear from "./mapear";

const T = "tenant-1";
const quando = new Date("2026-01-05T13:00:00Z");
const pessoas = new Map<string, string | null>([["u-original", "u-connect"], ["u-sem-par", null]]);

describe("carga: linha do original → Connect", () => {
  it("conta: chave de unicidade só entre as vivas, sem o pai (vai na segunda passada)", () => {
    const viva = mapear.conta({ id: "c1", empresa_id: "e1", conta_numero: 1026, codigo: "3.4.2.05", descricao: "Tarifas", tipo: "despesa", tipo_sa: "A", aceita_lancamentos: true, pai_id: "p1", created_at: quando, updated_at: quando, deleted_at: null }, T);
    expect(viva.codigoAtivo).toBe(codigoAtivo({ codigo: "3.4.2.05", deletedAt: null }));
    expect(viva).not.toHaveProperty("paiId");
    const apagada = mapear.conta({ id: "c2", empresa_id: "e1", conta_numero: null, codigo: "9", descricao: "x", tipo: "despesa", tipo_sa: "A", aceita_lancamentos: true, created_at: quando, updated_at: quando, deleted_at: quando }, T);
    expect(apagada.codigoAtivo).toBeNull();
    expect(apagada.contaNumero).toBeNull();
  });

  it("transação: data de calendário sem fuso, valor como texto e hash ativo só da viva", () => {
    const t = mapear.transacao({ id: "t1", empresa_id: "e1", agencia_id: "a1", data: "2026-01-31", valor: "1200.00", saldo_apos: null, historico: "PIX", ordem: 3, importacao_id: "i1", dc: "D", status: "pendente", hash_dedup: "h".repeat(64), auto_recusado_em: null, auto_recusado_por: "u-original", created_at: quando, updated_at: quando, deleted_at: null }, T, pessoas);
    expect(t.data.toISOString()).toBe("2026-01-31T00:00:00.000Z");
    expect(t.valor).toBe("1200.00");
    expect(t.hashAtivo).toBe(hashAtivo({ hashDedup: "h".repeat(64), deletedAt: null }));
    expect(t.autoRecusadoPorId).toBe("u-connect");
  });

  it("pessoa sem par no Connect fica nula", () => {
    const i = mapear.importacao({ id: "i1", empresa_id: "e1", agencia_id: "a1", nome_arquivo: "x.ofx", hash_arquivo: "f".repeat(64), total_no_arquivo: 3, importadas: 3, duplicadas: 0, rejeitadas: 0, criado_por: "u-sem-par", cancelada_em: null, cancelada_por: "desconhecida", motivo_cancelamento: null, saldo_declarado: "10.00", data_saldo_declarado: "2026-01-31", alerta_saldo: null, created_at: quando, updated_at: quando, deleted_at: null }, T, pessoas);
    expect(i.criadoPorId).toBeNull();
    expect(i.canceladaPorId).toBeNull();
    expect(i.dataSaldoDeclarado?.toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });

  it("regra, contraparte, agência, decisão e partida: as mesmas chaves que o Connect calcula ao gravar", () => {
    const r = mapear.regra({ id: "r1", empresa_id: "e1", conta_id: "c1", agencia_id: null, descricao: "d", historico: "TARIFA", historico_normalizado: "tarifa", dc: "D", tipo: "automatica", manter_historico: false, ativa: true, created_at: quando, updated_at: quando, deleted_at: null }, T);
    expect(r.chaveAtiva).toBe(regraChaveAtiva({ ativa: true, deletedAt: null, agenciaId: null, historicoNormalizado: "tarifa" }));
    const inativa = mapear.regra({ id: "r2", empresa_id: "e1", conta_id: "c1", agencia_id: "a1", descricao: "d", historico: "X", historico_normalizado: "x", dc: "D", tipo: "automatica", manter_historico: false, ativa: false, created_at: quando, updated_at: quando, deleted_at: null }, T);
    expect(inativa.chaveAtiva).toBeNull();

    const c = mapear.contraparte({ id: "k1", empresa_id: "e1", tipo: "cliente", documento: "12345678909", razao_social: "R", nome_fantasia: null, conta_contabil_id: "c1", origem: "relatorio_fiscal", dados_cadastrais: { uf: "SC" }, confirmado_em: quando, confirmado_por: "u-original", ativa: true, created_at: quando, updated_at: quando, deleted_at: null }, T, pessoas);
    expect(c.chaveAtiva).toBe(contraparteChaveAtiva({ ativa: true, deletedAt: null, documento: "12345678909", tipo: "cliente" }));
    expect(c.dadosCadastrais).toEqual({ uf: "SC" });
    expect(c.confirmadoPorId).toBe("u-connect");

    const a = mapear.agencia({ id: "a1", empresa_id: "e1", banco_sigla: "756", agencia: "1234", numero: "98765", digito: "4", ativa: true, conta_contabil_id: null, created_at: quando, updated_at: quando, deleted_at: null }, T);
    expect(a.chave).toBe(agenciaChave({ bancoSigla: "756", agencia: "1234", numero: "98765" }));

    const d = mapear.decisao({ id: "d1", empresa_id: "e1", transacao_id: "t1", resultado: "sem_regra", processado_em: quando }, T);
    expect(d.transacaoSemRegra).toBe(decisaoSemRegra({ resultado: "sem_regra", transacaoId: "t1" }));
    expect(mapear.decisao({ id: "d2", empresa_id: "e1", transacao_id: "t1", resultado: "associada", processado_em: quando }, T).transacaoSemRegra).toBeNull();

    const base = { id: "g1", empresa_id: "e1", transacao_id: "t1", lancamento_id: "l1", conta_id: "c1", agencia_id: "a1", descricao: "d", historico: "h", historico_extrato: "x", dc: "D", tipo_regra: "manual", valor: "10.00", data_lancamento: quando, cancelado_em: null, cancelado_por: null, motivo_cancelamento: null, created_at: quando, updated_at: quando, deleted_at: null };
    const simples = mapear.registro({ ...base, ordem_composicao: null }, T, pessoas);
    const perna = { deletedAt: null, transacaoId: "t1", lancamentoId: "l1", dc: "D" as const, ordemComposicao: null };
    expect(simples.chaveAtiva).toBe(registroChaveAtiva(perna));
    expect(simples.chavePadraoAtiva).toBe(registroChavePadraoAtiva(perna));
    const composta = mapear.registro({ ...base, ordem_composicao: 2 }, T, pessoas);
    expect(composta.chavePadraoAtiva).toBe(registroChavePadraoAtiva({ ...perna, ordemComposicao: 2 }));
  });

  it("CNPJ comparado só pelos dígitos", () => {
    expect(mapear.digitos("31.415.926/0001-71")).toBe("31415926000171");
    expect(mapear.digitos(null)).toBe("");
  });
});
