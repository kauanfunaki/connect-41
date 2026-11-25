// Conferência da carga do Contábil Core (Fase 5, 10/11/2026). Só lê, dos dois lados.
//
// Para cada empresa que a carga trouxe (mesmo UUID nos dois bancos):
// - contagem por tabela (vivas e apagadas);
// - soma dos valores por mês: transações vivas e partidas vivas e não canceladas, por lado (D/C);
// - com `--dominio=<pasta>`, o TXT do Domínio que o Connect gera para cada arquivo da pasta, comparado
//   byte a byte. Os arquivos da pasta são os baixados do Contábil Core (Exportar › Lançamentos para
//   importação, TXT), nomeados `<CNPJ>_<AAAA-MM>.txt` (o CNPJ com ou sem máscara).
//
// Bloco B (Fase B5, 18/11/2026), também por empresa:
// - contagem das cinco tabelas da conciliação (total e vivas);
// - o JSON gravado (snapshot e relatório da revisão, snapshot da análise, ids dos vínculos) igual ao
//   do original, valor a valor;
// - o `extrato_hash` recalculado no Connect, pelas mesmas funções do serviço, a partir das transações
//   espelhadas, comparado ao gravado; e a validade (`fontesValidas`, `extratoValido`) igual à do
//   original, recalculada lá com as transações de lá;
// - as revisões e análises vivas abertas pelos serviços (`obterRevisao`, `obterAnalise`), com a
//   validade igual à do original, e cada original baixado por `originalDoDocumento`;
// - o SHA-256 de cada original em disco igual ao `hash_arquivo` do original.
//
// Bloco C (Fase C4, 25/11/2026), também por empresa (as linhas que a carga pula pelas travas do Connect,
// decididas pela mesma `puladasPelasTravas`, ficam fora da conta e aparecem como informação):
// - contagem das sete tabelas (total e vivas);
// - cada linha comparada campo a campo (dinheiro com 2 casas, instantes em UTC, JSON valor a valor),
//   inclusive a transação ligada, o `dedup_key` e a procedência da nota;
// - a transação ligada (nota, comprovante, fatura) igual nos dois lados (data, valor, D/C e desfeita);
// - cada arquivo em disco com o SHA-256 e o tamanho dos bytes do original (o base64 decodificado como o
//   Python, o `conteudo` da fatura);
// - as decisões do NEO com evidência de nota ou comprovante iguais;
// - os serviços do Connect abrindo os registros: `listarNotas`, `listarComprovantes` e
//   `arquivoDoComprovante`, `listarCartoes`, `listarFaturas`, `listarLancamentos`, `obterDistribuicao`
//   (a aplicação APLICADA ou DESATUALIZADA igual à do original, pelo hash recalculado lá) e
//   `arquivoDoDocumento`.
//
// Variáveis: CARGA_ORIGEM_URL, CARGA_ORIGEM_SSL, CARGA_TENANT_ID e DATABASE_URL, como na carga.
//   npx tsx --require ./scripts/contabil-core/sem-server-only.cjs scripts/contabil-core/conferir-carga.ts [--dominio=<pasta>]
//
// O terminal mostra só contagens e o CNPJ mascarado.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { getPrisma } from "../../src/lib/prisma";
import { gerarArquivoDoDominio } from "../../src/lib/contabil-core/servidor/exportacao";
import { arquivoDoComprovante as arquivoNoOriginal, digitos, jsonDoOriginal, mesmoJson, puladasPelasTravas, sha256Hex, type LinhasDoBlocoC } from "../../src/lib/contabil-core/carga/mapear";
import { hashDaClassificacao } from "../../src/lib/contabil-core/cartoes/servico";
import { texto as textoDec } from "../../src/lib/contabil-core/motor/decimal";
import { listarNotas } from "../../src/lib/contabil-core/servidor/notas";
import { arquivoDoComprovante, listarComprovantes } from "../../src/lib/contabil-core/servidor/comprovantes";
import { listarCartoes, listarFaturas, listarLancamentos } from "../../src/lib/contabil-core/servidor/cartoes";
import { arquivoDoDocumento, obterDistribuicao } from "../../src/lib/contabil-core/servidor/faturas";
import { lerArquivo as lerArquivoDoComprovante } from "../../src/lib/contabil-core/servidor/originaisComprovantes";
import { lerArquivo as lerPdfDaFatura } from "../../src/lib/contabil-core/servidor/originaisFaturas";
import { evidenciaDoExtrato, hashJson, type TransacaoDaRevisao } from "../../src/lib/contabil-core/conciliacao/revisao";
import { identidadeDoExtrato } from "../../src/lib/contabil-core/conciliacao/financeiro";
import { dec, reescala } from "../../src/lib/contabil-core/motor/decimal";
import { dia } from "../../src/lib/contabil-core/servidor/base";
import { lerExtrato, obterRevisao } from "../../src/lib/contabil-core/servidor/revisao";
import { obterAnalise, originalDoDocumento } from "../../src/lib/contabil-core/servidor/financeiro";
import { lerOriginal } from "../../src/lib/contabil-core/servidor/originaisFinanceiro";

