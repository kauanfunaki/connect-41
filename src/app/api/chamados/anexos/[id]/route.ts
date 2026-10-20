import { getPrisma } from "@/lib/prisma";
import { contexto } from "@/lib/chamados/contexto";
import { detalhe } from "@/lib/chamados/consultas";
import { podeVerInterno } from "@/lib/chamados/acesso";
import { anexosDoChamado } from "@/lib/chamados/armazenamento";
import { respostaDoAnexo } from "@/lib/financeiro/pendencias/armazenamento";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const c = await contexto(), { id } = await params;
    const a = await getPrisma().helpdeskAttachment.findFirst({ where: { id, tenantId: c.ctx.tenantId }, include: { draft: { select: { createdById: true } } } });
    if (!a) return new Response(null, { status: 404 });
    if (a.ticketId) { await detalhe(c, a.ticketId); if (a.internal && !podeVerInterno(c.ctx, c.config)) return new Response(null, { status: 404 }); }
    else if (a.draft.createdById !== c.ctx.userId) return new Response(null, { status: 404 });
    const bytes = await anexosDoChamado.lerAnexo(a.fileUrl);
    return bytes ? respostaDoAnexo(bytes, a) : new Response(null, { status: 404 });
  } catch { return new Response(null, { status: 404 }); }
}
