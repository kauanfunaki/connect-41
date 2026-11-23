import { NextResponse } from "next/server";
import { idValido, semEmpresa } from "@/lib/contabil-core/conciliacao/rotaDaRevisao";
import { autorizarCartoes, erroDosCartoes, idsDoCaminho, naoEncontrado, recusaDoCartao } from "@/lib/contabil-core/cartoes/rotaDosCartoes";
import { arquivoDoDocumento } from "@/lib/contabil-core/servidor/faturas";

export const runtime = "nodejs";

// O PDF de um documento da fatura (Bloco C, Fase C3, 23/11/2026): porte do
// `GET .../documentos/{documento_id}/arquivo`. O serviço confere tenant, empresa, cartão, fatura e documento
// antes de ler o disco. Vai como anexo "fatura.pdf", com `nosniff` e sem cache, como no original.

type Params = { params: Promise<{ cartaoId: string; faturaId: string; documentoId: string }> };

export async function GET(req: Request, { params }: Params) {
  const a = await autorizarCartoes("ver");
  if (a.recusa) return a.recusa;
  const ids = idsDoCaminho(await params);
  if (!ids) return naoEncontrado();
  const empresaId = idValido(new URL(req.url).searchParams.get("empresa"));
  if (!empresaId) return semEmpresa();
  try {
    const r = await arquivoDoDocumento({ tenantId: a.ctx.tenantId, empresaId, cartaoId: ids.cartaoId, faturaId: ids.faturaId, userId: a.ctx.userId }, ids.documentoId);
    if (!r.ok) return recusaDoCartao(r);
    return new NextResponse(new Uint8Array(r.valor), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=fatura.pdf",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return erroDosCartoes("arquivo do documento", err, "Não deu para abrir o arquivo. Tente de novo.");
  }
}
