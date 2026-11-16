import { contexto } from "@/lib/chamados/contexto";
import { revisarRascunho } from "@/lib/chamados/revisao";

// A revisão antes de abrir (16/11/2026, funcionalidade-702) é uma rota, e não
// uma server action, porque as actions de uma tela rodam em fila: com a IA
// lendo o pedido numa action, o "Abrir sem esperar" ficaria atrás dela. Com
// `fetch`, a tela cancela a espera e abre o chamado na hora.
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const c = await contexto();
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin && new URL(origin).host !== request.headers.get("x-forwarded-host")) return Response.json({ error: "Origem inválida." }, { status: 403 });
    const { draftId } = await request.json() as { draftId?: unknown };
    if (typeof draftId !== "string" || !draftId || draftId.length > 191) return Response.json({ error: "Rascunho inválido." }, { status: 400 });
    return Response.json({ revisao: await revisarRascunho(c, draftId) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Não foi possível revisar o pedido." }, { status: 400 });
  }
}
