// Nunca lê .env. Exige destino local explícito e não apaga tabelas existentes.
import { spawnSync } from "node:child_process";
import mariadb from "mariadb";

const url = process.env.HELPDESK_TEST_DATABASE_URL;
if (!url) throw new Error("Defina HELPDESK_TEST_DATABASE_URL para um banco descartável local. DATABASE_URL não é usada por este script.");
const destino = new URL(url);
if (!["127.0.0.1", "localhost"].includes(destino.hostname) || destino.port !== "33379" || destino.pathname !== "/connect41") throw new Error("Recusado: o teste exige localhost:33379/connect41, reservado ao contêiner descartável connect41-helpdesk-test.");
const env = { ...process.env, DATABASE_URL: url, HELPDESK_TEST_DATABASE_URL: url, NODE_ENV: "test" };
const conexao = await mariadb.createConnection({ host: destino.hostname, port: Number(destino.port), user: decodeURIComponent(destino.username), password: decodeURIComponent(destino.password), database: "connect41", multipleStatements: true, allowPublicKeyRetrieval: true });
try {
  const tabelas = await conexao.query("SHOW TABLES");
  if (!tabelas.length) {
    const schema = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script"], { env, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
    if (schema.status !== 0) throw new Error("Falha ao gerar o schema de teste: " + schema.stderr);
    await conexao.query(schema.stdout);
  }
} finally { await conexao.end(); }
const teste = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "src/lib/chamados/integracao.test.ts"], { env, stdio: "inherit" });
process.exitCode = teste.status ?? 1;
