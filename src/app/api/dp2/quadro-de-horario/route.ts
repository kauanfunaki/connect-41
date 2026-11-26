import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { recusaDoFoco } from "@/lib/empresas/focoServidor";
import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { formatDocumento } from "@/lib/format";
import { linhasDoQuadro, pdfDoQuadroDeHorario } from "@/lib/dp2/quadroDeHorario";

export const dynamic = "force-dynamic";

// O quadro de horário de trabalho da empresa em PDF (26/11/2026, funcionalidade-776, entrega 2).
export async function GET(req: Request) {
  const companyId = new URL(req.url).searchParams.get("empresa") ?? "";
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await podeNoModulo(ctx, "dp2_colaboradores", "ver"))) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const foraDoFoco = await recusaDoFoco(ctx, [companyId]);
  if (foraDoFoco) return NextResponse.json({ error: foraDoFoco }, { status: 403 });
  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({ where: { id: companyId, tenantId: ctx.tenantId } });
  if (!empresa) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  const hoje = new Date();
  const [pessoas, horarios] = await Promise.all([
    prisma.person.findMany({
      where: { tenantId: ctx.tenantId, currentCompanyId: companyId, isInternal: false, dp2Vinculo: { isNot: null }, OR: [{ dismissalDate: null }, { dismissalDate: { gte: hoje } }] },
      select: { name: true, cargo: { select: { name: true } }, dp2Vinculo: { select: { horarioId: true } } },
    }),
    prisma.dp2Horario.findMany({ where: { tenantId: ctx.tenantId, companyId } }),
  ]);
  const horario = new Map(horarios.map((h) => [h.id, h]));
  const quadro = linhasDoQuadro(pessoas.map((p) => ({ nome: p.name, cargo: p.cargo?.name ?? null, horario: (p.dp2Vinculo?.horarioId && horario.get(p.dp2Vinculo.horarioId)) || null })));
  const endereco = [[empresa.addressStreet, empresa.addressNumber].filter(Boolean).join(", "), empresa.neighborhood, [empresa.city, empresa.stateCode].filter(Boolean).join("/")].filter(Boolean).join(" · ") || null;
  const pdf = await pdfDoQuadroDeHorario(quadro, {
    empresa: nomeExibicao(empresa),
    documento: formatDocumento(empresa.kind, empresa.cnpj, empresa.cpf) || null,
    endereco,
    cidade: empresa.city,
    data: hoje.toISOString().slice(0, 10),
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`Quadro de horario ${nomeExibicao(empresa)}.pdf`)}`, "Cache-Control": "no-store" },
  });
}
