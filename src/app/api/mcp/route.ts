import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { autenticarTokenPessoal } from "@/lib/tokens-pessoais/servidor";
import { origemPublica, respostaDeErro } from "@/lib/api-v1/http";
import { criarServidorMcp } from "@/lib/mcp/servidor";

export const runtime = "nodejs";

// O servidor MCP remoto do Connect (05/11/2026): Streamable HTTP, sem sessão
// (cada POST traz o token e é atendido sozinho, em JSON), para funcionar em
// mais de um processo e sem memória entre chamadas. Configuração no Claude
// Code, no Codex e no Cursor em docs/CONTROLE-INTERNO-API-E-MCP.md.

/** Um anexo de 10 MB em base64 passa de 13 MB: o teto do corpo cobre isso. */
const TETO_DO_CORPO = 16 * 1024 * 1024;

export async function POST(request: Request) {
  let ator;
  try { ator = await autenticarTokenPessoal(request); } catch (e) { return respostaDeErro(e); }
  const server = criarServidorMcp(ator, origemPublica(request));
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: TETO_DO_CORPO });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    // Em JSON, a resposta já está montada quando handleRequest volta.
    await server.close().catch(() => undefined);
  }
}

// Sem sessão, não há fluxo de eventos para abrir (GET) nem sessão para encerrar (DELETE).
function semSessao() {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32000, message: "Este servidor MCP não guarda sessão: use POST." }, id: null },
    { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } },
  );
}
export { semSessao as GET, semSessao as DELETE };
