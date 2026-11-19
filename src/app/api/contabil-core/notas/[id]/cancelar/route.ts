import { NextRequest, NextResponse } from "next/server";
import { corpoJson, idValido, semEmpresa } from "@/lib/contabil-core/conciliacao/rotaDaRevisao";
import { auditarNota, autorizarNotas, erroDasNotas, notaInexistente, recusaDaNota, respostaSemCache } from "@/lib/contabil-core/notas/rotaDasNotas";
import { cancelarNota } from "@/lib/contabil-core/servidor/notas";

export const runtime = "nodejs";

// Cancelar uma nota fiscal (Bloco C, Fase C1, 18/11/2026): porte do `POST /empresas/{id}/notas/{nota_id}/cancelar`.
// A nota fica "cancelada" e a associação com a transação sai junto, como no serviço do original.

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await autorizarNotas("agir");
  if (a.recusa) return a.recusa;
  const corpo = await corpoJson(req);
  if (!corpo) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const empresaId = idValido(corpo.empresa);
  if (!empresaId) return semEmpresa();
  const notaId = idValido((await params).id);
  if (!notaId) return notaInexistente();
  try {
    const r = await cancelarNota(a.ctx.tenantId, empresaId, notaId);
    if (!r.ok) return recusaDaNota(r);
    await auditarNota(a.ctx, notaId, r.valor.auditoria);
    return respostaSemCache({ ok: true, nota: r.valor.nota });
  } catch (err) {
    return erroDasNotas("cancelamento", err, "Não deu para cancelar a nota. Tente de novo.");
  }
}
