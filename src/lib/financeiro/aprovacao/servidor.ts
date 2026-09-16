// A parte da aprovação que toca o banco e os avisos. As decisões são de
// `regras.ts`; aqui só se busca o que elas precisam e se entrega o resultado.

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { isModuleEnabled } from "@/lib/modules";
import { notifyUser } from "@/lib/notifications";
import { sendAprovacaoPendenteEmail, type ResultadoDoAviso } from "@/lib/email/sendMail";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import { avisosPorAprovador, statusInicialDeAprovacao, type StatusDoLancamento, type TipoDoLancamento } from "./regras";

export const MODULO_DE_APROVACOES = "bpo_aprovacoes";

/**
 * Alçada que conta: ativa, de usuário do portal ativo. Alçada de uma conta
 * desativada não aprova nada — contá-la faria a conta entrar em aprovação sem
 * ninguém capaz de aprovar no portal.
 */
export function whereDaAlcadaValida(tenantId: string): Prisma.PortalApprovalLimitWhereInput {
  return { tenantId, active: true, portalUser: { active: true } };
}

/**
 * O que a regra de entrada precisa saber sobre as empresas, consultado uma vez
 * antes da transação — a importação de CSV cria centenas de lançamentos da
 * mesma empresa, e perguntar por linha seria uma consulta por título.
 */
export async function contextoDeEntrada(tenantId: string, companyIds: string[]) {
  const prisma = getPrisma();
  const [moduloLigado, comAlcada] = await Promise.all([
    isModuleEnabled(tenantId, MODULO_DE_APROVACOES),
    prisma.portalApprovalLimit.findMany({
      where: { ...whereDaAlcadaValida(tenantId), companyId: { in: [...new Set(companyIds)] } },
      select: { companyId: true },
      distinct: ["companyId"],
    }),
  ]);
  const empresas = new Set(comAlcada.map((a) => a.companyId));
  return {
    statusInicial(companyId: string, kind: TipoDoLancamento, status: StatusDoLancamento) {
      return statusInicialDeAprovacao({ kind, status, moduloLigado, empresaTemAlcadaAtiva: empresas.has(companyId) });
    },
  };
}

/** O evento ENVIADO de quem criou o lançamento que nasceu aguardando. */
export async function registrarEnvios(tx: Prisma.TransactionClient, entryIds: string[], actorUserId: string | null) {
  if (entryIds.length === 0) return;
  await tx.financeApprovalEvent.createMany({
    data: entryIds.map((entryId) => ({ entryId, decision: "ENVIADO" as const, actorUserId })),
  });
}

/**
 * Avisa por e-mail os aprovadores cujo teto cobre as contas que entraram.
 * Best-effort: a conta já está aguardando e aparece no portal com ou sem e-mail.
 */
export async function avisarAprovadores(
  tenantId: string,
  contas: { companyId: string; amount: { toString(): string } }[]
): Promise<ResultadoDoAviso> {
  if (contas.length === 0) return { enviados: 0, falhas: 0, semSmtp: false };
  try {
    const alcadas = await getPrisma().portalApprovalLimit.findMany({
      where: { ...whereDaAlcadaValida(tenantId), companyId: { in: [...new Set(contas.map((c) => c.companyId))] } },
      select: { companyId: true, portalUserId: true, maxAmount: true, portalUser: { select: { email: true, name: true } } },
    });
    const avisos = avisosPorAprovador(
      contas.map((c) => ({ companyId: c.companyId, valorCentavos: centavosDeDecimal(c.amount) })),
      alcadas.map((a) => ({
        portalUserId: a.portalUserId,
        companyId: a.companyId,
        tetoCentavos: centavosDeDecimal(a.maxAmount),
        email: a.portalUser.email,
        nome: a.portalUser.name,
      }))
    );
    return await sendAprovacaoPendenteEmail({
      tenantId,
      destinatarios: avisos.map((a) => ({ email: a.email, nome: a.nome, quantidade: a.quantidade })),
    });
  } catch (err) {
    console.error("[avisarAprovadores]", err);
    return { enviados: 0, falhas: 1, semSmtp: false };
  }
}

/** Sino de quem lançou a conta. Best-effort, como todo aviso. */
export async function avisarCriador(tenantId: string, createdById: string | null, mensagem: string, tipo: string) {
  if (!createdById) return;
  try {
    await notifyUser(createdById, { tenantId, type: tipo, message: mensagem });
  } catch (err) {
    console.error("[avisarCriador]", err);
  }
}
