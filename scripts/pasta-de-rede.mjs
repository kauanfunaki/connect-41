#!/usr/bin/env node
// O robô da pasta de rede (21/10/2026): lê a pasta de rede dos clientes no
// escritório e manda para os Arquivos do Connect o que é novo ou mudou.
//
//   <raiz>/<CNPJ> - <nome>/<pasta do modelo>/<subpastas…>/<arquivo>
//
// Roda numa máquina do escritório que enxerga a rede. Não apaga, não move e não
// renomeia nada na rede: só lê. Cada volta (a cada 5 minutos, por padrão):
// - manda o heartbeat da automação, como o scripts/ops-heartbeat.mjs;
// - percorre as pastas das empresas (as da lista `empresas`, se houver);
// - só manda arquivo que ficou parado (mesmo tamanho e data) desde a volta
//   anterior: arquivo ainda sendo copiado espera a próxima;
// - lembra, no estado local, o que já foi (caminho + SHA-256). O servidor
//   também confere: reenviar não duplica.
// Recusa do Connect (pasta fora do modelo, empresa fora do piloto, tipo não
// aceito) fica no estado e no Ops Center e só é tentada de novo quando o
// arquivo muda. Falha de rede ou do servidor tenta de novo na volta seguinte.
//
// Uso: node scripts/pasta-de-rede.mjs --config=.local/pasta-de-rede.json [--once | --watch | --status | --stop]
// Roteiro completo em docs/PASTA-DE-REDE.md.

import { createHash } from "node:crypto";
import { access, mkdir, open, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

const args = new Set(process.argv.slice(2).map((a) => a.split("=")[0]));
const value = (name, fallback = null) => {
  const hit = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : fallback;
};
const configPath = resolve(value("--config", process.env.PASTA_DE_REDE_CONFIG || ".local/pasta-de-rede.json"));
const statePath = resolve(value("--state", process.env.PASTA_DE_REDE_STATE || configPath.replace(/\.json$/, "") + "-estado.json"));
const lockPath = `${statePath}.lock`;
const stopPath = `${statePath}.stop`;
const TAMANHO_MAXIMO = 10 * 1024 * 1024;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...m) => console.log(`[pasta-de-rede] ${new Date().toISOString()}`, ...m);

// As mesmas regras de src/lib/drive/pastaDeRede.ts.
function cnpjDaPastaDaEmpresa(nome) {
  const m = /^\s*(\d{2}\.?\d{3}\.?\d{3}[/ ]?\d{4}-?\d{2})(?!\d)/.exec(nome);
  if (!m) return null;
  const d = m[1].replace(/\D/g, "");
  return d.length === 14 ? d : null;
}
function arquivoIgnorado(nome) {
  const n = nome.toLowerCase();
  return n.startsWith("~$") || n.startsWith("._") || n.startsWith(".~") || ["thumbs.db", "desktop.ini", ".ds_store"].includes(n) || /\.(tmp|temp|part|crdownload|partial|lnk)$/.test(n);
}

