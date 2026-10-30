import { lerJsonOps, responderOps } from "@/lib/ops/http";
import { ErroOps, autenticarWatcher } from "@/lib/ops/servidor";
import { slugSchema } from "@/lib/ops/regras";
import { devolucaoSchema } from "@/lib/robo/tarefas";
import { devolverTarefa } from "@/lib/robo/servidor";
export const runtime = "nodejs";

/** O PDF do alvará tem poucas centenas de KB; 10 MB sobra. */
const CORPO_MAXIMO = 10 * 1024 * 1024;

// O robô devolve a tarefa: JSON quando não há arquivo, multipart (campo
// "resultado" com o JSON e campo "arquivo") quando há — o JSON do Ops Center
// para em 32 KiB, e o PDF não cabe nele.
export async function POST(request: Request, context: { params: Promise<{ slug: string; id: string }> }) {
  return responderOps(async () => {
    const params = await context.params;
    const slug = slugSchema.parse(params.slug);
    if (!/^[0-9a-f-]{36}$/i.test(params.id)) throw new ErroOps("Tarefa não encontrada.", 404);
    const w = await autenticarWatcher(request, slug);
    const { corpo, arquivo } = await lerDevolucao(request);
    return devolverTarefa(w, params.id, devolucaoSchema.parse(corpo), arquivo);
  });
}

async function lerDevolucao(request: Request): Promise<{ corpo: unknown; arquivo: File | null }> {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) return { corpo: await lerJsonOps(request), arquivo: null };
  const tamanho = Number(request.headers.get("content-length"));
  if (!tamanho) throw new ErroOps("Informe o tamanho do envio (Content-Length).", 411);
  if (tamanho > CORPO_MAXIMO) throw new ErroOps("Envio acima do limite de 10 MB.", 413);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ErroOps("Envie como multipart/form-data.");
  }
  const resultado = form.get("resultado");
  if (typeof resultado !== "string") throw new ErroOps("Envie o resultado no campo “resultado”.");
  const arquivo = form.get("arquivo");
  return { corpo: JSON.parse(resultado), arquivo: arquivo instanceof File ? arquivo : null };
}
