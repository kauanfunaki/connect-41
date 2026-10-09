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
import { isModuleEnabled } from "@/lib/modules";
import { getActiveSectors } from "@/lib/sectors";
import { logAudit } from "@/lib/audit";
import { guardarTambemNosArquivos } from "@/lib/drive/guardarTambem";
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
import {
  MODULO_DO_CANAL,
  pedidosAoClienteLigados,
  setorDaPendencia,
  setorPadraoDasPendencias,
} from "@/lib/financeiro/pendencias/setor";

export type ResultadoDaPendencia = { error: string } | { ok: true; id: string; aviso: string | null };
export type Resultado = { error: string } | { ok: true; aviso: string | null };

/** Erro de regra dentro da transação: aborta o que já foi gravado e vira mensagem. */
class Recusa extends Error {}

/**
 * O tenant e quem pede. A permissão é conferida contra o **setor da pendência**
 * (01/10: qualquer setor pede ao cliente), e não mais contra o do módulo — quem
 * cria escolhe o setor; quem age numa existente precisa ser do setor dela.
 */
async function contexto() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false as const, erro: "Não autenticado." };
  if (!(await pedidosAoClienteLigados(ctx.tenantId))) return { ok: false as const, erro: "Módulo não habilitado." };
  const padrao = await setorPadraoDasPendencias(ctx.tenantId);
  return { ok: true as const, ctx, tenantId: ctx.tenantId, userId: ctx.userId || null, prisma: getPrisma(), padrao };
}

function revalidar(id?: string) {
  revalidatePath("/pendencias");
  revalidatePath("/solicitacoes/pedidos");
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

  // Sem setor no formulário é a tela do BPO: o setor do módulo, como sempre foi.
  const setor = texto(formData, "sectorCode").trim() || c.padrao;
  if (!canActOnSector(c.ctx, setor)) return { error: "Sem permissão para pedir em nome deste setor." };
  if (setor !== c.padrao) {
    if (!(await isModuleEnabled(c.tenantId, MODULO_DO_CANAL))) {
      return { error: "Pedidos de outros setores dependem das solicitações do portal, que estão desligadas." };
    }
    if (!(await getActiveSectors(c.tenantId)).some((s) => s.code === setor)) return { error: "Escolha um setor ativo." };
  }

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

  const arquivos = arquivosDoFormulario(formData, "anexos");
  const gravados = await gravarAnexos(c.tenantId, arquivos);
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
          sectorCode: setor,
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

  // "Guardar também em Arquivos": cópia na pasta escolhida, depois de gravado.
  const avisoDaCopia = await guardarTambemNosArquivos(c.ctx, formData, empresa.id, arquivos);

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
      setor,
      kind: v.dados.kind,
      financeEntryId,
      anexos: gravados.anexos.length,
      emailsEnviados: aviso.enviados,
      emailsFalharam: aviso.falhas,
      semSmtp: aviso.semSmtp,
    },
  });

  revalidar(id);
  return { ok: true, id, aviso: [resumoDoAviso(aviso), avisoDaCopia].filter(Boolean).join(" ") || null };
}

/**
 * A pendência do tenant com o que as ações precisam — se quem pede pode agir no
 * setor dela. Setor alheio responde "não encontrada", igual a uma que não existe.
 */
async function pendenciaParaAgir(c: Extract<Awaited<ReturnType<typeof contexto>>, { ok: true }>, id: string) {
  const p = await c.prisma.clientRequest.findFirst({
    where: { id, tenantId: c.tenantId },
    select: { id: true, status: true, title: true, companyId: true, sectorCode: true },
  });
  if (!p || !canActOnSector(c.ctx, setorDaPendencia(p.sectorCode, c.padrao))) return null;
  return p;
}

/** Responde na conversa, com texto e/ou anexos. Devolve a vez ao cliente. */
export async function responderPendenciaEquipe(formData: FormData): Promise<Resultado> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };

  const id = texto(formData, "requestId");
  const p = await pendenciaParaAgir(c, id);
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

  const avisoDaCopia = await guardarTambemNosArquivos(c.ctx, formData, p.companyId, arquivos);

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
  return { ok: true, aviso: [resumoDoAviso(aviso), avisoDaCopia].filter(Boolean).join(" ") || null };
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
  const p = await pendenciaParaAgir(c, id);
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
