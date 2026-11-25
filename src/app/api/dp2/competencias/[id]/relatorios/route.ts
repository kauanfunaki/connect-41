import { NextResponse } from "next/server";
import { competenciaParaBaixar, dadosDosRelatorios } from "@/lib/dp2/saidas";
import { planilhaDosRelatorios } from "@/lib/dp2/relatoriosDaFolha";

export const dynamic = "force-dynamic";

// Os relatórios da folha da competência em Excel (25/11/2026, funcionalidade-748):
// resumo por rubrica, folha analítica, encargos e provisões.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acesso = await competenciaParaBaixar(id);
  if ("erro" in acesso) return NextResponse.json({ error: acesso.erro }, { status: acesso.status });
  const d = await dadosDosRelatorios(acesso.ctx.tenantId, id);
  if (!d || d.calculos.length === 0) return NextResponse.json({ error: "Não há cálculo: calcule a folha." }, { status: 404 });
  const planilha = await planilhaDosRelatorios(d.titulo, d.calculos);
  return new NextResponse(new Uint8Array(planilha), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(d.nomeDoArquivo)}`,
      "Cache-Control": "no-store",
    },
  });
}
