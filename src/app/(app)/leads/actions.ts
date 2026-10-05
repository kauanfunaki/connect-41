"use server";

// O acompanhamento de um lead pela equipe (05/10/2026): situação, responsável e
// observações, num salvar só. Cada mudança vai para a auditoria com o que era
// e o que ficou, como nas filas vizinhas.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { setorDoModulo } from "@/lib/modules";
import { getSectorUsers } from "@/lib/sectorUsers";
import { logAudit } from "@/lib/audit";
import { MAX_OBSERVACOES_DO_LEAD, MODULO_LEADS, ehStatusDoLead } from "@/lib/leads/regras";

export type Resultado = { error: string } | { ok: true };

export async function salvarAcompanhamentoDoLead(id: string, form: FormData): Promise<Resultado> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Sessão expirada. Entre de novo." };
  if (!(await podeNoModulo(ctx, MODULO_LEADS, "agir"))) return { error: "Você não pode mudar leads." };

  const prisma = getPrisma();
  const lead = await prisma.lead.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true, status: true, assigneeId: true, notes: true, updatedAt: true },
  });
  if (!lead) return { error: "Lead não encontrado." };

  // A versão que a tela mostrava. Diferente da do banco = alguém salvou no meio,
  // e gravar por cima apagaria o que a outra pessoa escreveu sem ela saber.
  if (String(form.get("versao") ?? "") !== lead.updatedAt.toISOString()) {
    return { error: "Este lead acabou de ser mudado por outra pessoa. Atualize a página e confira antes de salvar." };
  }

  const status = String(form.get("status") ?? "");
  if (!ehStatusDoLead(status)) return { error: "Escolha a situação." };

  const responsavel = String(form.get("responsavel") ?? "") || null;
  if (responsavel && responsavel !== lead.assigneeId) {
    const setor = await setorDoModulo(ctx.tenantId, MODULO_LEADS);
    const possiveis = setor ? await getSectorUsers(ctx.tenantId, setor) : [];
    if (!possiveis.some((p) => p.id === responsavel)) return { error: "Escolha como responsável alguém do setor." };
  }

  const observacoes = String(form.get("observacoes") ?? "").trim();
  if (observacoes.length > MAX_OBSERVACOES_DO_LEAD) {
    return { error: "As observações passaram de 5.000 caracteres." };
  }
  const notes = observacoes || null;

  const mudouStatus = status !== lead.status;
  const mudouResponsavel = responsavel !== lead.assigneeId;
  const mudouObservacoes = notes !== lead.notes;
  if (!mudouStatus && !mudouResponsavel && !mudouObservacoes) return { ok: true };

  const gravou = await prisma.lead.updateMany({
    where: { id: lead.id, tenantId: ctx.tenantId, updatedAt: lead.updatedAt },
    data: { status, assigneeId: responsavel, notes },
  });
  if (gravou.count !== 1) {
    return { error: "Este lead acabou de ser mudado por outra pessoa. Atualize a página e confira antes de salvar." };
  }

  const base = { tenantId: ctx.tenantId, userId: ctx.userId, entityType: "Lead", entityId: lead.id };
  if (mudouStatus) await logAudit({ ...base, action: "lead.situacao", metadata: { de: lead.status, para: status } });
  if (mudouResponsavel) {
    await logAudit({ ...base, action: "lead.responsavel", metadata: { de: lead.assigneeId, para: responsavel } });
  }
  // O texto não vai para a auditoria: é anotação livre sobre uma pessoa de fora.
  if (mudouObservacoes) await logAudit({ ...base, action: "lead.observacoes" });

  revalidatePath("/leads");
  revalidatePath(`/leads/${lead.id}`);
  return { ok: true };
}
