#!/usr/bin/env node
// Acrescenta somente o SPED Fiscal ao banco local existente, com backup.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { gzipSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { parse } from "dotenv";
import mariadb from "mariadb";

process.chdir(fileURLToPath(new URL("../..", import.meta.url)));
const local = parse(readFileSync(".env.localdev", "utf8"));
const url = new URL(local.DATABASE_URL || "mysql://invalido");
if (url.protocol !== "mysql:" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "3307" || url.pathname !== "/connect41") {
  throw new Error("Recusado: esperado somente .env.localdev com connect41 local na porta 3307.");
}
const sql = readFileSync("prisma/migrations/20261030120000_sped_fiscal_connect/migration.sql", "utf8");
const statements = sql.replace(/^\s*--.*$/gm, "").split(";").map(s => s.trim()).filter(Boolean);
const criacoes = statements.map(statement => {
  const nome = statement.match(/^CREATE TABLE `(sped_fiscal_[a-z_]+)`\s*\(/)?.[1];
  if (!nome || /\b(DROP|ALTER|TRUNCATE|RENAME|DELETE|UPDATE|INSERT)\b/i.test(statement)) throw new Error("Migration fora do escopo: permitida somente a criação das tabelas SPED Fiscal.");
  return { nome, statement };
});
if (criacoes.length !== 11 || new Set(criacoes.map(t => t.nome)).size !== 11) throw new Error("Esperadas exatamente as 11 tabelas do SPED Fiscal.");
const db = await mariadb.createConnection({ host: url.hostname, port: Number(url.port), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: "connect41", allowPublicKeyRetrieval: true });
try {
  const tabelas = new Set((await db.query("SELECT table_name AS nome FROM information_schema.tables WHERE table_schema = DATABASE()" )).map(t => t.nome));
  const faltam = criacoes.filter(t => !tabelas.has(t.nome));
  console.log(`Banco local 3307/connect41: ${11 - faltam.length}/11 tabelas SPED presentes.`);
  if (!faltam.length) { console.log("SPED Fiscal já preparado. Nenhuma alteração realizada."); }
  else if (!process.argv.includes("--aplicar")) { console.log(`Faltam: ${faltam.map(t => t.nome).join(", ")}\nPara fazer backup e acrescentar somente essas tabelas: node scripts/local/atualizar-sped-fiscal.mjs --aplicar`); }
  else {
    const mapping = spawnSync("docker", ["port", "connect41-local", "3306/tcp"], { encoding: "utf8" });
    if (mapping.status !== 0 || mapping.stdout.trim() !== "127.0.0.1:3307") throw new Error("O contêiner connect41-local não corresponde à porta esperada. Nada aplicado.");
    const protegidas = ["companies", "users", "fiscal_documents", "financial_accounts", "bank_transactions"].filter(t => tabelas.has(t));
    async function contagens() {
      return Object.fromEntries(await Promise.all(protegidas.map(async nome => [nome, (await db.query(`SELECT CAST(COUNT(*) AS CHAR) AS total FROM \`${nome}\``))[0].total])));
    }
    const antes = await contagens();
    const dump = spawnSync("docker", ["exec", "connect41-local", "sh", "-c", 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers --no-tablespaces --set-gtid-purged=OFF connect41'], { maxBuffer: 256 * 1024 * 1024 });
    if (dump.status !== 0 || !dump.stdout?.length) throw new Error("Backup falhou. Nada aplicado.");
    const diretorio = resolve("storage/backups");
    mkdirSync(diretorio, { recursive: true });
    const backup = resolve(diretorio, `connect41-antes-sped-fiscal-${new Date().toISOString().replace(/[:.]/g, "-")}.sql.gz`);
    writeFileSync(backup, gzipSync(dump.stdout), { flag: "wx" });
    const hash = bytes => createHash("sha256").update(bytes).digest("hex");
    if (hash(gunzipSync(readFileSync(backup))) !== hash(dump.stdout)) throw new Error("A conferência do backup falhou. Nada aplicado.");
    console.log(`Backup conferido: ${backup}`);
    for (const tabela of faltam) { await db.query(tabela.statement); console.log(`Criada: ${tabela.nome}`); }
    const depois = await contagens();
    if (JSON.stringify(antes) !== JSON.stringify(depois)) throw new Error("As contagens existentes mudaram durante a atualização; confira a atividade local. O backup foi preservado.");
    const existentes = new Set((await db.query("SELECT table_name AS nome FROM information_schema.tables WHERE table_schema = DATABASE()")).map(t => t.nome));
    if (criacoes.some(t => !existentes.has(t.nome))) throw new Error("Preparação incompleta. O backup e as tabelas já criadas foram preservados; execute novamente para retomar.");
    console.log("11/11 tabelas SPED presentes. Registros existentes conferidos e preservados. Sem seeds ou alteração de senhas.");
  }
} finally { await db.end(); }
