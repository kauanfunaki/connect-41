"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { lerConfig } from "@/lib/integracoes/data";
import { enviarERegistrar } from "@/lib/whatsapp/envio";
import { podeResponder, podeDevolverAoRobo } from "@/lib/whatsapp/conversas";
import { MAX_CARACTERES_DA_MENSAGEM } from "@/lib/whatsapp/decisao";

export type AcaoNaConversa = { error: string } | { success: true } | null;

const SETOR = "recrutamento";

/** Resolve a conversa, já com a checagem de permissão feita. */
async function abrirConversa(threadId: string) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false as const, erro: "Não autenticado" };
  if (!canActOnSector(ctx, SETOR)) {
    return { ok: false as const, erro: "Sem permissão no Recrutamento." };
  }
  const tenantId = ctx.tenantId;

  const prisma = getPrisma();
  const thread = await prisma.whatsappThread.findFirst({ where: { id: threadId, tenantId } });
  if (!thread) return { ok: false as const, erro: "Conversa não encontrada." };

  return { ok: true as const, ctx, tenantId, thread, prisma };
}

/**
 * Uma pessoa responde no WhatsApp.
 *
 * As duas recusas de `podeResponder` valem aqui igual ao robô. A do opt-out é
 * a que importa: se ela valesse só para o robô, esta tela seria o jeito mais
 * fácil de escrever para quem pediu silêncio.
 */
export async function responderConversa(
  threadId: string,
  texto: string
): Promise<AcaoNaConversa> {
  const aberta = await abrirConversa(threadId);
  if (!aberta.ok) return { error: aberta.erro };
  const { ctx, tenantId, thread, prisma } = aberta;

  const corpo = texto.trim();
  if (!corpo) return { error: "Escreva a mensagem." };
  if (corpo.length > MAX_CARACTERES_DA_MENSAGEM) {
    return { error: "Mensagem longa demais para o WhatsApp." };
  }

  const veredito = podeResponder(thread, new Date());
  if (!veredito.pode) return { error: veredito.motivo };

  const conexao = await prisma.tenantIntegration.findFirst({
    where: { id: thread.integrationId, tenantId: tenantId },
    select: { configEnc: true, enabled: true },
  });
  if (!conexao) return { error: "Conexão de WhatsApp não encontrada." };
  // Diferente do robô, uma pessoa pode responder com a integração desligada:
  // desligar o robô é decidir que ninguém automatiza, não que ninguém fala.
  const config = lerConfig(conexao.configEnc);

  // Responder assume a conversa: se estava com o robô, ele para aqui. Dois
  // escrevendo na mesma conversa é o pior atendimento possível.
  if (!thread.handoffAt) {
    await prisma.whatsappThread.update({
      where: { id: thread.id },
      data: { handoffAt: new Date(), handoffReason: "alguém do time respondeu" },
    });
  }

  const r = await enviarERegistrar({
    tenantId: tenantId,
    threadId: thread.id,
    cred: { phoneNumberId: config.phoneNumberId ?? "", accessToken: config.accessToken ?? "" },
    paraE164: thread.waPhone,
    texto: corpo,
  });

  await logAudit({
    tenantId: tenantId,
    userId: ctx.userId,
    action: "whatsapp.reply",
    entityType: "WhatsappThread",
    entityId: thread.id,
    metadata: { ok: r.ok },
  });

  revalidatePath(`/whatsapp/${thread.id}`);
  revalidatePath("/whatsapp");
  if (!r.ok) return { error: `O WhatsApp recusou a mensagem: ${r.erro}` };
  return { success: true };
}

/** Devolve a conversa ao assistente. Ato deliberado — ele nunca volta sozinho. */
export async function devolverAoRobo(threadId: string): Promise<AcaoNaConversa> {
  const aberta = await abrirConversa(threadId);
  if (!aberta.ok) return { error: aberta.erro };
  const { ctx, tenantId, thread, prisma } = aberta;

  const veredito = podeDevolverAoRobo(thread);
  if (!veredito.pode) return { error: veredito.motivo };

  await prisma.whatsappThread.update({
    where: { id: thread.id },
    data: { handoffAt: null, handoffReason: null },
  });

  await logAudit({
    tenantId: tenantId,
    userId: ctx.userId,
    action: "whatsapp.returnToBot",
    entityType: "WhatsappThread",
    entityId: thread.id,
  });

  revalidatePath(`/whatsapp/${thread.id}`);
  revalidatePath("/whatsapp");
  return { success: true };
}

/**
 * Liga a conversa a uma candidatura.
 *
 * É o que faz `ver_meu_processo` funcionar — e o robô não faz isso sozinho de
 * propósito: identificar alguém por um número de telefone é palpite, e um
 * palpite errado mostra o processo de uma pessoa para outra.
 */
export async function vincularCandidatura(
  threadId: string,
  candidaturaId: string
): Promise<AcaoNaConversa> {
  const aberta = await abrirConversa(threadId);
  if (!aberta.ok) return { error: aberta.erro };
  const { ctx, tenantId, thread, prisma } = aberta;

  const candidatura = await prisma.candidatura.findFirst({
    where: { id: candidaturaId, tenantId: tenantId },
    select: { id: true, personId: true, vaga: { select: { sectorCode: true } } },
  });
  if (!candidatura) return { error: "Candidatura não encontrada." };
  if (!canActOnSector(ctx, candidatura.vaga.sectorCode)) {
    return { error: "Sem permissão nesta vaga." };
  }

  await prisma.whatsappThread.update({
    where: { id: thread.id },
    data: { candidaturaId: candidatura.id, personId: candidatura.personId },
  });

  await logAudit({
    tenantId: tenantId,
    userId: ctx.userId,
    action: "whatsapp.link",
    entityType: "WhatsappThread",
    entityId: thread.id,
    metadata: { candidaturaId },
  });

  revalidatePath(`/whatsapp/${thread.id}`);
  return { success: true };
}

/** Desfaz o vínculo — quando alguém ligou a conversa à pessoa errada. */
export async function desvincularCandidatura(threadId: string): Promise<AcaoNaConversa> {
  const aberta = await abrirConversa(threadId);
  if (!aberta.ok) return { error: aberta.erro };
  const { ctx, tenantId, thread, prisma } = aberta;

  await prisma.whatsappThread.update({
    where: { id: thread.id },
    data: { candidaturaId: null, personId: null },
  });

  await logAudit({
    tenantId: tenantId,
    userId: ctx.userId,
    action: "whatsapp.unlink",
    entityType: "WhatsappThread",
    entityId: thread.id,
  });

  revalidatePath(`/whatsapp/${thread.id}`);
  return { success: true };
}
