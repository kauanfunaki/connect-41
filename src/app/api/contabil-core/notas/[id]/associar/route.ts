import { NextRequest, NextResponse } from "next/server";
import { corpoJson, idValido, semEmpresa } from "@/lib/contabil-core/conciliacao/rotaDaRevisao";
import { auditarNota, autorizarNotas, erroDasNotas, notaInexistente, recusaDaNota, respostaSemCache } from "@/lib/contabil-core/notas/rotaDasNotas";
import { associarNota, desassociarNota } from "@/lib/contabil-core/servidor/notas";

export const runtime = "nodejs";

// Associar uma nota a uma transação do extrato, e desfazer (Bloco C, Fase C1, 18/11/2026): porte do
// `POST` e do `DELETE /empresas/{id}/notas/{nota_id}/associar`. A empresa vem no corpo.

type Rota = { params: Promise<{ id: string }> };

async function entrada(req: NextRequest, { params }: Rota) {
  const corpo = await corpoJson(req);
  if (!corpo) return { recusa: NextResponse.json({ error: "Pedido inválido." }, { status: 400 }) };
  const empresaId = idValido(corpo.empresa);
  if (!empresaId) return { recusa: semEmpresa() };
  const notaId = idValido((await params).id);
  if (!notaId) return { recusa: notaInexistente() };
  return { corpo, empresaId, notaId };
}

export async function POST(req: NextRequest, rota: Rota) {
  const a = await autorizarNotas("agir");
  if (a.recusa) return a.recusa;
  const e = await entrada(req, rota);
  if (e.recusa) return e.recusa;
  const transacaoId = idValido(e.corpo.transacaoId ?? e.corpo.transacao_id);
  if (!transacaoId) return NextResponse.json({ error: "Escolha a transação.", codigo: "INVALIDA" }, { status: 400 });
  try {
    const r = await associarNota(a.ctx.tenantId, e.empresaId, e.notaId, transacaoId);
    if (!r.ok) return recusaDaNota(r);
    await auditarNota(a.ctx, e.notaId, r.valor.auditoria);
    return respostaSemCache({ ok: true, nota: r.valor.nota });
  } catch (err) {
    return erroDasNotas("associação", err, "Não deu para associar a nota. Tente de novo.");
  }
}

export async function DELETE(req: NextRequest, rota: Rota) {
  const a = await autorizarNotas("agir");
  if (a.recusa) return a.recusa;
  const e = await entrada(req, rota);
  if (e.recusa) return e.recusa;
  try {
    const r = await desassociarNota(a.ctx.tenantId, e.empresaId, e.notaId);
    if (!r.ok) return recusaDaNota(r);
    await auditarNota(a.ctx, e.notaId, r.valor.auditoria);
    return respostaSemCache({ ok: true, nota: r.valor.nota });
  } catch (err) {
    return erroDasNotas("desassociação", err, "Não deu para remover a associação. Tente de novo.");
  }
}
