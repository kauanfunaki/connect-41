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
import { novoVinculoFinanceiroSchema } from "@/lib/contabil-core/entradasFinanceiro";
import { vincular } from "@/lib/contabil-core/servidor/financeiro";

export const runtime = "nodejs";

// Registrar uma conferência do financeiro (Bloco B, Fase B4, 12/11/2026): porte do
// `POST /concilpro/financeiro/{id}/vinculos`. Linhas do documento base e de UMA origem que a pessoa
// diz que se correspondem (muitos para muitos, mesma natureza). Os totais, a diferença e a regra da
// justificativa são conferidos de novo no serviço; nenhum lançamento, extrato ou NEO muda.

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await autorizarFinanceiro("agir");
  if (a.recusa) return a.recusa;
  const corpo = await corpoJson(req);
  if (!corpo) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const empresaId = idValido(corpo.empresa);
  if (!empresaId) return semEmpresa();
  const analiseId = idValido((await params).id);
  if (!analiseId) return analiseInexistente();
  const v = validar(novoVinculoFinanceiroSchema, corpo);
  if (!v.ok) return v.resposta;
  try {
    const r = await vincular(a.ctx.tenantId, a.ctx.userId, empresaId, analiseId, v.valor);
    if (!r.ok) return recusaDoFinanceiro(r);
    if (!r.valor.analise) return erroDoFinanceiro("vínculo", new Error("sem análise"));
    await auditarFinanceiro(a.ctx, analiseId, r.valor.auditoria);
    return respostaDaAnalise(r.valor.analise);
  } catch (err) {
    return erroDoFinanceiro("vínculo", err, "Não deu para registrar a conferência. Tente de novo.");
  }
}
