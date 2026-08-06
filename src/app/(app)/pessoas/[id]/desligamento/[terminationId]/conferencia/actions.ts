"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { logAudit } from "@/lib/audit";
import { getRescisaoItem } from "@/lib/rescisaoChecklist";
import { calcularSnapshotItem } from "@/lib/rescisao/referencia";
import { NoticeType, TerminationCheckStatus } from "@/generated/prisma/enums";

export type ConferenciaState = { error: string } | null;

async function findTerminationInScope(
  personId: string,
  terminationId: string,
  ctx: Awaited<ReturnType<typeof getAuthContext>>
) {
  const prisma = getPrisma();
  const person = await prisma.person.findFirst({
    where: { id: personId, ...(await scopedPersonWhere(ctx)) },
    select: { id: true },
  });
  if (!person) return null;
  return prisma.termination.findFirst({
    where: { id: terminationId, tenantId: ctx.tenantId, personId },
  });
}

// Grava um item da conferência. Upsert por (terminationId, itemKey) — a linha
// só passa a existir quando o conferente encosta no item, então uma rescisão
// nova não nasce com 21 linhas vazias no banco.
export async function salvarItemConferencia(
  personId: string,
  terminationId: string,
  itemKey: string,
  _prev: ConferenciaState,
  form: FormData
): Promise<ConferenciaState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para conferir rescisões." };

  const item = getRescisaoItem(itemKey);
  if (!item) return { error: "Item de conferência desconhecido." };

  const termination = await findTerminationInScope(personId, terminationId, ctx);
  if (!termination) return { error: "Rescisão não encontrada ou fora do seu escopo." };

  const status = form.get("status") as TerminationCheckStatus;
  if (!Object.values(TerminationCheckStatus).includes(status)) return { error: "Situação inválida." };

  const note = ((form.get("note") as string) ?? "").trim() || null;

  // Valor só é aceito em item de verba/desconto/média; item de prazo/documento
  // não tem valor por definição.
  let informedValue: number | null = null;
  if (item.hasValue) {
    const raw = ((form.get("informedValue") as string) ?? "").trim();
    if (raw) {
      const parsed = Number(raw.replace(/\./g, "").replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < 0) return { error: "Valor informado inválido." };
      informedValue = parsed;
    }
  }

  // Divergência sem descrição não serve pra nada na hora de cobrar a correção.
  if (status === "DIVERGENTE" && !note) {
    return { error: "Descreva a divergência encontrada para poder cobrar a correção." };
  }

  // Snapshot do cálculo de referência. RECALCULA NO SERVIDOR de propósito —
  // aceitar o valor num campo oculto do form significaria auditar um número
  // que veio do cliente, o que não é auditoria nenhuma.
  const snapshot = await calcularSnapshotItem(ctx.tenantId, personId, terminationId, itemKey);

  const prisma = getPrisma();
  try {
    await prisma.terminationCheck.upsert({
      where: { terminationId_itemKey: { terminationId, itemKey } },
      create: {
        tenantId: ctx.tenantId,
        terminationId,
        itemKey,
        status,
        informedValue,
        note,
        ...snapshot,
        checkedById: ctx.userId,
        checkedAt: new Date(),
      },
      update: {
        status,
        informedValue,
        note,
        ...snapshot,
        checkedById: ctx.userId,
        checkedAt: new Date(),
      },
    });
  } catch (err) {
    console.error("[salvarItemConferencia]", err);
    return { error: "Erro ao salvar a conferência deste item." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "termination.check",
    entityType: "Termination",
    entityId: terminationId,
    metadata: { itemKey, status },
  });

  revalidatePath(`/pessoas/${personId}/desligamento/${terminationId}/conferencia`);
  return null;
}

// Data do término e tipo de aviso ficam no Termination porque alimentam o
// prazo legal (art. 477 §6) — não são itens de checklist.
export async function salvarDadosRescisao(
  personId: string,
  terminationId: string,
  _prev: ConferenciaState,
  form: FormData
): Promise<ConferenciaState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para editar rescisões." };

  const termination = await findTerminationInScope(personId, terminationId, ctx);
  if (!termination) return { error: "Rescisão não encontrada ou fora do seu escopo." };

  const dateRaw = ((form.get("terminationDate") as string) ?? "").trim();
  let terminationDate: Date | null = null;
  if (dateRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) return { error: "Data do término inválida." };
    terminationDate = new Date(`${dateRaw}T00:00:00.000Z`);
  }

  const noticeRaw = ((form.get("noticeType") as string) ?? "").trim();
  const noticeType =
    noticeRaw && (Object.values(NoticeType) as string[]).includes(noticeRaw) ? (noticeRaw as NoticeType) : null;

  // Insumos que destravam cálculos que ficariam NAO_CALCULAVEL. Campo vazio
  // continua null de propósito — "não informado" é diferente de "zero", e o
  // motor trata os dois de formas diferentes.
  const parseValor = (key: string): number | null | { error: string } => {
    const raw = ((form.get(key) as string) ?? "").trim();
    if (!raw) return null;
    const parsed = Number(raw.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) return { error: `Valor inválido em ${key}.` };
    return parsed;
  };

  const fgtsBalance = parseValor("fgtsBalanceInformed");
  if (fgtsBalance && typeof fgtsBalance === "object") return { error: "Saldo do FGTS inválido." };
  const decimoAdiantado = parseValor("thirteenthAdvancePaid");
  if (decimoAdiantado && typeof decimoAdiantado === "object") return { error: "Adiantamento de 13º inválido." };

  const faltasRaw = ((form.get("unjustifiedAbsences") as string) ?? "").trim();
  let unjustifiedAbsences: number | null = null;
  if (faltasRaw) {
    const n = parseInt(faltasRaw, 10);
    if (!Number.isInteger(n) || n < 0) return { error: "Número de faltas inválido." };
    unjustifiedAbsences = n;
  }

  const apprentice = form.get("apprentice") === "true";

  const prisma = getPrisma();
  try {
    await prisma.termination.update({
      where: { id: terminationId },
      data: {
        terminationDate,
        noticeType,
        fgtsBalanceInformed: fgtsBalance as number | null,
        thirteenthAdvancePaid: decimoAdiantado as number | null,
        unjustifiedAbsences,
        apprentice,
      },
    });
  } catch (err) {
    console.error("[salvarDadosRescisao]", err);
    return { error: "Erro ao salvar os dados da rescisão." };
  }

  revalidatePath(`/pessoas/${personId}/desligamento/${terminationId}/conferencia`);
  return null;
}
