import { PrismaClient } from "@/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

// Lazy: não conecta em import-time (next build não tem DATABASE_URL disponível)
// Guardado em globalThis pra sobreviver ao HMR do Turbopack em dev — sem isso,
// cada reload recria o client e vaza conexões no pool do MySQL remoto.
const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  if (globalForPrisma.__prisma) return globalForPrisma.__prisma;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  const client = new PrismaClient({ adapter: new PrismaMariaDb(url) });
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.__prisma = client;
  }
  return client;
}
