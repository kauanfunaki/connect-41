#!/usr/bin/env node
// O robô do Societário (30/10/2026): roda na máquina do TI, ligada o tempo
// todo, e executa nos sites dos órgãos o que o Connect põe na fila.
//
// A máquina fica atrás do firewall do escritório, então é ela que vai buscar
// trabalho: a cada volta pede ao Connect a próxima tarefa (o pedido vale como
// sinal de vida da automação no Ops Center), executa num navegador de verdade
// e devolve o resultado. O certificado e a senha, quando um órgão pedir, são
// lidos do cofre na hora e só existem na memória deste processo: nada vai para
// o Connect, nem para o disco.
//
// O que ele sabe fazer hoje (o mesmo nome do catálogo em src/lib/robo/tarefas.ts):
//   imprimir_alvara — consulta a inscrição municipal no site do alvará de
//     Curitiba, marca o aceite de acessibilidade (decisão do Kauan, 15/09) e
//     devolve o PDF. Não decide nada além de "achou o botão de imprimir": o
//     número, a data e o que fazer com "não encontrado" são decididos no Connect.
//
// Uso:
//   node scripts/robo-societario.mjs --config=.local/robo-societario.json [--once | --watch | --status | --stop]
//   node scripts/robo-societario.mjs --ensaio-alvara --inscricao=<8 dígitos>   (para antes do aceite)
//   node scripts/robo-societario.mjs --testar-certificado --url=<site> --pfx=<arquivo.pfx> --entrada=<título no cofre> [--origens=a,b]
// Roteiro completo em docs/ROBO-DO-SOCIETARIO.md.

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { access, mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const VERSAO = "2026-10-30";
const args = new Set(process.argv.slice(2).map((a) => a.split("=")[0]));
const value = (name, fallback = null) => {
  const hit = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : fallback;
};
const configPath = resolve(value("--config", process.env.ROBO_SOCIETARIO_CONFIG || ".local/robo-societario.json"));
const statePath = resolve(value("--state", process.env.ROBO_SOCIETARIO_STATE || configPath.replace(/\.json$/, "") + "-estado.json"));
const capturasDir = join(dirname(statePath), "capturas-do-robo");
const lockPath = `${statePath}.lock`;
const stopPath = `${statePath}.stop`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...m) => console.log(`[robo-societario] ${new Date().toISOString()}`, ...m);

// ─── configuração e estado ─────────────────────────────────────────────────

