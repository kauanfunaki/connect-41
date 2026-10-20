// Banco descartável explícito; nunca carrega credenciais de .env.
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import mariadb from "mariadb";

const url = process.env.OPS_TEST_DATABASE_URL;
if (!url) throw new Error("Defina OPS_TEST_DATABASE_URL para localhost:33379/connect41 (banco descartável).");
const destino = new URL(url);
if (!["127.0.0.1", "localhost"].includes(destino.hostname) || destino.port !== "33379" || destino.pathname !== "/connect41") throw new Error("O teste exige o banco descartável localhost:33379/connect41.");
const env = { ...process.env, DATABASE_URL: url, OPS_TEST_DATABASE_URL: url, NODE_ENV: "test" };
const executar = args => {
  const r = spawnSync(process.execPath, args, { env, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return r.stdout;
};
const db = await mariadb.createConnection({ host: destino.hostname, port: 33379, user: decodeURIComponent(destino.username), password: decodeURIComponent(destino.password), database: "connect41", multipleStatements: true, allowPublicKeyRetrieval: true });
try {
  const tables = await db.query("SHOW TABLES");
  if (!tables.length) {
    const sql = executar(["node_modules/prisma/build/index.js", "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script"]);
    // A base é gerada pelo Prisma; as tabelas do Ops vêm da migration entregue.
    const base = sql.split(/(?=-- (?:CreateTable|CreateIndex|AddForeignKey))/).filter(block => !/(?:CREATE TABLE|ALTER TABLE|CREATE (?:UNIQUE )?INDEX[^;]* ON) `ops_(?:watchers|events)`/.test(block)).join("");
    await db.query(base);
    await db.query(await readFile("prisma/migrations/20261020120000_ops_center/migration.sql", "utf8"));
    console.log("Migration do Ops aplicada apenas ao banco descartável.");
  }
} finally { await db.end(); }
executar(["node_modules/prisma/build/index.js", "migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"]);
console.log("Migration conferida contra o schema: sem diferenças.");
const testes = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "src/lib/ops"], { env, stdio: "inherit" });
process.exitCode = testes.status ?? 1;
