// Depois de toda mudança de etapa: o envio ao cliente no fim do processo e a
// conclusão do processo.
//
// Era o `sincronizarConclusao` de `processos/actions.ts`; saiu de lá em
// 09/11/2026 para o observador de protocolo (o cron e o robô do SIMA) passar
// pelo mesmo ponto que a tela — o envio ao cliente tem de sair seja quem for
// que encerre a etapa anterior: pessoa, robô, observador ou aviso da Junta
// (que grava pelas actions da tela). Num arquivo "use server" isto viraria uma
// action exposta. A regra do envio é ./envioAoCliente.ts.

import { createHash } from "crypto";
import { getPrisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { notifyUser } from "@/lib/notifications";
import { setorDoModulo } from "@/lib/modules";
import { usuariosDoPortalDaEmpresa } from "@/lib/financeiro/pendencias/avisos";
import { telaBloqueadaNoPortal } from "@/lib/portal/telasBloqueadas";
import type { ResultadoDoAviso } from "@/lib/email/sendMail";
import { enviarAvisoDoProcesso, nomeDoProcessoNoAviso } from "./avisoAoCliente";
import { etapasLiberadas, itensObrigatoriosPendentes, type StatusDaEtapa } from "./processo";
import {
  AUTOMACAO_DO_ENVIO,
  avisoParaAEquipe,
  decidirEnvioAoCliente,
  type MotivoParaAEquipe,
} from "./envioAoCliente";

const SETOR = "societario";
const MODULE = "societario_processos";
const TELA_DO_PORTAL = "/portal/processos";

async function carregar(processId: string) {
  return getPrisma().process.findUnique({
    where: { id: processId },
    select: {
      id: true,
      tenantId: true,
      companyId: true,
      title: true,
      status: true,
      ownerUserId: true,
      concludedAt: true,
      type: { select: { name: true } },
      company: { select: { name: true, displayName: true } },
      template: {
        select: {
          steps: {
            select: { id: true, position: true, parallelGroup: true, optional: true, label: true, expectedActor: true, organId: true },
          },
        },
      },
      steps: {
        select: {
          id: true,
          templateStepId: true,
          status: true,
          startedAt: true,
          items: { select: { done: true, templateItem: { select: { required: true } } } },
        },
      },
    },
  });
}

type ProcessoCarregado = NonNullable<Awaited<ReturnType<typeof carregar>>>;

/**
 * Roda depois de toda ação que mexe em etapa: primeiro o envio ao cliente,
 * depois o ciclo grosso do processo.
 *
 * Só `CONCLUIDO` é derivado aqui: quando nada mais está liberado no roteiro, o
 * processo acabou. O estado fino (exigência, espera) continua sendo lido dos
 * protocolos a cada leitura — ver o comentário em `listarFila`. Chamar de menos
 * deixaria processo pronto aparecendo como aberto na fila, que é o tipo de
 * mentira que faz alguém parar de confiar na tela.
 *
 * O envio vem antes porque, quando sai, ele mesmo encerra a última etapa — e
 * aí o processo já fica concluído nesta mesma passada.
 */
export async function sincronizarProcesso(processId: string): Promise<void> {
  const processo = await carregar(processId);
  if (!processo) return;

  const statusPorEtapa = new Map<string, StatusDaEtapa>(processo.steps.map((s) => [s.templateStepId, s.status]));
  try {
    const concluida = await enviarAoClienteNoFim(processo);
    if (concluida) statusPorEtapa.set(concluida, "CONCLUIDA");
  } catch (err) {
    // O envio é complemento da ação de quem mexeu na etapa, que já está
    // gravada: falhar aqui não pode desfazer nem travar a conclusão.
    console.error("[societario:envio-ao-cliente]", processId, err);
  }

  const liberadas = etapasLiberadas(
    processo.template.steps.map((s) => ({
      templateStepId: s.id,
      position: s.position,
      parallelGroup: s.parallelGroup,
      optional: s.optional,
    })),
    [...statusPorEtapa].map(([templateStepId, status]) => ({ templateStepId, status }))
  );

  const prisma = getPrisma();
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
 * Manda o envio ao cliente quando é a hora (`decidirEnvioAoCliente`) e
 * devolve o `templateStepId` da etapa que o robô concluiu, ou `null`.
 *
 * **Reservar, enviar, registrar** — a mesma ordem do `submeterPorRobo`. A
 * reserva é a própria conclusão da etapa, condicionada a ela ainda estar em
 * aberto: duas sincronizações ao mesmo tempo (a tela e o observador, ou dois
 * cliques) leem a etapa aberta, mas só uma grava, e só quem gravou envia. Por
 * isso o cliente nunca recebe o aviso duas vezes, e uma etapa já concluída —
 * pelo robô ou à mão — não volta a disparar nada.
 *
 * Se o e-mail falhar depois da reserva, a etapa fica concluída e o responsável
 * é avisado: o portal já mostra o processo concluído, e tentar de novo sozinho
 * mandaria em dobro a quem recebeu.
 */
async function enviarAoClienteNoFim(processo: ProcessoCarregado): Promise<string | null> {
  const decisao = decidirEnvioAoCliente(
    processo.template.steps.map((s) => ({
      templateStepId: s.id,
      position: s.position,
      label: s.label,
      expectedActor: s.expectedActor,
      organId: s.organId,
    })),
    processo.steps.map((s) => ({
      templateStepId: s.templateStepId,
      status: s.status,
      itensObrigatoriosPendentes: itensObrigatoriosPendentes(
        s.items.map((i) => ({ obrigatorio: i.templateItem.required, feito: i.done }))
      ),
    })),
    processo.status
  );

  if (!decisao.enviar) {
    if (decisao.motivo === "checklist_pendente") {
      const etapa = processo.steps.find((s) => s.templateStepId === decisao.templateStepId);
      if (etapa) await avisarAEquipe(processo, etapa.id, { tipo: "checklist_pendente", itensPendentes: decisao.itensPendentes });
    }
    return null;
  }

  const etapa = processo.steps.find((s) => s.templateStepId === decisao.templateStepId);
  if (!etapa) return null;
  const rotulo = processo.template.steps.find((s) => s.id === decisao.templateStepId)?.label ?? null;

  // Sem quem receba, ou sem a tela onde o link cai, o robô não conclui: a
  // etapa fica com a equipe, que avisa o cliente por outro caminho.
  const destinatarios = await usuariosDoPortalDaEmpresa(processo.tenantId, processo.companyId);
  const semEnvio: MotivoParaAEquipe | null =
    destinatarios.length === 0
      ? { tipo: "sem_portal" }
      : (await telaBloqueadaNoPortal(processo.tenantId, TELA_DO_PORTAL))
        ? { tipo: "tela_bloqueada" }
        : null;
  if (semEnvio) {
    const avisou = await avisarAEquipe(processo, etapa.id, semEnvio);
    // Uma linha por vez que fica com a equipe — não a cada sincronização.
    if (avisou) {
      await logAudit({
        tenantId: processo.tenantId,
        rotina: "roboDoSocietario",
        action: "societario.processo.envio_com_a_equipe",
        entityType: "Process",
        entityId: processo.id,
        metadata: {
          etapa: rotulo,
          motivo: semEnvio.tipo === "sem_portal" ? "nenhum usuário ativo no portal da empresa" : "tela de Processos bloqueada no portal",
        },
      });
    }
    return null;
  }

  const agora = new Date();
  const reserva = await getPrisma().processStep.updateMany({
    where: { id: etapa.id, status: { in: ["PENDENTE", "EM_ANDAMENTO"] } },
    data: {
      status: "CONCLUIDA",
      startedAt: etapa.startedAt ?? agora,
      doneAt: agora,
      actor: "ROBO",
      automationRef: AUTOMACAO_DO_ENVIO,
      executedByUserId: null,
    },
  });
  if (reserva.count !== 1) return null;

  let envio: ResultadoDoAviso | null = null;
  try {
    envio = await enviarAvisoDoProcesso(processo.tenantId, processo, destinatarios, "concluido");
  } catch (err) {
    console.error("[societario:envio-ao-cliente] aviso", processo.id, err);
  }

  // Contagens, não endereços: o log é lido por quem audita, e o que importa é
  // que saiu, para quantos e o que falhou.
  await logAudit({
    tenantId: processo.tenantId,
    rotina: "roboDoSocietario",
    action: "societario.processo.envio_ao_cliente",
    entityType: "Process",
    entityId: processo.id,
    metadata: {
      etapa: rotulo,
      destinatarios: destinatarios.length,
      emailsEnviados: envio?.enviados ?? 0,
      emailsComFalha: envio ? envio.falhas : destinatarios.length,
      semSmtp: envio?.semSmtp ?? false,
    },
  });

  const problema: MotivoParaAEquipe | null = !envio
    ? { tipo: "falha_no_aviso" }
    : envio.semSmtp
      ? { tipo: "sem_smtp" }
      : envio.falhas > 0
        ? { tipo: "falha_no_email", falhas: envio.falhas }
        : null;
  if (problema) {
    // Depois da reserva nada pode lançar: a etapa já está concluída no banco,
    // e quem chamou precisa saber disso para concluir o processo junto.
    try {
      await avisarAEquipe(processo, etapa.id, problema);
    } catch (err) {
      console.error("[societario:envio-ao-cliente] aviso à equipe", processo.id, err);
    }
  }

  return decisao.templateStepId;
}

/**
 * O id do aviso à equipe, fixo por etapa, motivo e pessoa: o mesmo aviso não
 * sai duas vezes quando o processo é sincronizado de novo (uma exigência que
 * reabre e fecha outra etapa, por exemplo). Formato de uuid, que é o da coluna.
 */
export function idDoAvisoParaAEquipe(stepId: string, motivo: MotivoParaAEquipe["tipo"], userId: string): string {
  const h = createHash("sha256").update(`envio-ao-cliente:${stepId}:${motivo}:${userId}`).digest("hex").slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Avisa o responsável do processo — ou, sem responsável, quem é do setor que
 * opera o módulo, como o aviso da Junta. Devolve se avisou agora (`false`
 * quando este aviso já tinha saído, ou quando não há ninguém).
 */
async function avisarAEquipe(processo: ProcessoCarregado, stepId: string, motivo: MotivoParaAEquipe): Promise<boolean> {
  const prisma = getPrisma();
  let pessoas: string[];
  if (processo.ownerUserId) {
    pessoas = [processo.ownerUserId];
  } else {
    const setor = (await setorDoModulo(processo.tenantId, MODULE)) ?? SETOR;
    const usuarios = await prisma.user.findMany({
      where: { tenantId: processo.tenantId, active: true, sectors: { some: { sectorCode: setor } } },
      select: { id: true },
    });
    pessoas = usuarios.map((u) => u.id);
  }
  if (pessoas.length === 0) return false;

  const ids = pessoas.map((userId) => idDoAvisoParaAEquipe(stepId, motivo.tipo, userId));
  const jaSaiu = await prisma.notification.count({ where: { tenantId: processo.tenantId, id: { in: ids } } });
  if (jaSaiu > 0) return false;

  const message = avisoParaAEquipe(motivo, nomeDoProcessoNoAviso(processo));
  for (const [i, userId] of pessoas.entries()) {
    await notifyUser(userId, {
      tenantId: processo.tenantId,
      type: "PROCESS_ENVIO_AO_CLIENTE",
      message,
      entityId: processo.id,
      deduplicationId: ids[i],
    });
  }
  return true;
}
