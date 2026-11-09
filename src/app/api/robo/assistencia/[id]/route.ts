import { getAuthContext } from "@/lib/auth/context";
import { lerAssistencia, podeAssistir } from "@/lib/robo/assistenciaServidor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// A tela espelhada do robô parado no captcha (06/11/2026): o estado da sessão e,
// quando há, o quadro mais novo que o `desde` que a página já mostra. A página
// pergunta a cada ~0,7 s enquanto a sessão está aberta.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!(await podeAssistir(ctx))) return Response.json({ error: "Sem acesso." }, { status: 403 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Tarefa não encontrada." }, { status: 404 });
  const desde = Number(new URL(request.url).searchParams.get("desde") ?? 0);
  const a = await lerAssistencia(ctx, id, Number.isFinite(desde) ? desde : 0);
  if (!a) return Response.json({ error: "Tarefa não encontrada." }, { status: 404 });
  return Response.json(a, { headers: { "Cache-Control": "private, no-store" } });
}
