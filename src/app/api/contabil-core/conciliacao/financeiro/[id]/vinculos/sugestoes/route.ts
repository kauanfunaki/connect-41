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
import { sugestoesEmLoteSchema } from "@/lib/contabil-core/entradasFinanceiro";
import { vincularSugestoes } from "@/lib/contabil-core/servidor/financeiro";

export const runtime = "nodejs";

// Confirmar várias sugestões de uma vez (Bloco B, Fase B4, 12/11/2026): porte do
// `POST /concilpro/financeiro/{id}/vinculos/sugestoes`. O id da sugestão inclui a versão da análise e
// cada conferência a avança: registrar uma por vez invalidaria as seguintes. Por isso o lote vai junto,
// revalidado contra a mesma versão e gravado na mesma transação — tudo ou nada.

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await autorizarFinanceiro("agir");
  if (a.recusa) return a.recusa;
  const corpo = await corpoJson(req);
  if (!corpo) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const empresaId = idValido(corpo.empresa);
  if (!empresaId) return semEmpresa();
  const analiseId = idValido((await params).id);
  if (!analiseId) return analiseInexistente();
  const v = validar(sugestoesEmLoteSchema, corpo);
  if (!v.ok) return v.resposta;
  try {
    const r = await vincularSugestoes(a.ctx.tenantId, a.ctx.userId, empresaId, analiseId, v.valor);
    if (!r.ok) return recusaDoFinanceiro(r);
    if (!r.valor.analise) return erroDoFinanceiro("sugestões em lote", new Error("sem análise"));
    await auditarFinanceiro(a.ctx, analiseId, r.valor.auditoria);
    return respostaDaAnalise(r.valor.analise);
  } catch (err) {
    return erroDoFinanceiro("sugestões em lote", err, "Não deu para registrar as sugestões. Tente de novo.");
  }
}
