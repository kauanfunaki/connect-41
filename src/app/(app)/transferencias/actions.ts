"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import type { EntityType, HandoffPriority } from "@/generated/prisma/enums";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { scopedCompanyWhere, scopedHandoffWhere, scopedPersonWhere } from "@/lib/auth/scope";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { notifySector, notifyUser } from "@/lib/notifications";
import { findMentionedUserIds } from "@/lib/handoffMentions";
import { logAudit } from "@/lib/audit";
import { assuntoParaGravar } from "@/lib/handoffTemplates";
import { ASSUNTO_MAXIMO, HANDOFF_PRIORITY_LABEL, HANDOFF_STATUS_LABEL, tituloDaTransferencia } from "@/lib/handoffs";
import {
  TRANSICOES,
  destinatariosDoComentario,
  diferencaDeResponsaveis,
  ehAcaoNaParte,
  juntarNomes,
  podeAgirNaParte,
  podeComentar,
  podeEditarATransferencia,
  podeMudarResponsaveis,
  proximaSituacao,
  resumir,
  resumoDosResponsaveis,
  textoDaAcao,
  textoDoComentario,
  type AcaoNaParte,
} from "@/lib/handoffTransicoes";

/**
 * O campo que causou o erro (10/11/2026): a nova transferência em três passos
 * volta ao passo dele e mostra a frase junto do campo, e não solta no meio do
 * formulário. `geral` é o erro que não é de campo nenhum (falha ao gravar).
 */
export type CampoDaTransferencia = "entidade" | "assunto" | "prioridade" | "origem" | "setores" | "geral";

export type HandoffState = { error: string; campo?: CampoDaTransferencia } | null;

const PRIORITIES: HandoffPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

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
        // O primeiro item da Atividade (10/11/2026, pedido do Kauan): "pediu a transferência".
        events: { create: { tenantId: ctx.tenantId, type: "CREATED", userId: ctx.userId } },
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

/** O retorno das ações da transferência aberta: a tela mostra o erro ou o aviso de sucesso. */
export type ResultadoDaTransferencia = { ok: true } | { ok: false; erro: string };

const falha = (erro: string): ResultadoDaTransferencia => ({ ok: false, erro });

// A situação mudou entre a pessoa olhar e clicar (outra pessoa agiu antes).
class SituacaoMudou extends Error {}

// O código da auditoria de cada botão da parte (10/11/2026).
const ACAO_DA_AUDITORIA: Record<AcaoNaParte, string> = {
  comecar: "handoff.sector.start",
  finalizar: "handoff.sector.finish",
  devolver: "handoff.sector.return",
  reenviar: "handoff.sector.resend",
  reabrir: "handoff.sector.reopen",
};

const SEM_PERMISSAO_NA_PARTE = {
  destino: "Só quem coordena o setor ou é responsável pela parte pode fazer isso.",
  pedido: "Só quem pediu, a coordenação do setor de origem ou um administrador pode responder e reenviar.",
};

/** A coordenação do setor de origem: recebe o aviso da devolução junto com quem pediu. */
async function coordenacaoDoSetor(tenantId: string, sectorCode: string): Promise<string[]> {
  const us = await getPrisma().user.findMany({
    where: { tenantId, active: true, role: "SECTOR_ADMIN", sectors: { some: { sectorCode } } },
    select: { id: true },
  });
  return us.map((u) => u.id);
}

function revalidarATransferencia(handoffId: string) {
  revalidatePath(`/transferencias/${handoffId}`);
  revalidatePath("/transferencias");
}

/**
 * Os botões da parte de um setor (10/11/2026, pedido do Kauan — no lugar do
 * seletor de situação): Começar, Finalizar, Devolver (com o motivo), Responder
 * e reenviar (com a resposta) e Reabrir. As regras de quem pode e de onde
 * cada ação parte estão em src/lib/handoffTransicoes.ts.
 */
