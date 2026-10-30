import { lerJsonOps, responderOps } from "@/lib/ops/http";
import { autenticarWatcher } from "@/lib/ops/servidor";
import { slugSchema } from "@/lib/ops/regras";
import { pedidoDeTrabalhoSchema } from "@/lib/robo/tarefas";
import { pegarProxima } from "@/lib/robo/servidor";
export const runtime = "nodejs";
// O robô do Societário (scripts/robo-societario.mjs) pede a próxima tarefa,
// dizendo o que sabe fazer. Vale também como sinal de vida. Ver src/lib/robo/.
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  return responderOps(async () => {
    const slug = slugSchema.parse((await context.params).slug);
    const w = await autenticarWatcher(request, slug);
    const pedido = pedidoDeTrabalhoSchema.parse(await lerJsonOps(request));
    return pegarProxima(w, pedido.capacidades);
  });
}
