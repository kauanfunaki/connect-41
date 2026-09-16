import { NextRequest, NextResponse } from "next/server";
import { executarReguaDeCobranca, LIMITE_PADRAO_DE_ENVIOS } from "@/lib/financeiro/cobranca/executarRegua";

export const dynamic = "force-dynamic";

// A régua de cobrança: lembretes por e-mail ao sacado, por dias de atraso.
//
// Mesmo padrão das outras rotas de cron: POST com o token de serviço no
// `Authorization: Bearer`, e `/api/cron/` já está em PUBLIC_PATHS no proxy. O
// agendamento é do n8n (uma vez por dia basta — os passos são em dias).
//
// Processa em lote: no máximo `?limite=` envios por chamada (padrão 200, teto
// 1000). Com `maisPendentes: true` na resposta, o scheduler chama de novo. Pode
// ser chamado quantas vezes quiser: o passo de cada título é reservado no log
// antes do envio, e a segunda chamada não reenvia — ver
// src/lib/financeiro/cobranca/executarRegua.ts.
export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SERVICE_TOKEN;
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!expected || !token || token !== expected) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const bruto = Number(req.nextUrl.searchParams.get("limite"));
  const limite = Number.isInteger(bruto) && bruto > 0 ? bruto : LIMITE_PADRAO_DE_ENVIOS;

  try {
    // `tenantsSemSmtp` na resposta, e um aviso por tenant no log: régua ligada
    // sem SMTP é régua que não manda nada, e isso não pode ser um 200 mudo.
    const resultado = await executarReguaDeCobranca({ limite });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    console.error("[cron/cobranca-regua]", err);
    return NextResponse.json({ ok: false, error: "Falha ao executar a régua de cobrança" }, { status: 500 });
  }
}
