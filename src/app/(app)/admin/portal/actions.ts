"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import { createPasswordResetToken } from "@/lib/auth/passwordReset";
import { sendPasswordResetEmail } from "@/lib/email/sendMail";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import {
  CONTAGEM_DO_ACESSO,
  confirmacaoConfere,
  podeExcluirDeVerdade,
  resumirHistoricoDoAcesso,
  type HistoricoDoAcesso,
} from "@/lib/exclusaoConfirmada";
import { mensagemDoEmailRepetido, type AcessoExistente } from "@/lib/portal/acessoExistente";
import type { Prisma } from "@/generated/prisma/client";

/**
 * O retorno dos formulários de acesso. `existente` vem quando o e-mail já tem
 * acesso — a tela diz de quem é, em que situação está, e oferece o caminho
 * (ver lib/portal/acessoExistente).
 */
export type EstadoDoAcesso =
  | { erro: string; existente?: AcessoExistente }
  | { ok: true; aviso?: string; mensagem?: string }
  | null;

type Contexto = { tenantId: string; userId: string };
type ContaComEmail = { id: string; name: string; active: boolean; clientGroupId: string; clientGroup: { name: string } };
type Grupo = { id: string; name: string };

function lerCampos(form: FormData) {
  return {
    nome: String(form.get("nome") ?? "").trim().slice(0, 120),
    email: String(form.get("email") ?? "").trim().toLowerCase(),
    clientGroupId: String(form.get("clientGroupId") ?? ""),
  };
}

function validarCampos(c: ReturnType<typeof lerCampos>): string | null {
  if (!c.nome) return "Informe o nome.";
  if (!c.email.includes("@") || c.email.length > 120) return "E-mail inválido.";
  if (!c.clientGroupId) return "Escolha o cliente que esta conta enxerga.";
  return null;
}

/**
 * O cliente do formulário, só se for deste tenant: o id vem do cliente HTTP, e
 * sem esta conferência um id de outro tenant daria a um cliente acesso às
 * empresas de outro escritório.
 */
async function grupoDoTenant(tenantId: string, clientGroupId: string): Promise<Grupo | null> {
  return getPrisma().clientGroup.findFirst({
    where: { id: clientGroupId, tenantId },
    select: { id: true, name: true },
  });
}

/**
 * Cria um acesso de cliente ao portal.
 *
 * **Nasce sem senha conhecida**, igual à importação de usuários de 03/09: uma
 * senha aleatória é gerada, cifrada e descartada dentro deste processo. Não
 * existe senha padrão, e ninguém — nem quem cria — sabe qual é. O cliente entra
 * pelo link de definição de senha, que vai por e-mail.
 *
 * E-mail repetido (13/10/2026): o e-mail é único por escritório, inclusive
 * entre os desativados. Em vez de recusar sem explicar, a resposta diz de quem
 * é o acesso e em que situação ele está — e, quando faz sentido, o formulário
 * oferece reaproveitá-lo (botão com `name="reaproveitar"`, que volta para esta
 * mesma action com os campos como estão na tela).
 *
 * Só `isFullWrite`: dar acesso a alguém de fora da 41 não é operação de setor.
 */
