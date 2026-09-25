// Move para o plano da Irriga as categorias que o import do DRE criou no plano
// padrão do escritório.
//
//   npx tsx --env-file=.env scripts/mover-categorias-irriga.ts            # dry-run
//   npx tsx --env-file=.env scripts/mover-categorias-irriga.ts --aplicar
//   ... --empresa=<companyId>   # se o nome "Irriga" achar mais de uma empresa
//
// Contexto (25/09/2026): em 23/09 o import do Omie no `/dre` passou a criar as
// categorias que o arquivo trazia e o plano não tinha (`categoriasDoImport.ts`).
// Naquele dia ainda não existia plano por empresa, então as 82 categorias da
// Irriga nasceram no padrão do escritório — e hoje aparecem no seletor de todo
// cliente. Desde o PR #23 o import cria no plano da própria empresa; este
// script corrige o que entrou antes.
//
// ── Quem é candidata ────────────────────────────────────────────────────────
//
// Categoria do padrão (`companyId` nulo), criada a partir de 23/09 — antes
// disso o import não criava nada, então categoria mais antiga foi posta por
// alguém e é padrão de propósito — e cujo nome aparece num import de DRE da
// Irriga.
//
// ── O que fica no padrão, mesmo sendo candidata ─────────────────────────────
//
// - O nome está no plano padrão da 41 (`PLANO_PADRAO_41`): é categoria do
//   escritório que a Irriga só usou primeiro.
// - Outra empresa já usa: lançamento, fornecedor com ela de padrão, de-para
//   da DRE, ou import de DRE com o mesmo nome. Mover tiraria a categoria do
//   plano da outra empresa, e o DRE dela perderia a classificação.
// - A Irriga já tem categoria própria com o mesmo nome e lado (o Omie dela pode
//   ter trazido). Juntar as duas é decisão de gente — o script só avisa.
//
// ── O que muda na movida ────────────────────────────────────────────────────
//
// `companyId` e `scope` passam a ser os da Irriga. Lançamentos, de-para e
// grupo da DRE seguem apontando para o mesmo id, então nada se perde.
// `FinanceCategoryHidden` da categoria sai: esconder vale só para o padrão, e
// categoria da própria empresa se desativa nela mesma — se era a Irriga que
// a tinha escondido, a categoria passa a `active = false`.

import { getPrisma } from "../src/lib/prisma";
import { chaveDaCategoria } from "../src/lib/dre/calculo";
import { PLANO_PADRAO_41 } from "../src/lib/financeiro/planoPadrao";

const aplicar = process.argv.includes("--aplicar");
const empresaArg = process.argv.find((a) => a.startsWith("--empresa="))?.split("=")[1];

/** 23/09/2026 00:00 em São Paulo. */
const DESDE = new Date("2026-09-23T03:00:00Z");

