// Renomeia o setor `bpo` de "BPO Financeiro" para "BPO" em todos os tenants.
//
// O label do setor é dado, não código: vive em `sectors.label` e pode ter sido
// digitado no /admin/setores de cada workspace. O padrão em
// src/lib/sector-constants.ts já é "BPO" — este script só alcança as linhas
// criadas antes disso ou renomeadas à mão.
//
// Rodar uma vez, com DATABASE_URL apontando pro banco alvo:
//   npx tsx scripts/renomear-setor-bpo.ts
//
// Idempotente: rodar de novo não faz nada. Só toca em quem ainda tem o nome
// antigo — um tenant que deliberadamente chamou o setor de outra coisa fica
// como está.

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const NOME_ANTIGO = "BPO Financeiro";
const NOME_NOVO = "BPO";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });

  const alvos = await prisma.sector.findMany({
    where: { code: "bpo", label: NOME_ANTIGO },
    select: { id: true, tenantId: true, label: true },
  });

  if (alvos.length === 0) {
    console.log(`Nada a fazer — nenhum setor "bpo" com label "${NOME_ANTIGO}".`);
    await prisma.$disconnect();
    return;
  }

  console.log(`Renomeando ${alvos.length} setor(es):`);
  for (const s of alvos) console.log(`  tenant ${s.tenantId}: "${s.label}" → "${NOME_NOVO}"`);

  const { count } = await prisma.sector.updateMany({
    where: { code: "bpo", label: NOME_ANTIGO },
    data: { label: NOME_NOVO },
  });

  console.log(`Pronto: ${count} linha(s) atualizada(s).`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
