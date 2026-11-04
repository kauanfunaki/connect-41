// A gravação do observador de protocolo — o banco. A decisão é `decidir`, em
// ./observador.ts. Separada do cron em 03/11/2026, quando o SIMA passou a ser
// lido pelo robô da máquina (tarefa `observar_sima`): o cron e o robô gravam
// do mesmo jeito.

import { getPrisma } from "@/lib/prisma";
import type { Decisao } from "./observador";

export type ProtocoloParaGravar = { id: string; tenantId: string; stepId: string | null };

/** Aplica a decisão sobre um protocolo. Devolve o que foi feito. */
export async function aplicarDecisaoDoProtocolo(
  p: ProtocoloParaGravar,
  decisao: Decisao
): Promise<"pulado" | "segue_pendente" | "deferido" | "exigencia"> {
  const prisma = getPrisma();

  if (decisao.tipo === "pular" || decisao.tipo === "segue_pendente") {
    // Verificação deu certo — mesmo quando não há o que fazer. `checkError`
    // limpo, porque o robô funcionou.
    await prisma.processProtocol.update({
      where: { id: p.id },
      data: { lastCheckedAt: new Date(), checkError: null },
    });
    return decisao.tipo === "pular" ? "pulado" : "segue_pendente";
  }

  if (decisao.tipo === "deferir") {
    await prisma.$transaction(async (tx) => {
      await tx.processProtocol.update({
        where: { id: p.id },
        data: {
          outcome: "DEFERIDO",
          resolvedAt: new Date(),
          // A coluna que existe desde a primeira migration justamente
          // para este momento: o histórico sabe que foi robô.
          resolvedByActor: "ROBO",
          lastCheckedAt: new Date(),
          checkError: null,
        },
      });
      if (p.stepId) {
        await tx.processStep.update({
          where: { id: p.stepId },
          data: { status: "CONCLUIDA", doneAt: new Date(), actor: "ROBO" },
        });
      }
    });
    return "deferido";
  }

  // Exigência: fecha o protocolo e devolve a etapa para trabalho humano,
  // exatamente como a ação da tela faz.
  await prisma.$transaction(async (tx) => {
    await tx.processProtocol.update({
      where: { id: p.id },
      data: {
        outcome: "EXIGENCIA",
        resolvedAt: new Date(),
        resolvedByActor: "ROBO",
        lastCheckedAt: new Date(),
        checkError: null,
      },
    });
    await tx.processRequirement.create({
      data: { tenantId: p.tenantId, protocolId: p.id, description: decisao.descricao },
    });
    if (p.stepId) {
      await tx.processStep.update({
        where: { id: p.stepId },
        data: { status: "PENDENTE", doneAt: null },
      });
    }
  });
  return "exigencia";
}

/** A verificação deste protocolo falhou: anota, sem mexer no desfecho. */
export async function anotarFalhaDoProtocolo(id: string, mensagem: string) {
  await getPrisma().processProtocol.update({
    where: { id },
    data: { lastCheckedAt: new Date(), checkError: mensagem.slice(0, 500) },
  });
}
