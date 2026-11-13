import { lerJsonOps, responderOps } from "@/lib/ops/http";
import { ErroOps, autenticarWatcher } from "@/lib/ops/servidor";
import { slugSchema } from "@/lib/ops/regras";
import { fimDaAssistenciaSchema } from "@/lib/robo/assistenciaEsquemas";
import { encerrarAssistencia } from "@/lib/robo/assistenciaServidor";
export const runtime = "nodejs";

// O robô terminou a espera pelo captcha (06/11/2026): resolvido, prazo ou
// desistiu. A auditoria grava quem clicou como quem resolveu.
export async function POST(request: Request, context: { params: Promise<{ slug: string; id: string }> }) {
  return responderOps(async () => {
    const params = await context.params;
    const slug = slugSchema.parse(params.slug);
    if (!/^[0-9a-f-]{36}$/i.test(params.id)) throw new ErroOps("Tarefa não encontrada.", 404);
    const w = await autenticarWatcher(request, slug);
    const { resultado } = fimDaAssistenciaSchema.parse(await lerJsonOps(request));
    return encerrarAssistencia(w, params.id, resultado);
  });
}
