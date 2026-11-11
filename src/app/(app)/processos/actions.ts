"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector, podeExcluir } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { sincronizarProcesso } from "@/lib/societario/conclusaoServidor";
import {
  proximaTentativa,
  itensObrigatoriosPendentes,
  transicaoDeSituacao,
  type AcaoDeSituacao,
} from "@/lib/societario/processo";
import {
  executorPara,
  podeSubmeter,
  decidirAposSubmissao,
  precisaDeNumeroAMao,
} from "@/lib/societario/executor";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { getSectorUsers } from "@/lib/sectorUsers";
import { lerDadosDoProcesso } from "@/lib/societario/dados-do-processo";
import { lerDataDoCampo } from "@/lib/societario/datas";
import {
  ehTaxaDoBombeiros,
  arquivarTaxaDeBombeiros,
  assuntoDoEnvio,
  contatosDaEmpresa,
  destinatarios,
  podeEnviar,
  validarGuia,
} from "@/lib/societario/arquivamento";
import { salvarGuia, lerGuia } from "@/lib/societario/guias";
import { sendTaxaAoClienteEmail } from "@/lib/email/sendMail";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { lerFormularioDaTaxa } from "@/lib/societario/taxa-form";
import { abrirProcessoNoServidor } from "@/lib/societario/aberturaServidor";
import { lerAberturaParaAplicar, MAX_PEDIDO } from "@/lib/societario/abertura";

// `SECTOR` é o setor de origem, usado só como padrão: acesso e equipe seguem o
// setor que opera o módulo neste tenant — ver `setorDoModulo`.
const SECTOR = "societario";
const MODULE = "societario_processos";

export type ProcessoState = { error: string } | null;

async function contexto() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { erro: "Não autenticado" as const, ctx: null };
  if (!canActOnSector(ctx, (await setoresDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) return { erro: "Sem permissão no Societário" as const, ctx: null };
  return { erro: null, ctx };
}

// Toda ação que mexe em etapa termina em `sincronizarProcesso` — o envio ao
// cliente no fim e a conclusão. Era o `sincronizarConclusao` daqui; foi para
// `src/lib/societario/conclusaoServidor.ts` em 09/11/2026, para o observador
// de protocolo passar pelo mesmo ponto.

/**
 * Abre um processo pela abertura guiada (`/processos/novo`).
 *
 * A gravação é `abrirProcessoNoServidor` (09/11/2026), a mesma da proposta da
 * Ceci; aqui fica só o que é da tela: ler o formulário e ir para o processo.
 */
export async function abrirProcesso(_prev: ProcessoState, form: FormData): Promise<ProcessoState> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { error: erro ?? "Não autenticado" };

  // Sem o campo de responsável no formulário, fica com quem abriu — que é como
  // era antes de o campo existir.
  const informouResponsavel = form.has("ownerUserId");
  const pedido = String(form.get("pedido") ?? "").trim().slice(0, MAX_PEDIDO);
  const r = await abrirProcessoNoServidor(
    { tenantId: ctx.tenantId, userId: ctx.userId },
    {
      empresaId: String(form.get("companyId") ?? "").trim(),
      tipoId: String(form.get("typeId") ?? "").trim(),
      campos: {
        titulo: form.get("title"),
        responsavelId: informouResponsavel ? form.get("ownerUserId") : (ctx.userId ?? ""),
        prioridade: form.get("priority"),
        prazoCombinado: form.get("dueAt"),
      },
      aceitarQuemAbre: !informouResponsavel,
      jaTemos: form.getAll("jaTemos").map(String),
      pedidoAoCliente: form.get("pedirAoCliente") === "1" && pedido.length > 0 ? pedido : null,
      origem: { tipo: "tela" },
    }
  );
  if (!r.ok) return { error: r.erro };

  revalidatePath("/processos");
  redirect(r.endereco);
}

