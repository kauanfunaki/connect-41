import type { NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { doErro } from "@/lib/fiscal/motor/acoes";
import { portaoDaSessao } from "@/lib/fiscal/motor/portaoDoUpload";
import { responder, statusDoErro } from "@/lib/fiscal/motor/rotas";

export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string }> };

/**
 * A sessão de upload (API-CONNECT §14.4): `GET` é como a tela retoma um envio
 * interrompido (as partes que o motor já tem) e confere, depois de uma
 * conclusão sem resposta, se ela aconteceu; `DELETE` cancela (apaga a sessão
 * e as partes no motor; a importação já feita, se houver, fica).
 */
export async function GET(req: NextRequest, ctx: Contexto) {
  const g = await portaoDaSessao(req, (await ctx.params).id);
  if ("recusa" in g) return g.recusa;
  try {
    const upload = await g.p.motor.cliente.obterUpload(g.raiz, g.id);
    return responder({ ok: true, mensagem: `Sessão ${upload.estado}.`, dados: upload });
  } catch (err) {
    return responder(doErro(err), statusDoErro(err));
  }
}

export async function DELETE(req: NextRequest, ctx: Contexto) {
  const g = await portaoDaSessao(req, (await ctx.params).id);
  if ("recusa" in g) return g.recusa;
  const { p, raiz, id } = g;
  try {
    await p.motor.cliente.apagarUpload(raiz, id, { ator: p.ator });
    await logAudit({ tenantId: p.ctx.tenantId, userId: p.ctx.userId, action: "fiscal.sped.upload.cancelado",
      entityType: "SpedUpload", entityId: id, metadata: { nome: `envio ${id.slice(0, 8)}`, raiz } });
    return responder({ ok: true, mensagem: "Envio cancelado: as partes foram apagadas no motor." });
  } catch (err) {
    return responder(doErro(err), statusDoErro(err));
  }
}
