import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { MODULO_DO_TIPO, podeVerOTipo } from "@/lib/financeiro/acessoDaConta";
import { recusaDoFoco } from "@/lib/empresas/focoServidor";
import { SELECT_DO_RECIBO, dadosDoRecibo, respostaDoRecibo } from "@/lib/financeiro/baixa/reciboServidor";

export const dynamic = "force-dynamic";

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
    select: SELECT_DO_RECIBO,
  });
  if (!baixa) return NextResponse.json({ error: "Baixa não encontrada." }, { status: 404 });
  const kind = baixa.entry.kind;
  if (!(await podeVerOTipo(ctx, kind))) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const ligados = await Promise.all([MODULO_DO_TIPO[kind], "bpo_lancamentos"].map((m) => isModuleEnabled(ctx.tenantId, m)));
  if (!ligados.some(Boolean)) return NextResponse.json({ error: "Módulo não habilitado." }, { status: 403 });
  // Uma empresa por vez no BPO: o arquivo sai pelo endereço, sem passar pela tela.
  const foraDoFoco = await recusaDoFoco(ctx, [baixa.companyId]);
  if (foraDoFoco) return NextResponse.json({ error: foraDoFoco }, { status: 403 });

  // O cliente baixa o mesmo papel pelo portal desde 22/10/2026, sem a observação (`reciboServidor.ts`).
  return respostaDoRecibo(dadosDoRecibo(baixa));
}