pg.types.setTypeParser(1082, (v) => v);
// `json` como texto, lido por `jsonDoOriginal`, como na carga.
pg.types.setTypeParser(114, (v) => v);
pg.types.setTypeParser(3802, (v) => v);
const origemUrl = process.env.CARGA_ORIGEM_URL;
const tenantDoAmbiente = process.env.CARGA_TENANT_ID;
if (!origemUrl || !tenantDoAmbiente) throw new Error("Defina CARGA_ORIGEM_URL e CARGA_TENANT_ID.");
const tenantId: string = tenantDoAmbiente;
const pastaDominio = process.argv.find((a) => a.startsWith("--dominio="))?.slice("--dominio=".length);
const prisma = getPrisma();
const mascara = (c: string) => `${digitos(c).slice(0, 2)}.${digitos(c).slice(2, 5)}.***/****-**`;

let diferencas = 0;
/** Ordena por mês e lado nos dois lados: o PostgreSQL ordena o enum D/C pela declaração, o MySQL pelo texto. */
const porMesELado = <T extends { mes: unknown; dc: unknown }>(xs: T[]) =>
  [...xs].sort((a, b) => `${a.mes}${a.dc}`.localeCompare(`${b.mes}${b.dc}`));

function confere(nome: string, origem: unknown, connect: unknown) {
  const igual = JSON.stringify(origem) === JSON.stringify(connect);
  if (!igual) diferencas++;
  console.log(`  ${igual ? "ok   " : "DIFERE"} ${nome}${igual ? "" : `: original ${JSON.stringify(origem)} × Connect ${JSON.stringify(connect)}`}`);
}

type Consulta = (sql: string, args: unknown[]) => Promise<Record<string, unknown>[]>;

/** Só contagens: o JSON e os arquivos têm dado de cliente. */
function placar(nome: string, iguais: number, total: number, info = "") {
  const ok = iguais === total;
  if (!ok) diferencas++;
  console.log(`  ${ok ? "ok   " : "DIFERE"} ${nome}: ${iguais} de ${total} iguais${ok ? "" : `, ${total - iguais} diferente(s)`}${info ? ` (${info})` : ""}`);
}

const ouNulo = <T>(v: unknown, f: (v: unknown) => T): T | null => (v === null || v === undefined ? null : f(v));

/** O extrato vivo da conta no período, lido no ORIGINAL na forma do serviço; `null` sem a conta bancária viva (`_fontes_validas`). */
async function extratoDoOriginal(q: Consulta, empresaId: string, agenciaId: string, inicio: string, fim: string): Promise<TransacaoDaRevisao[] | null> {
  const [agencia] = await q("SELECT id FROM agencias_bancarias WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL", [agenciaId, empresaId]);
  if (!agencia) return null;
  const linhas = await q(
    "SELECT id, data, valor, dc, historico, saldo_apos, ordem, importacao_id FROM transacoes WHERE empresa_id = $1 AND agencia_id = $2 AND deleted_at IS NULL AND data >= $3 AND data <= $4",
    [empresaId, agenciaId, inicio, fim],
  );
  return linhas.map((t) => ({
    id: String(t.id), data: String(t.data), valor: reescala(dec(String(t.valor)), -2), dc: String(t.dc), historico: String(t.historico),
    saldoApos: ouNulo(t.saldo_apos, (v) => reescala(dec(String(v)), -2)), ordem: ouNulo(t.ordem, Number), importacaoId: ouNulo(t.importacao_id, String), loteEm: null,
  }));
}

/** O mesmo, no CONNECT, pela leitura do serviço (`lerExtrato`), depois da carga. */
async function extratoDoConnect(empresaId: string, agenciaId: string, inicio: string, fim: string): Promise<TransacaoDaRevisao[] | null> {
  const agencia = await prisma.coreAgencia.findFirst({ where: { id: agenciaId, tenantId, empresaId, deletedAt: null }, select: { id: true } });
  if (!agencia) return null;
  return lerExtrato(prisma, tenantId, empresaId, agenciaId, inicio, fim);
}

