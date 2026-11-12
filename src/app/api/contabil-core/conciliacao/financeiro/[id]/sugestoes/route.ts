import { NextRequest, NextResponse } from "next/server";
import { idValido, semEmpresa } from "@/lib/contabil-core/conciliacao/rotaDaRevisao";
import {
  analiseInexistente,
  autorizarFinanceiro,
  erroDoFinanceiro,
  recusaDoFinanceiro,
  respostaSemCache,
  tipoDeComparacao,
} from "@/lib/contabil-core/conciliacao/rotaDoFinanceiro";
import { sugestoesDaAnalise } from "@/lib/contabil-core/servidor/financeiro";

export const runtime = "nodejs";

// As sugestões de conferência de uma análise (Bloco B, Fase B4, 12/11/2026): porte do
// `GET /concilpro/financeiro/{id}/sugestoes?tipo=`. Só leitura: nada é gravado até a pessoa confirmar
// (em `vinculos` ou `vinculos/sugestoes`). Com o Extrato, se ele mudou depois da análise, 409.

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await autorizarFinanceiro("ver");
  if (a.recusa) return a.recusa;
  const q = req.nextUrl.searchParams;
  const empresaId = idValido(q.get("empresa"));
  if (!empresaId) return semEmpresa();
  const analiseId = idValido((await params).id);
  if (!analiseId) return analiseInexistente();
  const tipo = tipoDeComparacao(q.get("tipo"));
  if (!tipo) return NextResponse.json({ error: "Escolha o tipo de comparação." }, { status: 400 });
  try {
    const r = await sugestoesDaAnalise(a.ctx.tenantId, empresaId, analiseId, tipo);
    if (!r.ok) return recusaDoFinanceiro(r);
    return respostaSemCache({ ok: true, sugestoes: r.valor });
  } catch (err) {
    return erroDoFinanceiro("sugestões", err, "Não deu para procurar as sugestões. Tente de novo.");
  }
}
