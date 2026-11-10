"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import type { EntityType, HandoffPriority, HandoffSectorStatus } from "@/generated/prisma/enums";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { scopedCompanyWhere, scopedPersonWhere } from "@/lib/auth/scope";
import { getSectorMaps } from "@/lib/sectors";
import { notifySector, notifyUser } from "@/lib/notifications";
import { findMentionedUserIds } from "@/lib/handoffMentions";
import { logAudit } from "@/lib/audit";
import { assuntoParaGravar } from "@/lib/handoffTemplates";
import { ASSUNTO_MAXIMO, tituloDaTransferencia } from "@/lib/handoffs";

/**
 * O campo que causou o erro (10/11/2026): a nova transferência em três passos
 * volta ao passo dele e mostra a frase junto do campo, e não solta no meio do
 * formulário. `geral` é o erro que não é de campo nenhum (falha ao gravar).
 */
export type CampoDaTransferencia = "entidade" | "assunto" | "prioridade" | "origem" | "setores" | "geral";

export type HandoffState = { error: string; campo?: CampoDaTransferencia } | null;

const PRIORITIES: HandoffPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const SECTOR_STATUSES: HandoffSectorStatus[] = ["NEW", "IN_PROGRESS", "DONE"];

// Os avisos de transferência apontam para a própria transferência desde
// 10/11/2026 (pedido do Kauan): `entityId` é o id dela e `entityType` fica
// vazio — é assim que `linkDaNotificacao` reconhece o aviso novo e abre
// /transferencias/<id>. Os de antes guardavam a empresa ou a pessoa e continuam
// abrindo a ficha. O `EntityType` do banco só tem COMPANY e PERSON; acrescentar
// um valor mexeria na coluna de `handoffs` e na tabela grande de notificações.
function alvoDoAviso(handoffId: string) {
  return { entityType: undefined, entityId: handoffId };
}

