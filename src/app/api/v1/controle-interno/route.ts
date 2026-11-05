import { lerJson, parametrosDaUrl, responderApi } from "@/lib/api-v1/http";
import { criarParaApi, listarParaApi } from "@/lib/tech-interno/api";

export const runtime = "nodejs";

// API do Controle interno (05/11/2026): listar e criar itens com o token
// pessoal. Documentação em docs/CONTROLE-INTERNO-API-E-MCP.md.

/** Lista os itens. Filtros: status, type, priority, system, assignee, q, overdue, page. */
export async function GET(request: Request) {
  return responderApi(request, "controle-interno:ler", (ator, base) => listarParaApi(ator, parametrosDaUrl(request), base));
}

/** Cria um item e devolve o item criado. */
export async function POST(request: Request) {
  return responderApi(request, "controle-interno:escrever", async (ator, base) => criarParaApi(ator, await lerJson(request), base), 201);
}
