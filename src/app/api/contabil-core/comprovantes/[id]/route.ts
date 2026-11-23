import { NextRequest, NextResponse } from "next/server";
import { corpoJson, idValido, semEmpresa } from "@/lib/contabil-core/conciliacao/rotaDaRevisao";
import {
  auditarComprovante,
  autorizarComprovantes,
  comprovanteInexistente,
  erroDosComprovantes,
  recusaDoComprovante,
  respostaSemCache,
} from "@/lib/contabil-core/comprovantes/rotaDosComprovantes";
import { excluirComprovante, obterComprovante } from "@/lib/contabil-core/servidor/comprovantes";

export const runtime = "nodejs";

// Um comprovante de pagamento (Bloco C, Fase C2, 19/11/2026): porte do `GET` e do
// `DELETE /empresas/{id}/comprovantes/{comprovante_id}`. Excluir é lógico (o comprovante é prova de
// pagamento); a associação deixa de valer junto, e o arquivo pode ser importado de novo.

type Rota = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Rota) {
  const a = await autorizarComprovantes("ver");
  if (a.recusa) return a.recusa;
  const empresaId = idValido(req.nextUrl.searchParams.get("empresa"));
  if (!empresaId) return semEmpresa();
  const id = idValido((await params).id);
  if (!id) return comprovanteInexistente();
  try {
    const r = await obterComprovante(a.ctx.tenantId, empresaId, id);
    if (!r.ok) return recusaDoComprovante(r);
    return respostaSemCache({ ok: true, comprovante: r.valor });
  } catch (err) {
    return erroDosComprovantes("leitura", err);
  }
}

export async function DELETE(req: NextRequest, { params }: Rota) {
  const a = await autorizarComprovantes("agir");
  if (a.recusa) return a.recusa;
  const corpo = await corpoJson(req);
  if (!corpo) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const empresaId = idValido(corpo.empresa);
  if (!empresaId) return semEmpresa();
  const id = idValido((await params).id);
  if (!id) return comprovanteInexistente();
  try {
    const r = await excluirComprovante(a.ctx.tenantId, empresaId, id);
    if (!r.ok) return recusaDoComprovante(r);
    await auditarComprovante(a.ctx, id, r.valor.auditoria);
    return respostaSemCache({ ok: true });
  } catch (err) {
    return erroDosComprovantes("exclusão", err, "Não deu para excluir o comprovante. Tente de novo.");
  }
}