async function loadConfig() {
  const config = JSON.parse(await readFile(configPath, "utf8"));
  for (const k of ["baseUrl", "slug", "token", "raiz"]) if (!config[k]) throw new Error(`Configuração incompleta: falta "${k}".`);
  if (!/^https?:\/\//i.test(config.baseUrl)) throw new Error("baseUrl deve ser HTTP(S).");
  const empresas = Array.isArray(config.empresas) ? config.empresas.map((c) => String(c).replace(/\D/g, "")).filter((c) => c.length === 14) : null;
  return {
    ...config,
    baseUrl: config.baseUrl.replace(/\/$/, ""),
    raiz: resolve(config.raiz),
    empresas: empresas?.length ? new Set(empresas) : null,
    intervaloMs: Math.max(60_000, Number(config.intervaloMs) || 5 * 60_000),
    timeoutMs: Number(config.timeoutMs) || 60_000,
  };
}

async function readState() {
  try {
    const s = JSON.parse(await readFile(statePath, "utf8"));
    return { arquivos: {}, vistos: {}, ...s };
  } catch {
    return { arquivos: {}, vistos: {} };
  }
}
async function saveState(state) {
  await mkdir(dirname(statePath), { recursive: true });
  const tmp = `${statePath}.tmp`;
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  // Troca de uma vez: o robô que cai no meio não deixa o estado pela metade.
  await rename(tmp, statePath);
}

async function* percorrer(dir) {
  let itens;
  try {
    itens = await readdir(dir, { withFileTypes: true });
  } catch (e) {
    log(`não consegui ler ${dir}: ${e.code || e.message}`);
    return;
  }
  for (const item of itens) {
    const caminho = join(dir, item.name);
    if (item.isDirectory()) yield* percorrer(caminho);
    else if (item.isFile()) yield caminho;
  }
}

async function sha256DoArquivo(caminho) {
  return createHash("sha256").update(await readFile(caminho)).digest("hex");
}

async function heartbeat(config) {
  try {
    const r = await fetch(`${config.baseUrl}/api/ops/watchers/${encodeURIComponent(config.slug)}/heartbeat`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) log(`heartbeat HTTP ${r.status}`);
  } catch (e) {
    log(`heartbeat falhou: ${e.message}`);
  }
}

/** "ok" | "duplicado" | { recusado: string } | { falha: string } */
async function enviar(config, { cnpj, caminho, absoluto, sha256 }) {
  const corpo = new FormData();
  corpo.set("cnpj", cnpj);
  corpo.set("caminho", caminho);
  corpo.set("sha256", sha256);
  corpo.set("arquivo", new Blob([await readFile(absoluto)]), basename(absoluto));
  try {
    const r = await fetch(`${config.baseUrl}/api/ops/watchers/${encodeURIComponent(config.slug)}/arquivos`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.token}` },
      body: corpo,
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    const dados = await r.json().catch(() => ({}));
    if (r.ok) return dados.duplicado ? "duplicado" : "ok";
    const erro = String(dados.error || `HTTP ${r.status}`).slice(0, 300);
    // 401 (chave) e 409 (em curso) e 5xx tentam de novo; o resto é recusa do conteúdo.
    if (r.status === 401 || r.status === 409 || r.status === 429 || r.status >= 500) return { falha: erro };
    return { recusado: erro };
  } catch (e) {
    return { falha: e.message };
  }
}

async function volta(config) {
  await heartbeat(config);
  const state = await readState();
  const vistosAgora = {};
  const contagem = { enviados: 0, duplicados: 0, recusados: 0, falhas: 0, esperando: 0 };

  let empresas;
  try {
    empresas = await readdir(config.raiz, { withFileTypes: true });
  } catch (e) {
    throw new Error(`não consegui abrir a raiz ${config.raiz}: ${e.code || e.message}`);
  }
  for (const pasta of empresas) {
    if (!pasta.isDirectory()) continue;
    const cnpj = cnpjDaPastaDaEmpresa(pasta.name);
    if (!cnpj || (config.empresas && !config.empresas.has(cnpj))) continue;
    const base = join(config.raiz, pasta.name);
    for await (const absoluto of percorrer(base)) {
      const nome = basename(absoluto);
      if (arquivoIgnorado(nome)) continue;
      const caminho = relative(base, absoluto).split(sep).join("/");
      const chave = `${cnpj}/${caminho}`;
      let info;
      try {
        info = await stat(absoluto);
      } catch {
        continue;
      }
      if (info.size > TAMANHO_MAXIMO) {
        if (state.arquivos[chave]?.marca !== `${info.size}:${info.mtimeMs}`) {
          state.arquivos[chave] = { marca: `${info.size}:${info.mtimeMs}`, recusado: "Arquivo acima do limite de 10 MB.", em: new Date().toISOString() };
          contagem.recusados++;
        }
        continue;
      }
      const marca = `${info.size}:${info.mtimeMs}`;
      vistosAgora[chave] = marca;
      const ja = state.arquivos[chave];
      if (ja?.marca === marca && (ja.enviado || ja.recusado)) continue;
      // Parado desde a volta anterior? Senão pode estar sendo copiado.
      if (state.vistos[chave] !== marca) {
        contagem.esperando++;
        continue;
      }
      const sha256 = await sha256DoArquivo(absoluto);
      if (ja?.sha256 === sha256 && (ja.enviado || ja.recusado)) {
        state.arquivos[chave] = { ...ja, marca };
        continue;
      }
      const r = await enviar(config, { cnpj, caminho, absoluto, sha256 });
      const em = new Date().toISOString();
      if (r === "ok" || r === "duplicado") {
        state.arquivos[chave] = { marca, sha256, enviado: em };
        contagem[r === "ok" ? "enviados" : "duplicados"]++;
        if (r === "ok") log(`enviado: ${chave}`);
      } else if (r.recusado) {
        state.arquivos[chave] = { marca, sha256, recusado: r.recusado, em };
        contagem.recusados++;
        log(`recusado: ${chave} — ${r.recusado}`);
      } else {
        contagem.falhas++;
        log(`falhou, tento na próxima volta: ${chave} — ${r.falha}`);
      }
      await saveState({ ...state, vistos: { ...state.vistos, ...vistosAgora } });
    }
  }
  state.vistos = vistosAgora;
  state.ultimaVolta = { em: new Date().toISOString(), ...contagem };
  await saveState(state);
  log(`volta: ${JSON.stringify(contagem)}`);
  return contagem;
}

async function acquireLock() {
  await mkdir(dirname(lockPath), { recursive: true });
  try {
    return await open(lockPath, "wx");
  } catch {
    throw new Error("Já existe um robô rodando com esta configuração.");
  }
}

async function watch() {
  const lock = await acquireLock();
  const stop = async () => {
    await lock.close();
    await unlink(lockPath).catch(() => {});
    await unlink(stopPath).catch(() => {});
    log("parado");
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const config = await loadConfig();
  log(`lendo ${config.raiz} a cada ${Math.round(config.intervaloMs / 1000)}s`);
  while (true) {
    try {
      await volta(config);
    } catch (e) {
      log(`volta falhou: ${e.message}`);
    }
    // Dorme em pedaços para atender o --stop sem esperar a volta inteira.
    for (let t = 0; t < config.intervaloMs; t += 5_000) {
      await sleep(5_000);
      try {
        await access(stopPath);
        return stop();
      } catch {}
    }
  }
}

async function createConfig() {
  await mkdir(dirname(configPath), { recursive: true });
  try {
    await access(configPath);
    throw new Error(`Arquivo já existe: ${configPath}`);
  } catch (e) {
    if (e.message.startsWith("Arquivo já existe")) throw e;
  }
  const exemplo = {
    baseUrl: "https://connect.41contabil.com.br",
    slug: "pasta-de-rede",
    token: "ops_chave-gerada-no-ops-center",
    raiz: "\\\\servidor\\clientes",
    empresas: ["12.345.678/0001-90"],
    intervaloMs: 300000,
  };
  await writeFile(configPath, `${JSON.stringify(exemplo, null, 2)}\n`, { mode: 0o600 });
  console.log(`Configuração criada em ${configPath}. Preencha a chave e a raiz aqui, nunca no repositório.`);
}

async function status() {
  let rodando = false;
  try {
    await access(lockPath);
    rodando = true;
  } catch {}
  const s = await readState();
  const recusados = Object.entries(s.arquivos).filter(([, v]) => v.recusado).map(([k, v]) => ({ arquivo: k, motivo: v.recusado }));
  const enviados = Object.values(s.arquivos).filter((v) => v.enviado).length;
  console.log(JSON.stringify({ configPath, statePath, rodando, ultimaVolta: s.ultimaVolta ?? null, enviados, recusados }, null, 2));
}

try {
  if (args.has("--once")) {
    const c = await volta(await loadConfig());
    process.exitCode = c.falhas ? 1 : 0;
  } else if (args.has("--watch") || args.has("--start")) await watch();
  else if (args.has("--status")) await status();
  else if (args.has("--stop")) {
    await mkdir(dirname(stopPath), { recursive: true });
    await writeFile(stopPath, `${new Date().toISOString()}\n`, { mode: 0o600 });
    console.log("Parada pedida; o robô encerra em até 5 segundos.");
  } else if (args.has("--config")) await createConfig();
  else console.log("Uso: --config[=arquivo] (cria) | --once | --watch | --status | --stop");
} catch (error) {
  console.error(`[pasta-de-rede] ${error.message}`);
  process.exitCode = 1;
}
