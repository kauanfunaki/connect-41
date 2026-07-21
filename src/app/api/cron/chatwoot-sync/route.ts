import { NextRequest, NextResponse } from "next/server";
import { runChatwootSyncForAllTenants } from "@/lib/chatwoot/sync";

export const dynamic = "force-dynamic";

// Chamado por um scheduler externo (n8n) sem sessão de usuário — mesmo padrão
// de src/app/api/cron/alerts/route.ts (token de serviço, rota já coberta por
// "/api/cron/" em PUBLIC_PATHS no proxy). Roda sincronização inicial (com
// checkpoint) ou reconciliação para cada tenant com conexão Chatwoot ativa.
export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SERVICE_TOKEN;
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!expected || !token || token !== expected) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const result = await runChatwootSyncForAllTenants();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/chatwoot-sync]", err);
    return NextResponse.json({ ok: false, error: "Falha ao rodar a sincronização do Chatwoot" }, { status: 500 });
  }
}
