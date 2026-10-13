#!/usr/bin/env node
// Atualiza somente o banco de demonstração, sem recriar nem executar seeds.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { parse } from "dotenv";

const local = parse(readFileSync(".env.localdev", "utf8"));
const url = new URL(local.DATABASE_URL);
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/connect41" || url.port !== "3307") {
  throw new Error("Recusado: esperado connect41 local na porta 3307.");
}
const env = { ...process.env, ...local };
function prisma(args, input) {
  const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", ...args], {
    env, encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(String(result.stderr || result.error || "Prisma falhou").replace(/mysql:\/\/\S+/g, "[URL omitida]"));
  }
  return result.stdout;
}
const sql = prisma(["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--script"]);
const statements = sql.replace(/^\s*--.*$/gm, "").split(";").map(s => s.trim()).filter(Boolean);
if (!statements.length) {
  console.log("Banco local já está atualizado.");
  process.exit(0);
}
// Só adições são automáticas; qualquer mudança destrutiva exige revisão manual.
for (const statement of statements) {
  if (!/^(CREATE TABLE|CREATE (UNIQUE )?INDEX|ALTER TABLE `[^`]+` ADD (COLUMN|CONSTRAINT))\b/.test(statement)
    || /\b(DROP|MODIFY|CHANGE|TRUNCATE|RENAME)\b/i.test(statement)) {
    throw new Error("Diff não exclusivamente aditivo. Nenhuma alteração aplicada; revisão manual necessária.");
  }
}
console.log(sql);
if (!process.argv.includes("--aplicar")) {
  console.log("Somente comparação. Para backup e aplicação: node scripts/local/atualizar-banco.mjs --aplicar");
  process.exit(0);
}
const mapping = spawnSync("docker", ["port", "connect41-local", "3306/tcp"], { encoding: "utf8" });
if (mapping.status !== 0 || mapping.stdout.trim() !== "127.0.0.1:3307") {
  throw new Error("Container local não corresponde ao banco esperado. Nada aplicado.");
}
const dump = spawnSync("docker", ["exec", "connect41-local", "sh", "-c",
  'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers --no-tablespaces --set-gtid-purged=OFF connect41'],
{ maxBuffer: 256 * 1024 * 1024 });
if (dump.status !== 0 || !dump.stdout?.length) throw new Error("Backup falhou. Nada aplicado.");
const directory = resolve("storage/backups");
mkdirSync(directory, { recursive: true });
const backup = resolve(directory, `connect41-${new Date().toISOString().replace(/[:.]/g, "-")}.sql.gz`);
writeFileSync(backup, gzipSync(dump.stdout), { flag: "wx" });
console.log(`Backup preservado em ${backup}`);
prisma(["db", "execute", "--stdin"], sql);
const remaining = prisma(["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"]);
console.log(remaining.trim());
console.log("Banco atualizado sem recriação ou alteração de senhas.");
