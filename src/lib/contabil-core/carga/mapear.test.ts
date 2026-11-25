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

describe("carga do Bloco C (C4): documentos", () => {
  const datas = { created_at: quando, updated_at: quando, deleted_at: null };
  const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

  it("nota: dedup_key, chave, procedência e a transação ligada copiados como estão", () => {
    const n = mapear.notaFiscal({
      id: "n1", empresa_id: "e1", tipo: "nfe", numero: "5101", serie: "1", cnpj_emitente: "99.000.001/0001-01", nome_emitente: "ALFA",
      cnpj_destinatario: "31.415.926/0001-71", valor: "800.00", data_emissao: quando, status: "associada", transacao_id: "t1",
      chave_acesso: "3".repeat(44), assinatura_motivo: null, dedup_key: "d".repeat(64), observacao: null, origem: "xml_nao_verificado", ...datas,
    }, T);
    expect(n).toMatchObject({ dedupKey: "d".repeat(64), origem: "xml_nao_verificado", chaveAcesso: "3".repeat(44), transacaoId: "t1", valor: "800.00", status: "associada" });
    expect(n.dataEmissao).toEqual(quando);
    expect(n.serie).toBe("1");
    expect(mapear.notaFiscal({ ...n, id: "n2", empresa_id: "e1", cnpj_emitente: "x", dedup_key: "k", tipo: "nfse", numero: "7", valor: "1.00", data_emissao: quando, status: "pendente", origem: "ocr", ...datas }, T).chaveAcesso).toBeNull();
  });

  it("base64 decodificado como o b64decode do Python (sem validate)", () => {
    // Saídas do Python (base64.b64decode), uma a uma.
    const casos: [string, string | null][] = [
      ["QUJD", "414243"], ["QUI=", "4142"], ["QQ==", "41"], ["QUJD\nREVG\n", "414243444546"], ["QU JD!!", "414243"],
      ["QQ=Q=", "4104"], ["Q=Q==", "41"], ["QUI=QQ==", "4142"], ["QUJ=D", "4142"], ["QQ=a=", "4106"], ["====", ""],
      ["dataQUJD", "75ab5a414243"],
      ["Q", null], ["QUI", null], ["QQ", null], ["QU=I", null], ["QUJDRA", null], ["isto-nao-e-base64!", null], ["a/pdf;base64,QUJD", null], ["QéUJD", null],
    ];
    for (const [entrada, esperado] of casos) {
      const r = mapear.base64DoPython(entrada);
      expect(r === null ? null : hex(r), entrada).toBe(esperado);
    }
  });

  it("arquivo do comprovante: sem arquivo, base64 inválido, hash conferido, hash ausente calculado", () => {
    const bytes = new TextEncoder().encode("%PDF-1.4 comprovante inventado");
    const base64 = Buffer.from(bytes).toString("base64");
    const sha = mapear.sha256Hex(bytes);
    expect(mapear.arquivoDoComprovante({ arquivo_base64: null, arquivo_sha256: null })).toEqual({ tipo: "sem_arquivo" });
    expect(mapear.arquivoDoComprovante({ arquivo_base64: "", arquivo_sha256: null })).toEqual({ tipo: "sem_arquivo" });
    expect(mapear.arquivoDoComprovante({ arquivo_base64: "isto-nao-e-base64!", arquivo_sha256: null })).toEqual({ tipo: "base64_invalido" });
    expect(mapear.arquivoDoComprovante({ arquivo_base64: "isto-nao-e-base64!", arquivo_sha256: sha })).toMatchObject({ tipo: "recusa" });
    const certo = mapear.arquivoDoComprovante({ arquivo_base64: base64.replace(/(.{8})/g, "$1\n"), arquivo_sha256: sha });
    expect(certo).toMatchObject({ tipo: "arquivo", sha256: sha, calculado: false });
    expect(certo.tipo === "arquivo" && hex(certo.bytes)).toBe(hex(bytes));
    expect(mapear.arquivoDoComprovante({ arquivo_base64: base64, arquivo_sha256: null })).toMatchObject({ tipo: "arquivo", sha256: sha, calculado: true });
    expect(mapear.arquivoDoComprovante({ arquivo_base64: base64, arquivo_sha256: "0".repeat(64) })).toEqual({ tipo: "recusa", motivo: "SHA-256 do arquivo diferente do arquivo_sha256 do original" });
  });

  it("comprovante: com o arquivo em disco, e sem ele com o hash do original", () => {
    const base = {
      id: "c1", empresa_id: "e1", agencia_id: null, transacao_id: "t9", favorecido: "DELTA", cpf_cnpj: "96.000.004/0001-49", data_pagamento: quando,
      data_vencimento: null, valor_documento: null, valor_pago: "250.00", juros: "3.00", multa: "0.00", desconto: "0.00", observacao: null,
      arquivo_nome: "boleto.pdf", arquivo_sha256: "a".repeat(64), ...datas,
    };
    const com = mapear.comprovante(base, T, { sha256: "b".repeat(64), tamanho: 99, tipo: "application/pdf", storageKey: `${T}/c1.pdf` });
    expect(com).toMatchObject({ arquivoSha256: "b".repeat(64), arquivoTamanho: 99, arquivoTipo: "application/pdf", storageKey: `${T}/c1.pdf`, valorPago: "250.00", juros: "3.00", transacaoId: "t9" });
    expect(com).not.toHaveProperty("arquivoBase64");
    const sem = mapear.comprovante({ ...base, arquivo_sha256: null }, T, null);
    expect([sem.arquivoSha256, sem.arquivoTipo, sem.arquivoTamanho, sem.storageKey, sem.arquivoNome]).toEqual([null, null, null, null, "boleto.pdf"]);
  });

  it("cartão, fatura e gasto: números, datas e ligações", () => {
    const c = mapear.cartao({ id: "k1", empresa_id: "e1", nome: "Corporativo", bandeira: "visa", ultimos_digitos: "1234", dia_fechamento: 5, dia_vencimento: 15, limite: "20000.00", ativo: false, ...datas }, T);
    expect(c).toMatchObject({ diaFechamento: 5, diaVencimento: 15, limite: "20000.00", ativo: false, ultimosDigitos: "1234" });
    const f = mapear.fatura({ id: "f1", empresa_id: "e1", cartao_id: "k1", competencia: "2026-05", data_fechamento: null, data_vencimento: quando, valor_total: "0.00", status: "paga", transacao_id: "t1", observacao: null, ...datas }, T);
    expect(f).toMatchObject({ cartaoId: "k1", competencia: "2026-05", status: "paga", transacaoId: "t1", dataFechamento: null, valorTotal: "0.00" });
    const g = mapear.lancamentoCartao({ id: "uuid5", empresa_id: "e1", fatura_id: "f1", data_compra: quando, descricao: "MERCADO", valor: "180.40", conta_id: null, parcela_atual: 1, parcela_total: 3, ...datas }, T);
    expect(g).toMatchObject({ id: "uuid5", faturaId: "f1", valor: "180.40", parcelaAtual: 1, parcelaTotal: 3, contaId: null });
    expect(mapear.lancamentoCartao({ ...g, id: "g2", empresa_id: "e1", fatura_id: "f1", data_compra: quando, descricao: "x", valor: "1.00", parcela_atual: null, parcela_total: undefined, ...datas }, T).parcelaAtual).toBeNull();
  });

  it("documento e distribuição da fatura: JSON sem conversão, aplicação nula, PDF conferido", () => {
    const resultado = '{"itens": [{"data": "2026-05-02", "descricao": "RESTAURANTE", "valor": "1200.00"}], "total": "1200.00", "pendencias": [], "metodo": "COMPOSICAO", "revisado_por": "u-original"}';
    const d = mapear.faturaDocumento({ id: "d1", empresa_id: "e1", fatura_id: "f1", nome: "composicao.pdf", hash_arquivo: "c".repeat(64), status: "principal", resultado, erro: null, ...datas }, T, { storageKey: `${T}/d1.pdf`, tamanho: 1234 });
    expect(d.resultado).toEqual(JSON.parse(resultado));
    expect(d).toMatchObject({ storageKey: `${T}/d1.pdf`, tamanho: 1234, hashArquivo: "c".repeat(64), status: "principal" });
    expect(d).not.toHaveProperty("conteudo");

    const aplicada = mapear.faturaDistribuicao({ id: "x1", empresa_id: "e1", fatura_id: "f1", versao: 4, distribuicoes: '{"g1": [{"conta_id": "c1", "historico": "H", "valor": "10.00"}]}', aplicacao: '{"antes": null, "transacao_id": "t1", "hash": "h"}', ...datas }, T);
    expect(aplicada.aplicacao).toEqual({ antes: null, transacao_id: "t1", hash: "h" });
    expect(aplicada.distribuicoes).toEqual({ g1: [{ conta_id: "c1", historico: "H", valor: "10.00" }] });
    expect(aplicada.versao).toBe(4);
    expect(mapear.faturaDistribuicao({ id: "x2", empresa_id: "e1", fatura_id: "f2", versao: 0, distribuicoes: "{}", aplicacao: null, ...datas }, T).aplicacao).toBeNull();
    expect(mapear.faturaDistribuicao({ id: "x3", empresa_id: "e1", fatura_id: "f3", versao: 0, distribuicoes: "{}", aplicacao: "null", ...datas }, T).aplicacao).toBeNull();

    const pdf = new TextEncoder().encode("%PDF-1.7 fatura");
    expect(mapear.conferirPdfDaFatura(pdf, { hash_arquivo: mapear.sha256Hex(pdf) })).toBeNull();
    expect(mapear.conferirPdfDaFatura(pdf, { hash_arquivo: "0".repeat(64) })).toMatch(/SHA-256/);
    expect(mapear.conferirPdfDaFatura(null, { hash_arquivo: "0".repeat(64) })).toMatch(/sem conteúdo/);
  });

  it("travas do Connect: a linha que o MySQL recusaria fica de fora, com o motivo, e quem depende dela cai junto", () => {
    const vazio: mapear.LinhasDoBlocoC = { notas: [], comprovantes: [], cartoes: [], faturas: [], lancamentos: [], documentos: [], distribuicoes: [] };
    const comp = (id: string, extra: object) => ({ id, empresa_id: "e1", valor_pago: "10.00", juros: "0.00", multa: "0.00", desconto: "0.00", data_pagamento: quando, data_vencimento: null, ...datas, ...extra });
    const puladas = mapear.puladasPelasTravas({
      ...vazio,
      comprovantes: [comp("ok", {}), comp("zero", { valor_pago: "0.00" }), comp("juros", { juros: "-1.00" }), comp("ano", { data_pagamento: new Date("0999-12-31T00:00:00Z") })],
      cartoes: [
        { id: "k-ok", bandeira: "visa", dia_fechamento: 5, dia_vencimento: 28, ...datas },
        { id: "k-master", bandeira: "master", dia_fechamento: 30, dia_vencimento: 10, ...datas },
        { id: "k-dia", bandeira: "elo", dia_fechamento: 30, dia_vencimento: 10, ...datas },
      ],
      faturas: [
        { id: "f-ok", cartao_id: "k-ok", competencia: "2026-05", status: "aberta", transacao_id: "t1", ...datas },
        { id: "f-dep", cartao_id: "k-master", competencia: "2026-05", status: "aberta", transacao_id: null, ...datas },
        { id: "f-rep", cartao_id: "k-ok", competencia: "2026-05", status: "fechada", transacao_id: null, ...datas },
        { id: "f-tx", cartao_id: "k-ok", competencia: "2026-06", status: "paga", transacao_id: "t1", ...datas },
      ],
      lancamentos: [
        { id: "g-ok", fatura_id: "f-ok", valor: "0.00", data_compra: quando, ...datas },
        { id: "g-neg", fatura_id: "f-ok", valor: "-10.00", data_compra: quando, ...datas },
        { id: "g-dep", fatura_id: "f-dep", valor: "10.00", data_compra: quando, ...datas },
      ],
      documentos: [
        { id: "d-ok", fatura_id: "f-ok", status: "revisar", hash_arquivo: "AB", ...datas },
        { id: "d-caixa", fatura_id: "f-ok", status: "falhou", hash_arquivo: "ab", ...datas },
        { id: "d-status", fatura_id: "f-ok", status: "erro", hash_arquivo: "cd", ...datas },
        { id: "d-dep", fatura_id: "f-dep", status: "revisar", hash_arquivo: "ef", ...datas },
      ],
      distribuicoes: [{ id: "x-ok", fatura_id: "f-ok", versao: 0, ...datas }, { id: "x-neg", fatura_id: "f-tx", versao: -1, ...datas }, { id: "x-dep", fatura_id: "f-dep", versao: 1, ...datas }],
      notas: [
        { id: "n-ok", empresa_id: "e1", tipo: "nfe", status: "pendente", origem: "ocr", chave_acesso: null, dedup_key: "aa", data_emissao: quando, ...datas },
        { id: "n-sem-chave", empresa_id: "e1", tipo: "nfe", status: "pendente", origem: "ocr", chave_acesso: null, dedup_key: "bb", data_emissao: quando, ...datas },
        { id: "n-dedup", empresa_id: "e1", tipo: "nfse", status: "pendente", origem: "ocr", chave_acesso: null, dedup_key: "AA", data_emissao: quando, ...datas },
      ],
    });
    expect([...puladas.keys()].sort()).toEqual(["ano", "d-caixa", "d-dep", "d-status", "f-dep", "f-rep", "f-tx", "g-dep", "g-neg", "juros", "k-dia", "k-master", "n-dedup", "x-dep", "x-neg", "zero"].sort());
    expect(puladas.get("zero")).toMatch(/ck_core_comprovante_valor_pago/);
    expect(puladas.get("juros")).toMatch(/ck_core_comprovante_acrescimos/);
    expect(puladas.get("ano")).toMatch(/data_pagamento fora do que o MySQL guarda/);
    expect(puladas.get("k-master")).toBe("bandeira fora da lista (ck_core_cartao_bandeira); dia de fechamento ou de vencimento fora de 1 a 28 (ck_core_cartao_dias)");
    expect(puladas.get("k-dia")).toMatch(/ck_core_cartao_dias/);
    expect(puladas.get("f-dep")).toBe("o cartão k-master ficou de fora");
    expect(puladas.get("g-dep")).toBe("a fatura f-dep ficou de fora");
    expect(puladas.get("g-neg")).toMatch(/ck_core_lancamento_cartao_valor/);
    expect(puladas.get("f-rep")).toMatch(/cartão, competência/);
    expect(puladas.get("f-tx")).toMatch(/transação que pagou/);
    expect(puladas.get("x-neg")).toMatch(/a fatura f-tx ficou de fora/);
    expect(puladas.get("d-caixa")).toMatch(/hash do arquivo/);
    expect(puladas.get("d-status")).toMatch(/ck_core_fatura_documento_status/);
    expect(puladas.get("n-dedup")).toMatch(/dedup_key/);
    expect(mapear.puladasPelasTravas(vazio).size).toBe(0);
  });
});
