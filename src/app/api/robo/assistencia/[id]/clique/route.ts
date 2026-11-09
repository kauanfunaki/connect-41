import { getAuthContext } from "@/lib/auth/context";
import { exigirOrigem } from "@/lib/ops/http";
import { ErroOps } from "@/lib/ops/servidor";
import { cliqueSchema } from "@/lib/robo/assistencia";
import { cliqueDaPessoa, podeAssistir } from "@/lib/robo/assistenciaServidor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Um clique na tela espelhada (06/11/2026). Só a posição, em fração do quadro:
// não existe caminho para mandar tecla, então pela janela não se digita nada
// no site do órgão. O robô busca o clique junto com o próximo quadro.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    exigirOrigem(request);
  } catch (err) {
    return Response.json({ error: err instanceof ErroOps ? err.message : "Origem inválida." }, { status: 403 });
  }
  const ctx = await getAuthContext();
  if (!(await podeAssistir(ctx))) return Response.json({ error: "Sem acesso." }, { status: 403 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Tarefa não encontrada." }, { status: 404 });
  const tamanho = Number(request.headers.get("content-length") ?? 0);
  if (tamanho > 1024) return Response.json({ error: "Pedido grande demais." }, { status: 413 });
  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return Response.json({ error: "Pedido inválido." }, { status: 400 });
  }
  const clique = cliqueSchema.safeParse(corpo);
  if (!clique.success) return Response.json({ error: "Clique fora da tela." }, { status: 400 });
  const r = await cliqueDaPessoa(ctx, id, clique.data);
  return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.erro }, { status: 409 });
}