async function main() {
  const prisma = getPrisma();

  const empresas = await prisma.company.findMany({
    where: empresaArg ? { id: empresaArg } : { OR: [{ name: { contains: "irriga" } }, { displayName: { contains: "irriga" } }] },
    select: { id: true, tenantId: true, name: true, displayName: true, cnpj: true },
  });
  if (empresas.length !== 1) {
    console.log(`Esperava 1 empresa, achei ${empresas.length}:`);
    for (const e of empresas) console.log(`  ${e.id}  ${e.cnpj ?? ""}  ${e.displayName ?? e.name}`);
    console.log("Rode de novo com --empresa=<id>.");
    process.exit(1);
  }
  const irriga = empresas[0];
  const tenantId = irriga.tenantId;
  console.log(`Empresa: ${irriga.displayName ?? irriga.name} (${irriga.id})\n`);

  // Nomes que a Irriga trouxe nos imports de DRE, e os das outras empresas.
  const linhas = await prisma.dreImportLine.findMany({
    where: { dreImport: { tenantId }, categoria: { not: null } },
    select: { categoria: true, dreImport: { select: { companyId: true, company: { select: { name: true } } } } },
    distinct: ["importId", "categoria"],
  });
  const nomesDaIrriga = new Set<string>();
  const outrasPorNome = new Map<string, Set<string>>();
  for (const l of linhas) {
    const k = chaveDaCategoria(l.categoria!);
    if (l.dreImport.companyId === irriga.id) nomesDaIrriga.add(k);
    else {
      if (!outrasPorNome.has(k)) outrasPorNome.set(k, new Set());
      outrasPorNome.get(k)!.add(l.dreImport.company.name);
    }
  }

  const doPadrao41 = new Set(PLANO_PADRAO_41.map((p) => `${p.kind}|${chaveDaCategoria(p.nome)}`));

  const categoriasDoPadrao = await prisma.financeCategory.findMany({
    where: { tenantId, companyId: null, createdAt: { gte: DESDE } },
    select: {
      id: true,
      name: true,
      kind: true,
      createdAt: true,
      entries: { select: { companyId: true }, distinct: ["companyId"] },
      padraoDe: { select: { companyId: true } },
      dreMappings: { select: { companyId: true } },
      ocultaEm: { select: { id: true, companyId: true } },
    },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
  const candidatas = categoriasDoPadrao.filter((c) => nomesDaIrriga.has(chaveDaCategoria(c.name)));

  const proprias = await prisma.financeCategory.findMany({
    where: { tenantId, companyId: irriga.id },
    select: { name: true, kind: true },
  });
  const chavesProprias = new Set(proprias.map((p) => `${p.kind}|${chaveDaCategoria(p.name)}`));

  const mover: typeof candidatas = [];
  const ficam: { nome: string; kind: string; motivo: string }[] = [];

  for (const c of candidatas) {
    const chave = `${c.kind}|${chaveDaCategoria(c.name)}`;
    const outras = new Set<string>();
    for (const e of c.entries) if (e.companyId !== irriga.id) outras.add(`lançamento (${e.companyId.slice(0, 8)})`);
    for (const f of c.padraoDe) if (f.companyId !== irriga.id) outras.add(`fornecedor (${f.companyId.slice(0, 8)})`);
    for (const m of c.dreMappings) if (m.companyId !== irriga.id) outras.add(`de-para DRE (${m.companyId.slice(0, 8)})`);
    for (const n of outrasPorNome.get(chaveDaCategoria(c.name)) ?? []) outras.add(`import DRE de ${n}`);

    if (doPadrao41.has(chave)) ficam.push({ nome: c.name, kind: c.kind, motivo: "está no plano padrão da 41" });
    else if (outras.size) ficam.push({ nome: c.name, kind: c.kind, motivo: `outra empresa usa: ${[...outras].join(", ")}` });
    else if (chavesProprias.has(chave)) ficam.push({ nome: c.name, kind: c.kind, motivo: "a Irriga já tem uma própria com o mesmo nome — juntar à mão" });
    else mover.push(c);
  }

  console.log(`Categorias do padrão criadas desde 23/09: ${categoriasDoPadrao.length}`);
  console.log(`  com nome dos imports da Irriga:          ${candidatas.length}`);
  console.log(`  vão para o plano da Irriga:              ${mover.length}`);
  console.log(`  ficam no padrão:                         ${ficam.length}\n`);

  const soltas = categoriasDoPadrao.filter((c) => !nomesDaIrriga.has(chaveDaCategoria(c.name)));
  if (soltas.length) {
    console.log("Criadas desde 23/09 no padrão, mas sem nome da Irriga (não mexo):");
    for (const c of soltas) console.log(`  ${c.kind.padEnd(8)} ${c.name}`);
    console.log();
  }

  console.log("Vão para a Irriga:");
  for (const c of mover) {
    const oculta = c.ocultaEm.some((o) => o.companyId === irriga.id) ? "  (estava escondida pela Irriga → inativa)" : "";
    console.log(`  ${c.kind.padEnd(8)} ${c.name}${oculta}`);
  }
  if (ficam.length) {
    console.log("\nFicam no padrão:");
    for (const f of ficam) console.log(`  ${f.kind.padEnd(8)} ${f.nome} — ${f.motivo}`);
  }

  if (!aplicar) {
    console.log("\nDry-run. Nada foi gravado. Para aplicar: --aplicar");
    return;
  }
  if (mover.length === 0) {
    console.log("\nNada a mover.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    const ids = mover.map((c) => c.id);
    const escondidasPelaIrriga = mover.filter((c) => c.ocultaEm.some((o) => o.companyId === irriga.id)).map((c) => c.id);
    await tx.financeCategoryHidden.deleteMany({ where: { categoryId: { in: ids } } });
    await tx.financeCategory.updateMany({
      where: { id: { in: ids }, companyId: null },
      data: { companyId: irriga.id, scope: irriga.id },
    });
    if (escondidasPelaIrriga.length) {
      await tx.financeCategory.updateMany({ where: { id: { in: escondidasPelaIrriga } }, data: { active: false } });
    }
  });
  console.log(`\n${mover.length} categorias movidas para o plano da Irriga.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => getPrisma().$disconnect());
