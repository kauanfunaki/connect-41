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
//   vigiar_ie — emite o CICAD na Receita do PR, com o certificado da 041 pela
//     Web PKI, e devolve a "Situação Atual". Ligado só com `vigiarIE.ativo`.
//
// Uso:
//   node scripts/robo-societario.mjs --config=.local/robo-societario.json [--once | --watch | --status | --stop]
//   node scripts/robo-societario.mjs --ensaio-alvara --inscricao=<inscrição municipal>   (para antes do aceite)
//   node scripts/robo-societario.mjs --testar-certificado --url=<site> --pfx=<arquivo.pfx> --entrada=<título no cofre> [--origens=a,b]
//   node scripts/robo-societario.mjs --mapear --nome=<órgão> --url=<site> --pfx=<arquivo.pfx> --entrada=<título no cofre> [--origens=a,b]
//   node scripts/robo-societario.mjs --ensaio-ie --inscricao=<IE> [--cnpj=<CNPJ>]   (lê sem falar com o Connect)
//   node scripts/robo-societario.mjs --preparar-perfil   (Chrome do robô, para instalar a Web PKI)
//   node scripts/robo-societario.mjs --mapear --nome=<órgão> --url=<site> --perfil   (site com Web PKI)
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

const CAPACIDADES = { imprimir_alvara: imprimirAlvara, vigiar_ie: vigiarIE };
// A vigilância da IE só entra quando ligada na configuração (ver vigiarIE).
const capacidadesLigadas = (config) => Object.keys(CAPACIDADES).filter((t) => t !== "vigiar_ie" || config.vigiarIE?.ativo === true);

async function pedirTarefa(config) {
  const r = await fetch(`${config.baseUrl}/api/ops/watchers/${encodeURIComponent(config.slug)}/tarefas`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
    body: JSON.stringify({ capacidades: capacidadesLigadas(config), versao: VERSAO }),
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
    // O detalhe técnico fica no log da máquina; o Connect mostra a frase.
    log(`tarefa ${tarefa.id}: ${String(err?.message || err).slice(0, 300)}`);
    saida = { devolucao: { ok: false, motivo: motivoDaFalha(err), recuperavel: true } };
  }
  const resposta = await devolver(config, tarefa.id, saida.devolucao, saida.arquivo ?? null);
  log(`tarefa ${tarefa.id}: devolvida, ficou ${resposta.status}`);
  await saveState({ ultimaTarefa: { id: tarefa.id, tipo: tarefa.tipo, status: resposta.status, em: new Date().toISOString() } });
  return true;
}

/**
 * A falha em palavras de quem vai ler na tela do robô (03/11/2026). A mesma
 * classificação mora em `motivoParaPessoa` (src/lib/robo/tarefas.ts), que
 * traduz também o que as máquinas antigas mandavam cru.
 */
