import "dotenv/config";
import { PrismaClient } from "./src/generated/prisma/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) });

// Backfill único: conversas resolvidas antes de resolvedAt existir e que
// nunca mais tiveram atividade nova (por isso a reconciliação periódica —
// que só revisita conversas recentes, por desenho — nunca as tocou de novo)
// ficaram com resolvedAt eternamente nulo. Preenche com lastActivityAt
// (mesma estimativa já usada ao vivo em sync.ts).
const raw = await prisma.$executeRawUnsafe(
  "UPDATE chatwoot_conversations SET resolvedAt = COALESCE(lastActivityAt, NOW()) WHERE status = 'resolved' AND resolvedAt IS NULL"
);
console.log(`Linhas atualizadas: ${raw}`);

const stillNull = await prisma.chatwootConversation.count({ where: { status: "resolved", resolvedAt: null } });
console.log("Conversas resolvidas ainda sem resolvedAt:", stillNull);

await prisma.$disconnect();