export async function criarAcessoDoPortal(_anterior: EstadoDoAcesso, form: FormData): Promise<EstadoDoAcesso> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) return { erro: "Sem permissão." };

  const campos = lerCampos(form);
  const invalido = validarCampos(campos);
  if (invalido) return { erro: invalido };
  const { nome, email } = campos;

  const prisma = getPrisma();
  const grupo = await grupoDoTenant(ctx.tenantId, campos.clientGroupId);
  if (!grupo) return { erro: "Cliente não encontrado." };

  const jaExiste: ContaComEmail | null = await prisma.portalUser.findFirst({
    where: { tenantId: ctx.tenantId, email },
    select: { id: true, name: true, active: true, clientGroupId: true, clientGroup: { select: { name: true } } },
  });

  const reaproveitar = String(form.get("reaproveitar") ?? "");
  if (reaproveitar) {
    // O id veio da resposta anterior; se o e-mail agora é de outro acesso (ou
    // de nenhum), a pessoa estaria confirmando algo que não viu.
    if (!jaExiste || jaExiste.id !== reaproveitar) {
      return { erro: "Este acesso mudou enquanto a janela estava aberta. Feche e tente de novo." };
    }
    return reaproveitarAcesso(ctx, jaExiste, { nome, email, grupo });
  }

  if (jaExiste) {
    const existente: AcessoExistente = {
      id: jaExiste.id,
      nome: jaExiste.name,
      email,
      ativo: jaExiste.active,
      clienteId: jaExiste.clientGroupId,
      cliente: jaExiste.clientGroup.name,
    };
    return { erro: mensagemDoEmailRepetido(existente, grupo.id), existente };
  }

  let criadoId: string;
  try {
    const criado = await prisma.portalUser.create({
      data: {
        tenantId: ctx.tenantId,
        clientGroupId: grupo.id,
        name: nome,
        email,
        passwordHash: await hashPassword(randomBytes(32).toString("hex")),
      },
      select: { id: true },
    });
    criadoId = criado.id;
  } catch (err) {
    // Duas pessoas criando o mesmo e-mail ao mesmo tempo: a conferência acima
    // passou para as duas, e o índice único barrou a segunda.
    if (isPrismaUniqueError(err)) return { erro: "Acabou de ser criado um acesso com este e-mail. Feche a janela e confira a lista." };
    throw err;
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "portal.user.created",
    entityType: "PortalUser",
    entityId: criadoId,
    metadata: { email, clientGroupId: grupo.id },
  });

  revalidatePath("/admin/portal");

  const enviado = await enviarLinkDeSenhaInterno(ctx.tenantId, criadoId, email);
  return enviado
    ? { ok: true }
    : {
        ok: true,
        aviso: "Acesso criado, mas o e-mail não saiu (SMTP do workspace). Use “Enviar link” depois de configurar.",
      };
}

/**
 * Reaproveita o acesso que já tinha o e-mail: passa para o cliente escolhido,
 * leva o nome digitado e volta a funcionar.
 *
 * Quando o cliente muda, a pessoa sai do portal na hora — a sessão leva o
 * cliente, e toda tela confere no banco se ele ainda é o mesmo
 * (`sessaoAtivaDoPortal`). Os limites de aprovação dela em empresas que não são
 * do cliente novo são desligados (não apagados: explicam quem pôde aprovar o
 * que já foi aprovado — mesma regra de `alternarAlcada`).
 */
async function reaproveitarAcesso(
  ctx: Contexto,
  conta: ContaComEmail,
  pedido: { nome: string; email: string; grupo: Grupo }
): Promise<EstadoDoAcesso> {
  const trocaDeCliente = conta.clientGroupId !== pedido.grupo.id;
  if (conta.active && !trocaDeCliente) {
    return { erro: `Este e-mail já tem um acesso ativo neste cliente, em nome de ${conta.name}.` };
  }

  const prisma = getPrisma();
  const alcadasDesligadas = await prisma.$transaction(async (tx) => {
    await tx.portalUser.update({
      where: { id: conta.id },
      data: { name: pedido.nome, clientGroupId: pedido.grupo.id, active: true },
    });
    return trocaDeCliente ? desligarAlcadasForaDoCliente(tx, ctx.tenantId, conta.id, pedido.grupo.id) : 0;
  });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: trocaDeCliente ? "portal.user.reassigned" : "portal.user.enabled",
    entityType: "PortalUser",
    entityId: conta.id,
    metadata: {
      email: pedido.email,
      nomeAnterior: conta.name,
      nome: pedido.nome,
      deCliente: { id: conta.clientGroupId, nome: conta.clientGroup.name },
      paraCliente: { id: pedido.grupo.id, nome: pedido.grupo.name },
      reativado: !conta.active,
      alcadasDesligadas,
    },
  });
  revalidatePath("/admin/portal");

  if (!conta.active) {
    // Estava desativado: a pessoa pode nem lembrar a senha. Vai o mesmo link
    // do acesso novo, que é o que a janela de "Novo acesso" promete.
    const enviado = await enviarLinkDeSenhaInterno(ctx.tenantId, conta.id, pedido.email);
    const onde = trocaDeCliente ? ` e passou para o cliente ${pedido.grupo.name}` : "";
    return enviado
      ? { ok: true, mensagem: `Acesso reativado${onde}. Link de senha enviado.` }
      : { ok: true, aviso: `Acesso reativado${onde}, mas o e-mail não saiu (SMTP do workspace). Use “Enviar link” depois de configurar.` };
  }
  return {
    ok: true,
    mensagem: `Acesso passado para o cliente ${pedido.grupo.name}. ${pedido.nome} precisa entrar de novo no portal.`,
  };
}

