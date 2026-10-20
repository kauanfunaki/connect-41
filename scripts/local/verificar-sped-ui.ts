import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { hash } from "bcryptjs";
import { chromium, type Page } from "playwright";
import { getPrisma } from "../../src/lib/prisma";
import { bancoFiscalLocal } from "../../src/lib/fiscal/local/ambiente";
import { criarCenarioFiscalLocal } from "../../src/lib/fiscal/local/cenario";
import { COOKIE_SETOR_ATIVO } from "../../src/lib/auth/activeSector";
import { type Cenario } from "../../src/lib/fiscal/previa/cenario";

async function main() {
  if (!bancoFiscalLocal()) throw new Error("Verificação aceita somente connect41 local:3307.");
  const baseURL = process.env.SPED_QA_URL || "http://localhost:3100";
  const url = new URL(baseURL);
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("A interface de teste precisa ser local.");
  const prisma = getPrisma();
  const modelo = await prisma.localFiscalScenario.findFirst();
  if (!modelo) throw new Error("O banco local precisa ter um cenário fiscal preparado.");
  const id = randomUUID();
  const email = `sped-ui-${id}@exemplo.invalido`;
  const senha = randomUUID();
  const pasta = resolve(".local/sped-qa/evidencias");
  mkdirSync(pasta, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const erros: string[] = [];
  const avisosDoProfiler: string[] = [];
  const registrarDiagnostico = (texto: string) => {
    // Diagnóstico específico do profiler React/Next; não excluir outros erros.
    if (texto.includes("Failed to execute 'measure' on 'Performance'") && texto.includes("cannot have a negative time stamp")) avisosDoProfiler.push(texto);
    else erros.push(texto);
  };
  try {
    await prisma.user.create({ data: { id, tenantId: modelo.tenantId, name: "Validação SPED fictícia", email, role: "ADMIN", passwordHash: await hash(senha, 10) } });
    await prisma.localFiscalScenario.create({ data: { userId: id, tenantId: modelo.tenantId, data: criarCenarioFiscalLocal(), favorites: [] } });
    const context = await browser.newContext({ baseURL, viewport: { width: 1366, height: 768 } });
    context.on("page", (page) => {
      page.on("pageerror", (erro) => registrarDiagnostico(erro.stack || erro.message));
      page.on("console", (msg) => {
        if (msg.type() !== "error") return;
        registrarDiagnostico(msg.text());
      });
    });
    const login = await context.request.post("/api/auth/login", { data: { email, password: senha } });
    assert.equal(login.status(), 200, "Login local precisa funcionar.");
    await context.addCookies([{ name: COOKIE_SETOR_ATIVO, value: "fiscal", url: baseURL }]);
    const page = await context.newPage();
    page.setDefaultTimeout(45000);
    const estado = async () => (await prisma.localFiscalScenario.findUniqueOrThrow({ where: { tenantId_userId: { tenantId: modelo.tenantId, userId: id } } })).data as unknown as Cenario;
    const salvo = async () => { await page.getByText("Salvo no banco local", { exact: true }).waitFor(); };
    const ir = async (path: string) => {
      await page.goto(path); await salvo();
      await page.evaluate(() => new Promise<void>((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok()))));
    };
    const controlar = async (nome: string) => { await page.getByRole("button", { name: nome, exact: true }).first().click(); await salvo(); };
    await ir("/fiscal/operacao");
    const sped = page.locator("aside").getByRole("button", { name: "SPED", exact: true });
    assert.equal(await sped.count(), 1);
    for (const label of ["SPED gerados", "Executar"]) assert.equal(await page.locator("aside").getByRole("link", { name: label, exact: true }).count(), 0);
    await sped.hover();
    const submenu = page.getByRole("menu", { name: "SPED", exact: true });
    await submenu.waitFor();
    for (const label of ["Classificação e apuração", "SPED gerados", "Executar"]) assert.equal(await submenu.getByRole("menuitem", { name: label, exact: true }).count(), 1);
    await page.screenshot({ path: resolve(pasta, "menu-sped-aberto.png"), animations: "disabled", caret: "initial" });
    await page.keyboard.press("Escape");
    await sped.press("ArrowDown");
    await submenu.waitFor();
    assert.equal(await submenu.getByRole("menuitem", { name: "Classificação e apuração", exact: true }).evaluate((el) => document.activeElement === el), true);
    await page.keyboard.press("ArrowDown");
    assert.equal(await submenu.getByRole("menuitem", { name: "SPED gerados", exact: true }).evaluate((el) => document.activeElement === el), true);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("main").getByRole("tab").count(), 2);
    assert.equal(await page.locator("main").getByRole("link", { name: "Classificação", exact: true }).count(), 0);
    assert((await page.getByRole("tab", { name: "Executar", exact: true }).boundingBox())!.y < (await page.getByRole("heading", { level: 1 }).boundingBox())!.y);

    await controlar("Retentar erros");
    await controlar("Solicitar retentar erros");
    await controlar("Simular início");
    await controlar("Simular conclusão");
    assert.equal((await estado()).documentos.filter((d) => d.estabelecimentoId === "aurora-pr" && d.competencia === "2026-10" && d.estado === "Rejeitado").length, 0);
    const antes = (await estado()).documentos.length;
    await controlar("Extração paralela");
    await controlar("Solicitar extração paralela");
    await controlar("Simular início");
    await controlar("Simular conclusão");
    assert((await estado()).documentos.length > antes);

    await ir("/fiscal/classificacao?situacao=Pendente");
    assert.equal(await page.locator("main").getByRole("tablist").count(), 0);
    const menu = page.locator("main nav[aria-label='Abas']");
    assert.equal(await menu.getByRole("link").count(), 5);
    assert((await menu.boundingBox())!.y < (await page.getByRole("heading", { level: 1 }).boundingBox())!.y);
    await page.getByRole("checkbox", { name: "Selecionar esta página", exact: true }).check();
    await page.getByRole("button", { name: /^Aplicar a \d+ selecionado/ }).click();
    await salvo();
    await ir("/fiscal/icms-ipi");
    assert.equal(await page.locator("main").getByRole("tablist").count(), 0);
    await controlar("Simular apuração");
    await controlar("Fechar competência");

    await ir("/fiscal/operacao?aba=executar&secao=gerar");
    await escolher(page, "Tipo do arquivo", "Original");
    await controlar("Solicitar geração de teste");
    await controlar("Simular início");
    await controlar("Simular conclusão");
    const gerado = (await estado()).arquivos[0];
    assert(gerado?.resumo, "A geração precisa registrar o resumo da versão.");
    await ir("/fiscal/entregas");
    assert.equal(await page.locator("main nav[aria-label='Abas']").count(), 0);
    assert.equal(await page.locator("main").getByRole("tablist").count(), 0);
    await page.getByRole("button", { name: `Opções de ${gerado.nome}`, exact: true }).click();
    await page.getByText("Validar", { exact: true }).click();
    await controlar("Simular validação");
    assert.equal((await estado()).arquivos[0].validacao, "Aprovado");
    await page.keyboard.press("Escape");
    await controlar("Ver prévia");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("dialog").getByRole("button", { name: "Baixar prévia de teste", exact: true }).click();
    const download = await downloadPromise;
    await download.saveAs(resolve(pasta, "amostra.txt"));
    assert(readFileSync(resolve(pasta, "amostra.txt"), "utf8").includes("SEM VALIDADE FISCAL"));
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: `Opções de ${gerado.nome}`, exact: true }).click();
    await page.getByText("Registrar entrega", { exact: true }).click();
    await controlar("Confirmar entrega simulada");
    assert((await estado()).arquivos[0].protocolo.startsWith("TESTE-"));
    await page.keyboard.press("Escape");
    await page.reload(); await salvo();
    await page.getByRole("button", { name: `Opções de ${gerado.nome}`, exact: true }).waitFor();
    assert.equal((await estado()).arquivos[0].id, gerado.id);
    await page.getByRole("button", { name: `Opções de ${gerado.nome}`, exact: true }).click();
    await page.getByText("Consultar apuração", { exact: true }).click();
    await page.getByRole("dialog", { name: `Apuração · ${gerado.nome}` }).waitFor();
    await page.getByRole("dialog").getByRole("cell", { name: "Receita", exact: true }).waitFor();
    await page.keyboard.press("Escape");

    await ir("/fiscal/operacao");
    await controlar("Extração única");
    await controlar("Solicitar extração única");
    const falhaId = (await estado()).execucoes[0].id;
    await controlar("Simular início");
    await controlar("Simular falha");
    await page.getByRole("tab", { name: "Histórico", exact: true }).click(); await salvo();
    await controlar("Nova tentativa");
    const apos = await estado();
    assert.equal(apos.execucoes.find((e) => e.id === falhaId)?.estado, "Erro");
    assert.equal(apos.execucoes[0].tentativaDe, falhaId);
    await controlar("Cancelar pedido");
    await controlar("Ver log");
    await page.getByRole("heading", { name: /^Log ·/ }).waitFor();

    for (const [path, nome] of [["/fiscal/classificacao", "classificacao"], ["/fiscal/icms-ipi", "apuracao"], ["/fiscal/entregas", "gerados"], ["/fiscal/operacao?secao=gerar", "executar"], ["/fiscal/operacao?aba=historico", "historico"]]) {
      await ir(path);
      for (const tema of ["light", "dark"]) {
        await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), tema);
        await page.screenshot({ path: resolve(pasta, `${nome}-${tema}.png`), fullPage: false, animations: "disabled", caret: "initial" });
      }
      for (const escala of [1, 1.25, 1.5, 2]) {
        await page.setViewportSize({ width: Math.floor(1366 / escala), height: Math.floor(768 / escala) });
        const largura = await page.evaluate(() => ({ conteudo: document.documentElement.scrollWidth, tela: document.documentElement.clientWidth }));
        assert(largura.conteudo <= largura.tela + 1, `${nome} transborda a área útil em ${escala * 100}%.`);
        if (escala === 2) await page.screenshot({ path: resolve(pasta, `${nome}-area-200.png`), fullPage: false, animations: "disabled", caret: "initial" });
        if (escala === 2 && nome === "executar") {
          const acao = page.getByRole("button", { name: "Solicitar geração de teste", exact: true });
          await acao.scrollIntoViewIfNeeded();
          assert(await acao.isVisible(), "A ação de geração precisa continuar acessível em área útil de 200%.");
          await page.screenshot({ path: resolve(pasta, "executar-acoes-area-200.png"), animations: "disabled", caret: "initial" });
        }
      }
      await page.setViewportSize({ width: 1366, height: 768 });
    }
    await context.addCookies([{ name: "c41_menu", value: "recolhido", url: baseURL }]);
    await ir("/fiscal/classificacao");
    await page.screenshot({ path: resolve(pasta, "menu-recolhido.png"), animations: "disabled", caret: "initial" });
    assert.equal(await page.locator("aside button[aria-current='true']").count(), 1);
    await sped.click();
    await submenu.waitFor();
    await submenu.getByRole("menuitem", { name: "SPED gerados", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/fiscal/entregas");
    await salvo();
    assert.equal(new URL(page.url()).pathname, "/fiscal/entregas");
    await page.setViewportSize({ width: 390, height: 780 });
    await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
    await sped.click();
    await submenu.waitFor();
    const limites = (await submenu.boundingBox())!;
    assert(limites.x >= 0 && limites.x + limites.width <= 391, "O submenu precisa caber na tela do celular.");
    await page.screenshot({ path: resolve(pasta, "menu-sped-celular.png"), animations: "disabled", caret: "initial" });
    await submenu.getByRole("menuitem", { name: "Executar", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/fiscal/operacao");
    await salvo();
    assert.equal(new URL(page.url()).pathname, "/fiscal/operacao");
    await page.setViewportSize({ width: 1366, height: 768 });
    await ir("/fiscal/classificacao?aba=apoio");
    assert(new URL(page.url()).searchParams.get("grupo") === "apoio");
    assert.equal(await page.locator("main").getByRole("tablist").count(), 0);
    const resultado = { status: erros.length ? "failed" : "passed", fluxo: "passed", persistencia: "passed", download: "passed", tentativas: "passed", layout: "passed", erros, avisosDoProfiler: [...new Set(avisosDoProfiler)], evidencias: pasta };
    writeFileSync(resolve(pasta, "resultado-ui.json"), JSON.stringify(resultado, null, 2));
    assert.equal(erros.length, 0, erros.join("\n"));
    console.log(JSON.stringify(resultado));
  } finally {
    await browser.close();
    await prisma.refreshToken.deleteMany({ where: { userId: id } });
    await prisma.user.deleteMany({ where: { id, email } });
    await prisma.$disconnect();
  }
}
async function escolher(page: Page, nome: string, opcao: string) {
  await page.getByRole("combobox", { name: nome, exact: true }).click();
  await page.getByRole("option", { name: opcao, exact: true }).click();
}
main().catch((erro) => { console.error(erro instanceof Error ? erro.stack : "Verificação SPED falhou."); process.exit(1); });
