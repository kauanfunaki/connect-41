import { NextRequest, NextResponse } from "next/server";
import { runAlertEngine } from "@/lib/alerts";

export const dynamic = "force-dynamic";

// Chamado por um scheduler externo (n8n) sem sessão de usuário — por isso
// este caminho está em PUBLIC_PATHS no proxy (bypassa o gate de JWT) e faz a
// própria autenticação aqui via token de serviço, no mesmo espírito do
// HUB_SERVICE_TOKEN (ver src/lib/hub.ts), só que de fora pra dentro.
export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SERVICE_TOKEN;
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!expected || !token || token !== expected) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const result = await runAlertEngine();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/alerts]", err);
    return NextResponse.json({ ok: false, error: "Falha ao rodar o motor de alertas" }, { status: 500 });
  }
}