/**
 * Abre o processo que a Ceci propôs no chat, quando a pessoa aprova o cartão
 * (09/11/2026).
 *
 * As mesmas portas da tela: o setor que opera o módulo (`contexto`, o mesmo
 * da abertura guiada) e o módulo ligado (o que a página `/processos/novo`
 * confere). Os argumentos são lidos de novo, e a gravação refaz tenant,
 * empresa, tipo, roteiro e responsável — a proposta não vale como prova de
 * nada. Devolve o id para o cartão apontar o processo; não redireciona, porque
 * quem chama é o chat.
 */
export async function abrirProcessoPelaCeci(argumentos: unknown): Promise<{ error: string } | { processoId: string; endereco: string }> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { error: erro ?? "Não autenticado" };
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) return { error: "Os processos do Societário estão desligados neste escritório." };

  const lido = lerAberturaParaAplicar(argumentos);
  // As propostas chegam conferidas (`prepararAbertura`); a que não passa aqui
  // veio torta de fora do chat, e o detalhe técnico não ajuda quem clicou.
  if (!lido.ok) return { error: "A proposta ficou incompleta. Peça à Ceci para montar de novo." };
  const a = lido.dados;

  const r = await abrirProcessoNoServidor(
    { tenantId: ctx.tenantId, userId: ctx.userId },
    {
      empresaId: a.empresaId,
      tipoId: a.tipoId,
      campos: { titulo: a.titulo, responsavelId: a.responsavelId, prioridade: a.prioridade, prazoCombinado: a.prazo },
      aceitarQuemAbre: false,
      jaTemos: a.jaTemos,
      pedidoAoCliente: a.pedidoAoCliente || null,
      origem: { tipo: "ceci", roteiroId: a.roteiroId ?? null },
    }
  );
  if (!r.ok) return { error: r.erro };

  revalidatePath("/processos");
  revalidatePath("/processos/kanban");
  // O endereço curto vai junto (10/11/2026): é para onde o cartão do chat aponta.
  return { processoId: r.processoId, endereco: r.endereco };
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
  await sincronizarProcesso(etapa.processId);

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
  await sincronizarProcesso(etapa.processId);

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
  await sincronizarProcesso(protocolo.processId);

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
  // Ao meio-dia UTC, como toda data civil do Societário (ver `datas.ts`):
  // `new Date("AAAA-MM-DD")` dava meia-noite UTC, que em São Paulo ainda é o dia
  // anterior — e a agenda de prazos mostrava o prazo do órgão um dia antes.
  const prazo = lerDataDoCampo(prazoAte);
  if (!prazo.ok) return { error: "Prazo do órgão inválido." };

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
        dueAt: prazo.data,
      },
    });
    if (protocolo.stepId) {
      await tx.processStep.update({
        where: { id: protocolo.stepId },
        data: { status: "PENDENTE", doneAt: null },
      });
    }
  });
  await sincronizarProcesso(protocolo.processId);

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

const ACOES_DE_SITUACAO = new Set<AcaoDeSituacao>(["aguardar_cliente", "suspender", "retomar", "indeferir", "cancelar"]);

/**
 * Pausa, encerra sem conclusão ou retoma o processo.
 *
 * É a única escrita de `status` fora de `sincronizarProcesso`: as situações
 * que dependem de decisão de gente (esperar o cliente, suspender, o órgão
 * negou, o cliente desistiu) não se derivam de protocolo. A regra de quem vai
 * para onde está em `transicaoDeSituacao`; a gravação é condicional no status
 * lido, para duas pessoas na mesma tela não se sobreporem.
 */
