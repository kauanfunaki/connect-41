import { responderApi } from "@/lib/api-v1/http";
import { opcoesParaApi } from "@/lib/tech-interno/api";

export const runtime = "nodejs";

/** Os valores aceitos nos campos: tipos, situações, sistemas do Ops Center, responsáveis e entregas recentes. */
export async function GET(request: Request) {
  return responderApi(request, "controle-interno:ler", ator => opcoesParaApi(ator));
}
