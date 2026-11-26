import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { competenciaParaBaixar, dadosDosHolerites } from "@/lib/dp2/saidas";
import { pdfDoRpa } from "@/lib/dp2/reciboRpa";

export const dynamic = "force-dynamic";

// O recibo de pagamento a autônomo (RPA) de uma pessoa na competência (26/11/2026, funcionalidade-759).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const personId = new URL(req.url).searchParams.get("pessoa") ?? "";
  const acesso = await competenciaParaBaixar(id);
  if ("erro" in acesso) return NextResponse.json({ error: acesso.erro }, { status: acesso.status });
  const tenantId = acesso.ctx.tenantId;
  const [vinculo, calculo, d] = await Promise.all([
    getPrisma().dp2Vinculo.findFirst({ where: { tenantId, personId }, select: { categoria: true } }),
    getPrisma().dp2Calculo.findFirst({ where: { tenantId, competenciaId: id, personId }, select: { encargos: true } }),
    dadosDosHolerites(tenantId, id, personId),
  ]);
  if (vinculo?.categoria !== "701") return NextResponse.json({ error: "O RPA é do autônomo (categoria 701)." }, { status: 400 });
  const h = d?.dados[0];
  if (!h || !calculo) return NextResponse.json({ error: "Calcule a competência antes de emitir o RPA." }, { status: 404 });
  const pdf = await pdfDoRpa({
    empresa: h.empresaNome,
    documentoDaEmpresa: h.empresaDocumento,
    competencia: h.competencia,
    autonomo: h.colaborador,
    cpf: h.cpf,
    linhas: h.linhas,
    proventos: h.proventos,
    descontos: h.descontos,
    liquido: h.liquido,
    inssEmpresa: Number((calculo.encargos as { inssEmpresa?: number } | null)?.inssEmpresa ?? 0),
  });
  const nome = `RPA ${h.colaborador} ${h.competencia.replace("/", "-")}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`, "Cache-Control": "no-store" },
  });
}
