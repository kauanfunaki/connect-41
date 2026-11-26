import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { recusaDoFoco } from "@/lib/empresas/focoServidor";
import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { formatCpf, formatDocumento } from "@/lib/format";
import { montarTermo, pdfDoTermo } from "@/lib/dp2/quitacaoAnual";
import type { ItemDoHolerite } from "@/lib/dp2/mensal";

export const dynamic = "force-dynamic";

// O termo de quitação anual (art. 507-B da CLT) de um colaborador, com o que as
// competências fechadas do ano pagaram (25/11/2026, funcionalidade-764).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const personId = url.searchParams.get("pessoa") ?? "";
  const ano = Number(url.searchParams.get("ano"));
  if (!personId || !Number.isInteger(ano) || ano < 2000 || ano > 2100) return NextResponse.json({ error: "Escolha o colaborador e o ano." }, { status: 400 });
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await podeNoModulo(ctx, "dp2_colaboradores", "ver"))) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const prisma = getPrisma();
  const pessoa = await prisma.person.findFirst({ where: { id: personId, tenantId: ctx.tenantId, isInternal: false }, select: { id: true, name: true, cpf: true, admissionDate: true, currentCompanyId: true } });
  if (!pessoa?.currentCompanyId) return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 404 });
  const foraDoFoco = await recusaDoFoco(ctx, [pessoa.currentCompanyId]);
  if (foraDoFoco) return NextResponse.json({ error: foraDoFoco }, { status: 403 });
  const [empresa, calculos] = await Promise.all([
    prisma.company.findFirst({ where: { id: pessoa.currentCompanyId, tenantId: ctx.tenantId }, select: { name: true, tradeName: true, displayName: true, cnpj: true, cpf: true, kind: true } }),
    prisma.dp2Calculo.findMany({
      where: { tenantId: ctx.tenantId, personId, competencia: { ano, situacao: "FECHADA" } },
      select: { itens: true, fgts: true, competencia: { select: { ano: true, mes: true, tipo: true } } },
    }),
  ]);
  const termo = montarTermo(
    ano,
    calculos.map((c) => ({
      competencia: `${c.competencia.ano}-${String(c.competencia.mes).padStart(2, "0")}`,
      tipo: c.competencia.tipo,
      fgts: Number(c.fgts),
      itens: ((c.itens as unknown as ItemDoHolerite[]) ?? []).map((i) => ({ codigo: i.codigo, nome: i.nome, tipo: i.tipo, valor: i.valor })),
    }))
  );
  if (termo.meses.length === 0) return NextResponse.json({ error: `Nenhuma competência fechada de ${pessoa.name} em ${ano}.` }, { status: 404 });
  const pdf = await pdfDoTermo(termo, {
    colaborador: pessoa.name,
    cpf: pessoa.cpf ? formatCpf(pessoa.cpf) : null,
    admissao: pessoa.admissionDate ? pessoa.admissionDate.toISOString().slice(0, 10) : null,
    empresa: empresa ? nomeExibicao(empresa) : "",
    documentoDaEmpresa: empresa ? formatDocumento(empresa.kind, empresa.cnpj, empresa.cpf) || null : null,
    sindicato: null,
  });
  const nome = `Termo de quitacao anual ${ano} ${pessoa.name}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`, "Cache-Control": "no-store" },
  });
}
