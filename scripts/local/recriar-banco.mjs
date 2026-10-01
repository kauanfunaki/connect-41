#!/usr/bin/env node
// Recria do zero o banco LOCAL com dados fictícios (01/10/2026):
//
//   node scripts/local/recriar-banco.mjs
//
// Sobe o MySQL no Docker se ele não existir, apaga e recria o banco `connect41`
// local, cria as tabelas pelo schema atual, roda o seed, a demonstração do BPO
// e o preparo dos vídeos. Antes de cada rodada de gravação: alguns vídeos
// consomem dados (aprovar uma conta, responder uma pendência), e recriar é o
// que faz o próximo vídeo sair igual.
//
// ─── Por que o banco nasce do schema, e não das migrations ──────────────────
//
// O histórico de migrations **não reconstrói o banco do zero**: a
// `20260728150734_manual_page_cover` altera `manual_pages`, que nenhuma
// migration cria (a tabela entrou na produção por fora, antes de as migrations
// virarem regra). Em produção isso não aparece, porque as tabelas já existem.
// Aqui, `migrate diff --from-empty` gera o banco igual ao schema de hoje. Nunca
// `db push` — ver a memória do projeto sobre o drift de produção.

import { readFileSync, writeFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ARQUIVO = ".env.localdev";
const CONTAINER = "connect41-local";
if (!existsSync(ARQUIVO)) {
  console.error(`Falta ${ARQUIVO}. Veja scripts/local/README.md.`);
  process.exit(1);
}
const local = {};
for (const linha of readFileSync(ARQUIVO, "utf8").split(/\r?\n/)) {
  const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) local[m[1]] = m[2];
}
const url = new URL(local.DATABASE_URL ?? "mysql://x@invalido/x");
if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
  console.error("Recusado: a DATABASE_URL do .env.localdev não é local.");
  process.exit(1);
}
const env = { ...process.env, ...local };
const shell = process.platform === "win32";

function rodar(rotulo, comando, args, opcoes = {}) {
  process.stdout.write(`• ${rotulo}… `);
  const r = spawnSync(comando, args, { env, shell, encoding: "utf8", ...opcoes });
  if (r.status !== 0) {
    console.log("falhou");
    // Nada de imprimir a saída crua: o erro do driver às vezes traz a URL com a senha.
    console.error(String(r.stderr || r.stdout).replace(/mysql:\/\/\S+/g, "[url]").slice(-2000));
    process.exit(1);
  }
  console.log("ok");
  return r.stdout;
}

function mysql(sql) {
  return spawnSync("docker", ["exec", CONTAINER, "mysql", "-uroot", `-p${local.LOCAL_MYSQL_ROOT_PASSWORD}`, "-e", sql], { encoding: "utf8" });
}

// 1. O container
const existe = spawnSync("docker", ["ps", "-a", "--filter", `name=^${CONTAINER}$`, "--format", "{{.Status}}"], { encoding: "utf8" }).stdout.trim();
if (!existe) {
  rodar("subindo o MySQL local", "docker", [
    "run", "-d", "--name", CONTAINER,
    "-e", `MYSQL_ROOT_PASSWORD=${local.LOCAL_MYSQL_ROOT_PASSWORD}`,
    "-e", "MYSQL_DATABASE=connect41",
    "-p", `127.0.0.1:${url.port}:3306`,
    "mysql:8.0", "--character-set-server=utf8mb4", "--collation-server=utf8mb4_unicode_ci",
  ], { shell: false });
} else if (!existe.startsWith("Up")) {
  rodar("ligando o MySQL local", "docker", ["start", CONTAINER], { shell: false });
}
process.stdout.write("• esperando o MySQL… ");
for (let i = 0; i < 60; i++) {
  if (mysql("SELECT 1").status === 0) break;
  spawnSync(process.execPath, ["-e", "setTimeout(()=>{},2000)"]);
}
console.log("ok");

// 2. Banco do zero
const r = mysql("DROP DATABASE IF EXISTS connect41; CREATE DATABASE connect41 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;");
if (r.status !== 0) {
  console.error("Não consegui recriar o banco local.");
  process.exit(1);
}
console.log("• banco connect41 local recriado");

// 3. Tabelas pelo schema de hoje
const sql = rodar("gerando o SQL do schema", "npx", ["prisma", "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script"]);
const arquivoSql = path.join(mkdtempSync(path.join(tmpdir(), "connect41-")), "schema.sql");
writeFileSync(arquivoSql, sql);
rodar("criando as tabelas", "npx", ["prisma", "db", "execute", "--file", arquivoSql]);

// 4. Dados
rodar("seed (escritório e administrador)", "npx", ["tsx", "prisma/seed.ts"]);
rodar("demonstração do BPO", "npx", ["tsx", "scripts/dados-de-demonstracao.ts", "--aplicar"]);
rodar("preparo dos vídeos", "npx", ["tsx", "scripts/local/preparar-ambiente.ts"]);

console.log("\nPronto. Suba o Connect com:\n  node scripts/local/com-banco-local.mjs npx next start -p 3100\n(reinicie o servidor se ele já estava no ar: o banco antigo foi apagado)");
