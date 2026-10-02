// Dados fictícios para as telas além do BPO e do portal, no banco LOCAL —
// pedido do Kauan em 29/09: "dados fictícios em todas as telas" para analisar e
// redesenhar. Só roda pelo lançador:
//
//   node scripts/local/com-banco-local.mjs npx tsx scripts/local/dados-ficticios.ts
//
// Roda depois do seed, da demonstração do BPO, do preparo e dos modelos do
// Societário (`scripts/seed-societario.ts --aplicar`) — o `recriar-banco.mjs`
// já faz tudo nessa ordem. O que entra está em `scripts/dados-de-exemplo/gerador.ts`
// (o mesmo do escritório "Teste" da produção). Carrega uma vez: para recomeçar,
// recrie o banco.

import { getPrisma } from "../../src/lib/prisma";
import { carregarDadosDeExemplo, FONTE } from "../dados-de-exemplo/gerador";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "mysql://x@invalido/x");
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error("Recusado: só roda no banco local (use scripts/local/com-banco-local.mjs).");
  }
  const p = getPrisma();
  const tenant = await p.tenant.findUnique({ where: { slug: "41tech" }, select: { id: true } });
  if (!tenant) throw new Error("Rode o seed antes (prisma/seed.ts).");
  if (await p.company.findFirst({ where: { tenantId: tenant.id, source: FONTE }, select: { id: true } })) {
    console.log("dados fictícios já carregados — para recomeçar, recrie o banco (scripts/local/recriar-banco.mjs)");
    return;
  }
  await carregarDadosDeExemplo(p, tenant.id, { reunioes: true });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
