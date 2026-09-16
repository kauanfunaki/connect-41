"use server";

// Pendências ao cliente, do lado da equipe: abrir, responder, resolver, reabrir
// e cancelar.
//
// Toda mudança de status é um `updateMany` condicionado ao status lido: se o
// cliente respondeu enquanto alguém da equipe resolvia, uma das duas escritas
// não acha mais o estado que esperava e volta com mensagem, em vez de uma
// sobrescrever a outra em silêncio.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { logAudit } from "@/lib/audit";
import {
  transicao,
  validarCamposDaPendencia,
  validarResposta,
  type AcaoNaPendencia,
  type StatusDaPendencia,
} from "@/lib/financeiro/pendencias/regras";
import {
  arquivosDoFormulario,
  gravarAnexos,
  apagarAnexosGravados,
  type AnexoGravado,
} from "@/lib/financeiro/pendencias/armazenamento";
import { avisarClienteDaPendencia, resumoDoAviso } from "@/lib/financeiro/pendencias/avisos";

const MODULE = "bpo_pendencias";

export type ResultadoDaPendencia = { error: string } | { ok: true; id: string; aviso: string | null };
export type Resultado = { error: string } | { ok: true; aviso: string | null };

/** Erro de regra dentro da transação: aborta o que já foi gravado e vira mensagem. */
class Recusa extends Error {}

async function contexto() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false as const, erro: "Não autenticado." };
  const setor = (await setorDoModulo(ctx.tenantId, MODULE)) ?? getModuleDef(MODULE)!.sectorCode;
  if (!canActOnSector(ctx, setor)) return { ok: false as const, erro: "Sem permissão nas pendências." };
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) return { ok: false as const, erro: "Módulo não habilitado." };
  return { ok: true as const, ctx, tenantId: ctx.tenantId, userId: ctx.userId || null, prisma: getPrisma() };
}

function revalidar(id?: string) {
  revalidatePath("/pendencias");
  revalidatePath("/portal/pendencias");
  revalidatePath("/portal");
  if (id) {
    revalidatePath(`/pendencias/${id}`);
    revalidatePath(`/portal/pendencias/${id}`);
  }
}

function texto(formData: FormData, k: string): string {
  const v = formData.get(k);
  return typeof v === "string" ? v : "";
}

/**
 * Abre a pendência.
 *
 * O vínculo com lançamento é conferido contra o tenant **e a empresa**:
 * pendência da empresa A apontando para a conta da empresa B mostraria ao
 * cliente de A um título que é de outro cliente.
 */
export async function criarPendencia(formData: FormData): Promise<ResultadoDaPendencia> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };

  const companyId = texto(formData, "companyId").trim();
  const empresa = await c.prisma.company.findFirst({ where: { id: companyId, tenantId: c.tenantId }, select: { id: true } });
  if (!empresa) return { error: "Escolha a empresa." };

  const v = validarCamposDaPendencia({
    kind: texto(formData, "kind"),
    title: texto(formData, "title"),
    description: texto(formData, "description"),
    dueDate: texto(formData, "dueDate"),
  });
  if (!v.ok) return { error: v.erro };

  const financeEntryId = texto(formData, "financeEntryId").trim() || null;
  if (financeEntryId) {
    const lancamento = await c.prisma.financeEntry.findFirst({
      where: { id: financeEntryId, tenantId: c.tenantId, companyId: empresa.id },
      select: { id: true },
    });
    if (!lancamento) return { error: "O lançamento vinculado não é desta empresa." };
  }

  const gravados = await gravarAnexos(c.tenantId, arquivosDoFormulario(formData, "anexos"));
  if (!gravados.ok) return { error: gravados.erro };

  let id: string;
  try {
    id = await c.prisma.$transaction(async (tx) => {
      const criada = await tx.clientRequest.create({
        data: {
          tenantId: c.tenantId,
          companyId: empresa.id,
          kind: v.dados.kind,
          title: v.dados.title,
          description: v.dados.description,
          dueDate: v.dados.dueDate,
          status: "ABERTA",
          financeEntryId,
          createdById: c.userId,
        },
        select: { id: true },
      });
      // Anexo da abertura (o modelo de planilha, a guia a conferir) entra sem
      // mensagem: a descrição da pendência é o texto que ele acompanha.
      if (gravados.anexos.length > 0) {
        await tx.clientRequestAttachment.createMany({
          data: gravados.anexos.map((a) => ({ requestId: criada.id, uploadedByUserId: c.userId, ...a })),
        });
      }
      return criada.id;
    });
  } catch (err) {
    await apagarAnexosGravados(gravados.anexos);
    throw err;
  }

  const aviso = await avisarClienteDaPendencia({
    tenantId: c.tenantId,
    companyId: empresa.id,
    requestId: id,
    titulo: v.dados.title,
    motivo: "nova",
  });

  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "financeiro.client_request.created",
    entityType: "ClientRequest",
    entityId: id,
    metadata: {
      companyId: empresa.id,
      kind: v.dados.kind,
      financeEntryId,
      anexos: gravados.anexos.length,
      emailsEnviados: aviso.enviados,
      emailsFalharam: aviso.falhas,
      semSmtp: aviso.semSmtp,
    },
  });

  revalidar(id);
  return { ok: true, id, aviso: resumoDoAviso(aviso) };
}

