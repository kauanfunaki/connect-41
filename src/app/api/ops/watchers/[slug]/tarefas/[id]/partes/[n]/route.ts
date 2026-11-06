import { responderOps } from "@/lib/ops/http";
import { ErroOps, autenticarWatcher } from "@/lib/ops/servidor";
import { slugSchema } from "@/lib/ops/regras";
import { receberParte } from "@/lib/fiscal/sped/local/geracaoPeloAgente";
import { TAMANHO_DA_PARTE } from "@/lib/fiscal/sped/local/gerados";
export const runtime = "nodejs";

// Uma parte do TXT que o agente do motor gerou (06/11/2026). O arquivo vem em
// partes de até 8 MiB porque o proxy do Next guarda o corpo inteiro em memória
// e corta em 26 MB sem avisar (`next.config.ts`). Os mesmos bytes de novo
// respondem como gravados; outros bytes na mesma parte, 409. Ver
// docs/SPED-GERACAO-PELO-AGENTE.md.
export async function PUT(request: Request, context: { params: Promise<{ slug: string; id: string; n: string }> }) {
  return responderOps(async () => {
    const params = await context.params;
    const slug = slugSchema.parse(params.slug);
    if (!/^[0-9a-f-]{36}$/i.test(params.id)) throw new ErroOps("Tarefa não encontrada.", 404);
    const numero = /^\d{1,5}$/.test(params.n) ? Number(params.n) : NaN;
    if (!Number.isSafeInteger(numero) || numero < 1) throw new ErroOps("Número de parte inválido.", 400);
    // Antes de ler o corpo: tipo, tamanho declarado e hash.
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/octet-stream") throw new ErroOps("Envie a parte como application/octet-stream.", 415);
    const tamanho = Number(request.headers.get("content-length"));
    if (!Number.isSafeInteger(tamanho) || tamanho < 1) throw new ErroOps("Informe o tamanho da parte (Content-Length).", 411);
    if (tamanho > TAMANHO_DA_PARTE) throw new ErroOps("Cada parte tem até 8 MiB.", 413);
    const sha256 = (request.headers.get("x-parte-sha256") ?? "").trim().toLowerCase();
    const w = await autenticarWatcher(request, slug);
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length !== tamanho) throw new ErroOps("A parte chegou com tamanho diferente do declarado. Envie de novo.", 400);
    return receberParte(w, params.id, numero, bytes, sha256);
  });
}
