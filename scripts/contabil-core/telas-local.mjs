// Passeio pelas telas do Contábil Core no app LOCAL (09/11/2026), com navegador de verdade.
//
// Pré-requisitos: banco local preparado (`preparar-demo-local.ts`) e o app rodando
// (`node scripts/local/com-banco-local.mjs npx next dev -p 3102`). A sessão é assinada com o
// JWT_ACCESS_SECRET do `.env.localdev` para o administrador do seed; nada sai da máquina.
//
//   node scripts/contabil-core/telas-local.mjs <pasta das capturas> [porta]

import { readFileSync } from "node:fs";
import { mkdir, access } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import mariadb from "mariadb";
import jwt from "jsonwebtoken";
import { chromium } from "playwright";

const saida = process.argv[2];
const porta = process.argv[3] ?? "3102";
if (!saida) throw new Error("Informe a pasta das capturas.");
await mkdir(saida, { recursive: true });

const env = Object.fromEntries(
  readFileSync(".env.localdev", "utf8")
    .split(/\r?\n/)
    .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const destino = new URL(env.DATABASE_URL);
if (!["127.0.0.1", "localhost"].includes(destino.hostname)) throw new Error("Só banco local.");
const db = await mariadb.createConnection({
  host: destino.hostname, port: Number(destino.port), user: decodeURIComponent(destino.username), password: decodeURIComponent(destino.password),
  database: destino.pathname.slice(1), allowPublicKeyRetrieval: true,
});
const [admin] = await db.query("SELECT id, tenantId FROM users WHERE email = 'adm6@41bpo.com.br' LIMIT 1");
const [empresa] = await db.query("SELECT id FROM core_empresas WHERE tenantId = ? AND deletedAt IS NULL ORDER BY createdAt LIMIT 1", [admin.tenantId]);
await db.end();
assert.ok(admin && empresa, "Rode antes o preparar-demo-local.ts.");

const base = `http://localhost:${porta}`;
const instalado = await access(chromium.executablePath()).then(() => true, () => false);
const browser = await chromium.launch({ headless: true, ...(instalado ? {} : { channel: "msedge" }) });
const contexto = await browser.newContext({ viewport: { width: 1366, height: 900 } });
await contexto.addCookies([{
  name: "access_token",
  value: jwt.sign({ sub: admin.id, tenantId: admin.tenantId, role: "ADMIN", sectors: ["contabil"], accessibleTenants: [admin.tenantId] }, env.JWT_ACCESS_SECRET, { expiresIn: "30m" }),
  url: base, httpOnly: true, sameSite: "Lax",
}]);
const page = await contexto.newPage();
const erros = [];
page.on("pageerror", (e) => erros.push(e.message));
page.setDefaultTimeout(60000);

const abrir = async (aba, extra = "") => {
  await page.goto(`${base}/contabil-core?empresa=${empresa.id}&aba=${aba}${extra}`, { timeout: 180000, waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Contábil Core", exact: true }).waitFor();
  await page.screenshot({ path: path.join(saida, `${aba}.png`), fullPage: true });
};

await abrir("importacoes");
assert.ok(await page.getByText("sicoob-jan-2026.ofx").count(), "lote importado aparece");

await abrir("neo");
await page.getByRole("button", { name: /Rodar o NEO/ }).click();
await page.getByText(/pendência\(s\):/).waitFor();
await page.screenshot({ path: path.join(saida, "neo-depois.png"), fullPage: true });

// Fase 3: marcar o grupo de PIX, criar a regra pela seleção (com simulação) e aplicar nos semelhantes.
await page.getByRole("button", { name: /PIX EMITIDO OUTRA IF/ }).first().click();
await page.getByLabel("Conta contábil").click();
await page.getByRole("option", { name: /Despesas bancárias/ }).click();
await page.getByLabel("Histórico do lançamento").fill("PAGAMENTO VIA PIX");
await page.getByRole("checkbox", { name: "Criar uma regra com esta seleção" }).check();
assert.equal(await page.getByLabel("Texto da regra").inputValue(), "PIX EMITIDO OUTRA IF", "sugestão pelo trecho comum");
await page.getByRole("button", { name: "Simular alcance" }).click();
await page.getByText(/Pega \d+ pendência/).waitFor();
await page.screenshot({ path: path.join(saida, "neo-regra.png"), fullPage: true });
await page.getByRole("button", { name: "Classificar e criar a regra" }).click();
await page.getByText(/regra criada/).first().waitFor();

await abrir("extrato");
assert.ok(await page.getByText("Classificada").count(), "transações classificadas no extrato");
// Reclassificar a primeira transação classificada.
await page.getByRole("button", { name: "Reclassificar" }).first().click();
await page.getByRole("dialog").getByLabel("Conta contábil").click();
await page.getByRole("option", { name: /Energia elétrica/ }).click();
await page.getByRole("dialog").getByLabel("Histórico do lançamento").fill("AJUSTE DE CONTA");
await page.getByRole("dialog").getByLabel("Motivo").fill("conta errada");
await page.getByRole("dialog").getByRole("button", { name: "Reclassificar" }).click();
await page.getByText("Transação reclassificada.").waitFor();
await page.screenshot({ path: path.join(saida, "extrato.png"), fullPage: true });
for (const aba of ["regras", "contrapartes", "configuracoes"]) await abrir(aba);

// O arquivo do Domínio, baixado pela tela.
await abrir("registros");
const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Baixar arquivo" }).click()]);
const arquivo = path.join(saida, download.suggestedFilename());
await download.saveAs(arquivo);
const linhas = readFileSync(arquivo, "utf8").replace(/^﻿/, "").trim().split("\r\n");
assert.equal(linhas.length, 7, "sete lançamentos no TXT de janeiro (o PIX para pessoa física segue pendente)");
assert.ok(linhas.some((l) => l.startsWith("05/01/2026;") && l.endsWith(";39,9;;PGTO REF AJUSTE DE CONTA;;;;")), "linha reclassificada no layout do Domínio");
await page.screenshot({ path: path.join(saida, "registros.png"), fullPage: true });

await browser.close();
if (erros.length) {
  console.error("Erros no navegador:", erros);
  process.exitCode = 1;
} else {
  console.log(`telas ok; capturas em ${saida}`);
}
