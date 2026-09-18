"use server";

// Aprovar e reprovar contas a pagar pelo portal.
//
// A autoria fica no evento (`actorPortalUserId`), não no AuditLog, que exige
// usuário interno. O teto é relido do banco a cada chamada: a alçada pode ter
// sido reduzida ou desativada desde que a tela abriu, e o que vale é a de agora.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { clienteAtivoDoPortal } from "@/app/(portal)/usuario";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import { moeda } from "@/lib/financeiro/formato";
import { nomeExibicao } from "@/lib/companyName";
import { podeDecidir, separarLote, validarMotivo } from "@/lib/financeiro/aprovacao/regras";
import { avisarCriador, MODULO_DE_APROVACOES, whereDaAlcadaValida } from "@/lib/financeiro/aprovacao/servidor";

export type ResultadoDoLote = { error: string } | { ok: true; aprovadas: number; ignoradas: number; motivos: string[] };
export type ResultadoDoPortal = { error: string } | { ok: true };

/** Mais que isto numa tacada é seleção por engano, não lote. */
const MAXIMO_DO_LOTE = 200;

async function cliente() {
  const c = await clienteAtivoDoPortal();
  if (!c) return { ok: false as const, erro: "Sessão expirada. Entre de novo no portal." };
  if (!c.modulos.has(MODULO_DE_APROVACOES)) return { ok: false as const, erro: "Aprovações não estão habilitadas." };
  return { ok: true as const, ...c };
}

/** As contas pedidas, só das empresas do alcance, com o teto do cliente em cada empresa. */
async function contasEAlcadas(tenantId: string, portalUserId: string, companyIds: string[], entryIds: string[]) {
  const prisma = getPrisma();
  const [contas, alcadas] = await Promise.all([
    prisma.financeEntry.findMany({
      where: { id: { in: entryIds }, tenantId, companyId: { in: companyIds }, kind: "PAGAR" },
      select: {
        id: true,
        status: true,
        approvalStatus: true,
        amount: true,
        companyId: true,
        createdById: true,
        counterparty: { select: { name: true } },
        company: { select: { name: true, displayName: true } },
      },
    }),
    prisma.portalApprovalLimit.findMany({
      where: { ...whereDaAlcadaValida(tenantId), portalUserId, companyId: { in: companyIds } },
      select: { companyId: true, maxAmount: true },
    }),
  ]);
  return {
    contas: contas.map((c) => ({ ...c, valorCentavos: centavosDeDecimal(c.amount) })),
    tetoPorEmpresa: new Map(alcadas.map((a) => [a.companyId, centavosDeDecimal(a.maxAmount)])),
  };
}

function revalidar() {
  for (const p of ["/portal/aprovacoes", "/portal", "/aprovacoes", "/pagar"]) revalidatePath(p);
}

/**
 * Aprova uma ou várias contas.
 *
 * O lote aprova o que cabe no teto e ignora o resto com o motivo — uma conta
 * acima do teto no meio da seleção não derruba as outras. Cada aprovação é
 * condicionada a ainda estar AGUARDANDO; a que outra pessoa decidiu no meio do
 * caminho conta como ignorada, sem evento.
 */
export async function aprovarContas(entryIds: string[]): Promise<ResultadoDoLote> {
  const c = await cliente();
  if (!c.ok) return { error: c.erro };
  const ids = [...new Set(Array.isArray(entryIds) ? entryIds.filter((i) => typeof i === "string") : [])];
  if (ids.length === 0) return { error: "Escolha ao menos uma conta." };
  if (ids.length > MAXIMO_DO_LOTE) return { error: `No máximo ${MAXIMO_DO_LOTE} contas por vez.` };

  const { contas, tetoPorEmpresa } = await contasEAlcadas(c.tenantId, c.usuario.id, c.companyIds, ids);
  const { aprovaveis, ignoradas } = separarLote(contas, tetoPorEmpresa);
  const naoEncontradas = ids.length - contas.length;

  const prisma = getPrisma();
  const agora = new Date();
  const aprovadas = await prisma.$transaction(async (tx) => {
    const feitas: typeof aprovaveis = [];
    for (const conta of aprovaveis) {
      const mudou = await tx.financeEntry.updateMany({
        where: { id: conta.id, tenantId: c.tenantId, approvalStatus: "AGUARDANDO", status: { not: "CANCELADO" } },
        data: { approvalStatus: "APROVADO", approvedAt: agora },
      });
      if (mudou.count !== 1) continue;
      await tx.financeApprovalEvent.create({
        data: { entryId: conta.id, decision: "APROVADO", actorPortalUserId: c.usuario.id },
      });
      feitas.push(conta);
    }
    return feitas;
  });

  // Aviso por conta ao criador: quem lançou espera por esta aprovação para
  // fazer a baixa, e é esta notificação que diz que pode.
  for (const conta of aprovadas) {
    await avisarCriador(
      c.tenantId,
      conta.createdById,
      `${c.usuario.name} aprovou pelo portal a conta de ${conta.counterparty.name} (${moeda(conta.valorCentavos)}) — ${nomeExibicao(conta.company)}. A baixa está liberada.`,
      "finance_approval_approved"
    );
  }

  revalidar();
  const motivos = [...new Set(ignoradas.map((i) => i.motivo))];
  if (naoEncontradas > 0) motivos.push("Alguma conta escolhida não foi encontrada.");
  return { ok: true, aprovadas: aprovadas.length, ignoradas: ids.length - aprovadas.length, motivos };
}

/** Reprova uma conta, com motivo. O motivo vai para o histórico e para o sino de quem lançou. */
export async function reprovarConta(entryId: string, motivoBruto: string): Promise<ResultadoDoPortal> {
  const c = await cliente();
  if (!c.ok) return { error: c.erro };

  const { contas, tetoPorEmpresa } = await contasEAlcadas(c.tenantId, c.usuario.id, c.companyIds, [entryId]);
  const conta = contas[0];
  if (!conta) return { error: "Conta não encontrada." };
  const v = podeDecidir(conta, { tipo: "PORTAL", tetoCentavos: tetoPorEmpresa.get(conta.companyId) ?? null }, "REPROVAR", motivoBruto);
  if (!v.pode) return { error: v.motivo };
  const motivo = (validarMotivo(motivoBruto) as { ok: true; motivo: string }).motivo;

  const prisma = getPrisma();
  const feito = await prisma.$transaction(async (tx) => {
    const mudou = await tx.financeEntry.updateMany({
      where: { id: conta.id, tenantId: c.tenantId, approvalStatus: "AGUARDANDO", status: { not: "CANCELADO" } },
      data: { approvalStatus: "REPROVADO", approvedAt: null },
    });
    if (mudou.count !== 1) return false;
    await tx.financeApprovalEvent.create({
      data: { entryId: conta.id, decision: "REPROVADO", actorPortalUserId: c.usuario.id, reason: motivo },
    });
    return true;
  });
  if (!feito) return { error: "Esta conta acabou de ser decidida — atualize a página." };

  await avisarCriador(
    c.tenantId,
    conta.createdById,
    `${c.usuario.name} reprovou pelo portal a conta de ${conta.counterparty.name} (${moeda(conta.valorCentavos)}) — ${nomeExibicao(conta.company)}: ${motivo}`,
    "finance_approval_rejected"
  );

  revalidar();
  return { ok: true };
}