export async function mudarAParte(
  handoffSectorId: string,
  acao: AcaoNaParte,
  texto?: string | null
): Promise<ResultadoDaTransferencia> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return falha("Não autenticado.");
  if (!ehAcaoNaParte(acao)) return falha("Ação inválida.");
  const validado = textoDaAcao(acao, texto);
  if (!validado.ok) return falha(validado.erro);

  const prisma = getPrisma();
  const parte = await prisma.handoffSector.findFirst({
    where: { id: handoffSectorId, tenantId: ctx.tenantId },
    include: {
      handoff: { select: { id: true, requestedBy: true, fromSector: true, subject: true } },
      assignees: { select: { userId: true } },
    },
  });
  if (!parte) return falha("Transferência não encontrada.");

  const para = proximaSituacao(acao, parte.status);
  if (!para) return falha(`Esta parte está ${HANDOFF_STATUS_LABEL[parte.status].toLowerCase()} agora. Atualize a página.`);
  const regra = { sectorCode: parte.sectorCode, status: parte.status, responsaveis: parte.assignees.map((a) => a.userId) };
  if (!podeAgirNaParte(acao, ctx, regra, parte.handoff)) return falha(SEM_PERMISSAO_NA_PARTE[TRANSICOES[acao].lado]);

  try {
    await prisma.$transaction(async (tx) => {
      // Só muda se a situação ainda for a que a pessoa viu: dois cliques ao
      // mesmo tempo (o setor finaliza enquanto quem pediu reenvia) não passam
      // um por cima do outro.
      const mudou = await tx.handoffSector.updateMany({
        where: { id: parte.id, tenantId: ctx.tenantId, status: parte.status },
        data: { status: para, resolvedAt: para === "DONE" ? new Date() : null },
      });
      if (mudou.count !== 1) throw new SituacaoMudou();
      await tx.handoffEvent.create({
        data: {
          tenantId: ctx.tenantId,
          handoffId: parte.handoff.id,
          handoffSectorId: parte.id,
          type: TRANSICOES[acao].evento,
          userId: ctx.userId,
          body: validado.texto,
        },
      });
    });
  } catch (err) {
    if (err instanceof SituacaoMudou) return falha("A situação desta parte mudou enquanto você olhava. Atualize a página.");
    console.error("[mudarAParte]", err);
    return falha("Não foi possível gravar. Tente de novo.");
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: ACAO_DA_AUDITORIA[acao],
    entityType: "Handoff",
    entityId: parte.handoff.id,
    metadata: { sectorCode: parte.sectorCode, de: parte.status, para },
  });

  const { labels: sectorLabels } = await getSectorMaps(ctx.tenantId);
  const setor = sectorLabel(sectorLabels, parte.sectorCode);
  const origem = sectorLabel(sectorLabels, parte.handoff.fromSector);
  const titulo = tituloDaTransferencia(parte.handoff);
  const alvo = alvoDoAviso(parte.handoff.id);

  if (acao === "finalizar" && parte.handoff.requestedBy !== ctx.userId) {
    await notifyUser(parte.handoff.requestedBy, {
      tenantId: ctx.tenantId,
      type: "HANDOFF_SECTOR_DONE",
      message: `${setor} finalizou a parte dele na transferência "${titulo}"`,
      ...alvo,
      actorUserId: ctx.userId,
    });
  }

  // A devolução vai para quem pediu e para a coordenação do setor de origem —
  // quem pode responder e reenviar.
  if (acao === "devolver") {
    const quem = new Set([parte.handoff.requestedBy, ...(await coordenacaoDoSetor(ctx.tenantId, parte.handoff.fromSector))]);
    quem.delete(ctx.userId);
    await Promise.all(
      [...quem].map((userId) =>
        notifyUser(userId, {
          tenantId: ctx.tenantId,
          type: "HANDOFF_RETURNED",
          message: `${setor} devolveu a transferência "${titulo}": ${resumir(validado.texto ?? "", 140)}`,
          ...alvo,
          actorUserId: ctx.userId,
        })
      )
    );
  }

  // O reenvio vai para quem responde pela parte; sem responsável, para o setor.
  if (acao === "reenviar") {
    const responsaveis = regra.responsaveis.filter((id) => id !== ctx.userId);
    const mensagem = `${origem} respondeu e reenviou a transferência "${titulo}": ${resumir(validado.texto ?? "", 140)}`;
    if (regra.responsaveis.length > 0) {
      await Promise.all(
        responsaveis.map((userId) =>
          notifyUser(userId, { tenantId: ctx.tenantId, type: "HANDOFF_RESENT", message: mensagem, ...alvo, actorUserId: ctx.userId })
        )
      );
    } else {
      await notifySector(parte.sectorCode, { tenantId: ctx.tenantId, type: "HANDOFF_RESENT", message: mensagem, ...alvo, actorUserId: ctx.userId });
    }
  }

  revalidarATransferencia(parte.handoff.id);
  return { ok: true };
}