// Cria UMA transferência com informações gerais (description, válida para
// todos os setores) + uma instrução específica por setor de destino — formato
// do dia a dia no Acessórias, sem precisar abrir N transferências.
export async function criarHandoff(
  _prev: HandoffState,
  form: FormData
): Promise<HandoffState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado", campo: "geral" };

  const entityTypeRaw = form.get("entityType");
  const entityType: EntityType | null = entityTypeRaw === "COMPANY" || entityTypeRaw === "PERSON" ? entityTypeRaw : null;
  const entityId = ((form.get("entityId") as string | null) ?? "").trim();
  const fromSector = (form.get("fromSector") as string)?.trim();
  const priorityRaw = (form.get("priority") as string) || "MEDIUM";
  const description = (form.get("description") as string)?.trim() || null;
  const toSectors = Array.from(new Set(form.getAll("toSectors").map((s) => String(s).trim()).filter(Boolean)));
  // O assunto (10/11/2026): o rótulo do modelo escolhido ou o texto de "Outro
  // assunto". As "Informações adicionais" (`message`) saíram do formulário;
  // as transferências novas não escrevem mais nela.
  const assunto = assuntoParaGravar(form.get("subject") as string | null, form.get("templateKey") as string | null, ASSUNTO_MAXIMO);

  if (!entityId || !entityType) return { error: "Escolha a empresa ou a pessoa.", campo: "entidade" };
  if (!assunto) return { error: "Escolha um assunto ou escreva o seu em “Outro assunto”.", campo: "assunto" };
  if (!PRIORITIES.includes(priorityRaw as HandoffPriority)) return { error: "Prioridade inválida.", campo: "prioridade" };
  if (!fromSector) return { error: "Escolha o setor que pede a transferência.", campo: "origem" };
  if (toSectors.length === 0) return { error: "Escolha pelo menos um setor para receber.", campo: "setores" };
  if (toSectors.includes(fromSector)) return { error: "O setor que pede não pode estar entre os que recebem.", campo: "setores" };
  const priority = priorityRaw as HandoffPriority;
  if (!canManageSector(ctx, fromSector)) {
    return { error: "Sem permissão para pedir transferência a partir deste setor.", campo: "origem" };
  }

  const prisma = getPrisma();

  // Setores de destino precisam existir e estar ativos no tenant.
  const validSectors = await prisma.sector.findMany({
    where: { tenantId: ctx.tenantId, code: { in: toSectors }, active: true },
    select: { code: true },
  });
  if (validSectors.length !== toSectors.length) return { error: "Um dos setores escolhidos não está mais ativo.", campo: "setores" };

  // Confere que a entidade está dentro do escopo de quem solicita.
  const scope = entityType === "COMPANY" ? await scopedCompanyWhere(ctx) : await scopedPersonWhere(ctx);
  const entity =
    entityType === "COMPANY"
      ? await prisma.company.findFirst({ where: { id: entityId, ...scope } })
      : await prisma.person.findFirst({ where: { id: entityId, ...scope } });
  if (!entity) return { error: "Empresa ou pessoa não encontrada, ou fora do seu escopo.", campo: "entidade" };

  // Responsável por setor (opcional) — mesma regra de elegibilidade de
  // atribuirResponsavelSetor: precisa ser membro DO PRÓPRIO setor de destino
  // ou ADMIN/SUPER_ADMIN. Ignora silenciosamente um id inválido/inelegível em
  // vez de barrar a criação inteira da transferência por causa disso.
  // Multi-seleção: o picker envia um hidden por responsável, daí getAll.
  const assigneesBySector: Record<string, string[]> = {};
  for (const sectorCode of toSectors) {
    const raw = (form.getAll(`assignee_${sectorCode}`) as string[])
      .map((v) => v.trim())
      .filter(Boolean);
    if (raw.length === 0) {
      assigneesBySector[sectorCode] = [];
      continue;
    }
    const eligible = await prisma.user.findMany({
      where: {
        id: { in: raw },
        tenantId: ctx.tenantId,
        active: true,
        OR: [{ role: { in: ["SUPER_ADMIN", "ADMIN"] } }, { sectors: { some: { sectorCode } } }],
      },
      select: { id: true },
    });
    assigneesBySector[sectorCode] = eligible.map((u) => u.id);
  }

  let handoffId: string;
  try {
    const created = await prisma.handoff.create({
      data: {
        tenantId: ctx.tenantId,
        fromSector,
        entityType,
        entityId,
        requestedBy: ctx.userId,
        subject: assunto.subject,
        templateKey: assunto.templateKey,
        description,
        priority,
        sectors: {
          create: toSectors.map((sectorCode) => ({
            tenantId: ctx.tenantId,
            sectorCode,
            instruction: (form.get(`instruction_${sectorCode}`) as string)?.trim() || null,
            assignees: {
              create: assigneesBySector[sectorCode].map((userId) => ({ userId })),
            },
          })),
        },
      },
    });
    handoffId = created.id;
  } catch (err) {
    console.error("[criarHandoff]", err);
    return { error: "Não foi possível enviar a transferência. Tente de novo.", campo: "geral" };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "handoff.create",
    entityType: "Handoff",
    entityId: handoffId,
    metadata: { fromSector, toSectors, priority, templateKey: assunto.templateKey },
  });

  const { labels: sectorLabels } = await getSectorMaps(ctx.tenantId);
  const alvo = alvoDoAviso(handoffId);
  await Promise.all(
    toSectors.map((sectorCode) =>
      notifySector(sectorCode, {
        tenantId: ctx.tenantId,
        type: "HANDOFF_RECEIVED",
        message: `Nova transferência de ${sectorLabels[fromSector] ?? fromSector} para "${entity.name}": ${assunto.subject}`,
        ...alvo,
        // Quem pediu — a foto no sino (05/10/2026). Vale para os avisos abaixo.
        actorUserId: ctx.userId,
      })
    )
  );

  // Responsáveis já definidos na criação (mesmo aviso que atribuirResponsavelSetor
  // manda quando isso acontece depois). Com multi-seleção são vários por setor, e
  // a mesma pessoa pode responder por mais de um setor — daí o Set, pra não
  // mandar duas notificações iguais.
  const notifiedAssignees = new Set(
    Object.values(assigneesBySector).flat().filter((userId) => userId !== ctx.userId)
  );
  await Promise.all(
    [...notifiedAssignees].map((userId) =>
      notifyUser(userId, {
        tenantId: ctx.tenantId,
        type: "HANDOFF_ASSIGNED",
        message: `Você é responsável pela transferência "${assunto.subject}" (${entity.name})`,
        ...alvo,
        actorUserId: ctx.userId,
      })
    )
  );

  // "@Nome Completo" na Descrição/instruções por setor vira uma notificação de
  // verdade pra pessoa referenciada — não é só texto solto (ver
  // src/lib/handoffMentions.ts e MentionTextarea).
  const instructionTexts = toSectors.map((sectorCode) => form.get(`instruction_${sectorCode}`) as string | null);
  const mentionedUserIds = await findMentionedUserIds(ctx.tenantId, [description, ...instructionTexts]);
  await Promise.all(
    mentionedUserIds
      .filter((userId) => userId !== ctx.userId)
      .map((userId) =>
        notifyUser(userId, {
          tenantId: ctx.tenantId,
          type: "HANDOFF_MENTION",
          message: `Você foi mencionado na transferência "${assunto.subject}" para "${entity.name}"`,
          ...alvo,
          actorUserId: ctx.userId,
        })
      )
  );

  revalidatePath("/transferencias");
  // Depois de enviar, abre a transferência criada (10/11/2026, pedido do
  // Kauan): voltar para a lista deixava a pessoa procurando o que acabou de fazer.
  redirect(`/transferencias/${handoffId}`);
}

export type HandoffActionResult = { error: string } | null;

