"use server";

// O chat de IA do canto da tela: abrir, listar e apagar conversas, e aplicar
// uma proposta. A pergunta em si vai pela rota `/api/ia/chat`, que responde em
// partes (ver lá).

import { revalidatePath } from "next/cache";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { getPrisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import {
  apagarConversa,
  listarConversas,
  marcarPropostaAplicada,
  mensagemComPropostas,
  mensagensDaConversa,
  type ConversaNaLista,
  type MensagemNaTela,
} from "@/lib/ia/chat/conversas";
import { lerPropostas } from "@/lib/ia/chat/regras";
import { aplicarPropostaDoSocietario } from "@/app/(app)/processos/ia-actions";
import { aplicarProposta as aplicarPropostaDaVaga } from "@/app/(app)/vagas/[id]/ia-actions";

async function dono() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return null;
  return { tenantId: ctx.tenantId, userId: ctx.userId };
}

export async function conversasDoChat(): Promise<ConversaNaLista[]> {
  const d = await dono();
  return d ? listarConversas(d) : [];
}

export async function abrirConversaDoChat(
  conversaId: string
): Promise<{ agentCode: string; mensagens: MensagemNaTela[] } | { error: string }> {
  const d = await dono();
  if (!d) return { error: "Não autenticado." };
  return (await mensagensDaConversa(d, conversaId)) ?? { error: "Conversa não encontrada." };
}

export async function apagarConversaDoChat(conversaId: string): Promise<{ ok: boolean }> {
  const d = await dono();
  return { ok: d ? await apagarConversa(d, conversaId) : false };
}

/**
 * Aplica a proposta `indice` de uma resposta.
 *
 * A proposta sai do banco, e não do navegador: o que se aplica é o que o
 * agente propôs e ficou gravado. E vai pela action da tela do setor, que
 * refaz tenant, permissão e regra — a IA não ganha atalho nenhum.
 */
export async function aplicarPropostaDoChat(mensagemId: string, indice: number): Promise<{ error: string } | { ok: true }> {
  const d = await dono();
  if (!d) return { error: "Não autenticado." };
  const m = await mensagemComPropostas(d, mensagemId);
  if (!m) return { error: "Mensagem não encontrada." };
  const propostas = lerPropostas(m.proposals);
  const p = propostas[indice];
  if (!p) return { error: "Proposta não encontrada." };
  if (p.aplicada) return { ok: true };

  let r: { error: string } | null;
  if (m.conversation.agentCode === "assistente_do_societario") {
    r = await aplicarPropostaDoSocietario({ ferramenta: p.ferramenta, descricao: p.descricao, argumentos: p.argumentos });
  } else if (m.conversation.agentCode === "assistente_do_recrutamento") {
    // A proposta traz só a candidatura; a vaga sai do banco, no tenant. E a
    // action da vaga refaz o resto — setor, etapa válida, promoção a
    // colaborador em CONTRATADO.
    const candidaturaId = typeof p.argumentos.candidaturaId === "string" ? p.argumentos.candidaturaId : "";
    const c = candidaturaId
      ? await getPrisma().candidatura.findFirst({ where: { id: candidaturaId, tenantId: d.tenantId }, select: { vagaId: true } })
      : null;
    r = c
      ? await aplicarPropostaDaVaga(c.vagaId, { ferramenta: p.ferramenta, descricao: p.descricao, argumentos: p.argumentos })
      : { error: "Candidatura não encontrada." };
  } else {
    r = { error: "Esta IA não aplica propostas." };
  }
  if (r) return r;

  await marcarPropostaAplicada(m.id, propostas, indice);
  return { ok: true };
}

/** Quem vê o chat: só coordenadores (piloto) ou todos. Administração do escritório. */
export async function definirPublicoDoChat(todos: boolean): Promise<{ error: string } | { ok: true }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado." };
  if (!isFullWrite(ctx.role)) return { error: "Sem permissão." };
  const audience = todos ? "TODOS" : "COORDENADORES";
  await getPrisma().aiChatSettings.upsert({
    where: { tenantId: ctx.tenantId },
    create: { tenantId: ctx.tenantId, audience },
    update: { audience },
  });
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "ia.chat.publico",
    entityType: "Tenant",
    entityId: ctx.tenantId,
    metadata: { audience },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
