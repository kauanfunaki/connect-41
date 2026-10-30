import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import ExcelJS from "exceljs";
const base = "http://127.0.0.1:3127";
const ids = JSON.parse(readFileSync(".local/sped-fiscal/qa.json", "utf8"));
mkdirSync(".local/sped-fiscal/capturas", { recursive: true });
const executavel = [`${process.env.PROGRAMFILES}/Google/Chrome/Application/chrome.exe`, `${process.env["PROGRAMFILES(X86)"]}/Microsoft/Edge/Application/msedge.exe`].find(existsSync);
const browser = await chromium.launch({ headless: true, ...(executavel ? { executablePath: executavel } : {}) });
const context = await browser.newContext({ baseURL: base, viewport: { width: 1366, height: 768 } });
await context.addCookies([{ name: "active_sector_code", value: "fiscal", url: base }]);
const page = await context.newPage(), falhas = [], verificacoes = [];
let concluido = false;
page.on("pageerror", e => falhas.push(e.message));
const conferir = (nome, condicao) => { verificacoes.push({ nome, passou: !!condicao }); console.log(`${condicao ? "OK" : "FALHOU"}: ${nome}`); if (!condicao) throw new Error(nome); };
async function abrirMenuSped() {
  const botao = page.locator("aside").getByRole("button", { name: "SPED", exact: true });
  if (!await botao.isVisible()) await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  if (page.viewportSize().width >= 1024) await botao.hover(); else await botao.click();
  const menu = page.getByRole("menu", { name: "SPED", exact: true });
  await menu.waitFor({ state: "visible" });
  return menu;
}
try {
  await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 60000 });
  conferir("Tela de login abre", (await page.locator('input[name="email"]').count()) === 1);
  await page.locator('input[name="email"]').fill("fiscal.qa@example.invalid");
  await page.locator('input[name="password"]').fill("SpedFiscalQA-Only-2026");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(u => !u.pathname.startsWith("/login") && !u.pathname.startsWith("/api"), { timeout: 60000 });
  conferir("Login real com dados fictícios", !page.url().includes("/login") && !page.url().includes("/api/"));
  const url = aba => `/fiscal/sped/${aba}?empresa=${ids.companyId}&competencia=2026-09`;
  for (const aba of ["fechamento", "apuracao", "classificacao", "gerar"]) {
    const resposta = await page.goto(url(aba), { waitUntil: "domcontentloaded" }); await page.locator('[data-testid="sped-estacao"][data-hidratado="true"]').waitFor();
    conferir(`Acesso direto a ${aba} sem motor`, resposta.status() === 200);
    const menu = await abrirMenuSped();
    conferir(`Quatro áreas no dropdown em ${aba}`, await menu.getByRole("menuitem").count() === 4);
    if (aba === "classificacao") await page.screenshot({ path: ".local/sped-fiscal/capturas/dropdown-sped.png", animations: "disabled" });
    await page.keyboard.press("Escape");
    conferir(`Sem abas principais dentro de ${aba}`, await page.getByRole("navigation", { name: "Áreas do SPED" }).count() === 0);
    conferir(`Empresa preservada em ${aba}`, new URL(page.url()).searchParams.get("empresa") === ids.companyId);
    if (aba === "gerar") conferir("Geração informa integração ausente", await page.getByText("Configure o motor em Administração", { exact: false }).count() > 0);
    await page.screenshot({ path: `.local/sped-fiscal/capturas/${aba}-desktop.png`, fullPage: true, animations: "disabled", caret: "initial" });
  }
  await page.goto(url("classificacao"), { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Classificar", exact: true }).first().click();
  await page.getByRole("dialog").waitFor();
  conferir("Editor abre em painel lateral", await page.getByRole("dialog").count() === 1);
  await page.getByRole("dialog").locator('input[name="observacao"]').fill("Conferido no navegador do laboratório fictício");
  const salvamento = page.waitForResponse(r => r.url().includes("/api/fiscal/sped/local/acao") && r.request().method() === "POST");
  await page.getByRole("dialog").getByRole("button", { name: "Salvar", exact: true }).click();
  conferir("Decisão gravada pelo painel do navegador", (await salvamento).status() === 200);
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="sped-estacao"][data-hidratado="true"]').waitFor();
  await page.getByRole("button", { name: "Classificar", exact: true }).first().click();
  conferir("Decisão persiste ao atualizar a página", await page.getByRole("dialog").locator('input[name="observacao"]').inputValue() === "Conferido no navegador do laboratório fictício");
  await page.getByRole("dialog").getByRole("button", { name: "Fechar", exact: true }).click();
  const nomeCsv = `apoio-ui-${Date.now()}.csv`;
  const csvFicticio = `identidade;competencia;categoria;documento;nome;dataPagamento;bruto;liquido\nUI-${Date.now()};2026-09;recibo;01234567890;Pessoa ficticia do navegador;2026-09-20;20.00;20.00`;
  await page.getByRole("button", { name: "Importar documentos e consultar resultados", exact: false }).click();
  await page.getByLabel("Arquivos para importar").setInputFiles({ name: nomeCsv, mimeType: "text/csv", buffer: Buffer.from(csvFicticio) });
  await page.getByRole("button", { name: "Importar no Connect", exact: true }).click();
  await page.waitForFunction(nome => [...document.querySelectorAll("tr")].some(r => r.textContent.includes(nome) && r.textContent.includes("concluido")), nomeCsv);
  conferir("Importação processada pelo navegador", true);
  await (await abrirMenuSped()).getByRole("menuitem", { name: "Apuração", exact: true }).click();
  await page.waitForURL(u => u.pathname === "/fiscal/sped/apuracao");
  await page.getByRole("combobox", { name: "Obrigação", exact: true }).waitFor();
  conferir("Troca livre preserva contexto", new URL(page.url()).searchParams.get("competencia") === "2026-09" && new URL(page.url()).searchParams.get("empresa") === ids.companyId);
  await page.getByRole("button", { name: /^Empresa:/ }).click();
  await page.getByRole("option", { name: /Filial/ }).click();
  await page.waitForURL(u => u.searchParams.get("empresa") === ids.filialId);
  conferir("Filtro do BPO troca empresa mantendo a aba e o mês", new URL(page.url()).pathname === "/fiscal/sped/apuracao" && new URL(page.url()).searchParams.get("competencia") === "2026-09");
  await page.goBack();
  await page.waitForURL(u => u.searchParams.get("empresa") === ids.companyId);
  await page.goForward();
  await page.waitForURL(u => u.searchParams.get("empresa") === ids.filialId);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="sped-estacao"][data-hidratado="true"]').waitFor();
  conferir("Contexto preservado em voltar, avançar e atualizar", new URL(page.url()).pathname === "/fiscal/sped/apuracao" && new URL(page.url()).searchParams.get("empresa") === ids.filialId && new URL(page.url()).searchParams.get("competencia") === "2026-09");
  await page.goto(url("apuracao"), { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="sped-estacao"][data-hidratado="true"]').waitFor();
  const aguardarXlsx = page.waitForEvent("download");
  await page.getByRole("link", { name: "Excel", exact: true }).click();
  const xlsx = await aguardarXlsx;
  await xlsx.saveAs(".local/sped-fiscal/apuracao-navegador.xlsx");
  conferir("Exportação Excel real", !await xlsx.failure() && readFileSync(".local/sped-fiscal/apuracao-navegador.xlsx").subarray(0, 2).toString() === "PK");
  const livroExportado = new ExcelJS.Workbook();
  await livroExportado.xlsx.readFile(".local/sped-fiscal/apuracao-navegador.xlsx");
  const telaIcms = await page.getByRole("row").filter({ has: page.getByRole("cell", { name: "ICMS", exact: true }) }).getByRole("cell").allTextContents();
  const linhaIcms = livroExportado.getWorksheet("Apuração").getRow(2);
  conferir("Excel confere com os cinco valores de ICMS exibidos", telaIcms.slice(1).every((v, i) => Number(v.replace(/[^\d,.-]/g, "").replaceAll(".", "").replace(",", ".")) === linhaIcms.getCell(i + 2).value));
  const aguardarCsv = page.waitForEvent("download");
  await page.getByRole("link", { name: "CSV", exact: true }).click();
  const csv = await aguardarCsv;
  await csv.saveAs(".local/sped-fiscal/apuracao-navegador.csv");
  conferir("Exportação CSV real", !await csv.failure() && readFileSync(".local/sped-fiscal/apuracao-navegador.csv", "utf8").includes("CFOP"));
  for (const [nome, largura, escala, dark] of [["mobile", 390, 1, false], ["escala-125", 1093, 1.25, false], ["escala-150", 910, 1.5, true], ["escala-200", 683, 2, true]]) {
    await page.setViewportSize({ width: largura, height: Math.round(768 / escala) }); await page.emulateMedia({ colorScheme: dark ? "dark" : "light" });
    await context.addCookies([{ name: "theme", value: dark ? "dark" : "light", url: base }]);
    await page.goto(url("fechamento"), { waitUntil: "domcontentloaded" }); await page.locator('[data-testid="sped-estacao"][data-hidratado="true"]').waitFor();
    const menu = await abrirMenuSped();
    conferir(`Dropdown acessível em ${nome}`, await menu.getByRole("menuitem").count() === 4);
    await page.screenshot({ path: `.local/sped-fiscal/capturas/fechamento-${nome}.png`, fullPage: true, animations: "disabled", caret: "initial" });
    await menu.getByRole("menuitem", { name: "Gerar SPED", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.waitForURL(u => u.pathname === "/fiscal/sped/gerar");

  }
  conferir("Sem exceções no navegador", falhas.length === 0);
  concluido = true;
} catch(e) {
  falhas.push(e.message); await page.screenshot({ path: ".local/sped-fiscal/capturas/erro.png", fullPage: true }); throw e;
} finally {
  writeFileSync(".local/sped-fiscal/validacao-ui.json", JSON.stringify({ verificacoes, falhas }, null, 2));
  await browser.close();
  console.log(JSON.stringify({ verificacoes: verificacoes.length, passou: concluido && verificacoes.every(v => v.passou), falhas }));
}