/**
 * Desliga os limites de aprovação que a conta tem em empresas fora do cliente
 * novo. Sem isto, se uma dessas empresas viesse depois para o cliente novo, a
 * pessoa ganharia de volta, sem ninguém decidir, o poder de aprovar pagamento
 * nela.
 */
async function desligarAlcadasForaDoCliente(
  tx: Prisma.TransactionClient,
  tenantId: string,
  portalUserId: string,
  clientGroupId: string
): Promise<number> {
  const empresasDoCliente = await tx.company.findMany({ where: { tenantId, clientGroupId }, select: { id: true } });
  const r = await tx.portalApprovalLimit.updateMany({
    where: { tenantId, portalUserId, active: true, companyId: { notIn: empresasDoCliente.map((e) => e.id) } },
    data: { active: false },
  });
  return r.count;
}

/**
 * Edita nome, e-mail e cliente de um acesso (13/10/2026). Antes, um acesso
 * criado no cliente errado só se resolvia desativando e criando outro — e o
 * e-mail continuava preso no desativado.
 *
 * Trocar o cliente tira a pessoa do portal na hora (ver `reaproveitarAcesso`).
 */
export async function editarAcessoDoPortal(_anterior: EstadoDoAcesso, form: FormData): Promise<EstadoDoAcesso> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) return { erro: "Sem permissão." };

  const id = String(form.get("id") ?? "");
  const campos = lerCampos(form);
  const invalido = validarCampos(campos);
  if (invalido) return { erro: invalido };
  const { nome, email } = campos;

  const prisma = getPrisma();
  const conta = await prisma.portalUser.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true, name: true, email: true, clientGroupId: true, clientGroup: { select: { name: true } } },
  });
  if (!conta) return { erro: "Acesso não encontrado." };

  const grupo = await grupoDoTenant(ctx.tenantId, campos.clientGroupId);
  if (!grupo) return { erro: "Cliente não encontrado." };

  if (email !== conta.email) {
    const outro = await prisma.portalUser.findFirst({
      where: { tenantId: ctx.tenantId, email, id: { not: conta.id } },
      select: { name: true, active: true, clientGroup: { select: { name: true } } },
    });
    if (outro) {
      return {
        erro: `O e-mail ${email} já é de outro acesso: ${outro.name}, do cliente ${outro.clientGroup.name} (${outro.active ? "ativo" : "desativado"}). Cada e-mail tem um acesso só.`,
      };
    }
  }

  const trocaDeCliente = grupo.id !== conta.clientGroupId;
  let alcadasDesligadas = 0;
  try {
    alcadasDesligadas = await prisma.$transaction(async (tx) => {
      await tx.portalUser.update({ where: { id: conta.id }, data: { name: nome, email, clientGroupId: grupo.id } });
      return trocaDeCliente ? desligarAlcadasForaDoCliente(tx, ctx.tenantId, conta.id, grupo.id) : 0;
    });
  } catch (err) {
    if (isPrismaUniqueError(err)) return { erro: `O e-mail ${email} acabou de ser usado em outro acesso.` };
    throw err;
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: trocaDeCliente ? "portal.user.reassigned" : "portal.user.updated",
    entityType: "PortalUser",
    entityId: conta.id,
    metadata: {
      antes: { nome: conta.name, email: conta.email, cliente: { id: conta.clientGroupId, nome: conta.clientGroup.name } },
      depois: { nome, email, cliente: { id: grupo.id, nome: grupo.name } },
      alcadasDesligadas,
    },
  });
  revalidatePath("/admin/portal");

  return {
    ok: true,
    mensagem: trocaDeCliente
      ? `Acesso atualizado. ${nome} passa a ver as empresas de ${grupo.name} e precisa entrar de novo no portal.`
      : "Acesso atualizado.",
  };
}

/** O que a janela de exclusão mostra antes de a pessoa confirmar. */
export type ResumoDoAcessoParaExcluir = {
  nome: string;
  email: string;
  cliente: string;
  historico: HistoricoDoAcesso;
};

/** Conta o que está ligado ao acesso, para a janela de exclusão. Só leitura. */
export async function resumoDoAcessoParaExcluir(id: string): Promise<{ erro: string } | ResumoDoAcessoParaExcluir> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !podeExcluirDeVerdade(ctx)) return { erro: "Só administradores excluem acessos do portal." };

  const conta = await getPrisma().portalUser.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { name: true, email: true, clientGroup: { select: { name: true } }, _count: { select: CONTAGEM_DO_ACESSO } },
  });
  if (!conta) return { erro: "Acesso não encontrado." };

  return {
    nome: conta.name,
    email: conta.email,
    cliente: conta.clientGroup.name,
    historico: resumirHistoricoDoAcesso(conta._count),
  };
}

