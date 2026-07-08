import { PrismaClient } from "@/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

// Lazy: não conecta em import-time (next build não tem DATABASE_URL disponível)
// Cache SEMPRE em globalThis (não só em dev): em produção isso funciona como
// um singleton comum, escopado ao processo Node — sem isso, cada chamada cria
// um PrismaClient novo (pool de conexões novo), e o MySQL de produção estoura
// o limite de conexões em poucas requisições. Em dev, o globalThis também
// sobrevive ao HMR do Turbopack, que reavalia o módulo a cada reload.
const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  if (globalForPrisma.__prisma) return globalForPrisma.__prisma;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  const client = new PrismaClient({ adapter: new PrismaMariaDb(url) });
  globalForPrisma.__prisma = client;
  return client;
}
