import { PrismaClient } from "@/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

// Lazy: não conecta em import-time (next build não tem DATABASE_URL disponível)
let _client: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  if (_client) return _client;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  _client = new PrismaClient({ adapter: new PrismaMariaDb(url) });
  if (process.env.NODE_ENV !== "production") {
    (globalThis as { __prisma?: PrismaClient }).__prisma = _client;
  }
  return _client;
}