export async function mudarSituacaoDoProcesso(
  processId: string,
  acao: AcaoDeSituacao,
  motivo: string
): Promise<ProcessoState> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { error: erro ?? "Não autenticado" };
  if (!ACOES_DE_SITUACAO.has(acao)) return { error: "Ação desconhecida." };

  const prisma = getPrisma();
  const processo = await prisma.process.findFirst({
    where: { id: processId, tenantId: ctx.tenantId },
    select: { id: true, status: true, statusReason: true },
  });
  if (!processo) return { error: "Processo não encontrado." };

  const t = transicaoDeSituacao(processo.status, acao, typeof motivo === "string" ? motivo : "");
  if (!t.ok) return { error: t.erro };

  const gravado = await prisma.process.updateMany({
    where: { id: processo.id, status: processo.status },
    data: { status: t.status, statusReason: t.motivo, statusChangedAt: new Date() },
  });
  if (gravado.count !== 1) return { error: "O processo acabou de mudar — atualize a tela." };

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "societario.processo.situacao",
    entityType: "Process",
    entityId: processo.id,
    metadata: { de: processo.status, para: t.status, acao, motivo: t.motivo, motivoAnterior: processo.statusReason },
  });
  // Retomar solta o que a pausa segurou (09/11/2026): o robô não manda o envio
  // ao cliente com o processo pausado, e sem isto ele só sairia na próxima
  // mudança de etapa.
  if (acao === "retomar") await sincronizarProcesso(processo.id);

  revalidatePath(`/processos/${processo.id}`);
  revalidatePath("/processos");
  revalidatePath("/processos/kanban");
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
  // O checklist da etapa de envio segura o robô (09/11/2026): marcar o último
  // item obrigatório, com o resto do processo encerrado, é o que solta o envio.
  if (feito) {
    await sincronizarProcesso(item.step.processId);
    revalidatePath("/processos");
  }

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

export type EnvioDaTaxaState =
  | { error: string }
  | { ok: true; enviados: number; recusados: string[] }
  | null;

/**
 * Envia a guia da taxa do Bombeiros aos contatos da empresa.
 *
 * É o fim do fluxo do setor depois do portal: arquivar com o nome da convenção
 * e mandar aos e-mails do cadastro. **Ato para fora** — a confirmação é a tela
 * que mostra destinatários, descartados e o nome do arquivo antes deste clique,
 * calculados pelas mesmas funções usadas aqui.
 *
 * A ordem é validar tudo, **guardar a guia, e só então enviar**: se o e-mail
 * falhar, a guia já está no processo e a nova tentativa não pede o arquivo de
 * novo. O inverso deixaria um e-mail enviado sem a guia registrada.
 */
export async function enviarTaxaAoCliente(form: FormData): Promise<EnvioDaTaxaState> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { error: erro ?? "Não autenticado" };

  const taxaId = String(form.get("taxaId") ?? "");
  if (!taxaId) return { error: "Taxa não informada." };

  const prisma = getPrisma();
  // Tenant no `where`: um id de taxa de outro cliente não chega a ser lido.
  const taxa = await prisma.processFee.findFirst({
    where: { id: taxaId, tenantId: ctx.tenantId },
    select: {
      id: true,
      processId: true,
      description: true,
      amountCents: true,
      dueDate: true,
      documentUrl: true,
      protocol: { select: { organ: { select: { name: true, acronym: true } } } },
      company: {
        select: {
          name: true,
          email: true,
          people: { where: { active: true, isInternal: false }, select: { name: true, email: true } },
        },
      },
    },
  });
  if (!taxa) return { error: "Taxa não encontrada." };

  const orgao = taxa.protocol?.organ ?? null;
  if (!ehTaxaDoBombeiros(orgao ? { sigla: orgao.acronym, nome: orgao.name } : null)) {
    return { error: "O envio ao cliente por aqui é só da taxa do Corpo de Bombeiros." };
  }

  const arquivo = form.get("guia");
  const novaGuia = arquivo instanceof File && arquivo.size > 0 ? arquivo : null;
  if (novaGuia) {
    const v = validarGuia(novaGuia);
    if (!v.ok) return { error: v.motivo };
  }
  const guiaGuardada = !novaGuia && taxa.documentUrl ? await lerGuia(ctx.tenantId, taxa.documentUrl) : null;

  const d = destinatarios(contatosDaEmpresa(taxa.company, taxa.company.people));
  const veredito = podeEnviar(d, novaGuia !== null || guiaGuardada !== null);
  if (!veredito.pode) return { error: veredito.motivo };

  const arquivamento = arquivarTaxaDeBombeiros(taxa.company.name, taxa.dueDate, new Date());

  let conteudo: Buffer;
  if (novaGuia) {
    conteudo = Buffer.from(await novaGuia.arrayBuffer());
    try {
      const documentUrl = await salvarGuia(ctx.tenantId, conteudo);
      await prisma.processFee.update({ where: { id: taxa.id }, data: { documentUrl } });
    } catch (err) {
      console.error("[enviarTaxaAoCliente] guardar guia", err);
      return { error: "Erro ao guardar a guia. Nada foi enviado." };
    }
  } else {
    conteudo = guiaGuardada!;
  }

  const envio = await sendTaxaAoClienteEmail({
    tenantId: ctx.tenantId,
    para: d.para,
    assunto: assuntoDoEnvio(arquivamento),
    empresaNome: taxa.company.name,
    descricao: taxa.description,
    valorCentavos: taxa.amountCents,
    vencimento: taxa.dueDate,
    anexo: { nome: `${arquivamento.nome}.pdf`, conteudo },
  });
  if (!envio.ok) return { error: envio.error };

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "process.fee_sent",
    entityType: "Process",
    entityId: taxa.processId ?? taxa.id,
    // Contagens, não endereços: o log é lido por quem audita, e o que importa
    // é que saiu, para quantos, e com qual arquivo.
    metadata: {
      taxaId: taxa.id,
      arquivo: arquivamento.caminho,
      destinatarios: d.para.length,
      descartados: d.descartados.length,
      recusados: envio.recusados.length,
    },
  });

  if (taxa.processId) revalidatePath(`/processos/${taxa.processId}`);
  return { ok: true, enviados: d.para.length - envio.recusados.length, recusados: envio.recusados };
}

