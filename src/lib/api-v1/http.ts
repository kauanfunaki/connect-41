import { ErroApi } from "./erros";
import { autenticarTokenPessoal, type AtorDoToken } from "@/lib/tokens-pessoais/servidor";
import type { Escopo } from "@/lib/tokens-pessoais/regras";

// As respostas da API pública (`/api/v1`): JSON, sem cache, erro sempre como
// `{ "error": { "code", "message" } }`. A identidade vem só do token pessoal
// no cabeçalho — o proxy não põe sessão nestas rotas —, então não há cookie
// para um site de fora aproveitar.

const SEM_CACHE = { "Cache-Control": "no-store" };

export function respostaDeErro(e: unknown): Response {
  if (e instanceof ErroApi) {
    const headers: Record<string, string> = { ...SEM_CACHE };
    // RFC 6750: o 401 diz como se autenticar.
    if (e.status === 401) headers["WWW-Authenticate"] = `Bearer realm="connect", error="invalid_token"`;
    if (e.code === "insufficient_scope") headers["WWW-Authenticate"] = `Bearer realm="connect", error="insufficient_scope"`;
    return Response.json({ error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) } }, { status: e.status, headers });
  }
  // Sem o erro em si no log: pode carregar dado do item ou parâmetro da consulta.
  console.error("[api-v1] Falha na operação", e instanceof Error ? e.name : "erro");
  return Response.json({ error: { code: "internal_error", message: "O Connect não conseguiu concluir a operação. Tente de novo em instantes." } }, { status: 500, headers: SEM_CACHE });
}

/** O endereço público do Connect, para os links da resposta (no standalone, `request.url` pode ser o host interno). */
export function origemPublica(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || url.host;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.replace(":", "");
  return `${proto === "http" ? "http" : "https"}://${host}`;
}

/** Autentica pelo token com o escopo da rota e responde o que `fn` devolver. */
export async function responderApi(request: Request, escopo: Escopo, fn: (ator: AtorDoToken, base: string) => Promise<unknown>, status = 200): Promise<Response> {
  try {
    const ator = await autenticarTokenPessoal(request, escopo);
    return Response.json(await fn(ator, origemPublica(request)), { status, headers: SEM_CACHE });
  } catch (e) { return respostaDeErro(e); }
}

/** O corpo JSON, com teto de tamanho também quando o cliente não manda Content-Length. */
export async function lerJson(request: Request, limite = 64 * 1024): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new ErroApi("invalid_json", "Envie o corpo em JSON.");
  const partes: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limite) { await reader.cancel(); throw new ErroApi("payload_too_large", `O corpo passa de ${Math.round(limite / 1024)} KiB.`); }
      partes.push(value);
    }
  } finally { reader.releaseLock(); }
  const texto = Buffer.concat(partes).toString("utf8");
  if (!texto.trim()) throw new ErroApi("invalid_json", "Envie o corpo em JSON.");
  try { return JSON.parse(texto) as unknown; } catch { throw new ErroApi("invalid_json", "O corpo não é um JSON válido."); }
}

/** Os parâmetros da URL como objeto; um parâmetro repetido vale o último. */
export const parametrosDaUrl = (request: Request) => Object.fromEntries(new URL(request.url).searchParams);
