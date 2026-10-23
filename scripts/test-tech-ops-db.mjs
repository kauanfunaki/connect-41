// Exige URL explícita de MySQL descartável; nunca usa .env como destino.
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import mariadb from "mariadb";
const url = process.env.OPS_TEST_DATABASE_URL;
if (!url) throw new Error("Defina OPS_TEST_DATABASE_URL para o banco descartável localhost:33379/connect41.");
const destino = new URL(url);
if (!["127.0.0.1", "localhost"].includes(destino.hostname) || destino.port !== "33379" || destino.pathname !== "/connect41") throw new Error("Banco não isolado recusado.");
const env = { ...process.env, DATABASE_URL: url, TECH_INTERNAL_TEST_DATABASE_URL: url, OPS_TEST_DATABASE_URL: url, NODE_ENV: "test" };
const executar = args => {
  const result = spawnSync(process.execPath, args, { env, encoding: "utf8", maxBuffer: 30 * 1024 * 1024, windowsHide: true });
  if (result.status !== 0) throw new Error((result.stdout ?? "") + (result.stderr ?? ""));
  return result.stdout;
};
const db = await mariadb.createConnection({ host: destino.hostname, port: 33379, user: decodeURIComponent(destino.username), password: decodeURIComponent(destino.password), database: "connect41", allowPublicKeyRetrieval: true, multipleStatements: true });
try {
  const tables = await db.query("SHOW TABLES");
  if (!tables.length) {
    const sql = executar(["node_modules/prisma/build/index.js", "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script"]);
    const base = sql.split(/(?=-- (?:CreateTable|CreateIndex|AddForeignKey))/).filter(block => !/(?:CREATE TABLE|ALTER TABLE|CREATE (?:UNIQUE )?INDEX[^;]* ON) `(?:tech_internal_[a-z_]+|ops_api_keys)`/.test(block)).join("");
    await db.query(base);
  }
  const nomes = new Set((await db.query("SHOW TABLES")).map(row => Object.values(row)[0]));
  for (const [table, migration] of [["tech_internal_items", "20261021160000_tech_internal"], ["ops_api_keys", "20261023120000_ops_multiple_keys"]]) {
    if (!nomes.has(table)) {
      await db.query(await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"));
      console.log(`Migration ${migration} aplicada apenas no banco descartável.`);
    }
  }
} finally { await db.end(); }
executar(["node_modules/prisma/build/index.js", "migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"]);
console.log("Migrations compatíveis com o schema.");
console.log(executar(["node_modules/vitest/vitest.mjs", "run", "src/lib/tech-interno", "src/lib/ops", "src/lib/contabil", "src/lib/module-catalog.test.ts"]));
