#!/usr/bin/env node
import { mkdir, open, readFile, writeFile, unlink, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const args = new Set(process.argv.slice(2));
const value = (name, fallback = null) => {
  const hit = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : fallback;
};
const configPath = resolve(value("--config", process.env.OPS_HEARTBEAT_CONFIG || ".local/ops-heartbeat.json"));
const statePath = resolve(value("--state", process.env.OPS_HEARTBEAT_STATE || ".local/ops-heartbeat-state.json"));
const lockPath = `${statePath}.lock`;
const stopPath = `${statePath}.stop`;
const intervalMs = 30_000;
const maxAttempts = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadConfig() {
  const raw = await readFile(configPath, "utf8");
  const config = JSON.parse(raw);
  if (!config.baseUrl || !config.slug || !config.token) throw new Error("Configuração incompleta: baseUrl, slug e token são obrigatórios.");
  if (!/^https?:\/\//i.test(config.baseUrl)) throw new Error("baseUrl deve ser HTTP(S).");
  return { ...config, baseUrl: config.baseUrl.replace(/\/$/, "") };
}
async function saveState(state) {
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}
async function readState() { try { return JSON.parse(await readFile(statePath, "utf8")); } catch { return {}; } }
async function acquireLock() {
  await mkdir(dirname(lockPath), { recursive: true });
  try { return await open(lockPath, "wx"); } catch { throw new Error("Já existe uma instância do monitor para esta configuração."); }
}
async function send(config) {
  const startedAt = new Date().toISOString();
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${config.baseUrl}/api/ops/watchers/${encodeURIComponent(config.slug)}/heartbeat`, {
        method: "POST", headers: { authorization: `Bearer ${config.token}` }, signal: AbortSignal.timeout(config.timeoutMs || 8_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const state = { ...await readState(), lastAttemptAt: startedAt, lastSuccessAt: new Date().toISOString(), lastStatus: "success", lastHttpStatus: response.status, consecutiveFailures: 0 };
      await saveState(state); console.log(`[ops-heartbeat] sucesso HTTP ${response.status}`); return true;
    } catch (error) { lastError = error; if (attempt < maxAttempts) await sleep(500 * 2 ** (attempt - 1)); }
  }
  const state = { ...await readState(), lastAttemptAt: startedAt, lastStatus: "failure", lastError: String(lastError?.message || lastError).slice(0, 200), consecutiveFailures: ((await readState()).consecutiveFailures || 0) + 1 };
  await saveState(state); console.error(`[ops-heartbeat] falha após ${maxAttempts} tentativas: ${state.lastError}`); return false;
}
async function once() { const config = await loadConfig(); return (await send(config)) ? 0 : 1; }
async function watch() {
  const lock = await acquireLock();
  const stop = async () => { await lock.close(); await unlink(lockPath).catch(() => {}); await unlink(stopPath).catch(() => {}); console.log("[ops-heartbeat] parado"); process.exit(0); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  const config = await loadConfig();
  await send(config);
  while (true) { await sleep(intervalMs); try { await access(stopPath); return stop(); } catch {} await send(config); }
}
async function status() { let running = false; try { await access(lockPath); running = true; } catch {} console.log(JSON.stringify({ configPath, statePath, ...(await readState()), running }, null, 2)); }
async function createConfig() {
  await mkdir(dirname(configPath), { recursive: true });
  try { await access(configPath); throw new Error(`Arquivo já existe: ${configPath}`); } catch (e) { if (e.message.startsWith("Arquivo já existe")) throw e; }
  await writeFile(configPath, `${JSON.stringify({ baseUrl: "http://127.0.0.1:3000", slug: "slug-cadastrado", token: "ops_chave-gerada-na-tela-de-integracao", timeoutMs: 8000 }, null, 2)}\n`, { mode: 0o600 });
  console.log(`Configuração criada em ${configPath}. Preencha a chave localmente; ela nunca é exibida pelo monitor.`);
}
try {
  if (args.has("--config") && !args.has("--once") && !args.has("--watch") && !args.has("--status")) await createConfig();
  else if (args.has("--once")) process.exitCode = await once();
  else if (args.has("--watch") || args.has("--start")) await watch();
  else if (args.has("--status")) await status();
  else if (args.has("--stop")) { await mkdir(dirname(stopPath), { recursive: true }); await writeFile(stopPath, `${new Date().toISOString()}\n`, { mode: 0o600 }); console.log("Parada solicitada; o monitor encerrará no próximo intervalo."); }
  else console.log("Uso: --start | --stop | --status | --once | --watch | --config[=arquivo]");
} catch (error) { console.error(`[ops-heartbeat] ${error.message}`); process.exitCode = 1; }
