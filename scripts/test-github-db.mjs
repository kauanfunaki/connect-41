// Apenas MySQL descartável explicitamente configurado. Não carrega .env.
import { spawnSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import mariadb from "mariadb";

const url = process.env.GITHUB_TEST_DATABASE_URL;
if (!url) throw new Error("Defina GITHUB_TEST_DATABASE_URL para o banco descartável em 127.0.0.1:33381/connect41.");
const target = new URL(url);
if (!["127.0.0.1", "localhost"].includes(target.hostname) || target.port !== "33381" || target.pathname !== "/connect41") throw new Error("Banco não isolado recusado.");
const env = { ...process.env, DATABASE_URL: url, GITHUB_TEST_DATABASE_URL: url, NODE_ENV: "test" };
const run = args => {
  const result = spawnSync(process.execPath, args, { env, encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout;
};
const githubBlocks = sql => sql.split(/(?=-- (?:CreateTable|CreateIndex|AddForeignKey|AlterTable|DropTable|DropIndex))/).filter(block => /(?:CREATE TABLE|ALTER TABLE| ON) `github_/.test(block));
await mkdir(".local/github", { recursive: true });
const db = await mariadb.createConnection({ host: target.hostname, port: 33381, user: decodeURIComponent(target.username), password: decodeURIComponent(target.password), database: "connect41", allowPublicKeyRetrieval: true, multipleStatements: true });
try {
  const tables = await db.query("SHOW TABLES");
  if (!tables.length) {
    const sql = run(["node_modules/prisma/build/index.js", "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script"]);
    const blocks = sql.split(/(?=-- (?:CreateTable|CreateIndex|AddForeignKey))/);
    const base = blocks.filter(block => !/(?:CREATE TABLE|ALTER TABLE| ON) `github_/.test(block)).join("");
    await db.query(base);
  }
  const names = new Set((await db.query("SHOW TABLES")).map(row => Object.values(row)[0]));
  if (!names.has("github_connections")) {
    const migration = await readFile("prisma/migrations/20261021120000_github_contributions/migration.sql", "utf8");
    if (/DROP\s+(?:TABLE|COLUMN)|TRUNCATE/i.test(migration) || githubBlocks(migration).join("") !== migration) throw new Error("Migration não é exclusivamente aditiva do GitHub.");
    const before = Number((await db.query("SELECT COUNT(*) AS n FROM tenants"))[0].n);
    await db.query(migration);
    if (Number((await db.query("SELECT COUNT(*) AS n FROM tenants"))[0].n) !== before) throw new Error("Migration alterou dados existentes.");
  }
  // Vínculo de contas, títulos e finalidade OAuth (27/10/2026): também só aditiva e só do GitHub.
  if (!names.has("github_account_links")) {
    const migration = await readFile("prisma/migrations/20261027120000_github_account_links/migration.sql", "utf8");
    const statements = migration.replace(/^\s*--.*$/gm, "");
    if (/DROP\s+(?:TABLE|COLUMN)|TRUNCATE|MODIFY|CHANGE/i.test(statements) || githubBlocks(migration).join("") !== migration.slice(migration.indexOf("-- AlterTable"))) throw new Error("Migration de vínculos não é exclusivamente aditiva do GitHub.");
    const before = Number((await db.query("SELECT COUNT(*) AS n FROM github_contributions"))[0].n);
    await db.query(migration);
    if (Number((await db.query("SELECT COUNT(*) AS n FROM github_contributions"))[0].n) !== before) throw new Error("Migration alterou dados existentes.");
  }
  const diff = run(["node_modules/prisma/build/index.js", "migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--script"]);
  if (githubBlocks(diff).length) throw new Error("As tabelas GitHub da migration divergem do schema.");
  await writeFile(".local/github/migration-result.json", JSON.stringify({ host: "127.0.0.1:33381", tables: 9, schemaMatches: true, additive: true }, null, 2));
  console.log("Migrations GitHub validadas: nove tabelas, schema compatível e dados anteriores preservados.");
} finally { await db.end(); }
const tests = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "src/lib/github"], { env, stdio: "inherit" });
process.exitCode = tests.status ?? 1;
