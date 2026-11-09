import { getAuthContext } from "@/lib/auth/context";
import { chamadasDaPessoa, podeAssistir } from "@/lib/robo/assistenciaServidor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// A janela do captcha em qualquer tela (09/11/2026): o layout pergunta aqui se
// alguma sessão aberta chama a pessoa, e se ela tem tarefa na fila do robô —
// é o que decide o ritmo da conferência. O mesmo portão da tela
// `/robo/assistir/[id]`: sem ele, 403, e o layout para de perguntar.
//
// JSON por rota, e não Server Action: a conferência roda em segundo plano, e
// uma action no meio de uma navegação pode desfazer um filtro recém-aplicado
// (o mesmo motivo do alerta de reunião).
export async function GET() {
  const ctx = await getAuthContext();
  if (!(await podeAssistir(ctx))) return Response.json({ error: "Sem acesso." }, { status: 403 });
  return Response.json(await chamadasDaPessoa(ctx), { headers: { "Cache-Control": "private, no-store" } });
}
