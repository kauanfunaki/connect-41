import { parametrosDaUrl, responderApi } from "@/lib/api-v1/http";
import { rankingParaApi } from "@/lib/academia/api";

export const runtime = "nodejs";

/**
 * O ranking do mês da Academia (10/11/2026, pedido do Kauan), para o post do
 * Slack pelo n8n. Token pessoal com o escopo "academia:ler". Parâmetros:
 * teste (digitacao, numeros ou logica — obrigatório), mes (AAAA-MM; padrão o
 * mês de hoje em São Paulo), nivel (facil, medio ou dificil; sem ele, todos)
 * e limite (1 a 50; padrão 10). Contrato em docs/ACADEMIA-API.md.
 */
export async function GET(request: Request) {
  return responderApi(request, "academia:ler", (ator, base) => rankingParaApi(ator, parametrosDaUrl(request), base));
}