async function loadConfig() {
  const config = JSON.parse(await readFile(configPath, "utf8"));
  if (!config.baseUrl || !config.slug || !config.token) throw new Error("Configuração incompleta: baseUrl, slug e token são obrigatórios.");
  if (!/^https?:\/\//i.test(config.baseUrl)) throw new Error("baseUrl deve ser HTTP(S).");
  return {
    ...config,
    baseUrl: config.baseUrl.replace(/\/$/, ""),
    intervaloMs: Math.max(15_000, Number(config.intervaloMs) || 30_000),
    navegador: { visivel: config.navegador?.visivel !== false, canal: config.navegador?.canal || null },
  };
}
async function readState() { try { return JSON.parse(await readFile(statePath, "utf8")); } catch { return {}; } }
async function saveState(patch) {
  const state = { ...(await readState()), ...patch };
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

// ─── conversa com o Connect ───────────────────────────────────────────────

const CAPACIDADES = { imprimir_alvara: imprimirAlvara };

async function pedirTarefa(config) {
  const r = await fetch(`${config.baseUrl}/api/ops/watchers/${encodeURIComponent(config.slug)}/tarefas`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
    body: JSON.stringify({ capacidades: Object.keys(CAPACIDADES), versao: VERSAO }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`pedir tarefa: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
  return (await r.json()).tarefa;
}

/**
 * Devolve a tarefa. Com arquivo, multipart montado à mão: o Connect exige o
 * Content-Length, que o FormData do fetch nem sempre manda.
 */
async function devolver(config, id, devolucao, arquivo) {
  const url = `${config.baseUrl}/api/ops/watchers/${encodeURIComponent(config.slug)}/tarefas/${id}`;
  let body, headers = { authorization: `Bearer ${config.token}` };
  if (arquivo) {
    const fronteira = `----robo${Date.now().toString(16)}`;
    body = Buffer.concat([
      Buffer.from(`--${fronteira}\r\nContent-Disposition: form-data; name="resultado"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(devolucao)}\r\n`),
      Buffer.from(`--${fronteira}\r\nContent-Disposition: form-data; name="arquivo"; filename="${arquivo.nome}"\r\nContent-Type: ${arquivo.tipo}\r\n\r\n`),
      arquivo.dados,
      Buffer.from(`\r\n--${fronteira}--\r\n`),
    ]);
    headers = { ...headers, "content-type": `multipart/form-data; boundary=${fronteira}`, "content-length": String(body.length) };
  } else {
    body = JSON.stringify(devolucao);
    headers = { ...headers, "content-type": "application/json" };
  }
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const r = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(60_000) });
      const texto = await r.text();
      if (r.ok) return JSON.parse(texto);
      // 409: a tarefa não está mais com esta máquina (passou do prazo e voltou à fila).
      if (r.status < 500) throw Object.assign(new Error(`devolver: HTTP ${r.status} ${texto.slice(0, 160)}`), { definitivo: true });
      throw new Error(`devolver: HTTP ${r.status}`);
    } catch (err) {
      if (err.definitivo || tentativa === 3) throw err;
      await sleep(2_000 * tentativa);
    }
  }
}

// ─── uma volta ────────────────────────────────────────────────────────────

async function umaVolta(config) {
  const tarefa = await pedirTarefa(config);
  await saveState({ ultimaVolta: new Date().toISOString(), ultimoErro: null });
  if (!tarefa) return false;
  log(`tarefa ${tarefa.id}: ${tarefa.tipo} (tentativa ${tarefa.tentativa})`);
  const executar = CAPACIDADES[tarefa.tipo];
  let saida;
  try {
    saida = executar ? await comPrazo(executar(config, tarefa), 10 * 60_000) : { devolucao: { ok: false, motivo: `Esta máquina não sabe executar ${tarefa.tipo}.`, recuperavel: false } };
  } catch (err) {
    // Site fora do ar, tela que demorou, navegador que travou: tenta de novo.
    saida = { devolucao: { ok: false, motivo: `O robô falhou no site: ${String(err?.message || err).slice(0, 300)}`, recuperavel: true } };
  }
  const resposta = await devolver(config, tarefa.id, saida.devolucao, saida.arquivo ?? null);
  log(`tarefa ${tarefa.id}: devolvida, ficou ${resposta.status}`);
  await saveState({ ultimaTarefa: { id: tarefa.id, tipo: tarefa.tipo, status: resposta.status, em: new Date().toISOString() } });
  return true;
}

function comPrazo(promessa, ms) {
  return Promise.race([promessa, new Promise((_, rej) => setTimeout(() => rej(new Error(`passou de ${ms / 60_000} minutos`)), ms))]);
}

// ─── navegador ────────────────────────────────────────────────────────────

async function abrirNavegador(config, opcoesDoContexto = {}) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: !config.navegador.visivel, ...(config.navegador.canal ? { channel: config.navegador.canal } : {}) });
  const context = await browser.newContext({ acceptDownloads: true, locale: "pt-BR", ...opcoesDoContexto });
  return { browser, context };
}

async function capturar(page, id) {
  try {
    await mkdir(capturasDir, { recursive: true });
    const arquivo = join(capturasDir, `${id}.png`);
    await page.screenshot({ path: arquivo, fullPage: true });
    log(`captura da tela em ${arquivo}`);
  } catch {}
}

// ─── imprimir_alvara ──────────────────────────────────────────────────────

// O mesmo de src/lib/societario/orgaos/alvara-curitiba.ts. Se a prefeitura mudar
// a redação, o robô não marca: o Connect manda para alguém reler.
const CONSULTA_DO_ALVARA = "https://alvarafuncionamento.curitiba.pr.gov.br/client/alvara-licenca-localizacao";
const ACEITE =
  "Estou ciente da legislação específica de acessibilidade e, caso o estabelecimento " +
  "comercial não as atenda integralmente, adequarei para início das atividades.";
const espacos = (t) => String(t ?? "").replace(/\s+/g, " ").trim();

async function imprimirAlvara(config, tarefa, { ensaio = false } = {}) {
  const { inscricao } = tarefa.dados ?? {};
  if (!/^\d{8}$/.test(String(inscricao ?? ""))) return { devolucao: { ok: false, motivo: "A tarefa veio sem inscrição municipal de 8 dígitos.", recuperavel: false } };
  const { browser, context } = await abrirNavegador(config);
  const page = await context.newPage();
  try {
    await page.goto(CONSULTA_DO_ALVARA, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const campo = page.getByRole("textbox").first();
    await campo.waitFor({ timeout: 30_000 });
    await campo.fill(inscricao);
    await page.getByRole("button", { name: /consultar/i }).first().click();

    // Uma de três saídas: o botão de imprimir, a mensagem de não encontrado, ou outra tela.
    const imprimir = page.getByRole("button", { name: /imprimir/i }).first();
    const naoEncontrado = page.getByText(/n[ãa]o (foi )?encontrad|n[ãa]o h[áa] alvar/i).first();
    await Promise.any([imprimir.waitFor({ timeout: 45_000 }), naoEncontrado.waitFor({ timeout: 45_000 })]).catch(() => {});
    const texto = (await page.locator("body").innerText()).slice(0, 20_000);
    if (await naoEncontrado.isVisible().catch(() => false)) return { devolucao: { ok: true, resultado: { tela: "nao_encontrado", texto } } };
    if (!(await imprimir.isVisible().catch(() => false))) {
      await capturar(page, tarefa.id);
      return { devolucao: { ok: true, resultado: { tela: "outra", texto } } };
    }
    // No ensaio, para aqui: sem aceite, sem impressão, sem Connect.
    if (ensaio) {
      await capturar(page, "ensaio-do-alvara");
      return { ensaio: { tela: "encontrado", aceiteIgual: espacos(texto).includes(espacos(ACEITE)), texto: texto.slice(0, 1_500) } };
    }
    // O aceite só é marcado se o texto for o que o escritório decidiu aceitar.
    if (!espacos(texto).includes(espacos(ACEITE))) {
      await capturar(page, tarefa.id);
      return { devolucao: { ok: true, resultado: { tela: "encontrado", texto, aceite: null, aceiteMarcado: false } } };
    }
    await page.getByRole("checkbox").first().check();

    // "Imprimir alvará" abre o PDF numa aba nova, num endereço blob: (24/09).
    // Se o navegador baixar em vez de abrir, pega o download.
    const saida = Promise.any([
      context.waitForEvent("page", { timeout: 60_000 }).then((aba) => ({ aba })),
      page.waitForEvent("download", { timeout: 60_000 }).then((download) => ({ download })),
    ]);
    await imprimir.click();
    const { aba, download } = await saida;
    let dados;
    if (download) {
      dados = await readFile(await download.path());
    } else {
      await aba.waitForLoadState("load").catch(() => {});
      const b64 = await aba.evaluate(async () => {
        const r = await fetch(location.href);
        const bytes = new Uint8Array(await r.arrayBuffer());
        let s = "";
        for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(s);
      });
      dados = Buffer.from(b64, "base64");
    }
    const ehPdf = dados.subarray(0, 5).toString("latin1") === "%PDF-";
    if (!ehPdf) await capturar(page, tarefa.id);
    return {
      devolucao: { ok: true, resultado: { tela: "encontrado", texto, aceite: ACEITE, aceiteMarcado: true } },
      arquivo: ehPdf ? { nome: `alvara-${inscricao}.pdf`, tipo: "application/pdf", dados } : null,
    };
  } catch (err) {
    await capturar(page, tarefa.id);
    throw err;
  } finally {
    await browser.close().catch(() => {});
  }
}

// ─── teste do certificado (o primeiro risco: como o site pede o certificado) ─

/**
 * Lê a senha de uma entrada do cofre pelo keepassxc-cli. A senha mestra é
 * digitada aqui, sem eco, e vai pela entrada padrão do cli — como faz o
 * scripts/certificados/conferir-certificados.ps1. Nada é gravado.
 */
async function senhaDoCofre(cofre, entrada) {
  const cli = cofre.cli || "C:\\Program Files\\KeePassXC\\keepassxc-cli.exe";
  const mestra = await perguntarSemEco("Senha mestra do cofre: ");
  return new Promise((ok, falha) => {
    const p = spawn(cli, ["show", "-q", "-s", "-a", "Password", "-k", cofre.arquivoChave, cofre.arquivo, entrada], { windowsHide: true });
    let saida = "", erro = "";
    p.stdout.on("data", (d) => (saida += d));
    p.stderr.on("data", (d) => (erro += d));
    p.on("error", falha);
    p.on("close", (code) => (code === 0 ? ok(saida.replace(/\r?\n$/, "")) : falha(new Error(`keepassxc-cli saiu com ${code}: ${erro.trim().slice(0, 200) || "senha mestra ou arquivo-chave não abrem o cofre"}`))));
    p.stdin.end(`${mestra}\n`);
  });
}

function perguntarSemEco(pergunta) {
  return new Promise((ok) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(pergunta)) rl.output.write(s); };
    rl.question(pergunta, (resposta) => { rl.close(); process.stdout.write("\n"); ok(resposta); });
  });
}

/**
 * Abre o site com o certificado e deixa o navegador aberto para olhar. Serve
 * para o primeiro risco do mapa: se o site pede o certificado pela janela
 * comum (certificado de cliente), o Playwright resolve; se pedir extensão
 * (Web PKI e afins), o desenho muda antes de escrever o robô.
 */
async function testarCertificado() {
  const url = value("--url"), pfx = value("--pfx"), entrada = value("--entrada");
  if (!url || !pfx || !entrada) throw new Error("Use --url, --pfx e --entrada (o título da entrada no cofre).");
  const config = await loadConfig().catch(() => ({ navegador: { visivel: true, canal: null }, cofre: null }));
  const cofre = config.cofre;
  if (!cofre?.arquivo || !cofre?.arquivoChave) throw new Error("Preencha cofre.arquivo e cofre.arquivoChave na configuração.");
  const passphrase = await senhaDoCofre(cofre, entrada);
  const origens = (value("--origens") || new URL(url).origin).split(",").map((o) => o.trim()).filter(Boolean);
  const { browser, context } = await abrirNavegador({ navegador: { ...config.navegador, visivel: true } }, {
    clientCertificates: origens.map((origin) => ({ origin, pfxPath: resolve(pfx), passphrase })),
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  log(`aberto em ${page.url()}. Siga o login no navegador; ao terminar, aperte Enter aqui.`);
  await new Promise((ok) => createInterface({ input: process.stdin }).once("line", ok));
  log(`terminou em ${page.url()}`);
  await capturar(page, "teste-do-certificado");
  await browser.close();
}

// ─── laço ─────────────────────────────────────────────────────────────────

async function watch() {
  await mkdir(dirname(lockPath), { recursive: true });
  let lock;
  try { lock = await open(lockPath, "wx"); } catch { throw new Error("Já existe um robô rodando com esta configuração."); }
  const parar = async () => { await lock.close(); await unlink(lockPath).catch(() => {}); await unlink(stopPath).catch(() => {}); log("parado"); process.exit(0); };
  process.once("SIGINT", parar);
  process.once("SIGTERM", parar);
  const config = await loadConfig();
  log(`rodando como ${config.slug}, a cada ${config.intervaloMs / 1000} s`);
  while (true) {
    try { await access(stopPath); return parar(); } catch {}
    let trabalhou = false;
    try {
      trabalhou = await umaVolta(config);
    } catch (err) {
      log(`falha: ${err.message}`);
      await saveState({ ultimaVolta: new Date().toISOString(), ultimoErro: String(err.message).slice(0, 300) });
    }
    // Com trabalho, emenda a próxima; sem, espera a volta.
    if (!trabalhou) await sleep(config.intervaloMs);
  }
}

async function status() {
  let rodando = false;
  try { await access(lockPath); rodando = true; } catch {}
  console.log(JSON.stringify({ configPath, statePath, rodando, ...(await readState()) }, null, 2));
}

async function criarConfig() {
  await mkdir(dirname(configPath), { recursive: true });
  try { await access(configPath); throw new Error(`Arquivo já existe: ${configPath}`); } catch (e) { if (e.message.startsWith("Arquivo já existe")) throw e; }
  await writeFile(configPath, `${JSON.stringify({
    baseUrl: "https://app.useconnect.com.br",
    slug: "robo-societario",
    token: "ops_chave-gerada-no-ops-center",
    intervaloMs: 30000,
    navegador: { visivel: true, canal: null },
    cofre: { arquivo: "\\\\servidor\\41 Tech\\Certificados 41.kdbx", arquivoChave: "C:\\Robo\\certificados-41.keyx" },
  }, null, 2)}\n`, { mode: 0o600 });
  console.log(`Configuração criada em ${configPath}. Preencha a chave aqui, e só aqui: o robô nunca a mostra.`);
}

/**
 * Ensaio do alvará: consulta a inscrição e para antes do aceite. Não marca,
 * não imprime e não fala com o Connect — serve para ver, na máquina, se o robô
 * acha o campo e os botões antes da primeira tarefa de verdade.
 */
async function ensaiarAlvara() {
  const inscricao = String(value("--inscricao", "")).replace(/\D/g, "");
  const config = await loadConfig().catch(() => ({ navegador: { visivel: true, canal: null } }));
  const saida = await imprimirAlvara(config, { id: "ensaio-do-alvara", dados: { inscricao } }, { ensaio: true });
  console.log(JSON.stringify(saida.ensaio ?? saida.devolucao, null, 2));
}

try {
  if (args.has("--testar-certificado")) await testarCertificado();
  else if (args.has("--ensaio-alvara")) await ensaiarAlvara();
  else if (args.has("--once")) { const config = await loadConfig(); await umaVolta(config); }
  else if (args.has("--watch") || args.has("--start")) await watch();
  else if (args.has("--status")) await status();
  else if (args.has("--stop")) { await mkdir(dirname(stopPath), { recursive: true }); await writeFile(stopPath, `${new Date().toISOString()}\n`); console.log("Parada pedida; o robô para na próxima volta."); }
  else if (args.has("--config")) await criarConfig();
  else console.log("Uso: --config[=arquivo] | --once | --watch | --status | --stop | --ensaio-alvara --inscricao= | --testar-certificado --url= --pfx= --entrada=");
} catch (error) {
  console.error(`[robo-societario] ${error.message}`);
  process.exitCode = 1;
}
