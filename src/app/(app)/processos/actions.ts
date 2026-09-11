"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import {
  etapasLiberadas,
  proximaTentativa,
  itensObrigatoriosPendentes,
} from "@/lib/societario/processo";
import {
  executorPara,
  podeSubmeter,
  decidirAposSubmissao,
  precisaDeNumeroAMao,
} from "@/lib/societario/executor";
import { isPrismaUniqueError } from "@/lib/prismaErrors";

const SECTOR = "societario";

export type ProcessoState = { error: string } | null;

async function contexto() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { erro: "Não autenticado" as const, ctx: null };
  if (!canActOnSector(ctx, SECTOR)) return { erro: "Sem permissão no Societário" as const, ctx: null };
  return { erro: null, ctx };
}

/**
 * Recalcula o ciclo grosso do processo e grava.
 *
 * Só `CONCLUIDO` é derivado aqui: quando nada mais está liberado no roteiro, o
 * processo acabou. O estado fino (exigência, espera) continua sendo lido dos
 * protocolos a cada leitura — ver o comentário em `listarFila`.
 *
 * Roda depois de toda ação que mexe em etapa. Chamar de menos deixaria processo
 * pronto aparecendo como aberto na fila, que é o tipo de mentira que faz alguém
 * parar de confiar na tela.
 */
async function sincronizarConclusao(processId: string) {
  const prisma = getPrisma();
  const processo = await prisma.process.findUnique({
    where: { id: processId },
    select: {
      concludedAt: true,
      template: {
        select: {
          steps: { select: { id: true, position: true, parallelGroup: true, optional: true } },
        },
      },
      steps: { select: { templateStepId: true, status: true } },
    },
  });
  if (!processo) return;

  const liberadas = etapasLiberadas(
    processo.template.steps.map((s) => ({
      templateStepId: s.id,
      position: s.position,
      parallelGroup: s.parallelGroup,
      optional: s.optional,
    })),
    processo.steps.map((s) => ({ templateStepId: s.templateStepId, status: s.status }))
  );

  const acabou = liberadas.length === 0;
  if (acabou && processo.concludedAt === null) {
    await prisma.process.update({
      where: { id: processId },
      data: { status: "CONCLUIDO", concludedAt: new Date() },
    });
  } else if (!acabou && processo.concludedAt !== null) {
    // Reabriu — uma exigência depois de concluído, por exemplo.
    await prisma.process.update({
      where: { id: processId },
      data: { status: "EM_ANDAMENTO", concludedAt: null },
    });
  }
}

/**
 * Abre um processo a partir do roteiro publicado do tipo.
 *
 * As etapas e os itens de checklist são instanciados **na abertura**, e não sob
 * demanda: a versão do roteiro fica congelada no `templateId`, e criar etapa
 * depois faria um processo antigo herdar um roteiro novo no meio do caminho.
 */
