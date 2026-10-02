#!/usr/bin/env node
// Roda um comando com o ambiente LOCAL do Connect (`.env.localdev`), e só com ele.
//
//   node scripts/local/com-banco-local.mjs npx prisma migrate deploy
//   node scripts/local/com-banco-local.mjs npx tsx prisma/seed.ts
//   node scripts/local/com-banco-local.mjs npx next start -p 3100
//
// Existe por causa do `.env`: ele aponta para a PRODUÇÃO, e Prisma, Next e tsx o
// leem sozinhos. Este lançador põe as variáveis locais no ambiente antes (o
// `.env` não sobrescreve o que já está definido — ver prisma.config.ts) e
// **recusa** rodar se a DATABASE_URL não for de 127.0.0.1/localhost. É a mesma
// família de guarda do `BANCO_ESPERADO`: comando de banco no lugar errado não
// avisa, só estraga.

import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const ARQUIVO = ".env.localdev";
if (!existsSync(ARQUIVO)) {
  console.error(`Falta ${ARQUIVO}. Veja scripts/local/README.md.`);
  process.exit(1);
}

const local = {};
for (const linha of readFileSync(ARQUIVO, "utf8").split(/\r?\n/)) {
  const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) local[m[1]] = m[2];
}

let host;
try {
  host = new URL(local.DATABASE_URL ?? "").hostname;
} catch {
  host = "";
}
if (host !== "127.0.0.1" && host !== "localhost") {
  console.error(`Recusado: a DATABASE_URL de ${ARQUIVO} não é local (host "${host || "?"}").`);
  process.exit(1);
}

const [comando, ...args] = process.argv.slice(2);
if (!comando) {
  console.error("Uso: node scripts/local/com-banco-local.mjs <comando> [args…]");
  process.exit(1);
}

// O que vem do arquivo GANHA do ambiente do terminal: uma DATABASE_URL de
// produção exportada na sessão não pode passar por cima da local.
const env = { ...process.env, ...local };
const r = spawnSync(comando, args, { stdio: "inherit", env, shell: process.platform === "win32" });
process.exit(r.status ?? 1);