// Atualiza a situação da transferência PARA UM SETOR (Nova / Resolvendo /
// Finalizada). Pode mudar: a coordenação do setor (canManageSector) ou o
// colaborador designado como responsável daquela instrução.
export async function atualizarStatusSetor(
  handoffSectorId: string,
  status: HandoffSectorStatus
): Promise<HandoffActionResult> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado." };
  if (!SECTOR_STATUSES.includes(status)) return { error: "Situação inválida." };

  const prisma = getPrisma();
  const sector = await prisma.handoffSector.findFirst({
    where: { id: handoffSectorId, tenantId: ctx.tenantId },
    include: {
      handoff: { select: { id: true, requestedBy: true, subject: true } },
      assignees: { select: { userId: true } },
    },
  });
  if (!sector) return { error: "Transferência não encontrada." };

  // Todos os responsáveis do setor podem mexer no status, não só o primeiro:
  // ler `assignedTo` aqui deixava o 2º..Nº designado sem permissão.
  const allowed =
    canManageSector(ctx, sector.sectorCode) || sector.assignees.some((a) => a.userId === ctx.userId);
  if (!allowed || ctx.role === "READONLY") {
    return { error: "Sem permissão para atualizar a situação deste setor." };
  }

  try {
    await prisma.handoffSector.update({
      where: { id: sector.id },
      data: { status, resolvedAt: status === "DONE" ? new Date() : null },
    });
  } catch (err) {
    console.error("[atualizarStatusSetor]", err);
    return { error: "Erro ao atualizar a situação. Tente novamente." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "handoff.sector.status",
    entityType: "Handoff",
    entityId: sector.handoff.id,
    metadata: { sectorCode: sector.sectorCode, status },
  });

  if (status === "DONE" && sector.handoff.requestedBy !== ctx.userId) {
    const { labels: sectorLabels } = await getSectorMaps(ctx.tenantId);
    await notifyUser(sector.handoff.requestedBy, {
      tenantId: ctx.tenantId,
      type: "HANDOFF_SECTOR_DONE",
      message: `${sectorLabels[sector.sectorCode] ?? sector.sectorCode} finalizou a parte dele na transferência "${tituloDaTransferencia(sector.handoff)}"`,
      ...alvoDoAviso(sector.handoff.id),
      actorUserId: ctx.userId,
    });
  }

  revalidatePath(`/transferencias/${sector.handoff.id}`);
  revalidatePath("/transferencias");
  return null;
}

// Designa (ou remove) o responsável pela instrução de um setor. Restrito à
// coordenação do setor, e o designado precisa ser DO PRÓPRIO setor (a
// coordenadora do Fiscal designa alguém do Fiscal, nunca de outro setor) —
// ADMIN/SUPER_ADMIN também são elegíveis, pois gerenciam todos os setores.
export async function atribuirResponsavelSetor(
  handoffSectorId: string,
  userId: string | null
): Promise<HandoffActionResult> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado." };

  const prisma = getPrisma();
  const sector = await prisma.handoffSector.findFirst({
    where: { id: handoffSectorId, tenantId: ctx.tenantId },
    include: { handoff: { select: { id: true, subject: true } } },
  });
  if (!sector) return { error: "Transferência não encontrada." };
  if (!canManageSector(ctx, sector.sectorCode)) {
    return { error: "Sem permissão para atribuir responsável neste setor." };
  }

  if (userId) {
    const assignee = await prisma.user.findFirst({
      where: {
        id: userId,
        tenantId: ctx.tenantId,
        active: true,
        OR: [{ role: { in: ["SUPER_ADMIN", "ADMIN"] } }, { sectors: { some: { sectorCode: sector.sectorCode } } }],
      },
      select: { id: true },
    });
    if (!assignee) return { error: "O responsável precisa ser um membro deste setor." };
  }

  try {
    // Esta action é de troca única — quem define vários é o formulário de
    // criação — então a lista é substituída inteira.
    await prisma.$transaction([
      prisma.handoffSectorAssignee.deleteMany({ where: { handoffSectorId: sector.id } }),
      ...(userId
        ? [prisma.handoffSectorAssignee.create({ data: { handoffSectorId: sector.id, userId } })]
        : []),
    ]);
  } catch (err) {
    console.error("[atribuirResponsavelSetor]", err);
    return { error: "Erro ao atribuir responsável. Tente novamente." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "handoff.sector.assign",
    entityType: "Handoff",
    entityId: sector.handoff.id,
    metadata: { sectorCode: sector.sectorCode, assignedTo: userId },
  });

  if (userId && userId !== ctx.userId) {
    await notifyUser(userId, {
      tenantId: ctx.tenantId,
      type: "HANDOFF_ASSIGNED",
      message: `Você é responsável pela transferência "${tituloDaTransferencia(sector.handoff)}"`,
      ...alvoDoAviso(sector.handoff.id),
      actorUserId: ctx.userId,
    });
  }

  revalidatePath(`/transferencias/${sector.handoff.id}`);
  return null;
}

export async function registrarVisualizacao(id: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return;

  const prisma = getPrisma();
  await prisma.handoffView.upsert({
    where: { handoffId_userId: { handoffId: id, userId: ctx.userId } },
    create: { tenantId: ctx.tenantId, handoffId: id, userId: ctx.userId },
    update: { viewedAt: new Date() },
  });
}
