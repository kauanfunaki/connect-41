"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { setorDoModulo } from "@/lib/modules";
import { deferirProtocolo, registrarExigencia } from "./actions";

// Aplicar ou descartar o aviso da Junta que chegou por e-mail.
//
// O desfecho é gravado pelas MESMAS actions da tela (`deferirProtocolo`,
// `registrarExigencia`), então etapa, conclusão do processo e auditoria seguem
// o caminho de sempre. O aviso só registra que foi a pessoa que aplicou.

const SECTOR = "societario";
const MODULE = "societario_processos";

export type AvisoState = { error: string } | { ok: true };

async function avisoPendente(avisoId: string) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { erro: "Não autenticado", ctx: null, aviso: null } as const;
  if (!canActOnSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) {
    return { erro: "Sem permissão no Societário", ctx: null, aviso: null } as const;
  }
  const aviso = await getPrisma().avisoDeOrgao.findFirst({
    where: { id: avisoId, tenantId: ctx.tenantId },
    select: { id: true, status: true, processId: true, protocolId: true, protocol: { select: { outcome: true } } },
  });
  if (!aviso) return { erro: "Aviso não encontrado.", ctx: null, aviso: null } as const;
  if (aviso.status !== "PENDENTE") return { erro: "Este aviso já foi tratado.", ctx: null, aviso: null } as const;
  return { erro: null, ctx, aviso } as const;
}

async function marcar(avisoId: string, status: "APLICADO" | "DESCARTADO", userId: string) {
  await getPrisma().avisoDeOrgao.update({
    where: { id: avisoId },
    data: { status, reviewedByUserId: userId, reviewedAt: new Date() },
  });
}

function revalidar(processId: string | null) {
  if (processId) revalidatePath(`/processos/${processId}`);
  revalidatePath("/processos/avisos");
  revalidatePath("/processos");
}

/**
 * Aplica o aviso ao protocolo ligado a ele. A pessoa escolhe o desfecho — a
 * sugestão do sistema só vem pré-marcada — e, na exigência, revisa o texto.
 */
export async function aplicarAviso(
  avisoId: string,
  desfecho: "DEFERIDO" | "EXIGENCIA",
  descricao: string,
  prazoAte: string | null
): Promise<AvisoState> {
  const { erro, ctx, aviso } = await avisoPendente(avisoId);
  if (erro || !ctx || !aviso) return { error: erro ?? "Falha" };
  if (!aviso.protocolId || !aviso.protocol) {
    return { error: "Este aviso não está ligado a um protocolo. Trate no processo e descarte o aviso." };
  }
  // As actions da tela não olham isto; aqui olha, porque o aviso pode chegar
  // depois de alguém já ter registrado o desfecho à mão.
  if (aviso.protocol.outcome !== "PENDENTE") {
    return { error: "O protocolo já foi resolvido. Descarte o aviso se ele não trouxer nada novo." };
  }

  const r =
    desfecho === "DEFERIDO"
      ? await deferirProtocolo(aviso.protocolId)
      : await registrarExigencia(aviso.protocolId, descricao, prazoAte);
  if (r && "error" in r) return { error: r.error };

  await marcar(avisoId, "APLICADO", ctx.userId);
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "process.aviso_orgao_aplicado",
    entityType: "Process",
    entityId: aviso.processId ?? undefined,
    metadata: { avisoId, desfecho },
  });
  revalidar(aviso.processId);
  return { ok: true };
}

/** Aviso que não muda nada (repetido, informativo, ou já tratado à mão). */
export async function descartarAviso(avisoId: string): Promise<AvisoState> {
  const { erro, ctx, aviso } = await avisoPendente(avisoId);
  if (erro || !ctx || !aviso) return { error: erro ?? "Falha" };
  await marcar(avisoId, "DESCARTADO", ctx.userId);
  revalidar(aviso.processId);
  return { ok: true };
}
