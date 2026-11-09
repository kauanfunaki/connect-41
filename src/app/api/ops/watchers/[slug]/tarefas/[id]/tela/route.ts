import { responderOps } from "@/lib/ops/http";
import { ErroOps, autenticarWatcher } from "@/lib/ops/servidor";
import { slugSchema } from "@/lib/ops/regras";
import { QUADRO_MAXIMO_BYTES } from "@/lib/robo/assistencia";
import { receberQuadro } from "@/lib/robo/assistenciaServidor";
export const runtime = "nodejs";

const TIPOS = new Set(["image/jpeg", "image/png"]);

// A tela do robô parado no captcha (06/11/2026): um quadro por vez, e a
// resposta leva os cliques que a pessoa deu desde o último. O quadro fica em
// memória — ver src/lib/robo/assistenciaAoVivo.ts.
export async function PUT(request: Request, context: { params: Promise<{ slug: string; id: string }> }) {
  return responderOps(async () => {
    const params = await context.params;
    const slug = slugSchema.parse(params.slug);
    if (!/^[0-9a-f-]{36}$/i.test(params.id)) throw new ErroOps("Tarefa não encontrada.", 404);
    // Antes de ler o corpo: tipo e tamanho declarado.
    const tipo = request.headers.get("content-type")?.split(";")[0].trim() ?? "";
    if (!TIPOS.has(tipo)) throw new ErroOps("Envie o quadro como image/jpeg ou image/png.", 415);
    const tamanho = Number(request.headers.get("content-length"));
    if (!Number.isSafeInteger(tamanho) || tamanho < 1) throw new ErroOps("Informe o tamanho do quadro (Content-Length).", 411);
    if (tamanho > QUADRO_MAXIMO_BYTES) throw new ErroOps("O quadro passa de 2 MiB.", 413);
    const w = await autenticarWatcher(request, slug);
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length !== tamanho) throw new ErroOps("O quadro chegou com tamanho diferente do declarado.", 400);
    return receberQuadro(w, params.id, bytes, tipo);
  });
}
