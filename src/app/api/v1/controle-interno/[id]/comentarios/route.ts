import { lerJson, responderApi } from "@/lib/api-v1/http";
import { comentarParaApi } from "@/lib/tech-interno/api";

export const runtime = "nodejs";

/** Comenta no item: `{ "body": "texto" }`. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return responderApi(request, "controle-interno:escrever", async ator => comentarParaApi(ator, id, await lerJson(request)), 201);
}