/** Bloco B (B5): JSON, `extrato_hash`, validade, serviços e originais em disco. */
async function conferirConciliacao(q: Consulta, empresaId: string) {
  // Revisões: o JSON, o hash do extrato recalculado nos dois lados e a revisão aberta pelo serviço.
  const revisoes = await q("SELECT id, agencia_id, periodo_inicio, periodo_fim, extrato_hash, deleted_at FROM conciliacao_revisoes WHERE empresa_id = $1 ORDER BY created_at, id", [empresaId]);
  const r = { json: 0, extrato: 0, validas: 0, vivas: 0, abertas: 0 };
  for (const o of revisoes) {
    const id = String(o.id);
    const c = await prisma.coreConciliacaoRevisao.findUnique({ where: { id }, select: { snapshot: true, relatorio: true, extratoHash: true, agenciaId: true, periodoInicio: true, periodoFim: true } });
    if (!c) continue; // a contagem já acusou
    const [json] = await q("SELECT snapshot, relatorio FROM conciliacao_revisoes WHERE id = $1", [id]);
    if (mesmoJson(jsonDoOriginal(json.snapshot), c.snapshot) && mesmoJson(jsonDoOriginal(json.relatorio), c.relatorio)) r.json++;
    const noConnect = await extratoDoConnect(empresaId, c.agenciaId, dia(c.periodoInicio), dia(c.periodoFim));
    const noOriginal = await extratoDoOriginal(q, empresaId, String(o.agencia_id), String(o.periodo_inicio), String(o.periodo_fim));
    const validaNoConnect = !!noConnect && hashJson(evidenciaDoExtrato(noConnect)) === c.extratoHash;
    const validaNoOriginal = !!noOriginal && hashJson(evidenciaDoExtrato(noOriginal)) === String(o.extrato_hash);
    if (validaNoConnect === validaNoOriginal) r.extrato++;
    if (validaNoConnect) r.validas++;
    if (o.deleted_at) continue;
    r.vivas++;
    const [{ n }] = await q("SELECT count(*)::int AS n FROM conciliacao_vinculos WHERE revisao_id = $1", [id]);
    const aberta = await obterRevisao(tenantId, empresaId, id);
    if (aberta.ok && aberta.valor.fontesValidas === validaNoOriginal && aberta.valor.vinculos.length === n) r.abertas++;
  }
  placar("revisões: snapshot e relatório", r.json, revisoes.length);
  placar("revisões: extrato_hash recalculado no Connect × no original", r.extrato, revisoes.length, `${r.validas} com o extrato da criação`);
  placar("revisões vivas abertas por obterRevisao (fontesValidas e vínculos)", r.abertas, r.vivas);

  const vinculosDaRevisao = await q("SELECT id, extrato_ids, razao_itens FROM conciliacao_vinculos WHERE empresa_id = $1", [empresaId]);
  let vr = 0;
  for (const o of vinculosDaRevisao) {
    const c = await prisma.coreConciliacaoVinculo.findUnique({ where: { id: String(o.id) }, select: { extratoIds: true, razaoItens: true } });
    if (c && mesmoJson(jsonDoOriginal(o.extrato_ids), c.extratoIds) && mesmoJson(jsonDoOriginal(o.razao_itens), c.razaoItens)) vr++;
  }
  placar("vínculos da revisão: extrato_ids e razao_itens", vr, vinculosDaRevisao.length);

  // Análises do financeiro: o mesmo, com `identidadeDoExtrato`.
  const analises = await q("SELECT id, agencia_id, periodo_inicio, periodo_fim, extrato_hash, deleted_at FROM financeiro_analises WHERE empresa_id = $1 ORDER BY created_at, id", [empresaId]);
  const a = { json: 0, extrato: 0, validas: 0, vivas: 0, abertas: 0 };
  for (const o of analises) {
    const id = String(o.id);
    const c = await prisma.coreFinanceiroAnalise.findUnique({ where: { id }, select: { snapshot: true, extratoHash: true, agenciaId: true, periodoInicio: true, periodoFim: true } });
    if (!c) continue;
    const [json] = await q("SELECT snapshot FROM financeiro_analises WHERE id = $1", [id]);
    if (mesmoJson(jsonDoOriginal(json.snapshot), c.snapshot)) a.json++;
    const noConnect = await extratoDoConnect(empresaId, c.agenciaId, dia(c.periodoInicio), dia(c.periodoFim));
    const noOriginal = await extratoDoOriginal(q, empresaId, String(o.agencia_id), String(o.periodo_inicio), String(o.periodo_fim));
    const validaNoConnect = !!noConnect && identidadeDoExtrato(noConnect) === c.extratoHash;
    const validaNoOriginal = !!noOriginal && identidadeDoExtrato(noOriginal) === String(o.extrato_hash);
    if (validaNoConnect === validaNoOriginal) a.extrato++;
    if (validaNoConnect) a.validas++;
    if (o.deleted_at) continue;
    a.vivas++;
    const [{ n }] = await q("SELECT count(*)::int AS n FROM financeiro_vinculos WHERE analise_id = $1 AND deleted_at IS NULL", [id]);
    const aberta = await obterAnalise(tenantId, empresaId, id);
    if (aberta.ok && aberta.valor.extratoValido === validaNoOriginal && aberta.valor.vinculos.length === n) a.abertas++;
  }
  placar("análises: snapshot", a.json, analises.length);
  placar("análises: extrato_hash recalculado no Connect × no original", a.extrato, analises.length, `${a.validas} com o extrato da criação`);
  placar("análises vivas abertas por obterAnalise (extratoValido e vínculos)", a.abertas, a.vivas);

  const vinculosDoFinanceiro = await q("SELECT id, financeiro_ids, comparacao_ids FROM financeiro_vinculos WHERE empresa_id = $1", [empresaId]);
  let vf = 0;
  for (const o of vinculosDoFinanceiro) {
    const c = await prisma.coreFinanceiroVinculo.findUnique({ where: { id: String(o.id) }, select: { financeiroIds: true, comparacaoIds: true } });
    if (c && mesmoJson(jsonDoOriginal(o.financeiro_ids), c.financeiroIds) && mesmoJson(jsonDoOriginal(o.comparacao_ids), c.comparacaoIds)) vf++;
  }
  placar("vínculos do financeiro: financeiro_ids e comparacao_ids", vf, vinculosDoFinanceiro.length);

  // Originais: o arquivo em disco, e o baixado pelo serviço quando a análise e o documento vivem.
  const documentos = await q(
    "SELECT d.id, d.analise_id, d.hash_arquivo, d.deleted_at IS NULL AND a.deleted_at IS NULL AS vivo FROM financeiro_documentos d JOIN financeiro_analises a ON a.id = d.analise_id WHERE d.empresa_id = $1",
    [empresaId],
  );
  let emDisco = 0;
  let vivos = 0;
  let baixados = 0;
  for (const o of documentos) {
    const id = String(o.id);
    const hash = String(o.hash_arquivo);
    const c = await prisma.coreFinanceiroDocumento.findUnique({ where: { id }, select: { storageKey: true, hashArquivo: true } });
    const bytes = c ? await lerOriginal(tenantId, c.storageKey) : null;
    if (c && c.hashArquivo === hash && bytes && sha256Hex(bytes) === hash) emDisco++;
    if (!o.vivo) continue;
    vivos++;
    const baixado = await originalDoDocumento(tenantId, empresaId, String(o.analise_id), id);
    if (baixado.ok && sha256Hex(baixado.valor.bytes) === hash) baixados++;
  }
  placar("originais do financeiro em disco (SHA-256 = hash_arquivo)", emDisco, documentos.length);
  placar("originais baixados por originalDoDocumento", baixados, vivos);
}

