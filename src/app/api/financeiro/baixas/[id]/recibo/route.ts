import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { MODULO_DO_TIPO, podeVerOTipo } from "@/lib/financeiro/acessoDaConta";
import { recusaDoFoco } from "@/lib/empresas/focoServidor";
import { saoPauloParts } from "@/lib/agenda";
import { nomeExibicao } from "@/lib/companyName";
import { formatCnpj, formatCpf, formatDocumento } from "@/lib/format";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import { nomeDaContaBancaria } from "@/lib/financeiro/contaPrevista";
import { numeroDoRecibo, pdfDoRecibo } from "@/lib/financeiro/baixa/recibo";

export const dynamic = "force-dynamic";

const ORIGEM_SEM_PESSOA: Record<string, string> = {
  OMIE: "Leitura do Omie",
  MIGRACAO: "Migração de 19/10",
};

/** CPF ou CNPJ da contraparte, que é guardado só com os dígitos. */
function documentoDaContraparte(d: string | null): string | null {
  if (!d) return null;
  return d.length === 11 ? formatCpf(d) : formatCnpj(d);
}

// O recibo da baixa em PDF (22/10/2026). Quem baixa é quem vê a conta — o
// setor de Contas a pagar, Contas a receber ou Lançamentos, como o anexo da
// conta (`/api/financeiro/anexos/[id]`) —, com um dos módulos ligado e, com
// uma empresa em foco, só a baixa dela. A baixa é procurada com o `tenantId`
// no `where`: id de outro escritório responde 404, como id inexistente.
// Só leitura: a conta presa ao Omie também tem recibo.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const baixa = await getPrisma().financeEntryPayment.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: {
      id: true,
      companyId: true,
      paidAt: true,
      principal: true,
      interest: true,
      fine: true,
      discount: true,
      cash: true,
      note: true,
      origin: true,
      createdAt: true,
      tenant: { select: { name: true } },
      company: { select: { name: true, displayName: true, kind: true, cnpj: true, cpf: true } },
      bankAccount: { select: { nickname: true, accountNumber: true, type: true } },
      createdBy: { select: { name: true } },
      entry: {
        select: {
          kind: true,
          amount: true,
          dueDate: true,
          description: true,
          documentNumber: true,
          counterparty: { select: { name: true, document: true } },
        },
      },
    },
  });
  if (!baixa) return NextResponse.json({ error: "Baixa não encontrada." }, { status: 404 });
  const kind = baixa.entry.kind;
  if (!(await podeVerOTipo(ctx, kind))) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const ligados = await Promise.all([MODULO_DO_TIPO[kind], "bpo_lancamentos"].map((m) => isModuleEnabled(ctx.tenantId, m)));
  if (!ligados.some(Boolean)) return NextResponse.json({ error: "Módulo não habilitado." }, { status: 403 });
  // Uma empresa por vez no BPO: o arquivo sai pelo endereço, sem passar pela tela.
  const foraDoFoco = await recusaDoFoco(ctx, [baixa.companyId]);
  if (foraDoFoco) return NextResponse.json({ error: foraDoFoco }, { status: 403 });

  const documentoDaEmpresa = formatDocumento(baixa.company.kind, baixa.company.cnpj, baixa.company.cpf);
  const bytes = await pdfDoRecibo({
    paymentId: baixa.id,
    kind,
    escritorioNome: baixa.tenant.name,
    empresaNome: nomeExibicao(baixa.company),
    empresaDocumento: documentoDaEmpresa === "—" ? null : documentoDaEmpresa,
    contraparteNome: baixa.entry.counterparty.name,
    contraparteDocumento: documentoDaContraparte(baixa.entry.counterparty.document),
    descricao: baixa.entry.description,
    documentoNumero: baixa.entry.documentNumber,
    vencimentoKey: saoPauloParts(baixa.entry.dueDate).dateKey,
    pagamentoKey: saoPauloParts(baixa.paidAt).dateKey,
    valorDoTituloCentavos: centavosDeDecimal(baixa.entry.amount),
    principalCentavos: centavosDeDecimal(baixa.principal),
    jurosCentavos: centavosDeDecimal(baixa.interest),
    multaCentavos: centavosDeDecimal(baixa.fine),
    descontoCentavos: centavosDeDecimal(baixa.discount),
    caixaCentavos: centavosDeDecimal(baixa.cash),
    contaBancaria: baixa.bankAccount ? nomeDaContaBancaria(baixa.bankAccount) : null,
    observacao: baixa.note,
    registradoPor: baixa.createdBy?.name ?? ORIGEM_SEM_PESSOA[baixa.origin] ?? null,
    registradoEm: baixa.createdAt,
    emitidoEm: new Date(),
  });
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="recibo-${numeroDoRecibo(baixa.id).toLowerCase()}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
