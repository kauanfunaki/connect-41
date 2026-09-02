// Conserta dois resíduos da importação do Acessórias de 2026-09-02.
//
//   npx tsx --env-file=.env scripts/corrigir-clientes-duplicados.ts            # dry-run
//   npx tsx --env-file=.env scripts/corrigir-clientes-duplicados.ts --aplicar
//
// 1. RAIZ COM DOIS CLIENTES. O tenant já tinha dois `ClientGroup` com a raiz
//    17122471 antes da importação — "Gabriel BLD" (criado à mão, com a matriz
//    dentro) e um "BLD LOGISTICA LTDA" vazio. O script de importação montava um
//    `Map` por raiz e ficava com o último em silêncio, então as 20 filiais
//    entraram num cliente e a matriz continuou no outro. Como a listagem agrupa
//    por cliente ANTES de montar a árvore, elas apareceram em blocos separados.
//
//    Conserto: as empresas da raiz vão todas para o cliente que já tem mais
//    empresas; o que sobra vazio é apenas relatado, nunca apagado — quem criou
//    à mão decide se quer perdê-lo.
//
// 2. ESPAÇO DUPLO NO NOME. "BLD LOGISTICA LTDA  -  Filial 14" vem assim do
//    Acessórias. Não é cosmético: em ordenação alfabética o espaço (0x20) vem
//    antes do hífen (0x2D), então a 14 e a 17 pulavam para fora da sequência
//    das filiais.

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const aplicar = process.argv.includes("--aplicar");
const TENANT_NOME = "41 Tech";

/** Colapsa espaços repetidos e apara as pontas. */
export function normalizarEspacos(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });

  const tenant = await prisma.tenant.findFirst({ where: { name: TENANT_NOME }, select: { id: true } });
  if (!tenant) throw new Error(`Tenant "${TENANT_NOME}" não encontrado.`);

  console.log(`\n=== CORREÇÃO ${aplicar ? "(APLICANDO)" : "(DRY-RUN)"} ===\n`);

  // ---- 1. raízes com mais de um cliente ----
  const grupos = await prisma.clientGroup.findMany({
    where: { tenantId: tenant.id, cnpjRoot: { not: null } },
    select: { id: true, name: true, cnpjRoot: true, _count: { select: { companies: true } } },
  });

  const porRaiz = new Map<string, typeof grupos>();
  for (const g of grupos) {
    const lista = porRaiz.get(g.cnpjRoot!) ?? [];
    lista.push(g);
    porRaiz.set(g.cnpjRoot!, lista);
  }

  const duplicadas = [...porRaiz.entries()].filter(([, l]) => l.length > 1);
  console.log(`raízes com mais de um cliente: ${duplicadas.length}`);

  let empresasMovidas = 0;
  const ficamVazios: { id: string; name: string }[] = [];

  for (const [raiz, lista] of duplicadas) {
    // O que já tem mais empresas vence: mover 1 é mais barato e menos arriscado
    // que mover 20, e o nome dele já é o que aparece na tela para a maioria.
    const ordenados = [...lista].sort((a, b) => b._count.companies - a._count.companies);
    const vencedor = ordenados[0];
    const perdedores = ordenados.slice(1);

    console.log(`\n  raiz ${raiz} → mantém "${vencedor.name}" (${vencedor._count.companies} empresas)`);
    for (const p of perdedores) {
      const empresas = await prisma.company.findMany({
        where: { tenantId: tenant.id, clientGroupId: p.id },
        select: { id: true, name: true },
      });
      console.log(`     mover ${empresas.length} de "${p.name}":`);
      for (const e of empresas) console.log(`        ${e.name}`);
      if (aplicar && empresas.length > 0) {
        await prisma.company.updateMany({
          where: { id: { in: empresas.map((e) => e.id) } },
          data: { clientGroupId: vencedor.id },
        });
      }
      empresasMovidas += empresas.length;
      ficamVazios.push({ id: p.id, name: p.name });
    }
  }

  // ---- 2. espaços duplos no nome ----
  const todas = await prisma.company.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true, displayName: true },
  });
  const paraLimpar = todas.filter(
    (c) =>
      normalizarEspacos(c.name) !== c.name ||
      (c.displayName !== null && normalizarEspacos(c.displayName) !== c.displayName)
  );

  console.log(`\nnomes com espaço duplo: ${paraLimpar.length}`);
  for (const c of paraLimpar) {
    console.log(`   "${c.name}" → "${normalizarEspacos(c.name)}"`);
    if (aplicar) {
      await prisma.company.update({
        where: { id: c.id },
        data: {
          name: normalizarEspacos(c.name),
          displayName: c.displayName === null ? null : normalizarEspacos(c.displayName),
        },
      });
    }
  }

  console.log("");
  if (!aplicar) {
    console.log("Dry-run: nada foi escrito. Rode de novo com --aplicar.");
  } else {
    console.log(`empresas movidas de cliente: ${empresasMovidas}`);
    console.log(`nomes normalizados         : ${paraLimpar.length}`);
    if (ficamVazios.length > 0) {
      console.log(`\nClientes que ficaram SEM empresa — não apago, decida você:`);
      for (const v of ficamVazios) console.log(`   ${v.name} (${v.id})`);
      console.log("Dá para inativar em /clientes, que é o caminho normal.");
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
