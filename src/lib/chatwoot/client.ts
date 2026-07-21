// Cliente server-side para a Application API do Chatwoot 4.15. Fetch nativo
// (sem SDK externo — mesmo padrão de src/lib/integrations/google.ts e
// src/lib/ai.ts para OpenAI), com timeout via AbortController e retry só em
// falhas transitórias (429/5xx). Nunca importado de um arquivo "use client".
import { errorForStatus, ChatwootConnectionError, ChatwootRateLimitError } from "./errors";
import type { ChatwootConversationsPage, ChatwootMessagesPage } from "./types";

const TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;

export type ChatwootCredentials = {
  baseUrl: string;
  accountId: string;
  apiToken: string;
};

function maskToken(token: string): string {
  if (token.length <= 4) return "***";
  return `***${token.slice(-4)}`;
}

async function request<T>(
  creds: ChatwootCredentials,
  path: string,
  init: { method?: string; searchParams?: Record<string, string> } = {}
): Promise<T> {
  const url = new URL(`${creds.baseUrl.replace(/\/$/, "")}${path}`);
  for (const [k, v] of Object.entries(init.searchParams ?? {})) url.searchParams.set(k, v);

  let attempt = 0;
  for (;;) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url.toString(), {
        method: init.method ?? "GET",
        headers: { api_access_token: creds.apiToken, Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) return (await res.json()) as T;

      if (res.status === 429 && attempt < MAX_RETRIES) {
        const retryAfterHeader = res.headers.get("retry-after");
        const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 1000 * 2 ** attempt;
        await new Promise((r) => setTimeout(r, Math.min(retryAfterMs, 5000)));
        attempt++;
        continue;
      }
      if (res.status >= 500 && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        attempt++;
        continue;
      }

      const detail = await res.text().catch(() => undefined);
      // Nunca logar o token — só a URL (sem query string sensível, que aqui
      // não existe) e o status.
      console.error("[chatwoot:client]", res.status, path);
      throw errorForStatus(res.status, detail?.slice(0, 300));
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof ChatwootRateLimitError) throw err;
      if (err && typeof err === "object" && "name" in err && (err as Error).name === "AbortError") {
        throw new ChatwootConnectionError(`timeout após ${TIMEOUT_MS}ms`);
      }
      if (err instanceof Error && err.name.startsWith("Chatwoot")) throw err;
      throw new ChatwootConnectionError(err instanceof Error ? err.message : "falha de rede");
    }
  }
}

// Smoke test de conectividade (Etapa 2) — 1 página, dado mínimo, somente
// leitura. Nunca imprime o token; erro retornado já vem com mensagem amigável
// via errorForStatus.
export async function testConnection(creds: ChatwootCredentials): Promise<{ ok: true; conversationCount: number }> {
  const page = await request<ChatwootConversationsPage>(creds, `/api/v1/accounts/${creds.accountId}/conversations`, {
    searchParams: { page: "1", status: "all" },
  });
  return { ok: true, conversationCount: page.data.meta.count };
}

export async function listConversations(
  creds: ChatwootCredentials,
  page: number,
  status: "all" | "open" | "resolved" | "pending" | "snoozed" = "all"
): Promise<ChatwootConversationsPage> {
  return request<ChatwootConversationsPage>(creds, `/api/v1/accounts/${creds.accountId}/conversations`, {
    searchParams: { page: String(page), status },
  });
}

export async function getConversation(
  creds: ChatwootCredentials,
  conversationId: number
): Promise<{ payload: unknown }> {
  return request(creds, `/api/v1/accounts/${creds.accountId}/conversations/${conversationId}`);
}

export async function listMessages(
  creds: ChatwootCredentials,
  conversationId: number,
  beforeId?: number
): Promise<ChatwootMessagesPage> {
  return request<ChatwootMessagesPage>(
    creds,
    `/api/v1/accounts/${creds.accountId}/conversations/${conversationId}/messages`,
    beforeId ? { searchParams: { before: String(beforeId) } } : {}
  );
}

// Chatwoot não expõe um total de mensagens no objeto de conversa (confirmado
// no código-fonte do Chatwoot — sem counter_cache) — a única forma de saber o
// total é paginar /messages até a página vir vazia. Chamado só 1x por
// conversa (na primeira sincronização), nunca na reconciliação — depois disso
// o total é mantido por incremento no webhook message_created (ver sync.ts).
// MAX_PAGES é um limite de segurança contra histórico anormalmente longo.
const COUNT_MAX_PAGES = 50;

export async function countAllMessages(creds: ChatwootCredentials, conversationId: number): Promise<number> {
  let total = 0;
  let beforeId: number | undefined;

  for (let page = 0; page < COUNT_MAX_PAGES; page++) {
    const result = await listMessages(creds, conversationId, beforeId);
    if (result.payload.length === 0) break;
    total += result.payload.length;
    beforeId = Math.min(...result.payload.map((m) => m.id));
  }

  return total;
}

export { maskToken };