// ─── Bloco C (C4): os documentos ────────────────────────────────────────────

/** Como cada coluna se compara: dinheiro com 2 casas, instante em UTC (milissegundos), JSON valor a valor. */
type Tipo = "texto" | "dinheiro" | "instante" | "inteiro" | "logico" | "json";
type Campo = [coluna: string, tipo: Tipo];
/** `snake_case` do original → `camelCase` do Prisma (`cnpj_emitente` → `cnpjEmitente`). */
const camelo = (c: string) => c.replace(/_([a-z0-9])/g, (_, x: string) => x.toUpperCase());
const QUANDO: Campo[] = [["created_at", "instante"], ["updated_at", "instante"], ["deleted_at", "instante"]];

const TABELAS_DO_BLOCO_C: { tabela: string; chave: keyof LinhasDoBlocoC; modelo: string; campos: Campo[]; extras?: string[] }[] = [
  {
    tabela: "notas_fiscais", chave: "notas", modelo: "coreNotaFiscal",
    campos: [
      ["empresa_id", "texto"], ["tipo", "texto"], ["numero", "texto"], ["serie", "texto"], ["cnpj_emitente", "texto"], ["nome_emitente", "texto"],
      ["cnpj_destinatario", "texto"], ["valor", "dinheiro"], ["data_emissao", "instante"], ["status", "texto"], ["transacao_id", "texto"],
      ["chave_acesso", "texto"], ["assinatura_motivo", "texto"], ["dedup_key", "texto"], ["observacao", "texto"], ["origem", "texto"], ...QUANDO,
    ],
  },
  {
    tabela: "comprovantes", chave: "comprovantes", modelo: "coreComprovante", extras: ["arquivo_sha256"],
    campos: [
      ["empresa_id", "texto"], ["agencia_id", "texto"], ["transacao_id", "texto"], ["favorecido", "texto"], ["cpf_cnpj", "texto"],
      ["data_pagamento", "instante"], ["data_vencimento", "instante"], ["valor_documento", "dinheiro"], ["valor_pago", "dinheiro"],
      ["juros", "dinheiro"], ["multa", "dinheiro"], ["desconto", "dinheiro"], ["observacao", "texto"], ["arquivo_nome", "texto"], ...QUANDO,
    ],
  },
  {
    tabela: "cartoes_credito", chave: "cartoes", modelo: "coreCartaoCredito",
    campos: [
      ["empresa_id", "texto"], ["nome", "texto"], ["bandeira", "texto"], ["ultimos_digitos", "texto"], ["dia_fechamento", "inteiro"],
      ["dia_vencimento", "inteiro"], ["limite", "dinheiro"], ["ativo", "logico"], ...QUANDO,
    ],
  },
  {
    tabela: "faturas_cartao", chave: "faturas", modelo: "coreFaturaCartao",
    campos: [
      ["empresa_id", "texto"], ["cartao_id", "texto"], ["competencia", "texto"], ["data_fechamento", "instante"], ["data_vencimento", "instante"],
      ["valor_total", "dinheiro"], ["status", "texto"], ["transacao_id", "texto"], ["observacao", "texto"], ...QUANDO,
    ],
  },
  {
    tabela: "lancamentos_cartao", chave: "lancamentos", modelo: "coreLancamentoCartao",
    campos: [
      ["empresa_id", "texto"], ["fatura_id", "texto"], ["data_compra", "instante"], ["descricao", "texto"], ["valor", "dinheiro"], ["conta_id", "texto"],
      ["parcela_atual", "inteiro"], ["parcela_total", "inteiro"], ...QUANDO,
    ],
  },
  {
    tabela: "fatura_documentos", chave: "documentos", modelo: "coreFaturaDocumento",
    campos: [["empresa_id", "texto"], ["fatura_id", "texto"], ["nome", "texto"], ["hash_arquivo", "texto"], ["status", "texto"], ["resultado", "json"], ["erro", "texto"], ...QUANDO],
  },
  {
    tabela: "fatura_distribuicoes", chave: "distribuicoes", modelo: "coreFaturaDistribuicao",
    campos: [["empresa_id", "texto"], ["fatura_id", "texto"], ["versao", "inteiro"], ["distribuicoes", "json"], ["aplicacao", "json"], ...QUANDO],
  },
];

const nuloOuJsonNulo = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "null");

function mesmoValor(tipo: Tipo, o: unknown, c: unknown): boolean {
  if (tipo === "json" && nuloOuJsonNulo(o)) return c === null || c === undefined;
  if (o === null || o === undefined || c === null || c === undefined) return (o ?? null) === (c ?? null);
  switch (tipo) {
    case "texto":
      return String(o) === String(c);
    case "dinheiro":
      return textoDec(reescala(dec(String(o)), -2)) === textoDec(reescala(dec(String(c)), -2));
    case "instante":
      return new Date(o as Date).toISOString() === new Date(c as Date).toISOString();
    case "inteiro":
      return Number(o) === Number(c);
    case "logico":
      return Boolean(o) === Boolean(c);
    case "json":
      return mesmoJson(jsonDoOriginal(o), c);
  }
}

