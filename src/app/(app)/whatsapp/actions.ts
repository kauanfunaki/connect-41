"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { lerConfig } from "@/lib/integracoes/data";
import { enviarERegistrar } from "@/lib/whatsapp/envio";
import {
  podeResponder,
  podeDevolverAoRobo,
  podeAssumir,
  podeSoltar,
  podeEncerrar,
  podeTransferir,
  telefoneLegivel,
  MAX_NO_LOTE,
  type AcaoEmLote,
  type ResultadoDoLote,
} from "@/lib/whatsapp/conversas";
import { pessoasDoAtendimento } from "@/lib/whatsapp/equipe";
import { notifyUser } from "@/lib/notifications";
import { desfechoDaTela, LIMPEZA_AO_ENCERRAR, type Desfecho } from "@/lib/whatsapp/atendimentos";
import { atendimentoAberto, fecharAtendimentos, garantirAtendimentoAberto } from "@/lib/whatsapp/atendimentos-dados";
import { provedorDaIntegracao } from "@/lib/whatsapp/provedores";
import { setorDoModulo } from "@/lib/modules";
import { podeAgirNaVaga } from "@/lib/recrutamento/acessoVagas";

export type AcaoNaConversa = { error: string } | { success: true } | null;

// `SETOR` é o de origem, usado só como padrão: o acesso segue o setor que opera
// o módulo neste tenant — ver `setorDoModulo`.
const SETOR = "recrutamento";
const MODULE = "recrutamento_whatsapp";

