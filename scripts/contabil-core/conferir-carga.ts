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
// Variáveis: CARGA_ORIGEM_URL, CARGA_ORIGEM_SSL, CARGA_TENANT_ID e DATABASE_URL, como na carga.
//   npx tsx --require ./scripts/contabil-core/sem-server-only.cjs scripts/contabil-core/conferir-carga.ts [--dominio=<pasta>]
//
// O terminal mostra só contagens e o CNPJ mascarado.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { getPrisma } from "../../src/lib/prisma";
import { gerarArquivoDoDominio } from "../../src/lib/contabil-core/servidor/exportacao";
import { digitos, jsonDoOriginal, mesmoJson, sha256Hex } from "../../src/lib/contabil-core/carga/mapear";
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
