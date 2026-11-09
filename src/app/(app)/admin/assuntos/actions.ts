"use server";

// Assuntos das solicitações do portal: o que o cliente escolhe, o setor que
// atende e o prazo de resposta prometido. Só administrador mexe — é a regra de
// roteamento de tudo o que o cliente pede.
//
// Não há excluir: solicitações antigas apontam para o assunto, então ele é
// desativado (some da lista do cliente e continua no histórico).
//
// O assunto também diz se a solicitação vira cartão no quadro do setor, e em
// qual lista (09/11/2026, `cardPipelineId`). A lista tem de ser do setor que
// atende: o cartão é o trabalho de quem recebe a solicitação.
//
// E se aceita pedido por link público (09/11/2026, `publicLink`): ligar ou
// desligar publica ou tira do ar um formulário aberto a qualquer um, então a
// troca ganha linha própria na Auditoria, além do "editou".

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { getActiveSectors } from "@/lib/sectors";
import { logAudit } from "@/lib/audit";
import { validarAssunto } from "@/lib/solicitacoes/regras";
import { listaDoAssunto } from "@/lib/solicitacoes/cartaoServidor";

export type AssuntoState = { error: string } | null;

async function administrador() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role) || ctx.subscriptionReadOnly) return null;
  return ctx;
}

function campos(form: FormData) {
  const texto = (k: string) => String(form.get(k) ?? "");
  return { label: texto("label"), description: texto("description"), sectorCode: texto("sectorCode"), responseDays: texto("responseDays") };
}

async function setorAtivo(tenantId: string, code: string): Promise<boolean> {
  return (await getActiveSectors(tenantId)).some((s) => s.code === code);
}

/** A lista do cartão vinda do formulário, conferida. `undefined` = escolha que não vale. */
async function listaDoFormulario(tenantId: string, form: FormData, sectorCode: string) {
  return listaDoAssunto(tenantId, String(form.get("cardPipelineId") ?? "").trim(), sectorCode);
}

const LISTA_INVALIDA = "Escolha uma lista dos Quadros do setor que atende — ou deixe sem cartão.";

/** O interruptor "Aceita pedido por link público": envia "1" ligado e nada desligado. */
function linkPublicoDoFormulario(form: FormData): boolean {
  return form.get("publicLink") === "1";
}

async function registrarTrocaDoLink(ctx: { tenantId: string; userId: string }, id: string, label: string, ligado: boolean) {
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: ligado ? "solicitacao_assunto.link_publico_ligado" : "solicitacao_assunto.link_publico_desligado",
    entityType: "ServiceRequestSubject",
    entityId: id,
    metadata: { label },
  });
}

export async function criarAssunto(_prev: AssuntoState, form: FormData): Promise<AssuntoState> {
  const ctx = await administrador();
  if (!ctx) return { error: "Só administrador cadastra assuntos." };
  const v = validarAssunto(campos(form));
  if (!v.ok) return { error: v.erro };
  if (!(await setorAtivo(ctx.tenantId, v.dados.sectorCode))) return { error: "Escolha um setor ativo." };
  const cardPipelineId = await listaDoFormulario(ctx.tenantId, form, v.dados.sectorCode);
  if (cardPipelineId === undefined) return { error: LISTA_INVALIDA };
  const publicLink = linkPublicoDoFormulario(form);

  const prisma = getPrisma();
  const ultimo = await prisma.serviceRequestSubject.aggregate({ where: { tenantId: ctx.tenantId }, _max: { order: true } });
  let id: string;
  try {
    const criado = await prisma.serviceRequestSubject.create({
      data: { tenantId: ctx.tenantId, ...v.dados, cardPipelineId, publicLink, order: (ultimo._max.order ?? -1) + 1 },
      select: { id: true },
    });
    id = criado.id;
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: `Já existe um assunto "${v.dados.label}".` };
    throw err;
  }

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "solicitacao_assunto.create", entityType: "ServiceRequestSubject", entityId: id, metadata: { label: v.dados.label, setor: v.dados.sectorCode, cartao: cardPipelineId !== null, linkPublico: publicLink } });
  if (publicLink) await registrarTrocaDoLink(ctx, id, v.dados.label, true);
  revalidatePath("/admin/assuntos");
  redirect("/admin/assuntos");
}

/**
 * Mudar o setor do assunto vale para as próximas solicitações: as abertas
 * continuam no setor em que estão (foram encaminhadas ou estão com alguém).
 * O mesmo para o prazo, que foi prometido ao cliente na abertura, e para a
 * lista do cartão: ligar agora não cria cartão para as que já chegaram.
 */
export async function atualizarAssunto(_prev: AssuntoState, form: FormData): Promise<AssuntoState> {
  const ctx = await administrador();
  if (!ctx) return { error: "Só administrador edita assuntos." };
  const id = String(form.get("id") ?? "");
  const v = validarAssunto(campos(form));
  if (!v.ok) return { error: v.erro };
  if (!(await setorAtivo(ctx.tenantId, v.dados.sectorCode))) return { error: "Escolha um setor ativo." };
  const cardPipelineId = await listaDoFormulario(ctx.tenantId, form, v.dados.sectorCode);
  if (cardPipelineId === undefined) return { error: LISTA_INVALIDA };
  const publicLink = linkPublicoDoFormulario(form);

  const prisma = getPrisma();
  const existe = await prisma.serviceRequestSubject.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true, publicLink: true } });
  if (!existe) return { error: "Assunto não encontrado." };
  try {
    await prisma.serviceRequestSubject.update({ where: { id }, data: { ...v.dados, cardPipelineId, publicLink } });
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: `Já existe um assunto "${v.dados.label}".` };
    throw err;
  }

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "solicitacao_assunto.update", entityType: "ServiceRequestSubject", entityId: id, metadata: { label: v.dados.label, setor: v.dados.sectorCode, cartao: cardPipelineId !== null, linkPublico: publicLink } });
  if (publicLink !== existe.publicLink) await registrarTrocaDoLink(ctx, id, v.dados.label, publicLink);
  revalidatePath("/admin/assuntos");
  redirect("/admin/assuntos");
}

/** Liga ou desliga o assunto na lista do cliente. Devolve `null` no sucesso (contrato do botão com confirmação). */
export async function alternarAssunto(id: string): Promise<{ error: string } | null> {
  const ctx = await administrador();
  if (!ctx) return { error: "Só administrador ativa ou desativa assuntos." };
  const prisma = getPrisma();
  const assunto = await prisma.serviceRequestSubject.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { active: true, label: true } });
  if (!assunto) return { error: "Assunto não encontrado." };
  if (assunto.active) {
    const ativos = await prisma.serviceRequestSubject.count({ where: { tenantId: ctx.tenantId, active: true } });
    if (ativos <= 1) return { error: "Deixe ao menos um assunto ativo — sem nenhum, o cliente não consegue pedir nada." };
  }
  await prisma.serviceRequestSubject.update({ where: { id }, data: { active: !assunto.active } });
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: assunto.active ? "solicitacao_assunto.deactivate" : "solicitacao_assunto.activate",
    entityType: "ServiceRequestSubject",
    entityId: id,
    metadata: { label: assunto.label },
  });
  revalidatePath("/admin/assuntos");
  return null;
}
