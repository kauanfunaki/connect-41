"use server";

// Aprovação por alçada, do lado da equipe: enviar (e reenviar) para aprovação,
// aprovar e reprovar pela coordenação, e o cadastro das alçadas.
//
// Toda decisão é um `updateMany` condicionado ao estado lido mais o evento do
// histórico, na mesma transação: o cliente aprovando no portal e a coordenação
// reprovando aqui ao mesmo tempo não podem gerar dois eventos para um estado só.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector, canManageSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { logAudit } from "@/lib/audit";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import { decimalDeCentavos } from "@/lib/financeiro/manual";
import { moeda } from "@/lib/financeiro/formato";
import { podeDecidir, podeEnviarParaAprovacao, validarMotivo, lerTeto, type Decisao } from "@/lib/financeiro/aprovacao/regras";
import { avisarAprovadores, avisarCriador, MODULO_DE_APROVACOES } from "@/lib/financeiro/aprovacao/servidor";

const MODULE = MODULO_DE_APROVACOES;

export type Resultado = { error: string } | { ok: true; aviso?: string | null };

class Recusa extends Error {}

async function contexto() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false as const, erro: "Não autenticado." };
  const setor = (await setorDoModulo(ctx.tenantId, MODULE)) ?? getModuleDef(MODULE)!.sectorCode;
  if (!canActOnSector(ctx, setor)) return { ok: false as const, erro: "Sem permissão nas aprovações." };
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) return { ok: false as const, erro: "Módulo de aprovações não habilitado." };
  return {
    ok: true as const,
    ctx,
    tenantId: ctx.tenantId,
    userId: ctx.userId || null,
    gerencia: canManageSector(ctx, setor),
    prisma: getPrisma(),
  };
}

function revalidar() {
  for (const p of ["/aprovacoes", "/pagar", "/portal/aprovacoes", "/portal"]) revalidatePath(p);
}

async function contaDoTenant(prisma: ReturnType<typeof getPrisma>, entryId: string, tenantId: string) {
  return prisma.financeEntry.findFirst({
    where: { id: entryId, tenantId },
    select: {
      id: true,
      kind: true,
      status: true,
      paidAt: true,
      amount: true,
      companyId: true,
      approvalStatus: true,
      createdById: true,
      counterparty: { select: { name: true } },
    },
  });
}

/**
 * Envia para aprovação um lançamento a pagar em aberto — o primeiro envio de
 * uma conta anterior à alçada, ou o reenvio de uma reprovada.
 *
 * Não exige alçada cadastrada na empresa: a coordenação aprova sem teto, e é
 * ela quem decide mandar uma conta específica para a fila.
 */
export async function enviarParaAprovacao(entryId: string): Promise<Resultado> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };
  const conta = await contaDoTenant(c.prisma, entryId, c.tenantId);
  if (!conta) return { error: "Lançamento não encontrado." };
  const v = podeEnviarParaAprovacao(conta);
  if (!v.pode) return { error: v.motivo };

  try {
    await c.prisma.$transaction(async (tx) => {
      const mudou = await tx.financeEntry.updateMany({
        where: {
          id: conta.id,
          tenantId: c.tenantId,
          approvalStatus: conta.approvalStatus,
          status: { in: ["PROVISORIO", "CONFERIDO"] },
          paidAt: null,
        },
        data: { approvalStatus: "AGUARDANDO", approvedAt: null },
      });
      if (mudou.count !== 1) throw new Recusa("A conta acabou de mudar — atualize a tela.");
      await tx.financeApprovalEvent.create({ data: { entryId: conta.id, decision: "ENVIADO", actorUserId: c.userId } });
    });
  } catch (err) {
    if (err instanceof Recusa) return { error: err.message };
    throw err;
  }

  const aviso = await avisarAprovadores(c.tenantId, [conta]);
  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: conta.approvalStatus === "REPROVADO" ? "financeiro.approval.resent" : "financeiro.approval.sent",
    entityType: "FinanceEntry",
    entityId: conta.id,
    metadata: { valor: conta.amount.toString(), emailsEnviados: aviso.enviados, semSmtp: aviso.semSmtp },
  });

  revalidar();
  return {
    ok: true,
    aviso: aviso.semSmtp
      ? "Enviada. O e-mail aos aprovadores não saiu: SMTP não configurado."
      : aviso.enviados === 0
        ? "Enviada. Nenhum usuário do portal tem alçada que cubra este valor — a coordenação aprova."
        : null,
  };
}

