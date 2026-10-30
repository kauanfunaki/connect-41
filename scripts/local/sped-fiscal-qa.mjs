// Ambiente exclusivo do SPED Fiscal: não usa a base 3307 nem credenciais externas.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL("../..", import.meta.url)));
mkdirSync(".local/sped-fiscal", { recursive: true });
if (!existsSync(".local/sped-fiscal/tsconfig.json")) writeFileSync(".local/sped-fiscal/tsconfig.json", JSON.stringify({
  extends: "../../tsconfig.json", compilerOptions: { incremental: true, tsBuildInfoFile: "./tsconfig.tsbuildinfo" },
  include: ["../../next-env.d.ts", "../../src/**/*.ts", "../../src/**/*.tsx", "./next/types/**/*.ts", "./next/dev/types/**/*.ts"], exclude: ["../../node_modules"],
}));
const env = { ...process.env };
for (const arquivo of [".env", ".env.local", ".env.development", ".env.development.local", ".env.production", ".env.production.local"]) {
  if (!existsSync(arquivo)) continue;
  for (const linha of readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    const chave = linha.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/)?.[1];
    if (chave) env[chave] = ""; // Apenas nomes são utilizados; valores não são expostos.
  }
}
Object.assign(env, {
  DATABASE_URL: "mysql://root:sped-fiscal-fictional-only@127.0.0.1:33381/connect41?allowPublicKeyRetrieval=true&connection_limit=10",
  SPED_FISCAL_TEST_DATABASE_URL: "mysql://root:sped-fiscal-fictional-only@127.0.0.1:33381/connect41?allowPublicKeyRetrieval=true&connection_limit=10",
  JWT_ACCESS_SECRET: "fictional-sped-fiscal-access-secret-at-least-32",
  JWT_REFRESH_SECRET: "fictional-sped-fiscal-refresh-secret-at-least-32",
  JWT_ACCESS_TTL: "15m", JWT_REFRESH_TTL: "7d",
  SECRETS_ENCRYPTION_KEY: "fictional-sped-fiscal-encryption-key-32-characters",
  CRON_SERVICE_TOKEN: "fictional-sped-fiscal-cron-no-production",
  APP_PUBLIC_URL: "http://127.0.0.1:3127", APP_DOMAIN: "", SECTOR_HOST_SUFFIX: "", SECTOR_HOST_SUFFIX_ANTIGO: "",
  SPED_API_URL: "", SPED_API_TOKEN: "", GITHUB_SYNC_ENABLED: "false", NEXT_TELEMETRY_DISABLED: "1",
  SEED_ADMIN_PASSWORD: "SpedFiscalQA-Only-2026", SEED_ADMIN_EMAIL: "fiscal.qa@example.invalid",
  CONNECT_QA_DIST_DIR: ".local/sped-fiscal/next", NODE_ENV: process.argv.includes("build") || process.argv.some(a => /standalone[\\/]server\.js$/.test(a)) ? "production" : "development",
  PORT: "3127", HOSTNAME: "127.0.0.1",
});
// Os testes do relógio GitHub usam um motor simulado e exercitam a opção
// ligada. O servidor de QA continua com a coleta automática desligada.
if (process.argv.some(a => /vitest[\\/]/.test(a))) { env.NODE_ENV = "test"; delete env.GITHUB_SYNC_ENABLED; }
const [comando, ...args] = process.argv.slice(2);
if (!comando) throw new Error("Informe um comando para executar no ambiente fictício do SPED.");
const r = spawnSync(comando, args, { stdio: "inherit", env, shell: process.platform === "win32" });
process.exit(r.status ?? 1);
