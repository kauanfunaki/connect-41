import { NextRequest, NextResponse } from "next/server";
import { pontuarNovasCandidaturas } from "@/lib/recrutamento/triagemServidor";

export const dynamic = "force-dynamic";

// Pontuação automática da triagem (R1). Chamado pelo n8n a cada poucos minutos,
// sem sessão — mesmo padrão de evaluate-conversations/route.ts (token de
// serviço; "/api/cron/" já está em PUBLIC_PATHS no proxy). Cada chamada pontua
// um lote pequeno de candidaturas novas; o teto de gasto de cada tenant vale.
export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SERVICE_TOKEN;
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!expected || !token || token !== expected) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const result = await pontuarNovasCandidaturas();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/triagem]", err);
    return NextResponse.json({ ok: false, error: "Falha ao rodar a triagem automática" }, { status: 500 });
  }
}
