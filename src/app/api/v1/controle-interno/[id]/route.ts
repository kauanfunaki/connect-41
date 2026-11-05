import { lerJson, responderApi } from "@/lib/api-v1/http";
import { atualizarParaApi, verParaApi } from "@/lib/tech-interno/api";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ id: string }> };

/** Um item, com comentários, histórico e anexos. */
export async function GET(request: Request, { params }: Contexto) {
  const { id } = await params;
  return responderApi(request, "controle-interno:ler", (ator, base) => verParaApi(ator, id, base));
}

/** Atualiza só os campos enviados. Mande `version` para não gravar por cima de outra pessoa. */
export async function PATCH(request: Request, { params }: Contexto) {
  const { id } = await params;
  return responderApi(request, "controle-interno:escrever", async (ator, base) => atualizarParaApi(ator, id, await lerJson(request), base));
}
