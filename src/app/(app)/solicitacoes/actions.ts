"use server";

// Solicitações do cliente, do lado da equipe: responder (ou anotar só para a
// equipe), assumir, encaminhar a outro setor, concluir, cancelar e reabrir.
//
// Como na pendência, toda mudança de status é um `updateMany` condicionado ao
// status lido: se o cliente respondeu enquanto alguém concluía, uma das duas
// escritas não acha mais o estado que esperava e volta com mensagem.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { getActiveSectors } from "@/lib/sectors";
import { logAudit } from "@/lib/audit";
import { nomeExibicao } from "@/lib/companyName";
import { arquivosDoFormulario } from "@/lib/financeiro/pendencias/armazenamento";
import { validarResposta } from "@/lib/financeiro/pendencias/regras";
import { anexosDaSolicitacao } from "@/lib/solicitacoes/armazenamento";
import { podeAgirNaSolicitacao } from "@/lib/solicitacoes/acesso";
import { transicao, DEPOIS_DA_RESPOSTA, type AcaoNaSolicitacao, type DepoisDaResposta } from "@/lib/solicitacoes/regras";
import {
  avisarClienteDaSolicitacao,
  avisarEquipeDaSolicitacao,
  responsavelDaEmpresaNoSetor,
  resumoDoAvisoAoCliente,
} from "@/lib/solicitacoes/avisos";

const MODULO = "portal_solicitacoes";

export type Resultado = { error: string } | { ok: true; aviso?: string | null };

/** Erro de regra dentro da transação: aborta o que já foi gravado e vira mensagem. */
class Recusa extends Error {}

function revalidar(id: string) {
  revalidatePath("/solicitacoes");
  revalidatePath(`/solicitacoes/${id}`);
  revalidatePath("/portal/solicitacoes");
  revalidatePath(`/portal/solicitacoes/${id}`);
  revalidatePath("/portal");
}

/**
 * A solicitação, se a pessoa pode agir nela. Devolve o erro pronto para a tela
 * quando não pode — solicitação de setor alheio responde "não encontrada".
 */
async function paraAgir(id: string) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false as const, erro: "Não autenticado." };
  if (!(await isModuleEnabled(ctx.tenantId, MODULO))) return { ok: false as const, erro: "As solicitações não estão habilitadas." };
  const s = await getPrisma().serviceRequest.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: {
      id: true,
      number: true,
      status: true,
      sectorCode: true,
      assigneeId: true,
      companyId: true,
      firstResponseAt: true,
      subject: { select: { label: true } },
      company: { select: { name: true, displayName: true } },
    },
  });
  if (!s || !podeAgirNaSolicitacao(ctx, s)) return { ok: false as const, erro: "Solicitação não encontrada." };
  return { ok: true as const, ctx, s, userId: ctx.userId || null };
}

function lerDepois(valor: FormDataEntryValue | null): DepoisDaResposta {
  return DEPOIS_DA_RESPOSTA.some((d) => d.valor === valor) ? (valor as DepoisDaResposta) : "EM_ANDAMENTO";
}

/**
 * Responde ao cliente — ou deixa uma nota que só a equipe vê.
 *
 * A primeira resposta visível ao cliente é a que cumpre o prazo prometido
 * (`firstResponseAt`), e quem responde sem que ninguém tivesse assumido passa
 * a ser o responsável. A nota interna não conta para nenhuma das duas.
 */
export async function responderSolicitacaoEquipe(formData: FormData): Promise<Resultado> {
  const c = await paraAgir(String(formData.get("requestId") ?? ""));
  if (!c.ok) return { error: c.erro };
  const { ctx, s, userId } = c;

  const interna = formData.get("interna") === "1";
  const depois = lerDepois(formData.get("depois"));
  const arquivos = arquivosDoFormulario(formData, "anexos");
  const resposta = validarResposta(String(formData.get("body") ?? ""), arquivos.length);
  if (!resposta.ok) return { error: resposta.erro };

  const t = interna ? null : transicao(s.status, "EQUIPE", "RESPONDER", depois);
  if (t && !t.ok) return { error: t.motivo };

  const gravados = await anexosDaSolicitacao.gravarAnexos(ctx.tenantId, arquivos);
  if (!gravados.ok) return { error: gravados.erro };

  const agora = new Date();
  try {
    await getPrisma().$transaction(async (tx) => {
      if (t && t.ok) {
        const mudou = await tx.serviceRequest.updateMany({
          where: { id: s.id, tenantId: ctx.tenantId, status: s.status },
          data: {
            status: t.novo,
            lastMessageAt: agora,
            firstResponseAt: s.firstResponseAt ?? agora,
            assigneeId: s.assigneeId ?? userId,
            ...(t.novo === "CONCLUIDA" ? { closedAt: agora, closedById: userId } : {}),
          },
        });
        if (mudou.count !== 1) throw new Recusa("A solicitação acabou de mudar — atualize a página.");
      }
      const msg = await tx.serviceRequestMessage.create({
        data: { requestId: s.id, authorUserId: userId, body: resposta.corpo, internal: interna },
        select: { id: true },
      });
      if (gravados.anexos.length > 0) {
        await tx.serviceRequestAttachment.createMany({
          data: gravados.anexos.map((a) => ({ requestId: s.id, messageId: msg.id, uploadedByUserId: userId, ...a })),
        });
      }
    });
  } catch (err) {
    await anexosDaSolicitacao.apagarAnexosGravados(gravados.anexos);
    if (err instanceof Recusa) return { error: err.message };
    throw err;
  }

  let aviso: string | null = null;
  if (!interna) {
    const r = await avisarClienteDaSolicitacao(
      { tenantId: ctx.tenantId, companyId: s.companyId, id: s.id, numero: s.number, assunto: s.subject.label },
      depois === "CONCLUIDA" ? "concluida" : depois === "AGUARDANDO_CLIENTE" ? "aguardando" : "resposta"
    );
    aviso = resumoDoAvisoAoCliente(r);
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: interna ? "solicitacao.nota_interna" : "solicitacao.respondida",
    entityType: "ServiceRequest",
    entityId: s.id,
    metadata: interna ? { numero: s.number } : { numero: s.number, depois },
  });

  revalidar(s.id);
  return { ok: true, aviso };
}