export async function abrirProcesso(_prev: ProcessoState, form: FormData): Promise<ProcessoState> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { error: erro ?? "Não autenticado" };

  const companyId = (form.get("companyId") as string)?.trim();
  const typeId = (form.get("typeId") as string)?.trim();
  if (!companyId) return { error: "Escolha a empresa." };
  if (!typeId) return { error: "Escolha o tipo de processo." };

  const prisma = getPrisma();

  const template = await prisma.processTemplate.findFirst({
    where: { tenantId: ctx.tenantId, typeId, published: true },
    orderBy: { version: "desc" },
    select: {
      id: true,
      type: { select: { name: true } },
      steps: {
        select: { id: true, items: { select: { id: true } } },
        orderBy: { position: "asc" },
      },
    },
  });
  if (!template) {
    return { error: "Este tipo de processo não tem roteiro publicado. Configure antes de abrir." };
  }
  if (template.steps.length === 0) {
    return { error: "O roteiro publicado não tem etapas." };
  }

  // A empresa precisa ser do tenant — sem esta conferência, um id de outro
  // cliente abriria processo aqui dentro.
  const empresa = await prisma.company.findFirst({
    where: { id: companyId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!empresa) return { error: "Empresa não encontrada." };

  let processoId: string;
  try {
    processoId = await prisma.$transaction(
      async (tx) => {
        const processo = await tx.process.create({
          data: {
            tenantId: ctx.tenantId!,
            companyId,
            typeId,
            templateId: template.id,
            ownerUserId: ctx.userId ?? null,
          },
          select: { id: true },
        });

        for (const passo of template.steps) {
          const etapa = await tx.processStep.create({
            data: {
              tenantId: ctx.tenantId!,
              processId: processo.id,
              templateStepId: passo.id,
            },
            select: { id: true },
          });
          for (const item of passo.items) {
            await tx.processChecklistItem.create({
              data: {
                tenantId: ctx.tenantId!,
                stepId: etapa.id,
                templateItemId: item.id,
              },
            });
          }
        }
        return processo.id;
      },
      { timeout: 60_000, maxWait: 30_000 }
    );
  } catch (err) {
    console.error("[abrirProcesso]", err);
    return { error: "Erro ao abrir o processo." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "process.open",
    entityType: "Process",
    entityId: processoId,
    metadata: { tipo: template.type.name, companyId },
  });

  revalidatePath("/processos");
  redirect(`/processos/${processoId}`);
}

/** Carrega a etapa conferindo o tenant. Devolve null quando não é de quem pediu. */
async function etapaDoTenant(stepId: string, tenantId: string) {
  const prisma = getPrisma();
  return prisma.processStep.findFirst({
    where: { id: stepId, tenantId },
    select: {
      id: true,
      processId: true,
      status: true,
      templateStep: { select: { label: true, organId: true } },
    },
  });
}

export async function concluirEtapa(stepId: string): Promise<ProcessoState> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { error: erro ?? "Não autenticado" };

  const etapa = await etapaDoTenant(stepId, ctx.tenantId);
  if (!etapa) return { error: "Etapa não encontrada." };
  if (etapa.templateStep.organId) {
    // Etapa de órgão não se conclui na mão: o desfecho vem do protocolo, e
    // marcar como feita por fora apagaria o registro da volta.
    return { error: "Esta etapa se encerra pelo protocolo, não à mão." };
  }

  const prisma = getPrisma();

  // "Documentação completa evita retrabalhos", diz o rodapé do fluxo do setor.
  // Concluir com obrigatório em aberto é justamente o que a exigência do órgão
  // vai cobrar depois, com dias de volta no meio.
  //
  // Só vale para conclusão à mão: deferimento não passa por aqui, porque
  // travar um processo que o órgão já deferiu seria prender o trabalho por uma
  // regra nossa.
  const itens = await prisma.processChecklistItem.findMany({
    where: { stepId },
    select: { done: true, templateItem: { select: { required: true } } },
  });
  const faltando = itensObrigatoriosPendentes(
    itens.map((i) => ({ obrigatorio: i.templateItem.required, feito: i.done }))
  );
  if (faltando > 0) {
    return {
      error:
        faltando === 1
          ? "Falta 1 item obrigatório no checklist desta etapa."
          : `Faltam ${faltando} itens obrigatórios no checklist desta etapa.`,
    };
  }
  await prisma.processStep.update({
    where: { id: stepId },
    data: {
      status: "CONCLUIDA",
      doneAt: new Date(),
      actor: "PESSOA",
      executedByUserId: ctx.userId ?? null,
    },
  });
  await sincronizarConclusao(etapa.processId);

  revalidatePath(`/processos/${etapa.processId}`);
  revalidatePath("/processos");
  return null;
}