/** Aprovar ou reprovar pela coordenação. Sem teto, mas nunca quem lançou. */
async function decidirPelaEquipe(entryId: string, decisao: Decisao, motivoBruto?: string): Promise<Resultado> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };
  const conta = await contaDoTenant(c.prisma, entryId, c.tenantId);
  if (!conta) return { error: "Lançamento não encontrado." };

  const v = podeDecidir(
    { ...conta, valorCentavos: centavosDeDecimal(conta.amount) },
    { tipo: "EQUIPE", userId: c.ctx.userId, gerenciaOSetor: c.gerencia },
    decisao,
    motivoBruto
  );
  if (!v.pode) return { error: v.motivo };
  const motivo = decisao === "REPROVAR" ? (validarMotivo(motivoBruto) as { ok: true; motivo: string }).motivo : null;

  try {
    await c.prisma.$transaction(async (tx) => {
      const mudou = await tx.financeEntry.updateMany({
        where: { id: conta.id, tenantId: c.tenantId, approvalStatus: "AGUARDANDO", status: { not: "CANCELADO" } },
        data:
          decisao === "APROVAR"
            ? { approvalStatus: "APROVADO", approvedAt: new Date() }
            : { approvalStatus: "REPROVADO", approvedAt: null },
      });
      if (mudou.count !== 1) throw new Recusa("A conta acabou de ser decidida por outra pessoa — atualize a tela.");
      await tx.financeApprovalEvent.create({
        data: { entryId: conta.id, decision: decisao === "APROVAR" ? "APROVADO" : "REPROVADO", actorUserId: c.userId, reason: motivo },
      });
    });
  } catch (err) {
    if (err instanceof Recusa) return { error: err.message };
    throw err;
  }

  // Reprovação sempre avisa quem lançou: é trabalho para ele (corrigir e
  // reenviar, ou cancelar). Aprovação pela própria equipe não avisa — a pessoa
  // vê na tela de contas, e o aviso que importa é o do cliente aprovando.
  if (decisao === "REPROVAR") {
    await avisarCriador(
      c.tenantId,
      conta.createdById,
      `Conta a pagar de ${conta.counterparty.name} (${moeda(centavosDeDecimal(conta.amount))}) foi reprovada: ${motivo}`,
      "finance_approval_rejected"
    );
  }

  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: decisao === "APROVAR" ? "financeiro.approval.approved" : "financeiro.approval.rejected",
    entityType: "FinanceEntry",
    entityId: conta.id,
    metadata: { valor: conta.amount.toString(), motivo },
  });
  revalidar();
  return { ok: true };
}

export async function aprovarPelaEquipe(entryId: string): Promise<Resultado> {
  return decidirPelaEquipe(entryId, "APROVAR");
}

export async function reprovarPelaEquipe(entryId: string, motivo: string): Promise<Resultado> {
  return decidirPelaEquipe(entryId, "REPROVAR", motivo);
}

// ─── Alçadas ────────────────────────────────────────────────────────────────

/**
 * Cria ou atualiza a alçada de um usuário do portal numa empresa.
 *
 * Só a coordenação: a alçada decide quem libera dinheiro do cliente. O usuário
 * do portal precisa ser do grupo da empresa — alçada para quem não enxerga a
 * empresa no portal seria um aprovador que nunca vê o que aprova.
 */
export async function salvarAlcada(formData: FormData): Promise<Resultado> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };
  if (!c.gerencia) return { error: "Só a coordenação cadastra alçadas." };

  const companyId = String(formData.get("companyId") ?? "");
  const portalUserId = String(formData.get("portalUserId") ?? "");
  const teto = lerTeto(String(formData.get("maxAmount") ?? ""));
  if (!teto.ok) return { error: teto.erro };

  const empresa = await c.prisma.company.findFirst({
    where: { id: companyId, tenantId: c.tenantId },
    select: { id: true, clientGroupId: true },
  });
  if (!empresa) return { error: "Empresa não encontrada." };
  if (!empresa.clientGroupId) return { error: "Esta empresa não está em nenhum grupo do portal." };
  const usuario = await c.prisma.portalUser.findFirst({
    where: { id: portalUserId, tenantId: c.tenantId, clientGroupId: empresa.clientGroupId },
    select: { id: true, email: true },
  });
  if (!usuario) return { error: "Usuário do portal não encontrado no grupo desta empresa." };

  const maxAmount = decimalDeCentavos(teto.centavos);
  let id: string;
  try {
    const alcada = await c.prisma.portalApprovalLimit.upsert({
      where: { portalUserId_companyId: { portalUserId: usuario.id, companyId: empresa.id } },
      create: { tenantId: c.tenantId, companyId: empresa.id, portalUserId: usuario.id, maxAmount, active: true },
      update: { maxAmount, active: true },
      select: { id: true },
    });
    id = alcada.id;
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: "Esta alçada acabou de ser cadastrada por outra pessoa — atualize a tela." };
    throw err;
  }

  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "financeiro.approval_limit.saved",
    entityType: "PortalApprovalLimit",
    entityId: id,
    metadata: { companyId: empresa.id, portalUserId: usuario.id, email: usuario.email, maxAmount },
  });
  revalidar();
  return { ok: true };
}

/** Desativa ou reativa. Não apaga: a alçada explica quem pôde aprovar o que já foi aprovado. */
export async function alternarAlcada(id: string, ativa: boolean): Promise<Resultado> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };
  if (!c.gerencia) return { error: "Só a coordenação altera alçadas." };
  const r = await c.prisma.portalApprovalLimit.updateMany({ where: { id, tenantId: c.tenantId }, data: { active: ativa } });
  if (r.count !== 1) return { error: "Alçada não encontrada." };
  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: ativa ? "financeiro.approval_limit.reactivated" : "financeiro.approval_limit.deactivated",
    entityType: "PortalApprovalLimit",
    entityId: id,
  });
  revalidar();
  return { ok: true };
}
