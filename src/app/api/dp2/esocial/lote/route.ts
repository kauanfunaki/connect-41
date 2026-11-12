import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { acessoAoEsocial } from "@/lib/dp2/esocial/acesso";
import { loteParaConferencia } from "@/lib/dp2/esocial/eventos";
import { EVENTOS_POR_LOTE, GRUPO_DO_EVENTO, type TipoDeEvento } from "@/lib/dp2/esocial/leiaute";

export const dynamic = "force-dynamic";

// Os eventos prontos de um grupo (1 tabelas, 3 periódicos) da empresa num lote
// para conferência e validação (12/11/2026). Não é o arquivo de envio: os
// eventos ainda não estão assinados.
export async function GET(req: NextRequest) {
  const empresa = req.nextUrl.searchParams.get("empresa") ?? "";
  const pedido = req.nextUrl.searchParams.get("grupo");
  const grupo = pedido === "3" ? "3" : pedido === "2" ? "2" : "1";
  const acesso = await acessoAoEsocial(empresa);
  if ("erro" in acesso) return NextResponse.json({ error: acesso.erro }, { status: acesso.status });
  const prisma = getPrisma();
  const [empresaDb, tenant, eventos] = await Promise.all([
    prisma.company.findFirst({ where: { id: empresa, tenantId: acesso.ctx.tenantId }, select: { cnpj: true } }),
    prisma.tenant.findUnique({ where: { id: acesso.ctx.tenantId }, select: { cnpj: true } }),
    prisma.dp2EventoEsocial.findMany({
      where: { tenantId: acesso.ctx.tenantId, companyId: empresa, situacao: "PRONTO" },
      orderBy: [{ tipo: "asc" }, { createdAt: "asc" }],
      select: { tipo: true, idEvento: true, xml: true },
    }),
  ]);
  if (!empresaDb?.cnpj) return NextResponse.json({ error: "Empresa sem CNPJ." }, { status: 404 });
  const doGrupo = eventos.filter((e) => GRUPO_DO_EVENTO[e.tipo as TipoDeEvento] === grupo).slice(0, EVENTOS_POR_LOTE);
  if (doGrupo.length === 0) return NextResponse.json({ error: "Nenhum evento pronto neste grupo." }, { status: 404 });
  // O transmissor é o escritório (procurador); sem CNPJ do escritório, a própria empresa.
  const xml = loteParaConferencia(empresaDb.cnpj, tenant?.cnpj ?? empresaDb.cnpj, grupo, doGrupo);
  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="lote_grupo${grupo}_conferencia.xml"`,
      "Cache-Control": "no-store",
    },
  });
}
