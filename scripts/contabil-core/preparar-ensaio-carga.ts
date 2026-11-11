// Preparo do ensaio da carga (Fase 5, 10/11/2026), só no banco LOCAL do Connect: cria a empresa
// inventada que tem par no Contábil Core local (`povoar_core_local.py`) e mostra o escritório de
// destino. A outra empresa do original fica sem par, de propósito.
//
//   node scripts/local/com-banco-local.mjs npx tsx --require ./scripts/contabil-core/sem-server-only.cjs scripts/contabil-core/preparar-ensaio-carga.ts
import { getPrisma } from "../../src/lib/prisma";

const prisma = getPrisma();
const CNPJ = "31.415.926/0001-71";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Só banco local.");
  const admin = await prisma.user.findFirstOrThrow({ where: { email: "adm6@41bpo.com.br" }, select: { tenantId: true } });
  const existe = await prisma.company.findFirst({ where: { tenantId: admin.tenantId, cnpj: CNPJ }, select: { id: true } });
  if (!existe) await prisma.company.create({ data: { tenantId: admin.tenantId, name: "Mercearia Ensaio da Carga LTDA", cnpj: CNPJ } as never });
  console.log(`CARGA_TENANT_ID=${admin.tenantId}`);
}

main().finally(() => prisma.$disconnect());
