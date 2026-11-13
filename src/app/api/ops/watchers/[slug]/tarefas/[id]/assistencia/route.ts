import { lerJsonOps, responderOps } from "@/lib/ops/http";
import { ErroOps, autenticarWatcher } from "@/lib/ops/servidor";
import { slugSchema } from "@/lib/ops/regras";
import { pedidoDeAssistenciaSchema } from "@/lib/robo/assistenciaEsquemas";
import { abrirAssistencia } from "@/lib/robo/assistenciaServidor";
export const runtime = "nodejs";

// O robô parou no captcha e pede ajuda (06/11/2026). No horário comercial o
// Connect abre a sessão, avisa quem pediu e responde com o prazo; fora dele,
// responde "não espere", e a tarefa segue para o caminho do PDF.
export async function POST(request: Request, context: { params: Promise<{ slug: string; id: string }> }) {
  return responderOps(async () => {
    const params = await context.params;
    const slug = slugSchema.parse(params.slug);
    if (!/^[0-9a-f-]{36}$/i.test(params.id)) throw new ErroOps("Tarefa não encontrada.", 404);
    const w = await autenticarWatcher(request, slug);
    const { motivo } = pedidoDeAssistenciaSchema.parse(await lerJsonOps(request));
    return abrirAssistencia(w, params.id, motivo);
  });
}
