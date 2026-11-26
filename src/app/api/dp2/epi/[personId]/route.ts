import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { recusaDoFoco } from "@/lib/empresas/focoServidor";
import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { formatCpf, formatDocumento } from "@/lib/format";
import { pdfDaFichaDeEpi } from "@/lib/dp2/sst";

export const dynamic = "force-dynamic";

// A ficha de controle de entrega de EPI do colaborador em PDF, para assinatura (26/11/2026, funcionalidade-761).
export async function GET(_req: Request, { params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await podeNoModulo(ctx, "dp2_colaboradores", "ver"))) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const prisma = getPrisma();
  const pessoa = await prisma.person.findFirst({ where: { id: personId, tenantId: ctx.tenantId }, select: { name: true, cpf: true, currentCompanyId: true, cargo: { select: { name: true } } } });
  if (!pessoa?.currentCompanyId) return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 404 });
  const foraDoFoco = await recusaDoFoco(ctx, [pessoa.currentCompanyId]);
  if (foraDoFoco) return NextResponse.json({ error: foraDoFoco }, { status: 403 });
  const [empresa, entregas] = await Promise.all([
    prisma.company.findFirst({ where: { id: pessoa.currentCompanyId, tenantId: ctx.tenantId }, select: { name: true, tradeName: true, displayName: true, cnpj: true, cpf: true, kind: true } }),
    prisma.dp2EntregaDeEpi.findMany({ where: { tenantId: ctx.tenantId, personId }, include: { epi: { select: { nome: true, ca: true } } }, orderBy: [{ data: "asc" }, { createdAt: "asc" }] }),
  ]);
  const pdf = await pdfDaFichaDeEpi(
    entregas.map((e) => ({ data: e.data.toISOString().slice(0, 10), epi: e.epi.nome, ca: e.epi.ca, quantidade: e.quantidade })),
    {
      colaborador: pessoa.name,
      cpf: pessoa.cpf ? formatCpf(pessoa.cpf) : null,
      empresa: empresa ? nomeExibicao(empresa) : "",
      documentoDaEmpresa: empresa ? formatDocumento(empresa.kind, empresa.cnpj, empresa.cpf) || null : null,
      funcao: pessoa.cargo?.name ?? null,
    }
  );
  const nome = `Ficha de EPI ${pessoa.name}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`, "Cache-Control": "no-store" },
  });
}
