// O endereço dos avisos que chegam de fora (21/10, o que faltava da troca para
// app.useconnect.com.br): o Chatwoot e a Evolution guardam a URL do webhook do
// lado deles, e o Connect a mostrava para alguém colar de novo à mão. Aqui o
// Connect troca sozinho, pela API de cada um, com a credencial que já tem.
//
// Só a URL muda. No Chatwoot o webhook é o mesmo — o segredo da assinatura
// continua valendo —; na Evolution, os eventos e os cabeçalhos ficam, e o
// `x-connect-secret` é reposto com o segredo da conexão. A Meta não tem como:
// a URL de lá é do app, no painel de desenvolvedor, e fica com a pessoa.

import { CABECALHO_DO_SEGREDO } from "@/lib/whatsapp/provedores/evolucao";
import type { ChatwootCredentials } from "@/lib/chatwoot/client";

const TIMEOUT_MS = 10_000;

export type ResultadoDoEndereco = { ok: true; mudou: boolean; antes: string | null } | { ok: false; erro: string };

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** O endereço completo do aviso: a URL pública do Connect e o caminho da conexão. */
export function urlDoAviso(urlPublica: string, caminho: string): string {
  return `${urlPublica.replace(/\/+$/, "")}${caminho}`;
}

/** O caminho da URL, para achar o webhook do Connect seja qual for o domínio antigo. */
function caminhoDe(url: string): string | null {
  try {
    return new URL(url).pathname.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

async function chamar(url: string, init: RequestInit): Promise<{ ok: true; status: number; corpo: unknown } | { ok: false; erro: string }> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controle.signal, cache: "no-store" });
    const texto = await res.text();
    let corpo: unknown = null;
    try {
      corpo = texto ? JSON.parse(texto) : null;
    } catch {
      corpo = texto;
    }
    if (!res.ok) return { ok: false, erro: `${res.status}: ${(typeof corpo === "string" ? corpo : texto).slice(0, 200)}` };
    return { ok: true, status: res.status, corpo };
  } catch (err) {
    const abortou = err instanceof Error && err.name === "AbortError";
    return { ok: false, erro: abortou ? "não respondeu a tempo" : err instanceof Error ? err.message : "falha de rede" };
  } finally {
    clearTimeout(relogio);
  }
}

/**
 * Os webhooks da conta no Chatwoot (`GET /api/v1/accounts/{id}/webhooks`,
 * `{ payload: { webhooks: [...] } }`; numa versão antiga, `payload` é a lista).
 */
export function lerWebhooksDoChatwoot(corpo: unknown): { id: number | string; url: string; subscriptions: unknown }[] {
  const payload = obj(corpo)?.payload;
  const lista = Array.isArray(payload) ? payload : Array.isArray(obj(payload)?.webhooks) ? (obj(payload)!.webhooks as unknown[]) : [];
  return lista
    .map((w) => obj(w))
    .filter((w): w is Json => Boolean(w && (typeof w.id === "number" || typeof w.id === "string") && str(w.url)))
    .map((w) => ({ id: w.id as number | string, url: w.url as string, subscriptions: w.subscriptions }));
}

/**
 * Aponta para `urlNova` o webhook do Connect no Chatwoot — o que tem o mesmo
 * caminho (`/api/integrations/chatwoot/webhook/{conexão}`), em qualquer
 * domínio. Sem ele, não cria um: o segredo de um webhook novo teria de ser
 * copiado do Chatwoot para o Connect, e isso é a pessoa quem faz.
 */
export async function apontarWebhookDoChatwoot(creds: ChatwootCredentials, urlNova: string): Promise<ResultadoDoEndereco> {
  const base = `${creds.baseUrl.replace(/\/+$/, "")}/api/v1/accounts/${encodeURIComponent(creds.accountId)}/webhooks`;
  const headers = { api_access_token: creds.apiToken, Accept: "application/json", "Content-Type": "application/json" };
  const lista = await chamar(base, { headers });
  if (!lista.ok) return { ok: false, erro: `O Chatwoot recusou a lista de webhooks (${lista.erro}). O token precisa ser de um administrador da conta.` };

  const caminho = caminhoDe(urlNova);
  const webhooks = lerWebhooksDoChatwoot(lista.corpo);
  const doConnect = webhooks.find((w) => caminhoDe(w.url) === caminho);
  if (!doConnect) {
    return {
      ok: false,
      erro: "Não achei no Chatwoot o webhook desta conexão. Crie um em Configurações › Integrações › Webhooks com a URL mostrada aqui e salve o segredo dele no Connect.",
    };
  }
  if (doConnect.url === urlNova) return { ok: true, mudou: false, antes: doConnect.url };

  const r = await chamar(`${base}/${encodeURIComponent(String(doConnect.id))}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ url: urlNova, subscriptions: doConnect.subscriptions }),
  });
  if (!r.ok) return { ok: false, erro: `O Chatwoot não aceitou o endereço novo (${r.erro}).` };
  return { ok: true, mudou: true, antes: doConnect.url };
}

/**
 * Aponta para `urlNova` o webhook da instância na Evolution: lê o que está
 * (`GET /webhook/find/{instância}`) e grava de volta só com a URL trocada
 * (`POST /webhook/set/{instância}`, formato da 2.3.7). Os eventos ficam; sem
 * nenhum, vai o `MESSAGES_UPSERT`, que é o único que o Connect lê.
 */
export async function apontarWebhookDaEvolution(config: Record<string, string>, urlNova: string): Promise<ResultadoDoEndereco> {
  const base = (config.baseUrl ?? "").replace(/\/+$/, "");
  const instancia = config.instance ?? "";
  const apiKey = config.apiKey ?? "";
  const segredo = config.webhookSecret ?? "";
  if (!base || !instancia || !apiKey) return { ok: false, erro: "Conexão da Evolution incompleta: URL, instância ou apikey." };
  if (!segredo) return { ok: false, erro: "Falta o segredo do webhook nesta conexão — sem ele, a Evolution entregaria e o Connect recusaria." };

  const headers = { apikey: apiKey, "Content-Type": "application/json" };
  const atual = await chamar(`${base}/webhook/find/${encodeURIComponent(instancia)}`, { headers });
  if (!atual.ok) return { ok: false, erro: `A Evolution não devolveu o webhook da instância (${atual.erro}).` };
  const w = obj(atual.corpo) ?? {};
  const antes = str(w.url);
  const cabecalhos = { ...(obj(w.headers) ?? {}), [CABECALHO_DO_SEGREDO]: segredo };
  const eventos = Array.isArray(w.events) && w.events.length > 0 ? w.events : ["MESSAGES_UPSERT"];
  if (antes === urlNova && w.enabled === true && obj(w.headers)?.[CABECALHO_DO_SEGREDO] === segredo) return { ok: true, mudou: false, antes };

  const r = await chamar(`${base}/webhook/set/${encodeURIComponent(instancia)}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: urlNova,
        headers: cabecalhos,
        byEvents: w.webhookByEvents === true,
        base64: w.webhookBase64 === true,
        events: eventos,
      },
    }),
  });
  if (!r.ok) return { ok: false, erro: `A Evolution não aceitou o endereço novo (${r.erro}).` };
  return { ok: true, mudou: true, antes };
}
