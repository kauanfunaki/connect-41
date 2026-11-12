import { NextResponse } from "next/server";
import { competenciaParaBaixar, lancamentosDaCompetencia } from "@/lib/dp2/saidas";
import { csvDosLancamentos } from "@/lib/dp2/contabilizacao";

export const dynamic = "force-dynamic";

// Os lançamentos contábeis da competência do DP 2 em CSV (12/11/2026):
// Data;Débito;Crédito;Valor;Histórico, datados no último dia do mês.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acesso = await competenciaParaBaixar(id);
  if ("erro" in acesso) return NextResponse.json({ error: acesso.erro }, { status: acesso.status });
  const l = await lancamentosDaCompetencia(acesso.ctx.tenantId, id);
  if (!l || l.lancamentos.length === 0) return NextResponse.json({ error: "Não há lançamentos: calcule a folha." }, { status: 404 });
  const nome = `Lancamentos folha ${l.referencia.replace("/", "-")}.csv`;
  return new NextResponse(csvDosLancamentos(l.lancamentos, l.data), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`,
      "Cache-Control": "no-store",
    },
  });
}