/**
 * Os responsáveis da parte de um setor, vários (10/11/2026, pedido do Kauan).
 * Recebe a lista inteira e grava só a diferença: quem já era responsável fica
 * como estava (com a data de quando entrou) e não é avisado de novo. A troca
 * de antes apagava a lista e gravava uma pessoa só — perdia quem veio da
 * criação. Restrito a quem gerencia o setor de destino; quem entra precisa
 * ser do setor (ou administrador).
 */
export async function definirResponsaveisDaParte(handoffSectorId: string, userIds: string[]): Promise<ResultadoDaTransferencia> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return falha("Não autenticado.");
  const depois = [...new Set((Array.isArray(userIds) ? userIds : []).filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (depois.length > 50) return falha("Escolha até 50 responsáveis.");

  const prisma = getPrisma();
  const parte = await prisma.handoffSector.findFirst({
    where: { id: handoffSectorId, tenantId: ctx.tenantId },
    include: {
      handoff: { select: { id: true, subject: true } },
      assignees: { select: { userId: true, user: { select: { name: true } } } },
    },
  });
  if (!parte) return falha("Transferência não encontrada.");
  if (!podeMudarResponsaveis(ctx, parte)) return falha("Só quem coordena o setor pode mudar os responsáveis desta parte.");

  const antes = parte.assignees.map((a) => a.userId);
  const { entram, saem } = diferencaDeResponsaveis(antes, depois);
  if (entram.length === 0 && saem.length === 0) return { ok: true };

  // Só quem entra passa pela regra do setor: quem já era responsável e saiu
  // do setor depois continua na lista até alguém tirá-lo.
  const elegiveis = entram.length
    ? await prisma.user.findMany({
        where: {
          id: { in: entram },
          tenantId: ctx.tenantId,
          active: true,
          OR: [{ role: { in: ["SUPER_ADMIN", "ADMIN"] } }, { sectors: { some: { sectorCode: parte.sectorCode } } }],
        },
        select: { id: true, name: true },
      })
    : [];
  if (elegiveis.length !== entram.length) return falha("O responsável precisa ser um membro deste setor.");

  const nomeDe = new Map([...parte.assignees.map((a) => [a.userId, a.user.name] as const), ...elegiveis.map((u) => [u.id, u.name] as const)]);
  const nomes = (ids: string[]) => ids.map((id) => nomeDe.get(id) ?? "Usuário removido");

  try {
    await prisma.$transaction([
      ...(saem.length ? [prisma.handoffSectorAssignee.deleteMany({ where: { handoffSectorId: parte.id, userId: { in: saem } } })] : []),
      ...(entram.length
        ? [prisma.handoffSectorAssignee.createMany({ data: entram.map((userId) => ({ handoffSectorId: parte.id, userId })), skipDuplicates: true })]
        : []),
      prisma.handoffEvent.create({
        data: {
          tenantId: ctx.tenantId,
          handoffId: parte.handoff.id,
          handoffSectorId: parte.id,
          type: "ASSIGNEES_CHANGED",
          userId: ctx.userId,
          body: resumoDosResponsaveis(nomes(entram), nomes(saem)),
        },
      }),
    ]);
  } catch (err) {
    console.error("[definirResponsaveisDaParte]", err);
    return falha("Não foi possível mudar os responsáveis. Tente de novo.");
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "handoff.sector.assign",
    entityType: "Handoff",
    entityId: parte.handoff.id,
    metadata: { sectorCode: parte.sectorCode, entram, saem },
  });

  // Só quem entrou é avisado — e não quem se pôs na lista.
  await Promise.all(
    entram
      .filter((userId) => userId !== ctx.userId)
      .map((userId) =>
        notifyUser(userId, {
          tenantId: ctx.tenantId,
          type: "HANDOFF_ASSIGNED",
          message: `Você é responsável pela transferência "${tituloDaTransferencia(parte.handoff)}"`,
          ...alvoDoAviso(parte.handoff.id),
          actorUserId: ctx.userId,
        })
      )
  );

  revalidarATransferencia(parte.handoff.id);
  return { ok: true };
}

