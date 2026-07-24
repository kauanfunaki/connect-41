import "dotenv/config";
import { PrismaClient } from "./src/generated/prisma/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) });

// Migração manual e não-destrutiva do pivô CanvasPage.pipelineItemId -> sectorCode:
// adiciona a coluna nova como opcional, preenche com o sectorCode real do
// pipeline de origem de cada linha (achado via join), só então torna
// obrigatória — sem apagar nenhuma linha. Depois disso, `prisma db push
// --accept-data-loss` só precisa remover a coluna/FK antigas (pipelineItemId).
const cols = await prisma.$queryRawUnsafe("SHOW COLUMNS FROM canvas_pages LIKE 'sectorCode'");
if (cols.length === 0) {
  await prisma.$executeRawUnsafe("ALTER TABLE canvas_pages ADD COLUMN sectorCode VARCHAR(40) NULL");
  console.log("Coluna sectorCode adicionada (nullable).");
} else {
  console.log("Coluna sectorCode já existe, pulando ADD COLUMN.");
}

const backfill = await prisma.$queryRawUnsafe(
  "SELECT cp.id as canvasId, p.sectorCode as sectorCode FROM canvas_pages cp " +
  "JOIN pipeline_items pi ON pi.id = cp.pipelineItemId " +
  "JOIN pipelines p ON p.id = pi.pipelineId " +
  "WHERE cp.sectorCode IS NULL"
);
for (const row of backfill) {
  await prisma.$executeRawUnsafe(
    "UPDATE canvas_pages SET sectorCode = ? WHERE id = ?",
    row.sectorCode,
    row.canvasId
  );
  console.log(`Linha ${row.canvasId} -> sectorCode = ${row.sectorCode}`);
}

const remaining = await prisma.$queryRawUnsafe("SELECT id FROM canvas_pages WHERE sectorCode IS NULL");
if (remaining.length > 0) {
  console.log(`AVISO: ${remaining.length} linha(s) sem sectorCode resolvido (pipeline de origem não encontrado) — verificar manualmente antes de tornar a coluna NOT NULL.`);
} else {
  await prisma.$executeRawUnsafe("ALTER TABLE canvas_pages MODIFY sectorCode VARCHAR(40) NOT NULL");
  console.log("Coluna sectorCode agora é NOT NULL. Rode `npx prisma db push --accept-data-loss` de novo pra remover pipelineItemId.");
}

await prisma.$disconnect();