/** Carrega a pendência do tenant com o que as ações precisam. */
async function pendenciaDoTenant(prisma: ReturnType<typeof getPrisma>, id: string, tenantId: string) {
  return prisma.clientRequest.findFirst({
    where: { id, tenantId },
    select: { id: true, status: true, title: true, companyId: true },
  });
}

/** Responde na conversa, com texto e/ou anexos. Devolve a vez ao cliente. */
export async function responderPendenciaEquipe(formData: FormData): Promise<Resultado> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };

  const id = texto(formData, "requestId");
  const p = await pendenciaDoTenant(c.prisma, id, c.tenantId);
  if (!p) return { error: "Pendência não encontrada." };

  const arquivos = arquivosDoFormulario(formData, "anexos");
  const resposta = validarResposta(texto(formData, "body"), arquivos.length);
  if (!resposta.ok) return { error: resposta.erro };
  const t = transicao(p.status, "EQUIPE", "RESPONDER");
  if (!t.ok) return { error: t.motivo };

  const gravados = await gravarAnexos(c.tenantId, arquivos);
  if (!gravados.ok) return { error: gravados.erro };

  try {
    await c.prisma.$transaction(async (tx) => {
      const mudou = await tx.clientRequest.updateMany({
        where: { id: p.id, tenantId: c.tenantId, status: p.status },
        // `updatedAt` explícito: equipe respondendo em ABERTA não muda o status, e
        // o MySQL conta como afetada só a linha que de fato mudou.
        data: { status: t.novo, updatedAt: new Date() },
      });
      if (mudou.count !== 1) throw new Recusa("A pendência acabou de mudar — atualize a tela.");
      await gravarMensagem(tx, p.id, { authorUserId: c.userId }, resposta.corpo, gravados.anexos);
    });
  } catch (err) {
    await apagarAnexosGravados(gravados.anexos);
    if (err instanceof Recusa) return { error: err.message };
    throw err;
  }

  const aviso = await avisarClienteDaPendencia({
    tenantId: c.tenantId,
    companyId: p.companyId,
    requestId: p.id,
    titulo: p.title,
    motivo: "resposta",
  });

  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "financeiro.client_request.replied",
    entityType: "ClientRequest",
    entityId: p.id,
    metadata: { de: p.status, para: t.novo, anexos: gravados.anexos.length, emailsEnviados: aviso.enviados, semSmtp: aviso.semSmtp },
  });

  revalidar(p.id);
  return { ok: true, aviso: resumoDoAviso(aviso) };
}

type Tx = Prisma.TransactionClient;

/** Mensagem e anexos juntos: anexo sem a mensagem que o trouxe perde o contexto de quando e por quem. */
async function gravarMensagem(
  tx: Tx,
  requestId: string,
  autor: { authorUserId: string | null },
  corpo: string,
  anexos: AnexoGravado[]
) {
  const msg = await tx.clientRequestMessage.create({
    data: { requestId, authorUserId: autor.authorUserId, body: corpo },
    select: { id: true },
  });
  if (anexos.length > 0) {
    await tx.clientRequestAttachment.createMany({
      data: anexos.map((a) => ({ requestId, messageId: msg.id, uploadedByUserId: autor.authorUserId, ...a })),
    });
  }
}

const ACAO_DE_AUDITORIA: Record<Exclude<AcaoNaPendencia, "RESPONDER">, string> = {
  RESOLVER: "financeiro.client_request.resolved",
  REABRIR: "financeiro.client_request.reopened",
  CANCELAR: "financeiro.client_request.cancelled",
};

/**
 * Resolver, reabrir ou cancelar — as três só mudam o status.
 *
 * Resolver grava quem e quando; reabrir limpa, porque a pendência reaberta não
 * está mais resolvida e o "resolvida em" antigo mentiria na tela. O histórico
 * de quem resolveu antes fica no AuditLog.
 */
async function mudarStatus(id: string, acao: Exclude<AcaoNaPendencia, "RESPONDER">): Promise<Resultado> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };
  const p = await pendenciaDoTenant(c.prisma, id, c.tenantId);
  if (!p) return { error: "Pendência não encontrada." };
  const t = transicao(p.status, "EQUIPE", acao);
  if (!t.ok) return { error: t.motivo };

  const encerrando = acao === "RESOLVER";
  const mudou = await c.prisma.clientRequest.updateMany({
    where: { id: p.id, tenantId: c.tenantId, status: p.status as StatusDaPendencia },
    data: {
      status: t.novo,
      resolvedAt: encerrando ? new Date() : null,
      resolvedById: encerrando ? c.userId : null,
    },
  });
  if (mudou.count !== 1) return { error: "A pendência acabou de mudar — atualize a tela." };

  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: ACAO_DE_AUDITORIA[acao],
    entityType: "ClientRequest",
    entityId: p.id,
    metadata: { de: p.status, para: t.novo },
  });
  revalidar(p.id);
  return { ok: true, aviso: null };
}

export async function resolverPendencia(id: string): Promise<Resultado> {
  return mudarStatus(id, "RESOLVER");
}

export async function reabrirPendencia(id: string): Promise<Resultado> {
  return mudarStatus(id, "REABRIR");
}

export async function cancelarPendencia(id: string): Promise<Resultado> {
  return mudarStatus(id, "CANCELAR");
}