/**
 * O comentário da Atividade (10/11/2026, pedido do Kauan): a dúvida sobre a
 * transferência fica nela, e não no WhatsApp. "@Nome" avisa a pessoa
 * (HANDOFF_MENTION); quem pediu e os responsáveis de todas as partes recebem
 * HANDOFF_COMMENT. Quem escreveu não é avisado.
 */
export async function comentarNaTransferencia(handoffId: string, texto: string): Promise<ResultadoDaTransferencia> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return falha("Não autenticado.");
  if (!podeComentar(ctx)) return falha("Quem só lê não comenta.");
  const validado = textoDoComentario(texto);
  if (!validado.ok) return falha(validado.erro);

  const prisma = getPrisma();
  const handoff = await prisma.handoff.findFirst({
    where: { id: handoffId, ...scopedHandoffWhere(ctx) },
    select: { id: true, subject: true, requestedBy: true, sectors: { select: { assignees: { select: { userId: true } } } } },
  });
  if (!handoff) return falha("Transferência não encontrada.");

  try {
    await prisma.handoffEvent.create({
      data: { tenantId: ctx.tenantId, handoffId: handoff.id, type: "COMMENT", userId: ctx.userId, body: validado.texto },
    });
  } catch (err) {
    console.error("[comentarNaTransferencia]", err);
    return falha("Não foi possível comentar. Tente de novo.");
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "handoff.comment",
    entityType: "Handoff",
    entityId: handoff.id,
  });

  const [autor, mencionados] = await Promise.all([
    prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true } }),
    findMentionedUserIds(ctx.tenantId, [validado.texto]),
  ]);
  const destino = destinatariosDoComentario({
    autor: ctx.userId,
    requestedBy: handoff.requestedBy,
    responsaveis: handoff.sectors.flatMap((s) => s.assignees.map((a) => a.userId)),
    mencionados,
  });
  const quem = autor?.name ?? "Alguém";
  const titulo = tituloDaTransferencia(handoff);
  const alvo = alvoDoAviso(handoff.id);
  await Promise.all([
    ...destino.comentario.map((userId) =>
      notifyUser(userId, {
        tenantId: ctx.tenantId,
        type: "HANDOFF_COMMENT",
        message: `${quem} comentou na transferência "${titulo}": ${resumir(validado.texto ?? "", 140)}`,
        ...alvo,
        actorUserId: ctx.userId,
      })
    ),
    ...destino.mencao.map((userId) =>
      notifyUser(userId, {
        tenantId: ctx.tenantId,
        type: "HANDOFF_MENTION",
        message: `${quem} mencionou você na transferência "${titulo}"`,
        ...alvo,
        actorUserId: ctx.userId,
      })
    ),
  ]);

  revalidatePath(`/transferencias/${handoff.id}`);
  return { ok: true };
}

