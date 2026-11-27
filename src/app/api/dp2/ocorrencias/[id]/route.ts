import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { recusaDoFoco } from "@/lib/empresas/focoServidor";
import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { formatCpf, formatDocumento } from "@/lib/format";
import { pdfDaOcorrencia, type TipoDeOcorrencia } from "@/lib/dp2/ocorrencias";

export const dynamic = "force-dynamic";

// O documento da advertência ou da suspensão em PDF, para assinatura (25/11/2026, funcionalidade-763).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await podeNoModulo(ctx, "dp2_colaboradores", "ver"))) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const prisma = getPrisma();
  const o = await prisma.dp2Ocorrencia.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { person: { select: { name: true, cpf: true } } } });
  if (!o || (o.tipo !== "ADVERTENCIA" && o.tipo !== "SUSPENSAO")) return NextResponse.json({ error: "Ocorrência não encontrada." }, { status: 404 });
  const foraDoFoco = await recusaDoFoco(ctx, [o.companyId]);
  if (foraDoFoco) return NextResponse.json({ error: foraDoFoco }, { status: 403 });
  const empresa = await prisma.company.findFirst({ where: { id: o.companyId, tenantId: ctx.tenantId }, select: { name: true, tradeName: true, displayName: true, cnpj: true, cpf: true, kind: true, city: true } });
  const pdf = await pdfDaOcorrencia(
    { tipo: o.tipo as TipoDeOcorrencia, data: o.data.toISOString().slice(0, 10), dias: o.dias, motivo: o.motivo },
    {
      colaborador: o.person.name,
      cpf: o.person.cpf ? formatCpf(o.person.cpf) : null,
      empresa: empresa ? nomeExibicao(empresa) : "",
      documentoDaEmpresa: empresa ? formatDocumento(empresa.kind, empresa.cnpj, empresa.cpf) || null : null,
      cidade: empresa?.city ?? null,
    }
  );
  const nome = `${o.tipo === "SUSPENSAO" ? "Suspensao" : "Advertencia"} ${o.person.name} ${o.data.toISOString().slice(0, 10)}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`, "Cache-Control": "no-store" },
  });
}
