import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { chromium } from "playwright";
import { getPrisma } from "../../src/lib/prisma";
import { bancoFiscalLocal } from "../../src/lib/fiscal/local/ambiente";
import { COOKIE_SETOR_ATIVO } from "../../src/lib/auth/activeSector";

async function main() {
  if (!bancoFiscalLocal()) throw new Error("Verificação aceita somente connect41 local:3307.");
  const prisma = getPrisma();
  const modelo = await prisma.localFiscalScenario.findFirst();
  if (!modelo) throw new Error("Prepare o cenário fiscal local primeiro.");
  const senha = randomUUID();
  const id = randomUUID();
  const email = `fiscal-validacao-${id}@exemplo.invalido`;
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    await prisma.user.create({ data: { id, tenantId: modelo.tenantId, name: "Validação local temporária", email, role: "ADMIN", passwordHash: await hash(senha, 10) } });
    await prisma.localFiscalScenario.create({ data: { userId: id, tenantId: modelo.tenantId, data: modelo.data!, favorites: [] } });
    const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 1440, height: 1000 } });
    const login = await context.request.post("/api/auth/login", { data: { email, password: senha } });
    assert.equal(login.status(), 200, "Login local precisa funcionar.");
    await context.addCookies([{ name: COOKIE_SETOR_ATIVO, value: "fiscal", url: "http://localhost:3100" }]);
    const page = await context.newPage();
    await page.goto("/autorizacoes?regime=LUCRO_REAL&q=Modelo");
    const card = page.getByRole("link", { name: /^Ativas/ });
    await card.click();
    await page.waitForURL(/situacao=ativa/);
    assert.equal(await card.getAttribute("aria-current"), "true");
    assert.equal(new URL(page.url()).searchParams.get("regime"), "LUCRO_REAL");
    await card.click();
    await page.waitForURL((url) => !url.searchParams.has("situacao"));
    assert.equal(await card.getAttribute("aria-current"), null);
    assert.equal(new URL(page.url()).searchParams.get("q"), "Modelo");
    await page.goto("/autorizacoes");
    const alinhamentos = await page.locator(".c41-tabela tbody td").evaluateAll((cells) => cells.map((cell) => getComputedStyle(cell).verticalAlign));
    assert(alinhamentos.length > 0 && alinhamentos.every((value) => value === "middle"));
    const nav = page.locator("aside a[href='/autorizacoes']");
    assert.equal(await nav.count(), 1, "Autorizações precisa ter um link direto na lateral.");
    await page.goto("/fiscal/entregas");
    await page.getByText("Salvo no banco local", { exact: true }).waitFor();
    const estadoAntes = await prisma.localFiscalScenario.findUniqueOrThrow({ where: { tenantId_userId: { tenantId: modelo.tenantId, userId: id } } });
    const quantidadeAntes = (estadoAntes.data as { arquivos: unknown[] }).arquivos.length;
    await page.getByRole("button", { name: "Gerar versão de teste", exact: true }).click();
    await page.getByText("Nova versão de teste criada. Continue em Validação.", { exact: true }).waitFor();
    const estadoDepois = await prisma.localFiscalScenario.findUniqueOrThrow({ where: { tenantId_userId: { tenantId: modelo.tenantId, userId: id } } });
    assert.equal((estadoDepois.data as { arquivos: unknown[] }).arquivos.length, quantidadeAntes + 1);
    assert.equal(estadoDepois.revision, estadoAntes.revision + 1);
    await page.reload();
    await page.getByText("Salvo no banco local", { exact: true }).waitFor();
    const arquivo = (estadoDepois.data as { arquivos: { nome: string }[] }).arquivos[0];
    await page.getByText(arquivo.nome).waitFor();
    await page.goto("/fiscal/classificacao");
    await page.getByRole("checkbox", { name: "Selecionar esta página", exact: true }).check();
    await page.getByRole("button", { name: /^Aplicar a \d+ selecionado/ }).click();
    await page.getByText(/documento\(s\) classificados\. Apuração/).waitFor();
    await page.getByText(/versão\(ões\) de teste precisam de revisão/).waitFor();
    await page.goto("/fiscal/entregas");
    await page.getByRole("button", { name: "Gerar versão de teste", exact: true }).click();
    await page.getByText("Nova versão de teste criada. Continue em Validação.", { exact: true }).waitFor();
    assert.equal(await page.getByText(/versão\(ões\) de teste precisam de revisão/).count(), 0, "Nova versão precisa limpar a revisão da obrigação regenerada.");
    await page.getByText("Substituída por nova versão", { exact: true }).waitFor();
    const chaves = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("connect41:fiscal:previa:")));
    assert.equal(chaves.length, 0, "O navegador não deve persistir cenários fiscais.");
    console.log("Verificação concluída: cartões alternam e preservam filtros, tabela centralizada, menu direto, geração persistida após recarregar e aviso de revisão resolvido pela nova versão.");
  } finally {
    await browser.close();
    // Remove somente a conta temporária criada por esta execução; nunca dados do usuário.
    await prisma.refreshToken.deleteMany({ where: { userId: id } });
    await prisma.user.deleteMany({ where: { id, email } });
    await prisma.$disconnect();
  }
}
main().catch((erro) => { console.error(erro instanceof Error ? erro.message : "Verificação falhou."); process.exit(1); });
