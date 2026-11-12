import { NextRequest, NextResponse } from "next/server";
import { competenciaParaBaixar, dadosDosHolerites } from "@/lib/dp2/saidas";
import { pdfDosHolerites } from "@/lib/dp2/holeritePdf";

export const dynamic = "force-dynamic";

// Os holerites da competência do DP 2 em PDF (12/11/2026): todos, ou de uma
// pessoa com `?pessoa=`. Quem baixa é quem vê a competência, com a empresa
// dentro da faixa "Trabalhando em".
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acesso = await competenciaParaBaixar(id);
  if ("erro" in acesso) return NextResponse.json({ error: acesso.erro }, { status: acesso.status });
  const pessoa = req.nextUrl.searchParams.get("pessoa") ?? undefined;
  const h = await dadosDosHolerites(acesso.ctx.tenantId, id, pessoa);
  if (!h || h.dados.length === 0) return NextResponse.json({ error: "Não há holerites calculados." }, { status: 404 });
  const pdf = await pdfDosHolerites(h.dados);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(h.nomeDoArquivo)}`,
      "Cache-Control": "no-store",
    },
  });
}
