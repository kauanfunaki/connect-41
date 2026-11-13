import { NextRequest, NextResponse } from "next/server";
import { corpoJson, idValido, semEmpresa, validar } from "@/lib/contabil-core/conciliacao/rotaDaRevisao";
import {
  analiseInexistente,
  auditarFinanceiro,
  autorizarFinanceiro,
  erroDoFinanceiro,
  recusaDoFinanceiro,
  respostaDaAnalise,
} from "@/lib/contabil-core/conciliacao/rotaDoFinanceiro";
import { desfazerVinculoFinanceiroSchema } from "@/lib/contabil-core/entradasFinanceiro";
import { desfazerVinculoFinanceiro } from "@/lib/contabil-core/servidor/financeiro";

export const runtime = "nodejs";

// Desfazer uma conferência do financeiro (Bloco B, Fase B4, 12/11/2026): porte do
// `POST /concilpro/financeiro/{id}/vinculos/{vinculoId}/desfazer`. O motivo é obrigatório
// (`FinanceiroDesfazer`); a relação anterior, o autor, a data e os valores continuam no histórico.

type Rota = { params: Promise<{ id: string; vinculoId: string }> };

export async function POST(req: NextRequest, { params }: Rota) {
  const a = await autorizarFinanceiro("agir");
  if (a.recusa) return a.recusa;
  const corpo = await corpoJson(req);
  if (!corpo) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const empresaId = idValido(corpo.empresa);
  if (!empresaId) return semEmpresa();
  const p = await params;
  const analiseId = idValido(p.id);
  if (!analiseId) return analiseInexistente();
  const vinculoId = idValido(p.vinculoId);
  if (!vinculoId) return NextResponse.json({ error: "Conferência não encontrada nesta análise.", codigo: "NAO_ENCONTRADA" }, { status: 404 });
  const v = validar(desfazerVinculoFinanceiroSchema, corpo);
  if (!v.ok) return v.resposta;
  try {
    const r = await desfazerVinculoFinanceiro(a.ctx.tenantId, a.ctx.userId, empresaId, analiseId, vinculoId, v.valor);
    if (!r.ok) return recusaDoFinanceiro(r);
    if (!r.valor.analise) return erroDoFinanceiro("desfazer", new Error("sem análise"));
    await auditarFinanceiro(a.ctx, analiseId, r.valor.auditoria);
    return respostaDaAnalise(r.valor.analise);
  } catch (err) {
    return erroDoFinanceiro("desfazer", err, "Não deu para desfazer a conferência. Tente de novo.");
  }
}
