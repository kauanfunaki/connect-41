// Carga do Contábil Core para o Connect (Fase 5, 10/11/2026). Cópia de mão única, que pode ser
// repetida: cada linha entra com o UUID do original (upsert), então rodar de novo atualiza o
// espelho sem duplicar nada. Plano em docs/CONTABIL-CORE.md, seção "Carga dos dados".
//
// Lê o PostgreSQL do original numa transação SOMENTE LEITURA (um retrato consistente) e grava no
// banco do Connect pelo Prisma. Sem `--gravar`, só simula: diz o que entraria e o que falta ligar.
//
// Variáveis de ambiente (nunca por argumento, para não ficar no histórico do terminal):
//   CARGA_ORIGEM_URL      postgres://usuario_somente_leitura:...@host:porta/banco
//   CARGA_ORIGEM_SSL      "1" para exigir TLS na conexão com o original
//   CARGA_TENANT_ID       o escritório do Connect que recebe os dados
//   CARGA_TENANT_ORIGEM   o tenant do original (obrigatório só se houver mais de um)
//   DATABASE_URL          o banco do Connect (o mesmo do app)
//
// Uso:
//   npx tsx --require ./scripts/contabil-core/sem-server-only.cjs scripts/contabil-core/carga.ts [--gravar] [--relatorio=<arquivo.json>]
//
// O terminal mostra só contagens; o que identifica empresa ou pessoa (CNPJ, nome, e-mail) vai para
// o relatório, um arquivo local (por padrão na pasta temporária), que não deve ir para o git.

import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { getPrisma } from "../../src/lib/prisma";
import * as mapear from "../../src/lib/contabil-core/carga/mapear";

const gravar = process.argv.includes("--gravar");
const relatorioArg = process.argv.find((a) => a.startsWith("--relatorio="))?.slice("--relatorio=".length);
const caminhoDoRelatorio = relatorioArg || join(tmpdir(), `carga-contabil-core-${Date.now()}.json`);

const origemUrl = process.env.CARGA_ORIGEM_URL;
const tenantDoAmbiente = process.env.CARGA_TENANT_ID;
if (!origemUrl) throw new Error("Defina CARGA_ORIGEM_URL (somente leitura).");
if (!tenantDoAmbiente) throw new Error("Defina CARGA_TENANT_ID (o escritório do Connect que recebe os dados).");
const tenantId: string = tenantDoAmbiente;

// `date` do PostgreSQL como texto: convertido para instante pelo `pg`, o fuso local mudaria o dia.
pg.types.setTypeParser(1082, (v) => v);

const prisma = getPrisma();
type Modelo = { upsert(args: { where: { id: string }; create: object; update: object }): Promise<unknown> };

const relatorio: {
  modo: string;
  empresasSemPar: { idOriginal: string; cnpj: string; razaoSocial: string }[];
  empresasJaLigadas: { idOriginal: string; cnpj: string; idNoConnect: string }[];
  pessoasSemPar: { idOriginal: string; email: string }[];
  porEmpresa: Record<string, Record<string, { lidas: number; gravadas: number; recusadas: { id: string; erro: string }[] }>>;
} = { modo: gravar ? "gravar" : "simular", empresasSemPar: [], empresasJaLigadas: [], pessoasSemPar: [], porEmpresa: {} };