/**
 * Edita título, responsável, prioridade e prazo combinado.
 *
 * O responsável atual continua aceito mesmo que tenha saído do setor: editar a
 * prioridade de um processo não pode obrigar a trocar quem responde por ele.
 */
export async function atualizarDadosDoProcesso(_prev: ProcessoState, form: FormData): Promise<ProcessoState> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { error: erro ?? "Não autenticado" };

  const processId = String(form.get("processId") ?? "").trim();
  if (!processId) return { error: "Processo não informado." };

  const prisma = getPrisma();
  const processo = await prisma.process.findFirst({
    where: { id: processId, tenantId: ctx.tenantId },
    select: { id: true, ownerUserId: true, title: true, priority: true, dueAt: true },
  });
  if (!processo) return { error: "Processo não encontrado." };

  const responsaveis = await getSectorUsers(ctx.tenantId, (await setoresDoModulo(ctx.tenantId, MODULE)) ?? SECTOR);
  const validos = new Set(responsaveis.map((r) => r.id));
  if (processo.ownerUserId) validos.add(processo.ownerUserId);

  const lido = lerDadosDoProcesso(
    {
      titulo: form.get("title"),
      responsavelId: form.get("ownerUserId"),
      prioridade: form.get("priority"),
      prazoCombinado: form.get("dueAt"),
    },
    validos
  );
  if (!lido.ok) return { error: lido.erro };
  const dados = lido.dados;

  await prisma.process.update({
    where: { id: processo.id },
    data: {
      title: dados.titulo,
      ownerUserId: dados.responsavelId,
      priority: dados.prioridade,
      dueAt: dados.prazoCombinado,
    },
  });

  // Só os nomes do que mudou: o log é lido por quem audita, e "quem mudou a
  // prioridade para urgente" é a pergunta que ele responde.
  const mudou: string[] = [];
  if (processo.title !== dados.titulo) mudou.push("titulo");
  if (processo.ownerUserId !== dados.responsavelId) mudou.push("responsavel");
  if (processo.priority !== dados.prioridade) mudou.push("prioridade");
  if ((processo.dueAt?.getTime() ?? null) !== (dados.prazoCombinado?.getTime() ?? null)) mudou.push("prazo");

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "process.update",
    entityType: "Process",
    entityId: processo.id,
    metadata: { campos: mudou, prioridade: dados.prioridade },
  });

  revalidatePath(`/processos/${processo.id}`);
  revalidatePath("/processos");
  return null;
}

// ─── A taxa lançada à mão (30/10/2026) ──────────────────────────────────────

