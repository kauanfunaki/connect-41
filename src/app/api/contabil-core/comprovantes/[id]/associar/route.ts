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
import { associarComprovante, desassociarComprovante } from "@/lib/contabil-core/servidor/comprovantes";

export const runtime = "nodejs";

// Associar um comprovante a uma transação do extrato, e desfazer (Bloco C, Fase C2, 19/11/2026): porte do
// `POST` e do `DELETE /empresas/{id}/comprovantes/{comprovante_id}/associar`. A empresa vem no corpo.

type Rota = { params: Promise<{ id: string }> };

async function entrada(req: NextRequest, { params }: Rota) {
  const corpo = await corpoJson(req);
  if (!corpo) return { recusa: NextResponse.json({ error: "Pedido inválido." }, { status: 400 }) };
  const empresaId = idValido(corpo.empresa);
  if (!empresaId) return { recusa: semEmpresa() };
  const id = idValido((await params).id);
  if (!id) return { recusa: comprovanteInexistente() };
  return { corpo, empresaId, id };
}

export async function POST(req: NextRequest, rota: Rota) {
  const a = await autorizarComprovantes("agir");
  if (a.recusa) return a.recusa;
  const e = await entrada(req, rota);
  if (e.recusa) return e.recusa;
  const transacaoId = idValido(e.corpo.transacaoId ?? e.corpo.transacao_id);
  if (!transacaoId) return NextResponse.json({ error: "Escolha a transação.", codigo: "INVALIDA" }, { status: 400 });
  try {
    const r = await associarComprovante(a.ctx.tenantId, e.empresaId, e.id, transacaoId);
    if (!r.ok) return recusaDoComprovante(r);
    await auditarComprovante(a.ctx, e.id, r.valor.auditoria);
    return respostaSemCache({ ok: true, comprovante: r.valor.comprovante });
  } catch (err) {
    return erroDosComprovantes("associação", err, "Não deu para associar o comprovante. Tente de novo.");
  }
}

export async function DELETE(req: NextRequest, rota: Rota) {
  const a = await autorizarComprovantes("agir");
  if (a.recusa) return a.recusa;
  const e = await entrada(req, rota);
  if (e.recusa) return e.recusa;
  try {
    const r = await desassociarComprovante(a.ctx.tenantId, e.empresaId, e.id);
    if (!r.ok) return recusaDoComprovante(r);
    await auditarComprovante(a.ctx, e.id, r.valor.auditoria);
    return respostaSemCache({ ok: true, comprovante: r.valor.comprovante });
  } catch (err) {
    return erroDosComprovantes("desassociação", err, "Não deu para remover a associação. Tente de novo.");
  }
}
