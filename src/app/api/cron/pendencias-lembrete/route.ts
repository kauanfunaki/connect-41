import { NextRequest, NextResponse } from "next/server";
import { executarLembretesDePendencia, LIMITE_PADRAO_DE_LEMBRETES } from "@/lib/financeiro/pendencias/executarLembretes";

export const dynamic = "force-dynamic";

// Lembrete de pendência vencida: e-mail ao cliente quando o prazo passa sem
// resposta, com 1, 3, 7 e 15 dias de atraso.
//
// Mesmo padrão das outras rotas de cron: POST com o token de serviço no
// `Authorization: Bearer`, e `/api/cron/` já está em PUBLIC_PATHS no proxy. O
// agendamento é do n8n, e não do scheduler interno de `instrumentation.ts`: o
// e-mail vai ao cliente, então sai em dia útil e horário comercial — o scheduler
// interno roda a cada 15 minutos a qualquer hora, e o dia dele vira às 21h de
// Brasília.
//
// Pode ser chamado quantas vezes quiser: o passo de cada pendência é reservado
// antes do envio, e a segunda chamada não reenvia — ver
// src/lib/financeiro/pendencias/executarLembretes.ts.
export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SERVICE_TOKEN;
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!expected || !token || token !== expected) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const bruto = Number(req.nextUrl.searchParams.get("limite"));
  const limite = Number.isInteger(bruto) && bruto > 0 ? bruto : LIMITE_PADRAO_DE_LEMBRETES;

  try {
    // `tenantsSemSmtp` na resposta, e um aviso por tenant no log: pendência
    // vencida sem SMTP é lembrete que não sai, e isso não pode ser um 200 mudo.
    const resultado = await executarLembretesDePendencia({ limite });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    console.error("[cron/pendencias-lembrete]", err);
    return NextResponse.json({ ok: false, error: "Falha ao enviar os lembretes de pendência" }, { status: 500 });
  }
}