export async function dispensarEtapa(stepId: string): Promise<ProcessoState> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { error: erro ?? "Não autenticado" };

  const etapa = await etapaDoTenant(stepId, ctx.tenantId);
  if (!etapa) return { error: "Etapa não encontrada." };

  const prisma = getPrisma();
  await prisma.processStep.update({
    where: { id: stepId },
    data: { status: "DISPENSADA", doneAt: new Date(), actor: "PESSOA", executedByUserId: ctx.userId ?? null },
  });
  await sincronizarConclusao(etapa.processId);

  revalidatePath(`/processos/${etapa.processId}`);
  revalidatePath("/processos");
  return null;
}

/**
 * Protocola a etapa no órgão dela.
 *
 * A tentativa vem de `proximaTentativa`, que olha o que já foi apresentado
 * àquele órgão neste processo. Reapresentar é **abrir protocolo novo**, nunca
 * editar o anterior: sobrescrever apagaria o histórico da volta, que é o número
 * que explica o prazo.
 */
export async function protocolar(stepId: string, numero: string): Promise<ProcessoState> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { error: erro ?? "Não autenticado" };

  const etapa = await etapaDoTenant(stepId, ctx.tenantId);
  if (!etapa) return { error: "Etapa não encontrada." };
  const organId = etapa.templateStep.organId;
  if (!organId) return { error: "Esta etapa não protocola em órgão." };

  const prisma = getPrisma();
  const anteriores = await prisma.processProtocol.findMany({
    where: { processId: etapa.processId, organId },
    select: { organId: true, attempt: true, outcome: true },
  });
  const attempt = proximaTentativa(anteriores, organId);

  await prisma.$transaction(async (tx) => {
    await tx.processProtocol.create({
      data: {
        tenantId: ctx.tenantId!,
        processId: etapa.processId,
        stepId: etapa.id,
        organId,
        attempt,
        number: numero.trim() || null,
      },
    });
    await tx.processStep.update({
      where: { id: stepId },
      data: { status: "EM_ANDAMENTO", startedAt: new Date(), actor: "INTEGRACAO" },
    });
  });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "process.protocol",
    entityType: "Process",
    entityId: etapa.processId,
    metadata: { etapa: etapa.templateStep.label, tentativa: attempt },
  });

  revalidatePath(`/processos/${etapa.processId}`);
  revalidatePath("/processos");
  return null;
}

async function protocoloDoTenant(protocolId: string, tenantId: string) {
  const prisma = getPrisma();
  return prisma.processProtocol.findFirst({
    where: { id: protocolId, tenantId },
    select: { id: true, processId: true, stepId: true, organId: true, attempt: true, outcome: true },
  });
}

/** Deferido: o protocolo fecha e a etapa que o gerou se encerra junto. */
export async function deferirProtocolo(protocolId: string): Promise<ProcessoState> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { error: erro ?? "Não autenticado" };

  const protocolo = await protocoloDoTenant(protocolId, ctx.tenantId);
  if (!protocolo) return { error: "Protocolo não encontrado." };

  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    await tx.processProtocol.update({
      where: { id: protocolId },
      data: { outcome: "DEFERIDO", resolvedAt: new Date(), resolvedByActor: "PESSOA" },
    });
    if (protocolo.stepId) {
      await tx.processStep.update({
        where: { id: protocolo.stepId },
        data: { status: "CONCLUIDA", doneAt: new Date() },
      });
    }
  });
  await sincronizarConclusao(protocolo.processId);

  revalidatePath(`/processos/${protocolo.processId}`);
  revalidatePath("/processos");
  return null;
}

/**
 * Exigência: o protocolo fecha com pendência, e a etapa **volta a ficar aberta**.
 *
 * É o laço do fluxo. A etapa não é marcada como concluída nem como pendente do
 * zero — ela volta para o trabalho de gente, que é exatamente o que o setor
 * descreve como "ajustes e reapresentação".
 */