export type TaxaState = { error: string } | { success: true } | null;

/**
 * Lança a taxa de um processo — a guia que o setor pagou ou vai pagar. O
 * processo e a tentativa são conferidos no tenant, e a tentativa precisa ser
 * deste processo: é ela que separa a primeira via do que as voltas custaram.
 */
export async function lancarTaxa(_prev: TaxaState, form: FormData): Promise<TaxaState> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { error: erro ?? "Não autenticado" };
  const lido = lerFormularioDaTaxa({
    processId: form.get("processId"),
    description: form.get("description"),
    amount: form.get("amount"),
    dueDate: form.get("dueDate"),
    protocolId: form.get("protocolId"),
    paidAt: form.get("paidAt"),
  });
  if (!lido.ok) return { error: lido.erro };
  const d = lido.dados;

  const prisma = getPrisma();
  const processo = await prisma.process.findFirst({ where: { id: d.processId, tenantId: ctx.tenantId }, select: { id: true, companyId: true } });
  if (!processo) return { error: "Processo não encontrado." };
  if (d.protocolId) {
    const protocolo = await prisma.processProtocol.findFirst({ where: { id: d.protocolId, processId: processo.id, tenantId: ctx.tenantId }, select: { id: true } });
    if (!protocolo) return { error: "Essa apresentação não é deste processo." };
  }

  const taxa = await prisma.processFee.create({
    data: {
      tenantId: ctx.tenantId,
      companyId: processo.companyId,
      processId: processo.id,
      protocolId: d.protocolId,
      description: d.description,
      amountCents: d.amountCents,
      dueDate: d.dueDate,
      paidAt: d.paidAt,
    },
    select: { id: true },
  });
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "process.fee_created",
    entityType: "Process",
    entityId: processo.id,
    metadata: { taxaId: taxa.id, descricao: d.description, valorCentavos: d.amountCents },
  });
  revalidatePath(`/processos/${processo.id}`);
  return { success: true };
}

/** Marca a taxa como paga hoje, ou desfaz quando foi engano. */
export async function marcarTaxaComoPaga(taxaId: string, paga: boolean): Promise<{ error: string } | null> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { error: erro ?? "Não autenticado" };
  const prisma = getPrisma();
  const taxa = await prisma.processFee.findFirst({ where: { id: taxaId, tenantId: ctx.tenantId }, select: { id: true, processId: true } });
  if (!taxa) return { error: "Taxa não encontrada." };
  await prisma.processFee.update({ where: { id: taxa.id }, data: { paidAt: paga ? new Date() : null } });
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: paga ? "process.fee_paid" : "process.fee_unpaid",
    entityType: "Process",
    entityId: taxa.processId ?? taxa.id,
    metadata: { taxaId: taxa.id },
  });
  if (taxa.processId) revalidatePath(`/processos/${taxa.processId}`);
  return null;
}

/**
 * Exclui a taxa lançada por engano. A paga não sai: é o registro de quanto o
 * processo custou — desmarque o pagamento antes, se foi engano mesmo.
 */
export async function excluirTaxa(taxaId: string): Promise<{ error: string } | null> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { error: erro ?? "Não autenticado" };
  if (!podeExcluir(ctx)) return { error: "Seu papel não exclui registros." };
  const prisma = getPrisma();
  const taxa = await prisma.processFee.findFirst({ where: { id: taxaId, tenantId: ctx.tenantId }, select: { id: true, processId: true, paidAt: true, description: true, amountCents: true } });
  if (!taxa) return { error: "Taxa não encontrada." };
  if (taxa.paidAt) return { error: "A taxa está paga. Desmarque o pagamento antes de excluir." };
  await prisma.processFee.deleteMany({ where: { id: taxa.id, tenantId: ctx.tenantId } });
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "process.fee_deleted",
    entityType: "Process",
    entityId: taxa.processId ?? taxa.id,
    metadata: { taxaId: taxa.id, descricao: taxa.description, valorCentavos: taxa.amountCents },
  });
  if (taxa.processId) revalidatePath(`/processos/${taxa.processId}`);
  return null;
}
