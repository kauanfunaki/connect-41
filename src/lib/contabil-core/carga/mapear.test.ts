import { describe, expect, it } from "vitest";
import { agenciaChave, codigoAtivo, contraparteChaveAtiva, decisaoSemRegra, hashAtivo, regraChaveAtiva, registroChaveAtiva, registroChavePadraoAtiva, revisaoChaveAtiva } from "../motor/chaves";
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

describe("carga do Bloco B (B5): conciliação", () => {
  // O texto da coluna `json` como o SQLAlchemy grava (`json.dumps`: separadores com espaço, `ensure_ascii`).
  const snapshot = '{"fontes": [{"id": "f1", "nome_arquivo": "Extrato j\\u00e1 importado", "tem_original": false}], "linhas": [{"valor": "-350.00", "ordem": 3, "observacao": null}], "avisos": []}';

  it("revisão: JSON copiado sem conversão, chave ativa só da viva, pessoa sem par com o prefixo", () => {
    const base = {
      id: "r1", empresa_id: "e1", agencia_id: "a1", criado_por: "u-original", nome_arquivo: "razao.xlsx", titulo: null, conta_bancaria: "ITAU 7285 12287 0",
      periodo_inicio: "2026-04-01", periodo_fim: "2026-04-30", revisao_hash: "a".repeat(64), extrato_hash: "b".repeat(64), versao: 7,
      snapshot, relatorio: '{"resumo": {"conciliados_por_tipo": {"MESMO_DIA": 2}}}', created_at: quando, updated_at: quando, deleted_at: null,
    };
    const r = mapear.revisao(base, T, pessoas);
    expect(r.snapshot).toEqual(JSON.parse(snapshot));
    expect((r.snapshot as { fontes: { nome_arquivo: string }[] }).fontes[0].nome_arquivo).toBe("Extrato já importado");
    expect(r.relatorio).toEqual({ resumo: { conciliados_por_tipo: { MESMO_DIA: 2 } } });
    expect(r.chaveAtiva).toBe(revisaoChaveAtiva({ revisaoHash: "a".repeat(64), deletedAt: null }));
    expect(r.criadoPorId).toBe("u-connect");
    expect(r.periodoFim.toISOString()).toBe("2026-04-30T00:00:00.000Z");
    expect(r.versao).toBe(7);

    const apagada = mapear.revisao({ ...base, deleted_at: quando, criado_por: "u-sem-par" }, T, pessoas);
    expect(apagada.chaveAtiva).toBeNull();
    expect(apagada.criadoPorId).toBe(`${mapear.PESSOA_DO_ORIGINAL}u-sem-par`);
    expect(mapear.revisao({ ...base, criado_por: "nunca-vista" }, T, pessoas).criadoPorId).toBe("contabil-core:nunca-vista");
  });

  it("vínculos: ids e itens em JSON, dinheiro como texto, desfazer e pessoa", () => {
    const v = mapear.vinculoDaRevisao({
      id: "v1", empresa_id: "e1", revisao_id: "r1", extrato_ids: '["t1", "t2"]', razao_itens: '[{"linha_id": "l1", "dc": "C"}]',
      total_extrato: "350.00", total_razao: "350.00", diferenca: "0.00", observacao: "", estado: "DESFEITO", usuario_id: "u-original",
      responsavel: "Pessoa", desfeito_por: "Pessoa", desfeito_em: quando, motivo_desfazer: "Conta errada", created_at: quando, updated_at: quando, deleted_at: null,
    }, T, pessoas);
    expect(v.extratoIds).toEqual(["t1", "t2"]);
    expect(v.razaoItens).toEqual([{ linha_id: "l1", dc: "C" }]);
    expect([v.totalExtrato, v.diferenca, v.estado, v.confirmadoPorId, v.motivoDesfazer]).toEqual(["350.00", "0.00", "DESFEITO", "u-connect", "Conta errada"]);

    const f = mapear.vinculoDoFinanceiro({
      id: "v2", empresa_id: "e1", analise_id: "a1", tipo_comparacao: "RAZAO_DETALHADO", financeiro_ids: '["x"]', comparacao_ids: '["y", "z"]',
      total_financeiro: "1000.00", total_comparacao: "1000.00", diferenca: "0.00", observacao: "ok", estado: "ATIVO", usuario_id: "u-sem-par",
      responsavel: "Pessoa Ausente", desfeito_por: null, desfeito_em: null, motivo_desfazer: null, created_at: quando, updated_at: quando, deleted_at: null,
    }, T, pessoas);
    expect(f.comparacaoIds).toEqual(["y", "z"]);
    expect(f.confirmadoPorId).toBe("contabil-core:u-sem-par");
    expect(f.desfeitoEm).toBeNull();
  });

  it("análise e documento: snapshot sem conversão, a chave do disco vem de fora", () => {
    const a = mapear.analise({
      id: "a1", empresa_id: "e1", agencia_id: "ag", criado_por: "u-original", titulo: "Abril", conta_bancaria: "ITAU", periodo_inicio: "2026-04-01",
      periodo_fim: "2026-04-30", extrato_hash: "c".repeat(64), versao: 9, snapshot, created_at: quando, updated_at: quando, deleted_at: quando,
    }, T, pessoas);
    expect(a.snapshot).toEqual(JSON.parse(snapshot));
    expect(a.deletedAt).toEqual(quando);
    const d = mapear.documento({ id: "d1", empresa_id: "e1", analise_id: "a1", nome_arquivo: "x.xlsx", tipo: "SISPAG", hash_arquivo: "f".repeat(64), media_type: "application/pdf", tamanho: 10, created_at: quando, updated_at: quando, deleted_at: null }, T, "t/d1.xlsx");
    expect(d).toMatchObject({ storageKey: "t/d1.xlsx", tamanho: 10, mediaType: "application/pdf" });
    expect(d).not.toHaveProperty("conteudo");
  });

  it("original do financeiro: SHA-256 e tamanho conferidos antes de gravar", () => {
    const bytes = new TextEncoder().encode("planilha inventada");
    const certo = { hash_arquivo: mapear.sha256Hex(bytes), tamanho: bytes.length };
    expect(mapear.conferirOriginal(bytes, certo)).toBeNull();
    expect(mapear.conferirOriginal(bytes, { ...certo, hash_arquivo: "0".repeat(64) })).toMatch(/SHA-256/);
    expect(mapear.conferirOriginal(bytes, { ...certo, tamanho: 1 })).toMatch(/tamanho/);
    expect(mapear.conferirOriginal(new Uint8Array(), certo)).toMatch(/sem conteúdo/);
    expect(mapear.conferirOriginal(null, certo)).toMatch(/sem conteúdo/);
  });

  it("JSON do original: só como texto, e inteiro fora de ±2^53 recusa a linha", () => {
    expect(() => mapear.jsonDoOriginal({ ja: "lido" })).toThrow(/como texto/);
    expect(() => mapear.jsonDoOriginal("null")).toThrow(/sem objeto/);
    expect(() => mapear.jsonDoOriginal('{"n": 9007199254740993}')).toThrow(/fora do limite/);
    expect(mapear.jsonDoOriginal('{"n": 9007199254740991, "t": "9007199254740993", "q": "a\\"1e999999999999999999"}')).toEqual({ n: 9007199254740991, t: "9007199254740993", q: 'a"1e999999999999999999' });
    expect(mapear.inteiroForaDoLimite('[-12345678901234567890]')).toBe("-12345678901234567890");
    expect(mapear.inteiroForaDoLimite('["\\\\", 1, true, null, -0, 1.5e3]')).toBeNull();
  });

  it("igualdade valor a valor: a ordem das chaves não conta, a das listas conta", () => {
    expect(mapear.mesmoJson({ a: [1, { b: "x", c: null }] }, { a: [1, { c: null, b: "x" }] })).toBe(true);
    expect(mapear.mesmoJson([1, 2], [2, 1])).toBe(false);
    expect(mapear.mesmoJson({ a: "1" }, { a: 1 })).toBe(false);
    expect(mapear.mesmoJson({ a: null }, {})).toBe(false);
    expect(mapear.mesmoJson([], {})).toBe(false);
  });
});
