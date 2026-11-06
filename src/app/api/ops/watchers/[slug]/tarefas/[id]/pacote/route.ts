import { responderOps } from "@/lib/ops/http";
import { ErroOps, autenticarWatcher } from "@/lib/ops/servidor";
import { slugSchema } from "@/lib/ops/regras";
import { pacoteDaTarefa } from "@/lib/fiscal/sped/local/geracaoPeloAgente";
export const runtime = "nodejs";

// O agente do motor do SPED baixa o pacote da revisão que pegou (06/11/2026).
// Só a máquina que está com a tarefa `gerar_sped`; os bytes são os canônicos,
// os mesmos do SHA-256 que veio nos dados da tarefa. Ver
// docs/SPED-GERACAO-PELO-AGENTE.md.
export async function GET(request: Request, context: { params: Promise<{ slug: string; id: string }> }) {
  try {
    const params = await context.params;
    const slug = slugSchema.parse(params.slug);
    if (!/^[0-9a-f-]{36}$/i.test(params.id)) throw new ErroOps("Tarefa não encontrada.", 404);
    const w = await autenticarWatcher(request, slug);
    const { bytes, sha256 } = await pacoteDaTarefa(w, params.id);
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Length": String(bytes.length), "X-Conteudo-SHA256": sha256, "Cache-Control": "no-store" },
    });
  } catch (err) {
    // Os erros saem no mesmo formato das outras rotas da máquina.
    return responderOps(async () => { throw err; });
  }
}
