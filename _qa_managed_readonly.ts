/**
 * Checagem pré-deploy da mudança de política de 2026-08-04 (read-only por
 * inadimplência passou a valer para workspaces MANAGED).
 *
 * Lista os tenants MANAGED que vão ficar somente-leitura assim que a mudança
 * subir. Lista vazia = deploy seguro.
 *
 *   npx tsx _qa_managed_readonly.ts
 *
 * Só faz SELECT. Usa o DATABASE_URL do ambiente — confira no cabeçalho da
 * saída se é mesmo o banco de produção antes de tirar conclusão.
 */
import "dotenv/config";
import { PrismaClient } from "./src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { isSubscriptionReadOnly } from "./src/lib/subscription-policy";

function describeTarget(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) return "DATABASE_URL não definida";
  try {
    const u = new URL(raw);
    // host/porta/banco apenas — usuário e senha ficam de fora de propósito.
    return `${u.hostname}:${u.port || "3306"}${u.pathname}`;
  } catch {
    return "DATABASE_URL em formato inesperado";
  }
}

async function main() {
  console.log(`Banco alvo: ${describeTarget()}\n`);

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
  try {
    // Panorama antes do recorte: "0 MANAGED" pode significar tanto "nenhum
    // cliente gerenciado" quanto "conectei no banco errado". Sem isto, os dois
    // casos imprimem a mesma coisa e o segundo passa por deploy liberado.
    const todos = await prisma.tenant.groupBy({ by: ["managementMode"], _count: true });
    console.log("Tenants por modo de gestão:");
    for (const g of todos) console.log(`  ${g.managementMode}: ${g._count}`);
    console.log(`  (total de usuários no banco: ${await prisma.user.count()})\n`);

    const tenants = await prisma.tenant.findMany({
      where: { managementMode: "MANAGED" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    const subs = await prisma.subscription.findMany({
      where: { tenantId: { in: tenants.map((t) => t.id) } },
      select: { tenantId: true, status: true },
    });
    const statusByTenant = new Map(subs.map((s) => [s.tenantId, s.status]));

    // Mesma função que o app usa em runtime — se a regra mudar, esta checagem
    // acompanha sozinha em vez de virar uma segunda versão que envelhece.
    const afetados = tenants.filter((t) => isSubscriptionReadOnly(statusByTenant.get(t.id)));

    console.log(`Tenants MANAGED: ${tenants.length}`);
    console.log(`Sem linha em Subscription (nunca bloqueados): ${tenants.filter((t) => !statusByTenant.has(t.id)).length}`);
    console.log(`\nVão ficar SOMENTE LEITURA no deploy: ${afetados.length}`);

    for (const t of afetados) {
      console.log(`  - ${t.name} (${t.id}) — status ${statusByTenant.get(t.id)}`);
    }

    if (afetados.length === 0) {
      console.log("\nOK — nenhum workspace gerenciado trava com a mudança.");
    } else {
      console.log("\nATENÇÃO: acerte o status desses antes de subir, ou eles perdem a escrita na hora.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