/** CNPJ mascarado para o terminal: o completo fica só no relatório. */
const mascara = (cnpj: string) => {
  const d = mapear.digitos(cnpj);
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.***/****-**` : "***";
};

async function upsertMuitos(modelo: Modelo, linhas: { id: string }[], conta: { gravadas: number; recusadas: { id: string; erro: string }[] }, semAtualizar: string[] = []) {
  if (!gravar) return;
  const args = (l: { id: string }) => {
    const update: Record<string, unknown> = { ...l };
    delete update.id;
    for (const c of semAtualizar) delete update[c];
    return { where: { id: l.id }, create: l, update };
  };
  for (let i = 0; i < linhas.length; i += 200) {
    const lote = linhas.slice(i, i + 200);
    try {
      await prisma.$transaction(lote.map((l) => modelo.upsert(args(l)) as never));
      conta.gravadas += lote.length;
    } catch {
      // Um lote recusado é refeito linha a linha, para nomear só a que bateu (unicidade, chave estrangeira).
      for (const l of lote) {
        try {
          await modelo.upsert(args(l));
          conta.gravadas++;
        } catch (e) {
          conta.recusadas.push({ id: l.id, erro: (e as { code?: string; message?: string }).code ?? String((e as Error).message).slice(0, 200) });
        }
      }
    }
  }
}

async function main() {
  const origem = new pg.Client({ connectionString: origemUrl, ssl: process.env.CARGA_ORIGEM_SSL === "1" ? { rejectUnauthorized: true } : undefined });
  await origem.connect();
  try {
    // Um retrato só: todas as leituras enxergam o mesmo instante do original.
    await origem.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const q = async (sql: string, args: unknown[] = []) => (await origem.query(sql, args)).rows as mapear.Linha[];

    const tenants = await q("SELECT id FROM tenants WHERE deleted_at IS NULL");
    const tenantOrigem = process.env.CARGA_TENANT_ORIGEM ?? (tenants.length === 1 ? String(tenants[0].id) : null);
    if (!tenantOrigem) throw new Error(`O original tem ${tenants.length} tenants: defina CARGA_TENANT_ORIGEM.`);
    if (!(await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } }))) throw new Error("CARGA_TENANT_ID não é um escritório do Connect.");

    // Pessoas: pelo e-mail, no escritório de destino.
    const usuarios = await q("SELECT id, email FROM usuarios WHERE tenant_id = $1", [tenantOrigem]);
    const doConnect = await prisma.user.findMany({ where: { tenantId }, select: { id: true, email: true } });
    const porEmail = new Map(doConnect.map((u) => [u.email.trim().toLowerCase(), u.id]));
    const pessoas = new Map<string, string | null>();
    for (const u of usuarios) {
      const id = porEmail.get(String(u.email).trim().toLowerCase()) ?? null;
      pessoas.set(String(u.id), id);
      if (!id) relatorio.pessoasSemPar.push({ idOriginal: String(u.id), email: String(u.email) });
    }

    // Empresas: pelo CNPJ, nas empresas do escritório de destino.
    const companies = await prisma.company.findMany({ where: { tenantId, cnpj: { not: null } }, select: { id: true, cnpj: true } });
    const porCnpj = new Map<string, string[]>();
    for (const c of companies) porCnpj.set(mapear.digitos(c.cnpj), [...(porCnpj.get(mapear.digitos(c.cnpj)) ?? []), c.id]);
    const empresas = await q("SELECT * FROM empresas WHERE tenant_id = $1 ORDER BY created_at", [tenantOrigem]);

    for (const e of empresas) {
      const idOriginal = String(e.id);
      const cnpj = String(e.cnpj);
      const pares = porCnpj.get(mapear.digitos(cnpj)) ?? [];
      if (pares.length !== 1) {
        relatorio.empresasSemPar.push({ idOriginal, cnpj, razaoSocial: String(e.razao_social) });
        console.log(`empresa ${mascara(cnpj)}: ${pares.length ? "mais de uma empresa no Connect com este CNPJ" : "sem par no Connect"} (fica de fora)`);
        continue;
      }
      // Já ligada no Connect com outro cadastro: não sobrescreve o que alguém criou lá.
      const ligada = await prisma.coreEmpresa.findFirst({ where: { OR: [{ companyId: pares[0] }, { tenantId, cnpj }] }, select: { id: true } });
      if (ligada && ligada.id !== idOriginal) {
        relatorio.empresasJaLigadas.push({ idOriginal, cnpj, idNoConnect: ligada.id });
        console.log(`empresa ${mascara(cnpj)}: já está no Contábil Core do Connect com outro cadastro (fica de fora)`);
        continue;
      }

      const contagem: (typeof relatorio.porEmpresa)[string] = {};
      relatorio.porEmpresa[idOriginal] = contagem;
      const etapa = async (nome: string, modelo: Modelo, linhas: { id: string }[], semAtualizar: string[] = []) => {
        contagem[nome] = { lidas: linhas.length, gravadas: 0, recusadas: [] };
        await upsertMuitos(modelo, linhas, contagem[nome], semAtualizar);
      };
      const daEmpresa = (tabela: string, ordem = "created_at, id") => q(`SELECT * FROM ${tabela} WHERE empresa_id = $1 ORDER BY ${ordem}`, [idOriginal]);

      await etapa("empresa", prisma.coreEmpresa as unknown as Modelo, [mapear.empresa(e, tenantId, pares[0])]);
      const contas = await daEmpresa("plano_contas");
      // Primeiro todas as contas sem o pai; depois o pai, quando todas já existem.
      await etapa("plano_contas", prisma.corePlanoConta as unknown as Modelo, contas.map((l) => mapear.conta(l, tenantId)), ["paiId"]);
      if (gravar) {
        for (const l of contas) {
          await prisma.corePlanoConta.update({ where: { id: String(l.id) }, data: { paiId: l.pai_id ? String(l.pai_id) : null } }).catch(() => undefined);
        }
      }
      await etapa("faixas", prisma.corePlanoFaixa as unknown as Modelo, (await daEmpresa("plano_contas_faixas_tipo")).map((l) => mapear.faixa(l, tenantId)));
      await etapa("agencias", prisma.coreAgencia as unknown as Modelo, (await daEmpresa("agencias_bancarias")).map((l) => mapear.agencia(l, tenantId)));
      await etapa("contrapartes", prisma.coreContraparte as unknown as Modelo, (await daEmpresa("contrapartes")).map((l) => mapear.contraparte(l, tenantId, pessoas)));
      await etapa("regras", prisma.coreRegra as unknown as Modelo, (await daEmpresa("regras")).map((l) => mapear.regra(l, tenantId)));
      await etapa("importacoes", prisma.coreImportacao as unknown as Modelo, (await daEmpresa("extrato_importacoes")).map((l) => mapear.importacao(l, tenantId, pessoas)));
      await etapa("transacoes", prisma.coreTransacao as unknown as Modelo, (await daEmpresa("transacoes", "data, ordem NULLS LAST, id")).map((l) => mapear.transacao(l, tenantId, pessoas)));
      await etapa("decisoes", prisma.coreNeoDecisao as unknown as Modelo, (await daEmpresa("neo_decisoes", "processado_em, id")).map((l) => mapear.decisao(l, tenantId)));
      await etapa("registros", prisma.coreRegistro as unknown as Modelo, (await daEmpresa("registros_contabeis")).map((l) => mapear.registro(l, tenantId, pessoas)));
      await etapa("exportacoes", prisma.coreExportacao as unknown as Modelo, (await daEmpresa("export_jobs")).map((l) => mapear.exportacao(l, tenantId, pessoas)));

      const resumo = Object.entries(contagem)
        .map(([t, c]) => `${t} ${gravar ? `${c.gravadas}/${c.lidas}` : c.lidas}${c.recusadas.length ? ` (${c.recusadas.length} recusadas)` : ""}`)
        .join(", ");
      console.log(`empresa ${mascara(cnpj)}: ${resumo}`);
    }
    await origem.query("COMMIT");
  } finally {
    await origem.end();
  }

  writeFileSync(caminhoDoRelatorio, JSON.stringify(relatorio, null, 1), "utf8");
  const recusadas = Object.values(relatorio.porEmpresa).flatMap((t) => Object.values(t)).reduce((s, c) => s + c.recusadas.length, 0);
  console.log(
    `\n${gravar ? "Carga gravada" : "Simulação (nada gravado; use --gravar)"}: ${Object.keys(relatorio.porEmpresa).length} empresa(s), ` +
      `${relatorio.empresasSemPar.length} sem par, ${relatorio.empresasJaLigadas.length} já ligada(s) com outro cadastro, ` +
      `${relatorio.pessoasSemPar.length} pessoa(s) sem par, ${recusadas} linha(s) recusada(s).\nRelatório: ${caminhoDoRelatorio}`,
  );
  process.exitCode = recusadas ? 1 : 0;
}

main().finally(() => prisma.$disconnect());
