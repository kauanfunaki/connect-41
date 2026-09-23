import { NextRequest, NextResponse } from "next/server";
import { sincronizarTodasAsContasOmie } from "@/lib/integracoes/omie/sincronizacao";

export const dynamic = "force-dynamic";

// Notas emitidas no Omie → acervo fiscal (Fase 1b). Chamado pelo n8n a cada
// 30 minutos, sem sessão — mesmo padrão das outras rotas de cron (token de
// serviço; "/api/cron/" já está em PUBLIC_PATHS no proxy). Só lê o Omie.
export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SERVICE_TOKEN;
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!expected || !token || token !== expected) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const contas = await sincronizarTodasAsContasOmie();
    // 200 mesmo com conta em erro: o erro fica na conta (tela de Integrações), e
    // uma chave vencida não deve deixar o cron inteiro vermelho.
    return NextResponse.json({ ok: true, contas });
  } catch (err) {
    console.error("[cron/omie-notas]", err);
    return NextResponse.json({ ok: false, error: "Falha ao ler as notas do Omie" }, { status: 500 });
  }
}
