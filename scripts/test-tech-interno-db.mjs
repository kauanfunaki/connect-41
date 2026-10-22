// Aceita apenas banco descartável explícito. Nunca usa DATABASE_URL/.env como origem.
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import mariadb from "mariadb";

const url = process.env.TECH_INTERNAL_TEST_DATABASE_URL;
if (!url) throw new Error("Defina TECH_INTERNAL_TEST_DATABASE_URL para localhost:33379/connect41 (banco descartável).");
const destino = new URL(url);
if (!["127.0.0.1", "localhost"].includes(destino.hostname) || destino.port !== "33379" || destino.pathname !== "/connect41") throw new Error("O teste exige banco descartável localhost:33379/connect41.");
const env = { ...process.env, DATABASE_URL: url, TECH_INTERNAL_TEST_DATABASE_URL: url, NODE_ENV: "test" };
const executar = args => {
  const r = spawnSync(process.execPath, args, { env, encoding: "utf8", maxBuffer: 30 * 1024 * 1024, windowsHide: true });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return r.stdout;
};
const db = await mariadb.createConnection({ host: destino.hostname, port: 33379, user: decodeURIComponent(destino.username), password: decodeURIComponent(destino.password), database: "connect41", multipleStatements: true, allowPublicKeyRetrieval: true });
try {
  const tables = await db.query("SHOW TABLES");
  if (!tables.length) {
    const sql = executar(["node_modules/prisma/build/index.js", "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script"]);
    const base = sql.split(/(?=-- (?:CreateTable|CreateIndex|AddForeignKey))/).filter(block => !/(?:CREATE TABLE|ALTER TABLE|CREATE (?:UNIQUE )?INDEX[^;]* ON) `tech_internal_/.test(block)).join("");
    await db.query(base);
  }
  const nomes = new Set((await db.query("SHOW TABLES")).map(row => Object.values(row)[0]));
  if (!nomes.has("tech_internal_items")) {
    // Comprova preservação de um registro anterior à migration.
    const id = "tech-migration-fixture";
    await db.query("INSERT INTO tenants (id,name,slug,updatedAt) VALUES (?,?,?,NOW(3)) ON DUPLICATE KEY UPDATE name=VALUES(name)", [id, "Escritório fictício de migração", id]);
    const sql = await readFile("prisma/migrations/20261021160000_tech_internal/migration.sql", "utf8");
    if (/^\s*(DROP|TRUNCATE|DELETE|UPDATE)\b/im.test(sql)) throw new Error("Migration deixou de ser aditiva.");
    await db.query(sql);
    if (!(await db.query("SELECT id FROM tenants WHERE id=?", [id])).length) throw new Error("Registro anterior não preservado.");
    console.log("Migration aplicada; registro anterior preservado no banco descartável.");
  }
} finally { await db.end(); }
executar(["node_modules/prisma/build/index.js", "migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"]);
console.log("Schema do banco descartável confere com Prisma.");
const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "src/lib/tech-interno"], { env, stdio: "inherit", windowsHide: true });
process.exitCode = result.status ?? 1;