type Delegado = { findMany(args: { where: object }): Promise<Record<string, unknown>[]> };
const delegado = (modelo: string) => (prisma as unknown as Record<string, Delegado>)[modelo];

/** Os ids esperados e os listados pelo serviço: iguais quando é o mesmo conjunto (o listado a mais também conta). */
function mesmoConjunto(esperados: Iterable<string>, listados: Iterable<string>): { iguais: number; total: number } {
  const e = new Set(esperados);
  const l = new Set(listados);
  const iguais = [...e].filter((id) => l.has(id)).length;
  return { iguais, total: e.size + [...l].filter((id) => !e.has(id)).length };
}

/** `obter` no ORIGINAL: a aplicação continua valendo (o hash da classificação de lá) ou está desatualizada. */
async function aplicacaoNoOriginal(q: Consulta, empresaId: string, transacaoId: string | null, aplicacao: unknown): Promise<"APLICADA" | "DESATUALIZADA" | null> {
  if (nuloOuJsonNulo(aplicacao)) return null;
  const guardada = jsonDoOriginal(aplicacao) as { hash?: string };
  const [t] = transacaoId
    ? await q("SELECT id, valor, data, dc, status, agencia_id, historico FROM transacoes WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL", [transacaoId, empresaId])
    : [];
  const partidas = transacaoId
    ? await q("SELECT id, conta_id, valor, historico, dc FROM registros_contabeis WHERE transacao_id = $1 AND empresa_id = $2 AND deleted_at IS NULL ORDER BY id", [transacaoId, empresaId])
    : [];
  const hash = hashDaClassificacao(
    partidas.map((p) => ({ id: String(p.id), contaId: String(p.conta_id), valor: reescala(dec(String(p.valor)), -2), historico: ouNulo(p.historico, String), dc: String(p.dc) })),
    t ? { id: String(t.id), valor: reescala(dec(String(t.valor)), -2), data: String(t.data), dc: String(t.dc), status: String(t.status), agenciaId: String(t.agencia_id), historico: String(t.historico) } : null,
  );
  return guardada.hash !== hash ? "DESATUALIZADA" : "APLICADA";
}

