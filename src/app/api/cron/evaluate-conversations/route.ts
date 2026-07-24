import { NextRequest, NextResponse } from "next/server";
import { runEvaluationForAllTenants } from "@/lib/chatwoot/evaluation";

export const dynamic = "force-dynamic";

// Chamado por um scheduler externo (n8n) sem sessão de usuário — mesmo padrão
// de src/app/api/cron/alerts/route.ts e chatwoot-sync/route.ts (token de
// serviço, rota já coberta por "/api/cron/" em PUBLIC_PATHS no proxy). Avalia
// um lote pequeno de conversas resolvidas sem nota a cada chamada.
export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SERVICE_TOKEN;
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!expected || !token || token !== expected) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const result = await runEvaluationForAllTenants();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/evaluate-conversations]", err);
    return NextResponse.json({ ok: false, error: "Falha ao rodar a avaliação de atendimentos" }, { status: 500 });
  }
}