/** Muda só o status (e quem encerrou), para as ações sem mensagem. */
async function mudarStatus(id: string, acao: Extract<AcaoNaSolicitacao, "ASSUMIR" | "CONCLUIR" | "CANCELAR" | "REABRIR">): Promise<Resultado> {
  const c = await paraAgir(id);
  if (!c.ok) return { error: c.erro };
  const { ctx, s, userId } = c;

  const t = transicao(s.status, "EQUIPE", acao);
  if (!t.ok) return { error: t.motivo };

  const agora = new Date();
  const dados =
    acao === "ASSUMIR"
      ? { status: t.novo, assigneeId: userId }
      : acao === "REABRIR"
        ? { status: t.novo, closedAt: null, closedById: null }
        : { status: t.novo, closedAt: agora, closedById: userId };

  const mudou = await getPrisma().serviceRequest.updateMany({
    where: { id: s.id, tenantId: ctx.tenantId, status: s.status },
    data: dados,
  });
  if (mudou.count !== 1) return { error: "A solicitação acabou de mudar — atualize a página." };

  let aviso: string | null = null;
  if (acao === "CONCLUIR") {
    const r = await avisarClienteDaSolicitacao(
      { tenantId: ctx.tenantId, companyId: s.companyId, id: s.id, numero: s.number, assunto: s.subject.label },
      "concluida"
    );
    aviso = resumoDoAvisoAoCliente(r);
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: `solicitacao.${acao.toLowerCase()}`,
    entityType: "ServiceRequest",
    entityId: s.id,
    metadata: { numero: s.number, de: s.status, para: t.novo },
  });

  revalidar(s.id);
  return { ok: true, aviso };
}

export async function assumirSolicitacao(id: string): Promise<Resultado> {
  return mudarStatus(id, "ASSUMIR");
}
export async function concluirSolicitacao(id: string): Promise<Resultado> {
  return mudarStatus(id, "CONCLUIR");
}
export async function cancelarSolicitacao(id: string): Promise<Resultado> {
  return mudarStatus(id, "CANCELAR");
}
export async function reabrirSolicitacao(id: string): Promise<Resultado> {
  return mudarStatus(id, "REABRIR");
}

/**
 * Passa a solicitação para outro setor — o assunto que o cliente escolheu nem
 * sempre é o de quem resolve ("pedir um documento" pode ser um balancete).
 *
 * O responsável passa a ser o da empresa no setor novo, se houver; senão o
 * setor inteiro é avisado. O encaminhamento fica na conversa como nota
 * interna: o cliente não precisa saber por quantas mesas o pedido passou.
 */
export async function encaminharSolicitacao(id: string, setor: string, motivo: string): Promise<Resultado> {
  const c = await paraAgir(id);
  if (!c.ok) return { error: c.erro };
  const { ctx, s, userId } = c;

  const t = transicao(s.status, "EQUIPE", "ENCAMINHAR");
  if (!t.ok) return { error: t.motivo };

  const setores = await getActiveSectors(ctx.tenantId);
  const destino = setores.find((x) => x.code === setor);
  if (!destino) return { error: "Escolha o setor." };
  if (destino.code === s.sectorCode) return { error: "A solicitação já está neste setor." };
  const origem = setores.find((x) => x.code === s.sectorCode)?.label ?? s.sectorCode;
  const porque = motivo.trim().slice(0, 500);

  const assigneeId = await responsavelDaEmpresaNoSetor(ctx.tenantId, s.companyId, destino.code);
  try {
    await getPrisma().$transaction(async (tx) => {
      const mudou = await tx.serviceRequest.updateMany({
        where: { id: s.id, tenantId: ctx.tenantId, status: s.status, sectorCode: s.sectorCode },
        data: { sectorCode: destino.code, assigneeId },
      });
      if (mudou.count !== 1) throw new Recusa("A solicitação acabou de mudar — atualize a página.");
      await tx.serviceRequestMessage.create({
        data: {
          requestId: s.id,
          authorUserId: userId,
          internal: true,
          body: `Encaminhada de ${origem} para ${destino.label}${porque ? `: ${porque}` : "."}`,
        },
      });
    });
  } catch (err) {
    if (err instanceof Recusa) return { error: err.message };
    throw err;
  }

  await avisarEquipeDaSolicitacao(
    {
      tenantId: ctx.tenantId,
      id: s.id,
      numero: s.number,
      assunto: s.subject.label,
      empresaNome: nomeExibicao(s.company),
      setor: destino.code,
      assigneeId,
    },
    "encaminhada",
    userId
  );

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "solicitacao.encaminhada",
    entityType: "ServiceRequest",
    entityId: s.id,
    metadata: { numero: s.number, de: s.sectorCode, para: destino.code },
  });

  revalidar(s.id);
  return { ok: true };
}