async function conferirDocumentos(q: Consulta, empresaId: string) {
  // As linhas do original, sem os arquivos, e as que a carga pula pelas travas do Connect.
  const lidas = {} as LinhasDoBlocoC;
  for (const t of TABELAS_DO_BLOCO_C) {
    const colunas = ["id", ...t.campos.map(([c]) => c), ...(t.extras ?? [])].filter((c, i, todas) => todas.indexOf(c) === i);
    lidas[t.chave] = await q(`SELECT ${colunas.join(", ")} FROM ${t.tabela} WHERE empresa_id = $1 ORDER BY created_at, id`, [empresaId]);
  }
  const puladas = puladasPelasTravas(lidas);
  const esperadas = (chave: keyof LinhasDoBlocoC) => lidas[chave].filter((l) => !puladas.has(String(l.id)));
  if (puladas.size) console.log(`  info   ${puladas.size} linha(s) do original puladas pelas travas do Connect (o motivo está no relatório da carga)`);

  // Contagens e campos, tabela por tabela.
  const noConnect = new Map<string, Map<string, Record<string, unknown>>>();
  for (const t of TABELAS_DO_BLOCO_C) {
    const linhas = await delegado(t.modelo).findMany({ where: { empresaId } });
    const porId = new Map(linhas.map((c) => [String(c.id), c]));
    noConnect.set(t.chave, porId);
    const origem = esperadas(t.chave);
    const n = lidas[t.chave].length - origem.length;
    confere(
      `${t.tabela}${n ? ` (${n} pulada(s))` : ""}`,
      { total: origem.length, vivas: origem.filter((l) => !l.deleted_at).length },
      { total: linhas.length, vivas: linhas.filter((c) => !c.deletedAt).length },
    );
    let iguais = 0;
    for (const o of origem) {
      const c = porId.get(String(o.id));
      if (c && t.campos.every(([coluna, tipo]) => mesmoValor(tipo, o[coluna], c[camelo(coluna)]))) iguais++;
    }
    placar(`${t.tabela}: campos valor a valor`, iguais, origem.length);
  }
  const doConnect = (chave: keyof LinhasDoBlocoC, id: unknown) => noConnect.get(chave)?.get(String(id));

  let procedencia = 0;
  for (const o of esperadas("notas")) {
    const c = doConnect("notas", o.id);
    if (c && c.dedupKey === o.dedup_key && c.origem === o.origem && c.chaveAcesso === (o.chave_acesso ?? null)) procedencia++;
  }
  placar("notas: dedup_key, chave de acesso e procedência", procedencia, esperadas("notas").length);

  // A transação ligada: a mesma nos dois lados (data, valor, D/C e desfeita ou não).
  let ligadas = 0;
  let mesmas = 0;
  for (const chave of ["notas", "comprovantes", "faturas"] as const) {
    for (const o of esperadas(chave)) {
      if (!o.transacao_id) continue;
      ligadas++;
      const c = doConnect(chave, o.id);
      const [t] = await q("SELECT data, valor, dc, deleted_at IS NOT NULL AS desfeita FROM transacoes WHERE id = $1", [o.transacao_id]);
      const tc = c?.transacaoId ? await prisma.coreTransacao.findUnique({ where: { id: String(c.transacaoId) }, select: { data: true, valor: true, dc: true, deletedAt: true } }) : null;
      if (t && tc && c?.transacaoId === o.transacao_id && dia(tc.data) === String(t.data) && mesmoValor("dinheiro", t.valor, tc.valor) && tc.dc === t.dc && (tc.deletedAt !== null) === t.desfeita) mesmas++;
    }
  }
  placar("ligações com o extrato (notas, comprovantes, faturas): a mesma transação", mesmas, ligadas);

  // Os arquivos: o comprovante (o base64 decodificado como o Python) e o PDF da fatura, em disco.
  let comprovantesIguais = 0;
  for (const o of esperadas("comprovantes")) {
    const c = doConnect("comprovantes", o.id);
    if (!c) continue;
    const [linha] = await q("SELECT arquivo_base64 FROM comprovantes WHERE id = $1", [o.id]);
    const a = arquivoNoOriginal({ ...o, arquivo_base64: linha?.arquivo_base64 });
    if (a.tipo === "arquivo") {
      const bytes = c.storageKey ? await lerArquivoDoComprovante(tenantId, String(c.storageKey)) : null;
      if (bytes && sha256Hex(bytes) === a.sha256 && c.arquivoSha256 === a.sha256 && c.arquivoTamanho === a.bytes.length) comprovantesIguais++;
    } else if (a.tipo !== "recusa" && c.storageKey === null && c.arquivoSha256 === (o.arquivo_sha256 ?? null)) comprovantesIguais++;
  }
  placar("comprovantes: arquivo em disco com o SHA-256 e o tamanho dos bytes do original", comprovantesIguais, esperadas("comprovantes").length);

  let pdfsIguais = 0;
  for (const o of esperadas("documentos")) {
    const c = doConnect("documentos", o.id);
    const [bytes] = await q("SELECT encode(sha256(conteudo), 'hex') AS sha, octet_length(conteudo) AS tamanho FROM fatura_documentos WHERE id = $1", [o.id]);
    const noDisco = c?.storageKey ? await lerPdfDaFatura(tenantId, String(c.storageKey)) : null;
    if (c && noDisco && sha256Hex(noDisco) === bytes.sha && bytes.sha === o.hash_arquivo && c.tamanho === Number(bytes.tamanho)) pdfsIguais++;
  }
  placar("documentos da fatura: PDF em disco com o SHA-256 e o tamanho do conteudo do original", pdfsIguais, esperadas("documentos").length);

  // As decisões do NEO que mediram a contraparte pela nota ou pelo comprovante (a sombra da regra).
  const decisoes = await q("SELECT id, transacao_id, regra_id, conta_id, contraparte_id, conta_contraparte_id, origem_evidencia, conta_divergente FROM neo_decisoes WHERE empresa_id = $1 AND origem_evidencia IN ('nota_fiscal', 'comprovante')", [empresaId]);
  let decisoesIguais = 0;
  for (const o of decisoes) {
    const c = await prisma.coreNeoDecisao.findUnique({ where: { id: String(o.id) } });
    if (c && c.origemEvidencia === o.origem_evidencia && c.transacaoId === o.transacao_id && c.regraId === (o.regra_id ?? null) && c.contaId === (o.conta_id ?? null) &&
      c.contraparteId === (o.contraparte_id ?? null) && c.contaContraparteId === (o.conta_contraparte_id ?? null) && c.contaDivergente === (o.conta_divergente ?? null)) decisoesIguais++;
  }
  const decisoesNoConnect = await prisma.coreNeoDecisao.count({ where: { empresaId, origemEvidencia: { in: ["nota_fiscal", "comprovante"] } } });
  placar("decisões do NEO com evidência de nota ou comprovante", decisoesIguais, Math.max(decisoes.length, decisoesNoConnect), `${decisoes.length} no original`);

  // Os serviços do Connect abrindo o que veio.
  const vivas = (chave: keyof LinhasDoBlocoC) => esperadas(chave).filter((l) => !l.deleted_at);
  const listadas: string[] = [];
  for (let pagina = 1; ; pagina++) {
    const r = await listarNotas(tenantId, empresaId, {}, pagina, 200);
    if (!r.ok) break;
    listadas.push(...r.valor.itens.map((n) => n.id));
    if (pagina * 200 >= r.valor.total) break;
  }
  const n = mesmoConjunto(vivas("notas").map((l) => String(l.id)), listadas);
  placar("notas vivas listadas por listarNotas", n.iguais, n.total);

  const listados: string[] = [];
  for (let pagina = 1; ; pagina++) {
    const r = await listarComprovantes(tenantId, empresaId, {}, pagina, 200);
    if (!r.ok) break;
    listados.push(...r.valor.itens.map((c) => c.id));
    if (pagina * 200 >= r.valor.total) break;
  }
  const cp = mesmoConjunto(vivas("comprovantes").map((l) => String(l.id)), listados);
  placar("comprovantes vivos listados por listarComprovantes", cp.iguais, cp.total);
  let baixados = 0;
  let comArquivo = 0;
  for (const o of vivas("comprovantes")) {
    const c = doConnect("comprovantes", o.id);
    if (!c?.storageKey) continue;
    comArquivo++;
    const r = await arquivoDoComprovante(tenantId, empresaId, String(o.id));
    if (r.ok && sha256Hex(r.valor.bytes) === c.arquivoSha256) baixados++;
  }
  placar("arquivos baixados por arquivoDoComprovante", baixados, comArquivo);

  const cartoes = await listarCartoes(tenantId, empresaId);
  const ca = mesmoConjunto(vivas("cartoes").map((l) => String(l.id)), cartoes.ok ? cartoes.valor.map((c) => c.id) : []);
  placar("cartões vivos listados por listarCartoes", ca.iguais, ca.total);
  const s = { faturas: [0, 0], gastos: [0, 0], distribuicoes: [0, 0], pdfs: [0, 0], aplicadas: 0 };
  for (const cartao of cartoes.ok ? cartoes.valor : []) {
    const faturas = await listarFaturas(tenantId, empresaId, cartao.id);
    const esperadasDoCartao = vivas("faturas").filter((f) => f.cartao_id === cartao.id);
    const f = mesmoConjunto(esperadasDoCartao.map((l) => String(l.id)), faturas.ok ? faturas.valor.map((x) => x.id) : []);
    s.faturas[0] += f.iguais;
    s.faturas[1] += f.total;
    for (const fatura of faturas.ok ? faturas.valor : []) {
      const c = { tenantId, empresaId, cartaoId: cartao.id, faturaId: fatura.id, userId: null };
      const gastos = await listarLancamentos(tenantId, empresaId, cartao.id, fatura.id);
      const vivosDaFatura = vivas("lancamentos").filter((l) => l.fatura_id === fatura.id);
      const soma = vivosDaFatura.reduce((t, l) => t + Math.round(Number(l.valor) * 100), 0);
      const g = mesmoConjunto(vivosDaFatura.map((l) => String(l.id)), gastos.ok ? gastos.valor.itens.map((x) => x.id) : []);
      s.gastos[0] += g.iguais === g.total && gastos.ok && Math.round(Number(gastos.valor.valorTotal) * 100) === soma ? 1 : 0;
      s.gastos[1]++;
      const [d] = await q("SELECT aplicacao FROM fatura_distribuicoes WHERE fatura_id = $1", [fatura.id]);
      const original = await aplicacaoNoOriginal(q, empresaId, (lidas.faturas.find((l) => l.id === fatura.id)?.transacao_id as string | null) ?? null, d?.aplicacao ?? null);
      const vista = await obterDistribuicao(c);
      const documentosDaFatura = esperadas("documentos").filter((l) => l.fatura_id === fatura.id);
      const dd = mesmoConjunto(documentosDaFatura.map((l) => String(l.id)), vista.ok ? vista.valor.documentos.map((x) => x.id) : []);
      s.distribuicoes[0] += vista.ok && vista.valor.aplicacao === original && dd.iguais === dd.total ? 1 : 0;
      s.distribuicoes[1]++;
      if (vista.ok && vista.valor.aplicacao === "APLICADA") s.aplicadas++;
      for (const doc of documentosDaFatura) {
        s.pdfs[1]++;
        const r = await arquivoDoDocumento(c, String(doc.id));
        if (r.ok && sha256Hex(r.valor) === doc.hash_arquivo) s.pdfs[0]++;
      }
    }
  }
  placar("faturas vivas listadas por listarFaturas", s.faturas[0], s.faturas[1]);
  placar("faturas com os gastos vivos de listarLancamentos (ids e total)", s.gastos[0], s.gastos[1]);
  placar("faturas abertas por obterDistribuicao (aplicação igual à do original e documentos)", s.distribuicoes[0], s.distribuicoes[1], `${s.aplicadas} com a aplicação valendo`);
  placar("PDFs baixados por arquivoDoDocumento", s.pdfs[0], s.pdfs[1]);
}