/**
 * Exclui o acesso de verdade (regras de 13/10/2026, ver lib/exclusaoConfirmada).
 *
 * O que o banco faz sozinho, e por isso não há `deleteMany` de cada tabela
 * aqui: mensagens, solicitações, arquivos, aprovações e registros de download
 * ficam, com o autor em branco (`SET NULL`); limite de aprovação, "comunicado
 * lido" e aparelho de notificação vão junto (`CASCADE`). O token de redefinição
 * de senha não tem FK — é apagado à mão, na mesma transação.
 *
 * A sessão aberta morre na próxima tela: toda leitura do portal confere no
 * banco que a conta existe (`sessaoAtivaDoPortal`).
 *
 * A auditoria leva o retrato do que existia — nome, e-mail, cliente e a
 * contagem — porque depois da exclusão o id não aponta para mais nada.
 */
export async function excluirAcessoDoPortal(id: string, confirmacao: string): Promise<{ erro: string } | { ok: true }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !podeExcluirDeVerdade(ctx)) return { erro: "Só administradores excluem acessos do portal." };

  const prisma = getPrisma();
  const conta = await prisma.portalUser.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: {
      id: true,
      name: true,
      email: true,
      active: true,
      clientGroupId: true,
      clientGroup: { select: { name: true } },
      _count: { select: CONTAGEM_DO_ACESSO },
    },
  });
  if (!conta) return { erro: "Acesso não encontrado." };
  if (!confirmacaoConfere(confirmacao, [conta.name, conta.email])) {
    return { erro: `O nome digitado não confere. Digite ${conta.name} para confirmar.` };
  }

  const excluidos = await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.deleteMany({ where: { userId: conta.id, subject: "PORTAL_USER" } });
    const r = await tx.portalUser.deleteMany({ where: { id: conta.id, tenantId: ctx.tenantId } });
    return r.count;
  });
  if (excluidos !== 1) return { erro: "Acesso não encontrado." };

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "portal.user.deleted",
    entityType: "PortalUser",
    entityId: conta.id,
    metadata: {
      nome: conta.name,
      email: conta.email,
      ativo: conta.active,
      cliente: { id: conta.clientGroupId, nome: conta.clientGroup.name },
      historico: conta._count,
    },
  });
  revalidatePath("/admin/portal");
  return { ok: true };
}

async function enviarLinkDeSenhaInterno(tenantId: string, portalUserId: string, email: string): Promise<boolean> {
  const prisma = getPrisma();
  const smtp = await prisma.tenantSmtpConfig.findUnique({ where: { tenantId } });
  if (!smtp) return false;
  const token = await createPasswordResetToken(portalUserId, "PORTAL_USER");
  const r = await sendPasswordResetEmail({ tenantId, to: email, resetToken: token, destino: "portal" });
  return r.ok;
}

/** Reenvia o link de definição de senha — para quando o primeiro e-mail não chegou. */
export async function enviarLinkDeSenha(portalUserId: string): Promise<{ error: string } | { ok: true }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) return { error: "Sem permissão." };

  const prisma = getPrisma();
  const conta = await prisma.portalUser.findFirst({
    where: { id: portalUserId, tenantId: ctx.tenantId },
    select: { id: true, email: true, active: true },
  });
  if (!conta) return { error: "Acesso não encontrado." };
  if (!conta.active) return { error: "Acesso desativado — reative antes de mandar o link." };

  const ok = await enviarLinkDeSenhaInterno(ctx.tenantId, conta.id, conta.email);
  return ok ? { ok: true } : { error: "Não foi possível enviar. Confira o SMTP do workspace." };
}

/** Liga/desliga o acesso. Desativado não entra e não recebe link. */
export async function alternarAcessoDoPortal(portalUserId: string, ativo: boolean): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) return;

  const prisma = getPrisma();
  const conta = await prisma.portalUser.findFirst({
    where: { id: portalUserId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!conta) return;

  await prisma.portalUser.update({ where: { id: conta.id }, data: { active: ativo } });
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: ativo ? "portal.user.enabled" : "portal.user.disabled",
    entityType: "PortalUser",
    entityId: conta.id,
  });
  revalidatePath("/admin/portal");
}