/** Resolve a conversa, já com a checagem de permissão feita. */
async function abrirConversa(threadId: string) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false as const, erro: "Não autenticado" };
  if (!canActOnSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SETOR)) {
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

  const conexao = await prisma.tenantIntegration.findFirst({
    where: { id: thread.integrationId, tenantId: tenantId },
    select: { configEnc: true, integrationCode: true },
  });
  if (!conexao) return { error: "Conexão de WhatsApp não encontrada." };
  const provedor = provedorDaIntegracao(conexao.integrationCode);
  if (!provedor) return { error: "Esta conexão não é de um provedor de WhatsApp conhecido." };

  const corpo = texto.trim();
  if (!corpo) return { error: "Escreva a mensagem." };
  if (corpo.length > provedor.politica.maxCaracteres) {
    return { error: "Mensagem longa demais para o WhatsApp." };
  }

  // A janela é do provedor da conversa: a Meta tem 24h, a Evolution não tem.
  const veredito = podeResponder(
    { ...thread, janelaLivreHoras: provedor.politica.janelaLivreHoras },
    new Date()
  );
  if (!veredito.pode) return { error: veredito.motivo };

  // Diferente do robô, uma pessoa pode responder com a integração desligada:
  // desligar o robô é decidir que ninguém automatiza, não que ninguém fala.
  const config = lerConfig(conexao.configEnc);

  // Responder assume a conversa: se estava com o robô, ele para aqui. Dois
  // escrevendo na mesma conversa é o pior atendimento possível. E, se ninguém
  // tinha assumido, quem respondeu passa a ser o responsável — respondeu,
  // é dele. Se já era de outra pessoa, continua dela: responder uma vez não
  // é tomar a conversa.
  // Responder numa conversa encerrada abre um atendimento novo, desta pessoa.
  await garantirAtendimentoAberto(tenantId, thread.id, new Date());

  if (!thread.handoffAt || !thread.assignedToId) {
    const agora = new Date();
    await prisma.whatsappThread.update({
      where: { id: thread.id },
      data: {
        ...(thread.handoffAt ? {} : { handoffAt: agora, handoffReason: "alguém do time respondeu" }),
        ...(thread.assignedToId ? {} : { assignedToId: ctx.userId, assignedAt: agora }),
      },
    });
  }

  const r = await enviarERegistrar({
    tenantId: tenantId,
    threadId: thread.id,
    provedor,
    config,
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
    // Com o assistente, a conversa não tem responsável: soltar junto evita que
    // a próxima transferência caia no nome de quem a devolveu semanas antes.
    data: { handoffAt: null, handoffReason: null, assignedToId: null, assignedAt: null },
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
 * Assume a conversa: ela passa a ser de quem clicou, e os avisos dela vão só
 * para essa pessoa. Se estava com o assistente, ele para aqui — assumir é
 * decidir que uma pessoa conduz.
 */
export async function assumirConversa(threadId: string): Promise<AcaoNaConversa> {
  const aberta = await abrirConversa(threadId);
  if (!aberta.ok) return { error: aberta.erro };
  const { ctx, tenantId, thread, prisma } = aberta;

  const veredito = podeAssumir(thread, ctx.userId);
  if (!veredito.pode) return { error: veredito.motivo };

  const agora = new Date();
  // Assumir uma conversa encerrada é retomá-la: abre um atendimento novo.
  await garantirAtendimentoAberto(tenantId, thread.id, agora);
  await prisma.whatsappThread.update({
    where: { id: thread.id },
    data: {
      assignedToId: ctx.userId,
      assignedAt: agora,
      ...(thread.handoffAt ? {} : { handoffAt: agora, handoffReason: "assumida por alguém do time" }),
    },
  });

  await logAudit({
    tenantId,
    userId: ctx.userId,
    action: "whatsapp.assign",
    entityType: "WhatsappThread",
    entityId: thread.id,
    // De quem era: assumir a conversa de outra pessoa é permitido, e é isto que
    // responde "quem tirou de mim?".
    metadata: { anterior: thread.assignedToId },
  });

  revalidatePath(`/whatsapp/${thread.id}`);
  revalidatePath("/whatsapp");
  return { success: true };
}

/**
 * Encerra o atendimento, com o desfecho escolhido.
 *
 * A conversa volta ao assistente, sem responsável, e a próxima mensagem do
 * candidato abre um atendimento novo — o assistente se apresenta de novo e não
 * lê o que veio antes. Nada é enviado ao candidato: encerrar é do lado de cá.
 */
export async function encerrarAtendimento(threadId: string, desfecho: string): Promise<AcaoNaConversa> {
  const aberta = await abrirConversa(threadId);
  if (!aberta.ok) return { error: aberta.erro };
  const { ctx, tenantId, thread, prisma } = aberta;

  if (!desfechoDaTela(desfecho)) return { error: "Escolha como o atendimento terminou." };
  const aberto = await atendimentoAberto(thread.id);
  const veredito = podeEncerrar({ optedOutAt: thread.optedOutAt, atendimentoEncerradoEm: aberto ? null : new Date() });
  if (!veredito.pode) return { error: veredito.motivo };

  const agora = new Date();
  await prisma.whatsappThread.update({ where: { id: thread.id }, data: LIMPEZA_AO_ENCERRAR });
  await fecharAtendimentos(thread.id, { agora, porId: ctx.userId, desfecho });

  await logAudit({
    tenantId,
    userId: ctx.userId,
    action: "whatsapp.close",
    entityType: "WhatsappThread",
    entityId: thread.id,
    metadata: { desfecho, responsavelAnterior: thread.assignedToId },
  });

  revalidatePath(`/whatsapp/${thread.id}`);
  revalidatePath("/whatsapp");
  return { success: true };
}

/**
 * Encerrar, devolver ao assistente ou transferir várias conversas de uma vez
 * (02/10/2026, pedido do Kauan nos testes de 29/09).
 *
 * Cada conversa passa pela mesma regra da ação de uma só; a que não passa fica
 * de fora com o motivo, sem derrubar as outras. Nada é enviado ao candidato —
 * as três ações são do lado de cá.
 */
export async function agirEmLote(threadIds: string[], acao: AcaoEmLote): Promise<{ error: string } | ResultadoDoLote> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  const tenantId = ctx.tenantId;
  const setor = (await setorDoModulo(tenantId, MODULE)) ?? SETOR;
  if (!canActOnSector(ctx, setor)) return { error: "Sem permissão no Recrutamento." };

  const ids = [...new Set(threadIds.filter((x) => typeof x === "string" && x.length > 0))];
  if (ids.length === 0) return { error: "Selecione ao menos uma conversa." };
  if (ids.length > MAX_NO_LOTE) return { error: `Até ${MAX_NO_LOTE} conversas por vez.` };
  if (acao.tipo === "encerrar" && !desfechoDaTela(acao.desfecho)) return { error: "Escolha como os atendimentos terminaram." };
  // Só recebe conversa quem atende o WhatsApp do setor — o id vem do navegador.
  const destino =
    acao.tipo === "transferir" ? (await pessoasDoAtendimento(tenantId, setor)).find((p) => p.id === acao.paraId) : undefined;
  if (acao.tipo === "transferir" && !destino) return { error: "Essa pessoa não atende o WhatsApp do Recrutamento." };

  const prisma = getPrisma();
  const threads = await prisma.whatsappThread.findMany({
    where: { tenantId, id: { in: ids } },
    select: {
      id: true,
      waPhone: true,
      optedOutAt: true,
      handoffAt: true,
      assignedToId: true,
      candidaturaId: true,
      atendimentos: { where: { encerradoEm: null }, take: 1, select: { id: true } },
    },
  });
  const candidaturas = await prisma.candidatura.findMany({
    where: { tenantId, id: { in: threads.map((t) => t.candidaturaId).filter((v): v is string => !!v) } },
    select: { id: true, person: { select: { name: true } } },
  });
  const nomeDaCandidatura = new Map(candidaturas.map((c) => [c.id, c.person.name]));

  const agora = new Date();
  const resultado: ResultadoDoLote = { feitas: 0, puladas: [] };
  const transferidas: { id: string; nome: string }[] = [];
  for (const t of threads) {
    const nome = (t.candidaturaId && nomeDaCandidatura.get(t.candidaturaId)) || telefoneLegivel(t.waPhone);
    // Igual à ação de uma só: sem atendimento aberto, conta como encerrado.
    const encerradoEm = t.atendimentos.length > 0 ? null : agora;
    const veredito =
      acao.tipo === "encerrar"
        ? podeEncerrar({ optedOutAt: t.optedOutAt, atendimentoEncerradoEm: encerradoEm })
        : acao.tipo === "devolver"
          ? podeDevolverAoRobo(t)
          : podeTransferir({ optedOutAt: t.optedOutAt, atendimentoEncerradoEm: encerradoEm, assignedToId: t.assignedToId }, acao.paraId);
    if (!veredito.pode) {
      resultado.puladas.push({ nome, motivo: veredito.motivo });
      continue;
    }

    if (acao.tipo === "encerrar") {
      await prisma.whatsappThread.update({ where: { id: t.id }, data: LIMPEZA_AO_ENCERRAR });
      await fecharAtendimentos(t.id, { agora, porId: ctx.userId, desfecho: acao.desfecho as Desfecho });
    } else if (acao.tipo === "devolver") {
      await prisma.whatsappThread.update({
        where: { id: t.id },
        data: { handoffAt: null, handoffReason: null, assignedToId: null, assignedAt: null },
      });
    } else {
      await prisma.whatsappThread.update({
        where: { id: t.id },
        data: {
          assignedToId: acao.paraId,
          assignedAt: agora,
          // Com o assistente, transferir é tirar dele: uma pessoa conduz daqui.
          ...(t.handoffAt ? {} : { handoffAt: agora, handoffReason: "transferida por alguém do time" }),
        },
      });
      transferidas.push({ id: t.id, nome });
    }
    resultado.feitas++;

    await logAudit({
      tenantId,
      userId: ctx.userId,
      action: acao.tipo === "encerrar" ? "whatsapp.close" : acao.tipo === "devolver" ? "whatsapp.returnToBot" : "whatsapp.transfer",
      entityType: "WhatsappThread",
      entityId: t.id,
      metadata: {
        emLote: ids.length > 1,
        responsavelAnterior: t.assignedToId,
        ...(acao.tipo === "encerrar" ? { desfecho: acao.desfecho } : {}),
        ...(acao.tipo === "transferir" ? { para: acao.paraId } : {}),
      },
    });
    revalidatePath(`/whatsapp/${t.id}`);
  }
  for (let i = threads.length; i < ids.length; i++) resultado.puladas.push({ nome: "—", motivo: "Conversa não encontrada." });

  // Quem recebe é avisado — uma vez só, mesmo num lote grande.
  if (destino && destino.id !== ctx.userId && transferidas.length > 0) {
    try {
      const quem = (await prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true } }))?.name ?? "Alguém do time";
      // Com quem passou, para a foto no sino (05/10/2026).
      await notifyUser(
        destino.id,
        transferidas.length === 1
          ? { tenantId, type: "WHATSAPP_HANDOFF", message: `WhatsApp: ${quem} passou para você a conversa com ${transferidas[0].nome}`.slice(0, 255), entityId: transferidas[0].id, actorUserId: ctx.userId }
          : { tenantId, type: "WHATSAPP_HANDOFF", message: `WhatsApp: ${quem} passou ${transferidas.length} conversas para você`, actorUserId: ctx.userId }
      );
    } catch (err) {
      console.error("[whatsapp] aviso de transferência", err);
    }
  }

  revalidatePath("/whatsapp");
  return resultado;
}

