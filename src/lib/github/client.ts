import { z } from "zod";
import { GithubError, identity } from "./rules";

const API_ORIGIN = "https://api.github.com";
export const API_VERSION = "2026-03-10";
export type ApiPage = { items: unknown[]; next: boolean };
export function githubRetryAt(headers: Headers, now = Date.now()): Date {
  const retry = Number(headers.get("retry-after")), reset = Number(headers.get("x-ratelimit-reset"));
  if (headers.has("retry-after") && Number.isFinite(retry) && retry >= 0) return new Date(now + Math.min(retry, 86400) * 1000);
  if (headers.get("x-ratelimit-remaining") === "0" && Number.isFinite(reset) && reset * 1000 > now) return new Date(reset * 1000 + 1000);
  return new Date(now + 60000);
}
export async function readResponse(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new GithubError("Resposta vazia do GitHub.", 502, undefined, "network");
  let length = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      length += part.value.byteLength;
      if (length > 12 * 1024 * 1024) { await reader.cancel(); throw new GithubError("Resposta GitHub acima do limite do lote.", 502, undefined, "network"); }
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally { reader.releaseLock(); }
}
export class GithubClient {
  constructor(private token: string, private fetcher: typeof fetch = fetch) {}
  async request(path: string): Promise<{ data: unknown; headers: Headers }> {
    const url = new URL(path, API_ORIGIN);
    if (url.origin !== API_ORIGIN || !path.startsWith("/") || path.startsWith("//")) throw new GithubError("Endereço de API inválido.");
    let response: Response;
    try {
      response = await this.fetcher(url, { headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${this.token}`, "X-GitHub-Api-Version": API_VERSION },
        cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) });
    } catch { throw new GithubError("Não foi possível consultar o GitHub. A sincronização será retomada.", 503, new Date(Date.now() + 60000), "network"); }
    if (!response.ok) {
      let message = "";
      try { const details = await readResponse(response); if (details && typeof details === "object" && "message" in details && typeof details.message === "string") message = details.message; } catch { /* Não confiar nem registrar o corpo de erro. */ }
      const limited = response.status === 429 || response.status === 403 && (response.headers.has("retry-after") || response.headers.get("x-ratelimit-remaining") === "0" || /rate limit|abuse/i.test(message));
      if (limited) throw new GithubError("Limite de consultas do GitHub. Aguardando liberação.", 429, githubRetryAt(response.headers), "limit");
      if (response.status === 401) throw new GithubError("Autorização GitHub inválida. Reconecte a conta em Integrações.", 401, undefined, "auth");
      if (response.status === 403 || response.status === 404) {
        const sso = response.headers.get("x-github-sso");
        throw new GithubError(sso ? "O acesso exige autorização SSO da organização no GitHub." : "Recurso indisponível ou sem permissão no GitHub.", response.status, undefined, "access");
      }
      // Não logar o corpo: pode conter dados privados, código ou tokens.
      throw new GithubError(response.status === 409 ? "Repositório vazio ou histórico indisponível." : "O GitHub não concluiu a consulta.", response.status, new Date(Date.now() + 60000), "network");
    }
    try { return { data: await readResponse(response), headers: response.headers }; }
    catch (error) { if (error instanceof GithubError) throw error; throw new GithubError("Resposta GitHub inválida. O lote não foi confirmado.", 502, undefined, "network"); }
  }
  async page(path: string): Promise<ApiPage> {
    const { data, headers } = await this.request(path);
    const items = z.array(z.unknown()).max(100).parse(data);
    return { items, next: hasNext(headers, items.length) };
  }
  async viewer() { return identity((await this.request("/user")).data); }
}
export function hasNext(headers: Headers, size: number): boolean {
  const link = headers.get("link"); return link !== null ? /;\s*rel="next"/.test(link) : size === 100;
}
export const repositorySchema = z.object({
  node_id: z.string().min(1).max(100), name: z.string().min(1).max(100), full_name: z.string().min(1).max(210),
  owner: z.object({ login: z.string().min(1).max(100) }), default_branch: z.string().max(255).nullable().optional(),
  private: z.boolean(), fork: z.boolean(), archived: z.boolean(),
});
export const repoPath = (owner: string, name: string) => `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