async function main() {
  const origem = new pg.Client({ connectionString: origemUrl, ssl: process.env.CARGA_ORIGEM_SSL === "1" ? { rejectUnauthorized: true } : undefined });
  await origem.connect();
  await origem.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const q = async (sql: string, args: unknown[]) => (await origem.query(sql, args)).rows as Record<string, unknown>[];
  try {
    const empresas = await prisma.coreEmpresa.findMany({ where: { tenantId }, select: { id: true, cnpj: true } });
    for (const e of empresas) {
      const [existe] = await q("SELECT id FROM empresas WHERE id = $1", [e.id]);
      if (!existe) continue; // empresa criada no Connect, sem par no original
      console.log(`empresa ${mascara(e.cnpj)}`);

      const tabelas: [string, string, (where: object) => Promise<number>][] = [
        ["plano_contas", "deleted_at", (w) => prisma.corePlanoConta.count({ where: { empresaId: e.id, ...w } })],
        ["plano_contas_faixas_tipo", "deleted_at", (w) => prisma.corePlanoFaixa.count({ where: { empresaId: e.id, ...w } })],
        ["agencias_bancarias", "deleted_at", (w) => prisma.coreAgencia.count({ where: { empresaId: e.id, ...w } })],
        ["contrapartes", "deleted_at", (w) => prisma.coreContraparte.count({ where: { empresaId: e.id, ...w } })],
        ["regras", "deleted_at", (w) => prisma.coreRegra.count({ where: { empresaId: e.id, ...w } })],
        ["extrato_importacoes", "deleted_at", (w) => prisma.coreImportacao.count({ where: { empresaId: e.id, ...w } })],
        ["transacoes", "deleted_at", (w) => prisma.coreTransacao.count({ where: { empresaId: e.id, ...w } })],
        ["registros_contabeis", "deleted_at", (w) => prisma.coreRegistro.count({ where: { empresaId: e.id, ...w } })],
        ["neo_decisoes", "", () => prisma.coreNeoDecisao.count({ where: { empresaId: e.id } })],
        ["export_jobs", "", () => prisma.coreExportacao.count({ where: { empresaId: e.id } })],
        ["conciliacao_revisoes", "deleted_at", (w) => prisma.coreConciliacaoRevisao.count({ where: { empresaId: e.id, ...w } })],
        ["conciliacao_vinculos", "deleted_at", (w) => prisma.coreConciliacaoVinculo.count({ where: { empresaId: e.id, ...w } })],
        ["financeiro_analises", "deleted_at", (w) => prisma.coreFinanceiroAnalise.count({ where: { empresaId: e.id, ...w } })],
        ["financeiro_documentos", "deleted_at", (w) => prisma.coreFinanceiroDocumento.count({ where: { empresaId: e.id, ...w } })],
        ["financeiro_vinculos", "deleted_at", (w) => prisma.coreFinanceiroVinculo.count({ where: { empresaId: e.id, ...w } })],
      ];
      for (const [tabela, vida, contar] of tabelas) {
        const [o] = await q(
          vida ? `SELECT count(*)::int AS total, count(*) FILTER (WHERE ${vida} IS NULL)::int AS vivas FROM ${tabela} WHERE empresa_id = $1` : `SELECT count(*)::int AS total FROM ${tabela} WHERE empresa_id = $1`,
          [e.id],
        );
        const c = vida ? { total: await contar({}), vivas: await contar({ deletedAt: null }) } : { total: await contar({}) };
        confere(tabela, o, c);
      }

      // Somas por mês, em centavos (texto, para não passar por ponto flutuante).
      const somaTransacoesOrigem = await q(
        "SELECT to_char(data, 'YYYY-MM') AS mes, dc, sum(valor)::text AS total, count(*)::int AS n FROM transacoes WHERE empresa_id = $1 AND deleted_at IS NULL GROUP BY 1, 2 ORDER BY 1, 2",
        [e.id],
      );
      const somaTransacoesConnect = await prisma.$queryRaw<{ mes: string; dc: string; total: string; n: bigint }[]>`
        SELECT DATE_FORMAT(data, '%Y-%m') AS mes, dc, CAST(SUM(valor) AS CHAR) AS total, COUNT(*) AS n
        FROM core_transacoes WHERE empresaId = ${e.id} AND deletedAt IS NULL GROUP BY 1, 2 ORDER BY 1, 2`;
      confere("transações por mês e lado", porMesELado(somaTransacoesOrigem as { mes: string; dc: string }[]), porMesELado(somaTransacoesConnect.map((r) => ({ ...r, n: Number(r.n) }))));

      const somaRegistrosOrigem = await q(
        "SELECT to_char(data_lancamento AT TIME ZONE 'UTC', 'YYYY-MM') AS mes, dc, sum(valor)::text AS total, count(*)::int AS n FROM registros_contabeis WHERE empresa_id = $1 AND deleted_at IS NULL AND cancelado_em IS NULL GROUP BY 1, 2 ORDER BY 1, 2",
        [e.id],
      );
      const somaRegistrosConnect = await prisma.$queryRaw<{ mes: string; dc: string; total: string; n: bigint }[]>`
        SELECT DATE_FORMAT(dataLancamento, '%Y-%m') AS mes, dc, CAST(SUM(valor) AS CHAR) AS total, COUNT(*) AS n
        FROM core_registros WHERE empresaId = ${e.id} AND deletedAt IS NULL AND canceladoEm IS NULL GROUP BY 1, 2 ORDER BY 1, 2`;
      confere("partidas vigentes por mês e lado", porMesELado(somaRegistrosOrigem as { mes: string; dc: string }[]), porMesELado(somaRegistrosConnect.map((r) => ({ ...r, n: Number(r.n) }))));

      await conferirConciliacao(q, e.id);
      await conferirDocumentos(q, e.id);

      if (pastaDominio) {
        for (const nome of readdirSync(pastaDominio).filter((n) => n.endsWith(".txt"))) {
          const m = /^(.+)_(\d{4}-\d{2})\.txt$/.exec(nome);
          if (!m || digitos(m[1]) !== digitos(e.cnpj)) continue;
          const esperado = readFileSync(join(pastaDominio, nome));
          const gerado = await gerarArquivoDoDominio(tenantId, null, e.id, { mes: m[2], agenciaId: null, formato: "txt", usarHistoricoExtrato: false, incluirContasInativas: false }, { registrar: false });
          const obtido = gerado.ok ? Buffer.from(gerado.valor.conteudo, "utf8") : Buffer.from(`erro: ${gerado.erro}`);
          const igual = Buffer.compare(esperado, obtido) === 0;
          if (!igual) diferencas++;
          console.log(`  ${igual ? "ok   " : "DIFERE"} Domínio ${m[2]}: ${esperado.length} bytes no original, ${obtido.length} no Connect`);
        }
      }
    }
    await origem.query("COMMIT");
  } finally {
    await origem.end();
  }
  console.log(diferencas ? `\n${diferencas} diferença(s).` : "\ntudo igual ao original");
  process.exitCode = diferencas ? 1 : 0;
}

main().finally(() => prisma.$disconnect());
