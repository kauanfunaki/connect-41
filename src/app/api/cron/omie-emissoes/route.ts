import { NextRequest, NextResponse } from "next/server";
import { acompanharEmissoes } from "@/lib/integracoes/omie/emissaoServidor";

export const dynamic = "force-dynamic";

// Acompanhamento das NFS-e pedidas pelo Connect ao Omie (Fase 2, 13/10/2026).
// Chamado pelo n8n a cada 5 minutos, sem sessão — mesmo padrão das outras rotas
// de cron (token de serviço; "/api/cron/" já está em PUBLIC_PATHS no proxy).
//
// Só consulta o Omie (`StatusOS`): o que está em PROCESSANDO até a prefeitura
// responder, e o que ficou em ENVIANDO porque a resposta do Omie se perdeu.
// Nada é emitido nem faturado daqui. Nota autorizada entra no acervo fiscal.
export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SERVICE_TOKEN;
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!expected || !token || token !== expected) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const resumo = await acompanharEmissoes();
    // 200 mesmo com falha numa emissão: a falha fica na lista do resumo, e uma
    // conta com chave vencida não deve deixar o cron inteiro vermelho.
    return NextResponse.json({ ok: true, ...resumo });
  } catch (err) {
    console.error("[cron/omie-emissoes]", err);
    return NextResponse.json({ ok: false, error: "Falha ao acompanhar as emissões do Omie" }, { status: 500 });
  }
}