export async function registrarExigencia(
  protocolId: string,
  descricao: string,
  prazoAte: string | null
): Promise<ProcessoState> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { error: erro ?? "Não autenticado" };
  if (!descricao.trim()) return { error: "Descreva a exigência." };

  const protocolo = await protocoloDoTenant(protocolId, ctx.tenantId);
  if (!protocolo) return { error: "Protocolo não encontrado." };

  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    await tx.processProtocol.update({
      where: { id: protocolId },
      data: { outcome: "EXIGENCIA", resolvedAt: new Date(), resolvedByActor: "PESSOA" },
    });
    await tx.processRequirement.create({
      data: {
        tenantId: ctx.tenantId!,
        protocolId,
        description: descricao.trim(),
        dueAt: prazoAte ? new Date(prazoAte) : null,
      },
    });
    if (protocolo.stepId) {
      await tx.processStep.update({
        where: { id: protocolo.stepId },
        data: { status: "PENDENTE", doneAt: null },
      });
    }
  });
  await sincronizarConclusao(protocolo.processId);

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "process.requirement",
    entityType: "Process",
    entityId: protocolo.processId,
    metadata: { tentativa: protocolo.attempt },
  });

  revalidatePath(`/processos/${protocolo.processId}`);
  revalidatePath("/processos");
  return null;
}

/** Marca a exigência como cumprida. A reapresentação é protocolar de novo. */
export async function resolverExigencia(requirementId: string): Promise<ProcessoState> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { error: erro ?? "Não autenticado" };

  const prisma = getPrisma();
  const exigencia = await prisma.processRequirement.findFirst({
    where: { id: requirementId, tenantId: ctx.tenantId },
    select: { id: true, protocol: { select: { processId: true } } },
  });
  if (!exigencia) return { error: "Exigência não encontrada." };

  await prisma.processRequirement.update({
    where: { id: requirementId },
    data: { resolvedAt: new Date() },
  });

  revalidatePath(`/processos/${exigencia.protocol.processId}`);
  revalidatePath("/processos");
  return null;
}

/** Marca ou desmarca um item do checklist da etapa. */
export async function alternarItemDoChecklist(
  itemId: string,
  feito: boolean
): Promise<ProcessoState> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { error: erro ?? "Não autenticado" };

  const prisma = getPrisma();
  const item = await prisma.processChecklistItem.findFirst({
    where: { id: itemId, tenantId: ctx.tenantId },
    select: { id: true, step: { select: { processId: true, status: true } } },
  });
  if (!item) return { error: "Item não encontrado." };
  if (item.step.status === "CONCLUIDA" || item.step.status === "DISPENSADA") {
    return { error: "Etapa encerrada — reabra antes de mexer no checklist." };
  }

  await prisma.processChecklistItem.update({
    where: { id: itemId },
    data: { done: feito, doneAt: feito ? new Date() : null },
  });

  revalidatePath(`/processos/${item.step.processId}`);
  return null;
}

/**
 * Submete a etapa ao órgão por robô.
 *
 * ─── A ordem importa mais que o resto ────────────────────────────────────────
 *
 * **Reservar, submeter, preencher** — nunca submeter e depois gravar. A reserva
 * é um `ProcessProtocol` com número nulo, e o `@@unique([processId, organId,
 * attempt])` é quem garante que duas execuções simultâneas não abrem dois
 * processos no órgão: a segunda esbarra no banco antes de qualquer requisição
 * sair daqui.
 *
 * A chamada ao portal acontece **fora da transação**. Segurar transação aberta
 * durante requisição de rede é como se esgota o pool — e o portal de um órgão
 * demora o que quiser.
 *
 * Se o adaptador morrer depois de submeter e antes de devolver o número, sobra
 * a reserva com o erro registrado. Uma pessoa vê "submetido, número não
 * capturado" e resolve, em vez de o robô tentar de novo e duplicar.
 */