/** Passa a conversa para outra pessoa do time — ver `agirEmLote`. */
export async function transferirConversa(threadId: string, paraId: string): Promise<AcaoNaConversa> {
  const r = await agirEmLote([threadId], { tipo: "transferir", paraId });
  if ("error" in r) return r;
  if (r.puladas.length > 0) return { error: r.puladas[0].motivo };
  return { success: true };
}

/** Solta a conversa: ela volta para a fila, sem responsável, ainda com o time. */
export async function soltarConversa(threadId: string): Promise<AcaoNaConversa> {
  const aberta = await abrirConversa(threadId);
  if (!aberta.ok) return { error: aberta.erro };
  const { ctx, tenantId, thread, prisma } = aberta;

  const veredito = podeSoltar(thread, ctx.userId);
  if (!veredito.pode) return { error: veredito.motivo };

  await prisma.whatsappThread.update({
    where: { id: thread.id },
    data: { assignedToId: null, assignedAt: null },
  });

  await logAudit({
    tenantId,
    userId: ctx.userId,
    action: "whatsapp.unassign",
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
    select: { id: true, personId: true, vaga: { select: { id: true, sectorCode: true, restrictedToRecruiters: true } } },
  });
  if (!candidatura) return { error: "Candidatura não encontrada." };
  if (!(await podeAgirNaVaga(ctx, candidatura.vaga))) {
    return { error: "Sem permissão nesta vaga." };
  }

  await prisma.whatsappThread.update({
    where: { id: thread.id },
    // Ligar à mão encerra qualquer confirmação por nome em andamento: uma pessoa
    // do time já decidiu quem é.
    data: {
      candidaturaId: candidatura.id,
      personId: candidatura.personId,
      linkPendingPersonId: null,
      linkAttempts: 0,
    },
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
    // `linkFailedAt` impede o vínculo automático de refazer o mesmo engano na
    // próxima mensagem: desfeito à mão, só se liga à mão.
    data: { candidaturaId: null, personId: null, linkPendingPersonId: null, linkFailedAt: new Date() },
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
