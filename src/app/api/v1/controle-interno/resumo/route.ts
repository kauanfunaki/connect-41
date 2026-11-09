import { parametrosDaUrl, responderApi } from "@/lib/api-v1/http";
import { resumoParaApi } from "@/lib/tech-interno/api";

export const runtime = "nodejs";

/**
 * O resumo do período (06/11/2026): concluídos, em andamento, planejados e
 * cancelados. Parâmetros: period (day, week, month ou year; padrão week) e
 * date (AAAA-MM-DD; padrão hoje, em São Paulo).
 */
export async function GET(request: Request) {
  return responderApi(request, "controle-interno:ler", (ator, base) => resumoParaApi(ator, parametrosDaUrl(request), base));
}