export type DadosDaEdicao = { subject: string; description: string; priority: HandoffPriority };

/** O tamanho da descrição na edição — a coluna é TEXT; o teto é para a tela. */
const DESCRICAO_MAXIMA = 10_000;

/**
 * "Editar" no cabeçalho da transferência aberta (10/11/2026, pedido do
 * Kauan): assunto, descrição e prioridade, pelo lado de quem pediu (quem
 * pediu, a coordenação do setor de origem, o administrador). Vira um item da
 * Atividade ("editou a transferência"), e quem passou a ser mencionado na
 * descrição é avisado.
 */
export async function editarTransferencia(handoffId: string, dados: DadosDaEdicao): Promise<ResultadoDaTransferencia> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return falha("Não autenticado.");

  const subject = (dados?.subject ?? "").replace(/\s+/g, " ").trim();
  const description = (dados?.description ?? "").trim() || null;
  if (!subject) return falha("Escreva o assunto.");
  if (subject.length > ASSUNTO_MAXIMO) return falha(`O assunto pode ter até ${ASSUNTO_MAXIMO} caracteres.`);
  if (description && description.length > DESCRICAO_MAXIMA) return falha("A descrição está longa demais.");
  if (!PRIORITIES.includes(dados?.priority)) return falha("Prioridade inválida.");

  const prisma = getPrisma();
  const handoff = await prisma.handoff.findFirst({
    where: { id: handoffId, ...scopedHandoffWhere(ctx) },
    select: { id: true, subject: true, description: true, priority: true, requestedBy: true, fromSector: true },
  });
  if (!handoff) return falha("Transferência não encontrada.");
  if (!podeEditarATransferencia(ctx, handoff)) return falha("Só quem pediu, a coordenação do setor de origem ou um administrador edita a transferência.");

  const campos: string[] = [];
  if (subject !== (handoff.subject ?? "")) campos.push("o assunto");
  if ((description ?? "") !== (handoff.description ?? "")) campos.push("a descrição");
  if (dados.priority !== handoff.priority) campos.push(`a prioridade para ${HANDOFF_PRIORITY_LABEL[dados.priority]}`);
  if (campos.length === 0) return { ok: true };

  try {
    await prisma.$transaction([
      prisma.handoff.update({ where: { id: handoff.id }, data: { subject, description, priority: dados.priority } }),
      prisma.handoffEvent.create({
        data: { tenantId: ctx.tenantId, handoffId: handoff.id, type: "EDITED", userId: ctx.userId, body: `Mudou ${juntarNomes(campos)}.` },
      }),
    ]);
  } catch (err) {
    console.error("[editarTransferencia]", err);
    return falha("Não foi possível salvar. Tente de novo.");
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "handoff.edit",
    entityType: "Handoff",
    entityId: handoff.id,
    metadata: { campos },
  });

  // Quem já estava mencionado na descrição de antes não é avisado de novo.
  if (description !== handoff.description) {
    const [agora, antes] = await Promise.all([
      findMentionedUserIds(ctx.tenantId, [description]),
      findMentionedUserIds(ctx.tenantId, [handoff.description]),
    ]);
    const novos = agora.filter((id) => !antes.includes(id) && id !== ctx.userId);
    await Promise.all(
      novos.map((userId) =>
        notifyUser(userId, {
          tenantId: ctx.tenantId,
          type: "HANDOFF_MENTION",
          message: `Você foi mencionado na transferência "${subject}"`,
          ...alvoDoAviso(handoff.id),
          actorUserId: ctx.userId,
        })
      )
    );
  }

  revalidarATransferencia(handoff.id);
  return { ok: true };
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
