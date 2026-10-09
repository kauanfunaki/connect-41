import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { receberAvisoPorEmail } from "@/lib/societario/avisos";
import { idDoEmail } from "@/lib/societario/idDoEmail";

export const dynamic = "force-dynamic";

// Entrada dos avisos da Junta que chegam por e-mail (28/09).
//
// O n8n lê a caixa societario@ por IMAP e manda cada e-mail novo aqui, com o
// token de serviço — o mesmo padrão das outras rotas de `/api/cron/`, que já
// estão em PUBLIC_PATHS no proxy. O tenant vem pelo slug na URL
// (`?tenant=<slug>`): a caixa é de um escritório só, e quem configura o fluxo
// sabe qual é.
//
// Nada aqui aplica desfecho. A rota grava o aviso como sugestão e avisa quem
// decide — ver src/lib/societario/avisos.ts.

type Corpo = {
  messageId?: unknown;
  from?: unknown;
  subject?: unknown;
  date?: unknown;
  text?: unknown;
  html?: unknown;
};

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SERVICE_TOKEN;
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!expected || !token || token !== expected) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const slug = req.nextUrl.searchParams.get("tenant")?.trim();
  if (!slug) return NextResponse.json({ error: "Informe ?tenant=<slug>" }, { status: 400 });
  const tenant = await getPrisma().tenant.findUnique({ where: { slug }, select: { id: true, active: true } });
  if (!tenant || !tenant.active) return NextResponse.json({ error: "Tenant não encontrado" }, { status: 404 });

  let corpo: Corpo;
  try {
    corpo = (await req.json()) as Corpo;
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  // Sem Message-ID (09/10/2026: o Sistema Nacional da NFS-e não manda), o id
  // vem de um resumo do próprio e-mail, em vez de recusar — ver idDoEmail.
  const messageId = idDoEmail({
    messageId: texto(corpo.messageId),
    remetente: texto(corpo.from),
    data: texto(corpo.date),
    assunto: texto(corpo.subject),
    texto: texto(corpo.text),
  });
  const data = texto(corpo.date) ? new Date(corpo.date as string) : new Date();

  try {
    const resultado = await receberAvisoPorEmail(tenant.id, {
      messageId,
      remetente: texto(corpo.from),
      assunto: texto(corpo.subject),
      recebidoEm: Number.isNaN(data.getTime()) ? new Date() : data,
      texto: texto(corpo.text),
      html: texto(corpo.html),
    });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    console.error("[cron/societario-avisos-email]", err);
    return NextResponse.json({ ok: false, error: "Falha ao registrar o aviso" }, { status: 500 });
  }
}