export async function submeterPorRobo(stepId: string): Promise<ProcessoState> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { error: erro ?? "Não autenticado" };

  const prisma = getPrisma();

  const etapa = await prisma.processStep.findFirst({
    where: { id: stepId, tenantId: ctx.tenantId },
    select: {
      id: true,
      processId: true,
      status: true,
      templateStep: { select: { label: true, organId: true, organ: { select: { acronym: true } } } },
      items: { select: { done: true, templateItem: { select: { required: true } } } },
    },
  });
  if (!etapa) return { error: "Etapa não encontrada." };

  const organId = etapa.templateStep.organId;
  const sigla = etapa.templateStep.organ?.acronym ?? null;

  const protocolos = await prisma.processProtocol.findMany({
    where: { processId: etapa.processId, organId: organId ?? undefined },
    select: { organId: true, attempt: true, outcome: true },
  });

  const veredito = podeSubmeter({
    status: etapa.status,
    siglaDoOrgao: sigla,
    temProtocoloAberto: protocolos.some((p) => p.outcome === "PENDENTE"),
    itensPendentes: itensObrigatoriosPendentes(
      etapa.items.map((i) => ({ obrigatorio: i.templateItem.required, feito: i.done }))
    ),
  });
  if (!veredito.pode) return { error: veredito.motivo };

  const executor = executorPara(sigla);
  if (!executor || !organId) return { error: "Este órgão ainda não tem robô — siga à mão." };

  // ── 1. Reservar ───────────────────────────────────────────────────────────
  const attempt = proximaTentativa(protocolos, organId);
  let reservaId: string;
  try {
    const reserva = await prisma.$transaction(async (tx) => {
      const criado = await tx.processProtocol.create({
        data: {
          tenantId: ctx.tenantId!,
          processId: etapa.processId,
          stepId: etapa.id,
          organId,
          attempt,
          number: null,
        },
        select: { id: true },
      });
      await tx.processStep.update({
        where: { id: stepId },
        data: { status: "EM_ANDAMENTO", startedAt: new Date(), actor: "ROBO" },
      });
      return criado;
    });
    reservaId = reserva.id;
  } catch (err) {
    if (isPrismaUniqueError(err)) {
      // Outra execução reservou a mesma tentativa. É o caso que a chave única
      // existe para pegar, e o certo aqui é desistir em silêncio.
      return { error: "Outra submissão desta tentativa já está em andamento." };
    }
    console.error("[submeterPorRobo] reserva", err);
    return { error: "Erro ao reservar o protocolo." };
  }

  // ── 2. Submeter, fora da transação ───────────────────────────────────────
  const credencial: Record<string, string> = {};
  let resultado;
  try {
    resultado = await executor({ credencial, dados: {} });
  } catch (err) {
    resultado = {
      ok: false as const,
      motivo: err instanceof Error ? err.message : "falha desconhecida",
      recuperavel: true,
    };
  }

  // ── 3. Preencher ─────────────────────────────────────────────────────────
  const desfecho = decidirAposSubmissao(resultado, new Date());
  await prisma.$transaction(async (tx) => {
    await tx.processProtocol.update({
      where: { id: reservaId },
      data: desfecho.protocolo,
    });
    if (desfecho.etapaVoltaParaPendente) {
      await tx.processStep.update({
        where: { id: stepId },
        data: { status: "PENDENTE", startedAt: null },
      });
    }
  });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "process.robot_submit",
    entityType: "Process",
    entityId: etapa.processId,
    metadata: {
      etapa: etapa.templateStep.label,
      tentativa: attempt,
      ok: resultado.ok,
      orgao: sigla,
    },
  });

  revalidatePath(`/processos/${etapa.processId}`);
  revalidatePath("/processos");

  if (!resultado.ok) {
    return {
      error: desfecho.recuperavel
        ? `${resultado.motivo} — dá para tentar de novo.`
        : `${resultado.motivo} — precisa de ajuste antes de reenviar.`,
    };
  }
  if (precisaDeNumeroAMao(resultado)) {
    // Nem falha nem sucesso limpo: o órgão recebeu e não sabemos o protocolo.
    return {
      error:
        "Enviado, mas o portal não devolveu o número do protocolo. Busque no site e preencha à mão — não reenvie.",
    };
  }
  return null;
}
