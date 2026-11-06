import fs from "node:fs";
import mariadb from "mariadb";
import { spawnSync } from "node:child_process";
const url = new URL(process.env.DATABASE_URL || "");
if (url.hostname !== "127.0.0.1" || url.port !== "33381" || url.pathname !== "/connect41") throw new Error("Este preparo aceita somente o banco descartável 127.0.0.1:33381/connect41.");
const db = await mariadb.createConnection({ host: url.hostname, port: Number(url.port), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: "connect41", allowPublicKeyRetrieval: true, multipleStatements: true });
function gerarSchema() {
  const schema = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script"], { encoding: "utf8", env: process.env });
  if (schema.status !== 0 || !schema.stdout.includes("CREATE TABLE")) throw new Error("Não foi possível gerar o schema descartável. " + schema.stderr);
  fs.mkdirSync(".local/sped-fiscal", { recursive: true });
  fs.writeFileSync(".local/sped-fiscal/schema-qa.sql", schema.stdout);
  return schema.stdout.replace(/^﻿/, "");
}
try {
  const existentes = new Set((await db.query("SHOW TABLES")).map(t => Object.values(t)[0]));
  if (existentes.size) {
    // Banco já preparado: os dados ficam. Só entram as tabelas que o schema
    // ganhou depois (06/11/2026: sped_fiscal_generations), nunca ALTER.
    const novas = [...gerarSchema().matchAll(/CREATE TABLE `([a-z0-9_]+)` \([\s\S]*?\) DEFAULT CHARACTER SET [^;]+;/g)].filter(m => !existentes.has(m[1]));
    for (const m of novas) { await db.query(m[0]); console.log(`Tabela acrescentada: ${m[1]}`); }
    console.log(novas.length ? "Banco descartável atualizado; dados preservados." : "Banco descartável já preparado; dados preservados.");
  } else {
    await db.query(gerarSchema());
    console.log("Schema criado no banco descartável do SPED (33381).");
  }
} finally { await db.end(); }
