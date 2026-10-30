import fs from "node:fs";
import mariadb from "mariadb";
import { spawnSync } from "node:child_process";
const url = new URL(process.env.DATABASE_URL || "");
if (url.hostname !== "127.0.0.1" || url.port !== "33381" || url.pathname !== "/connect41") throw new Error("Este preparo aceita somente o banco descartável 127.0.0.1:33381/connect41.");
const db = await mariadb.createConnection({ host: url.hostname, port: Number(url.port), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: "connect41", allowPublicKeyRetrieval: true, multipleStatements: true });
try {
  if ((await db.query("SHOW TABLES")).length) { console.log("Banco descartável já preparado; dados preservados."); }
  else {
    const schema = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script"], { encoding: "utf8", env: process.env });
    if (schema.status !== 0 || !schema.stdout.includes("CREATE TABLE")) throw new Error("Não foi possível gerar o schema descartável. " + schema.stderr);
    fs.mkdirSync(".local/sped-fiscal", { recursive: true });
    fs.writeFileSync(".local/sped-fiscal/schema-qa.sql", schema.stdout);
    await db.query(schema.stdout.replace(/^\uFEFF/, ""));
    console.log("Schema criado no banco descartável do SPED (33381).");
  }
} finally { await db.end(); }
