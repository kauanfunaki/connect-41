"use server";

// As guias do mês (Guias pelo Connect, 28/10/2026): marcar e desmarcar como
// paga. Quem edita no Fiscal, como a emissão. A action confere de novo quem
// pode — Server Function aceita POST direto.

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { getPrisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { acessoAsAutorizacoes } from "@/lib/autorizacoes/servidor";
import { recusaDoFoco } from "@/lib/empresas/focoServidor";
import { marcarGuiaComoPaga } from "@/lib/guias/servidor";

const ehId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function marcarGuiaComoPagaAction(guiaId: unknown, paga: unknown): Promise<{ ok: true } | { ok: false; erro: string }> {
  const acesso = await acessoAsAutorizacoes(await getAuthContext());
  if (!acesso?.podeEditar) return { ok: false, erro: "Sem permissão para marcar guias." };
  if (!ehId(guiaId) || typeof paga !== "boolean") return { ok: false, erro: "Guia não encontrada." };
  const guia = await getPrisma().guia.findFirst({ where: { id: guiaId, tenantId: acesso.tenantId }, select: { companyId: true } });
  if (!guia) return { ok: false, erro: "Guia não encontrada." };
  // Uma empresa por vez no BPO (21/10/2026): com foco, só mexe nas dele.
  const foraDoFoco = await recusaDoFoco(acesso.ctx, [guia.companyId]);
  if (foraDoFoco) return { ok: false, erro: foraDoFoco };

  const r = await marcarGuiaComoPaga(acesso.tenantId, acesso.ctx.userId!, guiaId, paga);
  if (!r) return { ok: false, erro: "Guia não encontrada." };
  await logAudit({
    tenantId: acesso.tenantId,
    userId: acesso.ctx.userId,
    action: paga ? "autorizacoes.guia_paga" : "autorizacoes.guia_reaberta",
    entityType: "Guia",
    entityId: guiaId,
    metadata: { companyId: r.companyId, guia: r.descricao },
  });
  revalidatePath("/autorizacoes/guias");
  return { ok: true };
}
