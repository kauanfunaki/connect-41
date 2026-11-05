import { lerJson, responderApi } from "@/lib/api-v1/http";
import { mudarSituacaoParaApi } from "@/lib/tech-interno/api";

export const runtime = "nodejs";

/** Muda a situação do item: `{ "status": "IN_PROGRESS", "version": 3 }`. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return responderApi(request, "controle-interno:escrever", async (ator, base) => mudarSituacaoParaApi(ator, id, await lerJson(request), base));
}