function motivoDaFalha(err) {
  const m = String(err?.message || err);
  if (/has been closed|browser.*closed|Target closed/i.test(m)) return "A janela do navegador fechou antes de o robô terminar. Ele tenta de novo na próxima volta.";
  if (/passou de \d+ minutos|Timeout|timed out/i.test(m)) return "O site da prefeitura demorou demais para responder. O robô tenta de novo na próxima volta.";
  if (/net::|ENOTFOUND|ECONNRE|ERR_/i.test(m)) return "O site da prefeitura não abriu: fora do ar ou sem internet na máquina. O robô tenta de novo na próxima volta.";
  return "O robô não conseguiu terminar no site da prefeitura. Ele tenta de novo na próxima volta; o detalhe está no registro da máquina.";
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
// O que a prefeitura escreve quando não há o que imprimir. Se a redação mudar,
// a tela cai em "outra" e vai para alguém conferir — nunca para a impressão.
// "Alvará pendente de regularização, aguardando anuências obrigatórias dos
// órgãos de licenciamento." (03/11/2026)
const PENDENTE = /pendente de regulariza|aguardando anu[êe]ncia/i;
const NAO_ENCONTRADO = /n[ãa]o (foi )?encontrad|n[ãa]o h[áa] alvar/i;

async function imprimirAlvara(config, tarefa, { ensaio = false } = {}) {
  const { inscricao } = tarefa.dados ?? {};
  if (!/^\d{8}$/.test(String(inscricao ?? ""))) return { devolucao: { ok: false, motivo: "A tarefa veio sem inscrição municipal de 8 dígitos.", recuperavel: false } };
  const { browser, context } = await abrirNavegador(config);
  const page = await context.newPage();
  // Aviso em janela do navegador (alert) some sem deixar texto na página.
  const avisos = [];
  page.on("dialog", (d) => {
    avisos.push(d.message());
    d.accept().catch(() => {});
  });
  try {
    await page.goto(CONSULTA_DO_ALVARA, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const campo = page.getByRole("textbox").first();
    await campo.waitFor({ timeout: 30_000 });
    await campo.fill(inscricao);
    await page.getByRole("button", { name: /consultar/i }).first().click();

    // Uma de quatro saídas: o botão de imprimir, "não encontrado", "pendente de
    // regularização" ou outra tela. A pendência (03/11/2026) aparece num aviso
    // que some, então a página é lida a cada meio segundo, e não só no fim da
    // espera — esperar só o botão de imprimir deixava o robô parado 45 s
    // olhando o aviso.
    const imprimir = page.getByRole("button", { name: /imprimir/i }).first();
    let tela = null;
    let mensagem = null;
    for (const fim = Date.now() + 45_000; !tela && Date.now() < fim; ) {
      if (page.isClosed()) throw new Error("Target page, context or browser has been closed");
      const agora = `${avisos.join("\n")}\n${await page.locator("body").innerText().catch(() => "")}`;
      const linhaPendente = agora.split("\n").find((l) => PENDENTE.test(l));
      if (linhaPendente) {
        tela = "pendente";
        mensagem = espacos(linhaPendente).slice(0, 500);
      } else if (NAO_ENCONTRADO.test(agora)) tela = "nao_encontrado";
      else if (await imprimir.isVisible().catch(() => false)) tela = "encontrado";
      else await page.waitForTimeout(500);
    }
    const texto = (await page.locator("body").innerText()).slice(0, 20_000);
    if (tela === "pendente") {
      await capturar(page, ensaio ? "ensaio-do-alvara" : tarefa.id);
      return { devolucao: { ok: true, resultado: { tela, mensagem, texto } } };
    }
    if (tela === "nao_encontrado") return { devolucao: { ok: true, resultado: { tela, texto } } };
    if (tela !== "encontrado") {
      await capturar(page, ensaio ? "ensaio-do-alvara" : tarefa.id);
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

// ─── vigiar_ie ────────────────────────────────────────────────────────────
//
// Emite o CICAD na Receita do PR e devolve o texto do campo "Situação Atual".
// Mapeado contra a página real em 03/11/2026 (`--mapear --nome=cicad`):
//   1. receita.pr.gov.br/certificado mostra a "Lista de Certificados" da Web
//      PKI; a opção é "<NOME>:<CNPJ>", e o robô escolhe pelo CNPJ, não pela
//      posição — na máquina há mais de um certificado.
//   2. Logado, o menu tem "Emissão de CICAD", um link com chave da sessão.
//   3. O formulário (arinternet.pr.gov.br/cadicms/_d_cicad1.asp) tem o campo
//      eCadICMS, só dígitos, e o botão B1. IE errada dá o alerta
//      "CAD/ICMS Inválido."; certa abre o CICAD numa aba nova.
//   4. No CICAD, a situação fica entre "Situação Atual" e "Natureza Jurídica"
//      ("ATIVO - SIMPLES NACIONAL / … DESDE 08/2023"). Quem interpreta é o
//      Connect (`lerSituacaoDaIE`).
//
// Desligado por padrão: só pede `vigiar_ie` com `vigiarIE.ativo` na
// configuração, porque a primeira rodada lê a carteira inteira do PR.

const LOGIN_DA_RECEITA = "https://receita.pr.gov.br/certificado";
const CNPJ_DO_CERTIFICADO = "31052957000105";
const PAUSA_ENTRE_LEITURAS_MS = 15_000;
const SITUACAO_NO_CICAD = /Situa[çc][ãa]o Atual\s+([\s\S]+?)\s+Natureza Jur[íi]dica/i;
const RECUSA_DO_CICAD = /solicita[çc][ãa]o n[ãa]o p[ôo]de ser atendida/i;

// O Chrome da Receita fica aberto entre uma empresa e outra: um login por
// rodada, e não um por empresa. Fecha depois de alguns minutos sem uso.
let receita = null;
async function fecharReceita() {
  const r = receita;
  receita = null;
  await r?.context.close().catch(() => {});
}

async function vigiarIE(config, tarefa, { ensaio = false } = {}) {
  const inscricao = String(tarefa.dados?.inscricao ?? "").replace(/\D/g, "");
  const cnpj = String(tarefa.dados?.cnpj ?? "").replace(/\D/g, "");
  const pessoa = (motivo) => ({ devolucao: { ok: false, motivo, recuperavel: false } });
  if (inscricao.length < 8) return pessoa("A empresa não tem inscrição estadual completa no cadastro.");

  if (!receita || receita.page.isClosed()) {
    await fecharReceita();
    const { chromium } = await import("playwright");
    const context = await chromium.launchPersistentContext(perfilDir, {
      headless: false,
      ...(config.navegador?.chrome ? { executablePath: config.navegador.chrome } : { channel: "chrome" }),
      acceptDownloads: true,
      locale: "pt-BR",
      ignoreDefaultArgs: ["--disable-extensions"],
    });
    receita = { context, page: context.pages()[0] ?? (await context.newPage()), logado: false };
  }
  receita.usadoEm = Date.now();
  const { context, page } = receita;
  const avisos = [];
  const aoAviso = (d) => { avisos.push(espacos(d.message())); d.accept().catch(() => {}); };
  page.on("dialog", aoAviso);
  try {
    // O perfil guarda a sessão: depois de uma falha, ou de reiniciar o robô, a
    // Receita pode já estar logada, e aí a tela do certificado não mostra a
    // lista (03/11/2026). Confere antes de tentar entrar.
    if (!receita.logado) {
      await page.goto("https://receita.pr.gov.br/", { waitUntil: "domcontentloaded", timeout: 60_000 });
      if (await page.getByText("Emissão de CICAD").count()) receita.logado = true;
    }
    if (!receita.logado) {
      const doCertificado = config.vigiarIE?.cnpjDoCertificado || CNPJ_DO_CERTIFICADO;
      await page.goto(LOGIN_DA_RECEITA, { waitUntil: "domcontentloaded", timeout: 60_000 });
      // A lista é preenchida pela extensão, depois de a página carregar. Lê
      // todas as listas da página pelo textContent: o innerText de uma opção
      // fechada pode vir vazio.
      // O $$eval da página não achou lista nenhuma (03/11): ela pode estar num
      // frame ou dentro de um componente. O locator do Playwright entra nos
      // dois, então a busca é por ele, frame a frame.
      let vistas = [];
      const opcao = await (async () => {
        const fim = Date.now() + 30_000;
        while (Date.now() < fim) {
          vistas = [];
          for (const [f, frame] of page.frames().entries()) {
            const doFrame = await frame
              .locator("select")
              .evaluateAll((ls) => ls.flatMap((l, i) => [...l.options].map((o) => ({ lista: i, valor: o.value, texto: (o.textContent || "").trim() }))))
              .catch((e) => [{ erro: String(e?.message || e).slice(0, 120) }]);
            vistas.push(...doFrame.map((o) => ({ frame: f, ...o })));
          }
          const achou = vistas.find((o) => !o.erro && (o.texto + o.valor).replace(/\D/g, "").includes(doCertificado));
          if (achou) return achou;
          await sleep(1_000);
        }
        return null;
      })();
      if (!opcao) {
        log(`opções vistas na lista: ${JSON.stringify(vistas).slice(0, 600)} (${page.frames().length} frame(s): ${page.frames().map((f) => f.url()).join(" ")})`);
        await capturar(page, `${tarefa.id}-lista-de-certificados`);
        return pessoa(`O certificado de CNPJ ${doCertificado} não apareceu na lista da Receita do PR. Confira, na máquina do robô, se ele está instalado no Windows e se a extensão Web PKI está no Chrome do robô.`);
      }
      // O formulário fica num frame: a lista e o botão são procurados nele.
      const formulario = page.frames()[opcao.frame];
      await formulario.locator("select").nth(opcao.lista).selectOption(opcao.valor ? opcao.valor : { label: opcao.texto });
      await formulario.getByText("Login com Certificado").click();
      await page.getByText("Emissão de CICAD").first().waitFor({ state: "attached", timeout: 60_000 });
      receita.logado = true;
    } else {
      await page.goto("https://receita.pr.gov.br/", { waitUntil: "domcontentloaded", timeout: 60_000 });
    }

    // O link do menu leva a chave da sessão: vale o endereço da hora.
    const link = page.getByText("Emissão de CICAD").first();
    if (!(await link.count())) { receita.logado = false; throw new Error("sessão da Receita do PR caiu"); }
    const href = await link.getAttribute("href");
    await page.goto(new URL(href, page.url()).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    const campo = page.locator('input[name="eCadICMS"]');
    await campo.waitFor({ timeout: 30_000 });
    await campo.fill(inscricao);

    const abaNova = context.waitForEvent("page", { timeout: 30_000 }).catch(() => null);
    await page.locator('input[name="B1"]').click();
    // A aba nova ou o alerta, o que vier primeiro.
    let decidido = false;
    const resultado = await Promise.race([
      abaNova,
      (async () => { while (!decidido && !avisos.length) await sleep(250); return null; })(),
    ]);
    decidido = true;
    if (avisos.some((a) => /inv[áa]lid/i.test(a))) return pessoa(`A Receita do PR diz que a inscrição estadual ${inscricao} é inválida. Confira o cadastro da empresa.`);
    if (!resultado) throw new Error(`o CICAD não abriu${avisos.length ? `: ${avisos.join(" / ")}` : ""}`);

    try {
      await resultado.waitForLoadState("domcontentloaded", { timeout: 30_000 });
      // Ou o CICAD, ou a recusa ("Sua solicitação não pôde ser atendida").
      await resultado.getByText(/Situação Atual|não p[ôo]de ser atendida/).first().waitFor({ timeout: 30_000 });
      const texto = espacos(await resultado.locator("body").innerText());

      // A recusa traz o motivo, e ele é a situação do cliente, não falha do
      // robô: "Estabelecimento inativo no CAD/ICMS." (03/11/2026). O motivo
      // vai como situação, e o Connect decide — o que ele não conhece vai
      // para uma pessoa com o texto da Receita.
      if (RECUSA_DO_CICAD.test(texto)) {
        const motivo = texto.match(/Motivo:\s*(.+?)(?:\s+Orienta[çc][õo]es|$)/i)?.[1]?.trim();
        const ieNaRecusa = texto.match(/CAD\/ICMS:\s*([\d.\-/]+)/i)?.[1]?.replace(/\D/g, "");
        if (ensaio) return { ensaio: { recusa: true, motivo: motivo ?? null, ieNaRecusa, texto: texto.slice(0, 800) } };
        if (!motivo) { await capturar(resultado, tarefa.id); return pessoa("A Receita do PR recusou o CICAD sem dizer o motivo onde o robô espera. A captura está na máquina do robô."); }
        if (ieNaRecusa && ieNaRecusa !== inscricao) return pessoa(`A recusa da Receita do PR é de outra inscrição estadual (${ieNaRecusa}). Confira na Receita do PR.`);
        return { devolucao: { ok: true, resultado: { situacao: motivo.slice(0, 200) } } };
      }
      const situacao = texto.match(SITUACAO_NO_CICAD)?.[1]?.trim();
      const ieNoCicad = texto.match(/Inscri[çc][ãa]o no CAD\/ICMS\s+([\d.\-/]+)/i)?.[1]?.replace(/\D/g, "");
      const cnpjNoCicad = texto.match(/Inscri[çc][ãa]o CNPJ\s+([\d.\-/]+)/i)?.[1]?.replace(/\D/g, "");
      if (ensaio) return { ensaio: { situacao: situacao ?? null, ieNoCicad, cnpjNoCicad, texto: texto.slice(0, 800) } };
      if (!situacao) { await capturar(resultado, tarefa.id); return pessoa("O CICAD abriu, mas sem o campo Situação Atual onde o robô espera. A captura está na máquina do robô."); }
      if (ieNoCicad && ieNoCicad !== inscricao) return pessoa(`O CICAD que abriu é de outra inscrição estadual (${ieNoCicad}). Confira na Receita do PR.`);
      if (cnpj && cnpjNoCicad && cnpjNoCicad !== cnpj) return pessoa(`A inscrição estadual ${inscricao} é de outro CNPJ na Receita do PR (${cnpjNoCicad}). Confira o cadastro da empresa.`);
      return { devolucao: { ok: true, resultado: { situacao: situacao.slice(0, 200) } } };
    } finally {
      await resultado.close().catch(() => {});
    }
  } catch (err) {
    await capturar(page, tarefa.id);
    // Na dúvida sobre a sessão, a próxima tentativa entra de novo.
    if (receita) receita.logado = false;
    throw err;
  } finally {
    page.off("dialog", aoAviso);
    if (ensaio) await fecharReceita();
    else await sleep(PAUSA_ENTRE_LEITURAS_MS);
  }
}

/** Ensaio da IE: lê uma inscrição e mostra o que leria, sem falar com o Connect. */
async function ensaiarIE() {
  const config = await loadConfig().catch(() => ({ navegador: { visivel: true, canal: null } }));
  const saida = await vigiarIE(config, { id: "ensaio-da-ie", dados: { inscricao: value("--inscricao", ""), cnpj: value("--cnpj", "") } }, { ensaio: true });
  console.log(JSON.stringify(saida.ensaio ?? saida.devolucao, null, 2));
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
 * Abre o navegador visível com o certificado do cofre, liberado para as origens
 * de `--origens` (ou só a de `--url`). É a mesma abertura do teste do
 * certificado e do mapeamento.
 */
async function abrirComCertificado() {
  const url = value("--url"), pfx = value("--pfx"), entrada = value("--entrada");
  if (!url || !pfx) throw new Error("Use --url e --pfx, e --entrada (o título da entrada no cofre) para ler a senha do cofre.");
  const config = await loadConfig().catch(() => ({ navegador: { visivel: true, canal: null }, cofre: null }));
  // Sem --entrada, a senha do certificado é digitada aqui, sem eco (03/11/2026):
  // serve para mapear um site quando o cofre não está à mão.
  let passphrase;
  if (entrada) {
    const cofre = config.cofre;
    if (!cofre?.arquivo || !cofre?.arquivoChave) throw new Error("Preencha cofre.arquivo e cofre.arquivoChave na configuração.");
    passphrase = await senhaDoCofre(cofre, entrada);
  } else {
    passphrase = await perguntarSemEco("Senha do certificado: ");
  }
  const origens = (value("--origens") || new URL(url).origin).split(",").map((o) => o.trim()).filter(Boolean);
  // Os .pfx das certificadoras vêm cifrados em RC2, que o OpenSSL 3 só abre com
  // o provedor legado — o `npm run robo:societario` já liga (03/11/2026).
  if (!process.execArgv.includes("--openssl-legacy-provider") && !/--openssl-legacy-provider/.test(process.env.NODE_OPTIONS ?? "")) {
    log("aviso: sem --openssl-legacy-provider, o certificado das certificadoras não abre. Rode pelo npm run robo:societario.");
  }
  const { browser, context } = await abrirNavegador({ navegador: { ...config.navegador, visivel: true } }, {
    clientCertificates: origens.map((origin) => ({ origin, pfxPath: resolve(pfx), passphrase })),
  });
  return { url, origens, browser, context };
}

/**
 * Abre o site com o certificado e deixa o navegador aberto para olhar. Serve
 * para o primeiro risco do mapa: se o site pede o certificado pela janela
 * comum (certificado de cliente), o Playwright resolve; se pedir extensão
 * (Web PKI e afins), o desenho muda antes de escrever o robô.
 */
async function testarCertificado() {
  const { url, browser, context } = await abrirComCertificado();
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  log(`aberto em ${page.url()}. Siga o login no navegador; ao terminar, aperte Enter aqui.`);
  await new Promise((ok) => createInterface({ input: process.stdin }).once("line", ok));
  log(`terminou em ${page.url()}`);
  await capturar(page, "teste-do-certificado");
  await browser.close();
}

// ─── perfil próprio do Chrome, para os sites com Web PKI (03/11/2026) ──────
//
// A Receita do PR não pede o certificado pela janela do navegador: mostra uma
// "Lista de Certificados" que a extensão Web PKI lê do Windows. Para esses
// sites o robô usa um perfil fixo do Chrome instalado, com a extensão, e o
// certificado instalado no Windows da máquina (decisão do Kauan, 03/11). O
// perfil é só do robô: não é o Chrome de quem usa a máquina.

const perfilDir = join(dirname(statePath), "perfil-do-chrome");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

/**
 * Abre o Chrome comum, fora do Playwright, no perfil do robô. É onde a pessoa
 * instala a extensão e autoriza o site uma vez — o Playwright, com o perfil
 * aberto por ele, deixa a extensão rodar, mas a instalação é mais segura assim.
 */
async function prepararPerfil() {
  const config = await loadConfig().catch(() => ({ navegador: {} }));
  await mkdir(perfilDir, { recursive: true });
  const url = value("--url", "https://receita.pr.gov.br/certificado");
  spawn(config.navegador?.chrome || CHROME, [`--user-data-dir=${perfilDir}`, "--no-first-run", url], { detached: true, stdio: "ignore" }).unref();
  log(`Chrome aberto no perfil do robô (${perfilDir}). Instale a extensão Web PKI pelo aviso do site, clique em Atualizar Lista de Certificados, autorize o site e confira se o certificado aparece. Depois feche o Chrome.`);
}

/** O perfil do robô pelo Playwright, com as extensões ligadas. */
async function abrirComPerfil() {
  const url = value("--url");
  if (!url) throw new Error("Use --url.");
  const config = await loadConfig().catch(() => ({ navegador: {} }));
  const { chromium } = await import("playwright");
  const context = await chromium.launchPersistentContext(perfilDir, {
    headless: false,
    ...(config.navegador?.chrome ? { executablePath: config.navegador.chrome } : { channel: "chrome" }),
    acceptDownloads: true,
    locale: "pt-BR",
    // O Playwright desliga as extensões por padrão; aqui elas são o motivo do perfil.
    ignoreDefaultArgs: ["--disable-extensions"],
  });
  return { url, origens: [], browser: context, context };
}

// ─── mapeamento de um site novo (03/11/2026) ───────────────────────────────

/**
 * Uma pessoa faz o caminho à mão, com o certificado, e a cada Enter o robô
 * anota a tela: endereço, campos (rótulo, nome, id, tipo — sem o valor
 * digitado), botões e links, o começo do texto e uma captura. Abas novas e
 * PDFs que o site abre também ficam anotados, e o PDF é guardado.
 *
 * É o material para escrever a leitura de um órgão contra a página real, sem
 * adivinhar seletor. Tudo fica em `.local/capturas-do-robo/mapa-<nome>/`, na
 * máquina: tem dado de cliente, e não vai para o repositório nem para o Connect.
 */
async function mapearSite() {
  const nome = String(value("--nome", "site")).replace(/[^\w-]/g, "") || "site";
  const pasta = join(capturasDir, `mapa-${nome}`);
  await mkdir(pasta, { recursive: true });
  const { url, origens, browser, context } = args.has("--perfil") ? await abrirComPerfil() : await abrirComCertificado();
  const hosts = new Set();
  const eventos = [];
  let pdfs = 0;
  context.on("page", (p) => eventos.push({ em: new Date().toISOString(), aba_nova: p.url() }));
  context.on("request", (r) => { try { hosts.add(new URL(r.url()).origin); } catch {} });
  context.on("response", async (r) => {
    if (!/application\/pdf/i.test(r.headers()["content-type"] ?? "")) return;
    try {
      const arquivo = join(pasta, `documento-${++pdfs}.pdf`);
      await writeFile(arquivo, await r.body());
      eventos.push({ em: new Date().toISOString(), pdf: r.url(), arquivo });
    } catch {}
  });
  const page = context.pages()[0] ?? (await context.newPage());
  page.on("dialog", (d) => { eventos.push({ em: new Date().toISOString(), aviso: d.message() }); d.accept().catch(() => {}); });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });

  const passos = [];
  const linhas = createInterface({ input: process.stdin });
  const proxima = () => new Promise((ok) => linhas.once("line", ok));
  log(`aberto em ${page.url()}. Faça o caminho no navegador. A cada tela que importa, aperte Enter aqui (pode escrever uma nota antes). Para terminar, escreva fim e Enter.`);
  while (true) {
    const nota = (await proxima()).trim();
    if (nota.toLowerCase() === "fim") break;
    const n = passos.length + 1;
    for (const aba of context.pages()) {
      const tela = await aba.evaluate(() => {
        const curto = (t, max = 120) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, max);
        const rotulo = (el) =>
          curto(
            (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.innerText) ||
              el.closest("label")?.innerText ||
              el.getAttribute("aria-label") ||
              el.getAttribute("placeholder") ||
              el.previousElementSibling?.innerText
          );
        const campos = [...document.querySelectorAll("input, select, textarea")]
          .filter((el) => el.type !== "hidden")
          .map((el) => ({
            tag: el.tagName.toLowerCase(),
            tipo: el.type || null,
            nome: el.name || null,
            id: el.id || null,
            rotulo: rotulo(el),
            opcoes: el.tagName === "SELECT" ? [...el.options].slice(0, 30).map((o) => curto(o.text, 60)) : undefined,
          }));
        const acoes = [...document.querySelectorAll("button, a, input[type=submit], input[type=button], [role=button], [onclick]")]
          .map((el) => ({ tag: el.tagName.toLowerCase(), texto: curto(el.innerText || el.value || el.title, 80), href: el.getAttribute("href") || null, id: el.id || null }))
          .filter((a) => a.texto || a.href)
          .slice(0, 150);
        return {
          titulo: document.title,
          campos,
          acoes,
          frames: [...document.querySelectorAll("iframe, frame")].map((f) => f.src),
          texto: curto(document.body?.innerText, 6000),
        };
      }).catch((e) => ({ erro: String(e?.message || e).slice(0, 200) }));
      const captura = join(pasta, `passo-${n}-aba-${context.pages().indexOf(aba) + 1}.png`);
      await aba.screenshot({ path: captura, fullPage: true }).catch(() => {});
      passos.push({ passo: n, nota: nota || null, url: aba.url(), captura, ...tela });
    }
    await writeFile(join(pasta, "mapa.json"), `${JSON.stringify({ url, origens, hosts: [...hosts], passos, eventos }, null, 2)}\n`);
    log(`passo ${n} anotado (${context.pages().length} aba(s)). Enter para o próximo, fim para terminar.`);
  }
  linhas.close();
  await writeFile(join(pasta, "mapa.json"), `${JSON.stringify({ url, origens, hosts: [...hosts], passos, eventos }, null, 2)}\n`);
  log(`mapa em ${join(pasta, "mapa.json")}. Endereços que o site usou: ${[...hosts].join(", ")}`);
  await browser.close();
}

// ─── laço ─────────────────────────────────────────────────────────────────

async function watch() {
  await mkdir(dirname(lockPath), { recursive: true });
  let lock;
  // A trava guarda o PID. Fechar a janela do cmd mata o robô sem soltar a
  // trava, e aí o Agendador não conseguia subir outro (03/11/2026): trava de
  // processo que não existe mais é descartada.
  try { lock = await open(lockPath, "wx"); } catch {
    const pid = Number((await readFile(lockPath, "utf8").catch(() => "")).trim());
    let vivo = false;
    try { if (pid) { process.kill(pid, 0); vivo = true; } } catch {}
    if (vivo) throw new Error("Já existe um robô rodando com esta configuração.");
    log(`trava antiga${pid ? ` do processo ${pid}` : ""} descartada: o robô anterior não está mais rodando`);
    await unlink(lockPath).catch(() => {});
    lock = await open(lockPath, "wx");
  }
  await lock.writeFile(String(process.pid));
  const parar = async () => { await fecharReceita(); await lock.close(); await unlink(lockPath).catch(() => {}); await unlink(stopPath).catch(() => {}); log("parado"); process.exit(0); };
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
    if (!trabalhou) {
      if (receita && Date.now() - receita.usadoEm > 5 * 60_000) await fecharReceita();
      await sleep(config.intervaloMs);
    }
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
  // Como o Connect faz (`normalizarInscricao`): 7 dígitos ganham o zero, e o
  // código inteiro que o site exibe (11) perde os 4 primeiros.
  const digitos = String(value("--inscricao", "")).replace(/\D/g, "");
  const inscricao = digitos.length === 7 ? `0${digitos}` : digitos.length === 11 ? `0${digitos.slice(4)}` : digitos;
  const config = await loadConfig().catch(() => ({ navegador: { visivel: true, canal: null } }));
  const saida = await imprimirAlvara(config, { id: "ensaio-do-alvara", dados: { inscricao } }, { ensaio: true });
  console.log(JSON.stringify(saida.ensaio ?? saida.devolucao, null, 2));
}

try {
  if (args.has("--testar-certificado")) await testarCertificado();
  else if (args.has("--mapear")) await mapearSite();
  else if (args.has("--preparar-perfil")) await prepararPerfil();
  else if (args.has("--ensaio-ie")) await ensaiarIE();
  else if (args.has("--ensaio-alvara")) await ensaiarAlvara();
  else if (args.has("--once")) { const config = await loadConfig(); await umaVolta(config); }
  else if (args.has("--watch") || args.has("--start")) await watch();
  else if (args.has("--status")) await status();
  else if (args.has("--stop")) { await mkdir(dirname(stopPath), { recursive: true }); await writeFile(stopPath, `${new Date().toISOString()}\n`); console.log("Parada pedida; o robô para na próxima volta."); }
  else if (args.has("--config")) await criarConfig();
  else console.log("Uso: --config[=arquivo] | --once | --watch | --status | --stop | --ensaio-alvara --inscricao= | --ensaio-ie --inscricao= [--cnpj=] | --testar-certificado --url= --pfx= --entrada= | --mapear --nome= --url= (--pfx= --entrada= | --perfil) | --preparar-perfil");
} catch (error) {
  console.error(`[robo-societario] ${error.message}`);
  process.exitCode = 1;
}
