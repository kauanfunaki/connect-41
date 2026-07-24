import "dotenv/config";
import { PrismaClient } from "./src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });

const statements = [
  `CREATE TABLE \`assessment_links\` (
    \`id\` VARCHAR(191) NOT NULL,
    \`tenantId\` VARCHAR(191) NOT NULL,
    \`personId\` VARCHAR(191) NOT NULL,
    \`candidaturaId\` VARCHAR(191) NULL,
    \`sectorCode\` VARCHAR(40) NOT NULL,
    \`type\` ENUM('DISC') NOT NULL DEFAULT 'DISC',
    \`token\` VARCHAR(64) NOT NULL,
    \`status\` ENUM('PENDENTE', 'RESPONDIDO') NOT NULL DEFAULT 'PENDENTE',
    \`expiresAt\` DATETIME(3) NOT NULL,
    \`submittedAt\` DATETIME(3) NULL,
    \`answers\` JSON NULL,
    \`scores\` JSON NULL,
    \`primaryProfile\` VARCHAR(4) NULL,
    \`secondaryProfile\` VARCHAR(4) NULL,
    \`createdById\` VARCHAR(191) NOT NULL,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX \`assessment_links_token_key\`(\`token\`),
    INDEX \`assessment_links_tenantId_personId_idx\`(\`tenantId\`, \`personId\`),
    INDEX \`assessment_links_tenantId_sectorCode_status_idx\`(\`tenantId\`, \`sectorCode\`, \`status\`),
    PRIMARY KEY (\`id\`)
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
  `ALTER TABLE \`assessment_links\` ADD CONSTRAINT \`assessment_links_tenantId_fkey\` FOREIGN KEY (\`tenantId\`) REFERENCES \`tenants\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE;`,
  `ALTER TABLE \`assessment_links\` ADD CONSTRAINT \`assessment_links_personId_fkey\` FOREIGN KEY (\`personId\`) REFERENCES \`people\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE;`,
  `ALTER TABLE \`assessment_links\` ADD CONSTRAINT \`assessment_links_candidaturaId_fkey\` FOREIGN KEY (\`candidaturaId\`) REFERENCES \`candidaturas\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE;`,
  `ALTER TABLE \`assessment_links\` ADD CONSTRAINT \`assessment_links_createdById_fkey\` FOREIGN KEY (\`createdById\`) REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE;`,
];

(async () => {
  const existing = (await prisma.$queryRawUnsafe("SHOW TABLES LIKE 'assessment_links'")) as unknown[];
  if (existing.length > 0) {
    console.log("Tabela já existe — nada a fazer.");
    await prisma.$disconnect();
    return;
  }

  for (const [i, sql] of statements.entries()) {
    await prisma.$executeRawUnsafe(sql);
    console.log(`Statement ${i + 1}/${statements.length} OK`);
  }

  const after = await prisma.$queryRawUnsafe("SHOW TABLES LIKE 'assessment_links'");
  console.log("Confirmação pós-criação:", after);
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error("ERRO:", err);
  await prisma.$disconnect();
  process.exit(1);
});
