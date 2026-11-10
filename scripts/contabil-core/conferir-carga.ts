// Conferência da carga do Contábil Core (Fase 5, 10/11/2026). Só lê, dos dois lados.
//
// Para cada empresa que a carga trouxe (mesmo UUID nos dois bancos):
// - contagem por tabela (vivas e apagadas);
// - soma dos valores por mês: transações vivas e partidas vivas e não canceladas, por lado (D/C);
// - com `--dominio=<pasta>`, o TXT do Domínio que o Connect gera para cada arquivo da pasta, comparado
//   byte a byte. Os arquivos da pasta são os baixados do Contábil Core (Exportar › Lançamentos para
//   importação, TXT), nomeados `<CNPJ>_<AAAA-MM>.txt` (o CNPJ com ou sem máscara).
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
import { digitos } from "../../src/lib/contabil-core/carga/mapear";

pg.types.setTypeParser(1082, (v) => v);
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
