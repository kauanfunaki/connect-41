// Motor de alertas proativos — disparado por um scheduler externo (n8n) via
// POST /api/cron/alerts, sem sessão de usuário. Cada checagem é independente e
// best-effort (uma falha numa checagem ou num tenant não derruba as demais).
// Dedup por dia usa AlertDispatch: cada condição só notifica uma vez por dia
// mesmo que o job rode várias vezes. Lembrete de reunião não entra aqui — o
// Kauan já cobre isso com o overlay focal em tempo real (MeetingAttendee.
// acknowledgedAt + polling no client), que é mais preciso que um cron diário.
import { getPrisma } from "@/lib/prisma";
import { notifySector, notifyUser } from "@/lib/notifications";
import { statusPrazoPagamento } from "@/lib/rescisaoChecklist";
import { calcularValidade } from "@/lib/relatoriosRH";
import { saoPauloParts } from "@/lib/agenda";
import { nomeExibicao } from "@/lib/companyName";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import { avisoDeContasAPagar, avisoDeOrcamento, avisoDePendenciasVencidas, maiorEstouro } from "@/lib/financeiro/alertas";
import { serieEconomica } from "@/lib/dre/dataEconomica";
import { orcamentosAprovados, MODULO_DE_ORCAMENTO } from "@/lib/dre/orcamento/dados";
import { porGrupoOrcado } from "@/lib/dre/orcamento/grade";

const DAY_MS = 24 * 60 * 60 * 1000;

const VACATION_WARNING_DAYS = 30;
const PROBATION_CHECKPOINTS = [40, 45, 85, 90] as const; // dias desde a admissão (5 dias de antecedência + no dia)
const EXAM_WARNING_DAYS = 15;
const HANDOFF_STALE_DAYS = 3;
const DOCUMENT_WARNING_DAYS = 30;
const ADMISSAO_PENDENTE_DAYS = 5; // link gerado, colaborador ainda não preencheu
const ADMISSAO_CONFERENCIA_DAYS = 2; // colaborador preencheu, DP ainda não concluiu
const RESCISAO_WARNING_DAYS = 3; // antecedência do prazo do art. 477 §6
const TRAINING_WARNING_DAYS = 30; // reciclagem de treinamento vencendo

const VACATION_OPEN_STATUSES = ["PLANEJADA", "SOLICITADA", "EM_ANALISE", "APROVADA", "PROGRAMADA", "EM_GOZO"] as const;
const EXAM_RESOLVED_STATUSES = ["ASO_APTO", "ASO_INAPTO", "ASO_APTO_COM_RESTRICAO"] as const;

function startOfDayUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((startOfDayUTC(b).getTime() - startOfDayUTC(a).getTime()) / DAY_MS);
}

// Tenta reservar o disparo de hoje para essa chave; retorna false se já foi
// disparada hoje (inclusive por uma execução concorrente/anterior do job).
async function tryDispatch(tenantId: string, alertKey: string, today: Date): Promise<boolean> {
  const prisma = getPrisma();
  try {
    await prisma.alertDispatch.create({
      data: { tenantId, alertKey, sentOn: today },
    });
    return true;
  } catch {
    return false; // violação do @@unique([tenantId, alertKey, sentOn]) — já disparado hoje
  }
}

async function checkVacationsExpiring(tenantId: string, today: Date): Promise<number> {
  const prisma = getPrisma();
  const limit = new Date(today.getTime() + VACATION_WARNING_DAYS * DAY_MS);

  const vacations = await prisma.vacation.findMany({
    where: {
      tenantId,
      status: { in: [...VACATION_OPEN_STATUSES] },
      concessivePeriodEnd: { not: null, lte: limit },
    },
    include: { person: { select: { id: true, name: true } } },
  });

  let sent = 0;
  for (const v of vacations) {
    const key = `VACATION_EXPIRING:${v.id}`;
    if (!(await tryDispatch(tenantId, key, today))) continue;
    const overdue = v.concessivePeriodEnd! < today;
    const dias = Math.abs(daysBetween(today, v.concessivePeriodEnd!));
    const message = overdue
      ? `Férias de ${v.person.name} vencidas há ${dias} dia(s).`
      : `Férias de ${v.person.name} vencem em ${dias} dia(s).`;
    await notifySector("dp", { tenantId, type: "VACATION_EXPIRING", message, entityType: "PERSON", entityId: v.personId });
    sent++;
  }
  return sent;
}

async function checkProbationDeadlines(tenantId: string, today: Date): Promise<number> {
  const prisma = getPrisma();
  const oldestCheckpoint = Math.max(...PROBATION_CHECKPOINTS);
  const earliestAdmission = new Date(today.getTime() - oldestCheckpoint * DAY_MS);

  const people = await prisma.person.findMany({
    where: {
      tenantId,
      type: "COLABORADOR",
      employmentStatus: { in: ["ATIVO", "ADMISSAO_EM_ANDAMENTO"] },
      admissionDate: { not: null, gte: earliestAdmission },
    },
    select: { id: true, name: true, admissionDate: true },
  });

  let sent = 0;
  for (const p of people) {
    const dias = daysBetween(p.admissionDate!, today);
    if (!PROBATION_CHECKPOINTS.includes(dias as (typeof PROBATION_CHECKPOINTS)[number])) continue;
    const key = `PROBATION_DEADLINE:${p.id}:${dias}`;
    if (!(await tryDispatch(tenantId, key, today))) continue;
    const message = `Contrato de experiência de ${p.name} completa ${dias} dias.`;
    await notifySector("dp", { tenantId, type: "PROBATION_DEADLINE", message, entityType: "PERSON", entityId: p.id });
    sent++;
  }
  return sent;
}

async function checkExamesVencendo(tenantId: string, today: Date): Promise<number> {
  const prisma = getPrisma();
  const limit = new Date(today.getTime() + EXAM_WARNING_DAYS * DAY_MS);

  const exames = await prisma.exameAdmissional.findMany({
    where: {
      tenantId,
      asoDueDate: { not: null, lte: limit },
      status: { notIn: [...EXAM_RESOLVED_STATUSES] },
    },
    include: { person: { select: { id: true, name: true } } },
  });

  let sent = 0;
  for (const e of exames) {
    const key = `EXAME_VENCENDO:${e.id}`;
    if (!(await tryDispatch(tenantId, key, today))) continue;
    const overdue = e.asoDueDate! < today;
    const dias = Math.abs(daysBetween(today, e.asoDueDate!));
    const message = overdue
      ? `ASO de ${e.person.name} vencido há ${dias} dia(s).`
      : `ASO de ${e.person.name} vence em ${dias} dia(s).`;
    await notifySector("dp", { tenantId, type: "EXAM_DUE", message, entityType: "PERSON", entityId: e.personId });
    sent++;
  }
  return sent;
}

// A transferência agora é por setor (HandoffSector, ver migration
// 20260716130000_transferencias_multi_setor_alerta_reuniao do Kauan) — cada
// setor de destino tem seu próprio status/responsável, então o alerta de
// "parado" é por linha de HandoffSector, não mais por Handoff inteiro.
// A ausência de HandoffView (visualização) continua sendo olhada no Handoff
// pai, que é o nível em que a visualização é registrada.
async function checkHandoffsParados(tenantId: string, today: Date): Promise<number> {
  const prisma = getPrisma();
  const limit = new Date(today.getTime() - HANDOFF_STALE_DAYS * DAY_MS);

  const pendentes = await prisma.handoffSector.findMany({
    where: {
      tenantId,
      status: { not: "DONE" },
      createdAt: { lte: limit },
      handoff: { views: { none: {} } },
    },
    include: {
      handoff: { select: { entityType: true, entityId: true, createdAt: true } },
      assignees: { select: { userId: true } },
    },
  });

  let sent = 0;
  for (const hs of pendentes) {
    const key = `HANDOFF_STALE:${hs.id}`;
    if (!(await tryDispatch(tenantId, key, today))) continue;
    const dias = daysBetween(hs.handoff.createdAt, today);
    const message = `Transferência parada há ${dias} dia(s) sem visualização no setor ${hs.sectorCode}.`;
    if (hs.assignees.length > 0) {
      // Um aviso por responsável — com `assignedTo` só o primeiro era avisado,
      // e os demais designados nunca ficavam sabendo que a transferência parou.
      for (const { userId } of hs.assignees) {
        await notifyUser(userId, {
          tenantId,
          type: "HANDOFF_STALE",
          message,
          entityType: hs.handoff.entityType,
          entityId: hs.handoff.entityId,
        });
      }
    } else {
      await notifySector(hs.sectorCode, {
        tenantId,
        type: "HANDOFF_STALE",
        message,
        entityType: hs.handoff.entityType,
        entityId: hs.handoff.entityId,
      });
    }
    sent++;
  }
  return sent;
}

// Notifica quem fez o upload — é sempre alguém com contexto do documento,
// independente da entidade (PERSON/COMPANY/VAGA/PIPELINE_ITEM) a que ele
// pertence. O alerta continua diário (dedup) enquanto o vencimento não for
// resolvido (trocar o documento remove/atualiza o expiresAt).
async function checkDocumentosVencendo(tenantId: string, today: Date): Promise<number> {
  const prisma = getPrisma();
  const limit = new Date(today.getTime() + DOCUMENT_WARNING_DAYS * DAY_MS);

  const docs = await prisma.document.findMany({
    where: { tenantId, expiresAt: { not: null, lte: limit } },
    select: { id: true, fileName: true, category: true, expiresAt: true, uploadedById: true, entityType: true, entityId: true },
  });

  let sent = 0;
  for (const d of docs) {
    const key = `DOC_EXPIRING:${d.id}`;
    if (!(await tryDispatch(tenantId, key, today))) continue;
    const overdue = d.expiresAt! < today;
    const dias = Math.abs(daysBetween(today, d.expiresAt!));
    const message = overdue
      ? `Documento "${d.fileName}" (${d.category}) vencido há ${dias} dia(s).`
      : `Documento "${d.fileName}" (${d.category}) vence em ${dias} dia(s).`;
    await notifyUser(d.uploadedById, {
      tenantId,
      type: "DOC_EXPIRING",
      message,
      entityType: d.entityType === "COMPANY" ? "COMPANY" : d.entityType === "PERSON" ? "PERSON" : undefined,
      entityId: d.entityType === "COMPANY" || d.entityType === "PERSON" ? d.entityId : undefined,
    });
    sent++;
  }
  return sent;
}

// Admissão digital emperrada — dois estados acionáveis, ambos notificam quem
// gerou o link (o responsável do DP), não o setor inteiro: (1) link PENDENTE há
// dias sem o colaborador preencher; (2) já PREENCHIDO mas o DP não concluiu a
// conferência. Nag diário (dedup) enquanto não resolver.
async function checkAdmissoesParadas(tenantId: string, today: Date): Promise<number> {
  const prisma = getPrisma();
  const pendenteLimit = new Date(today.getTime() - ADMISSAO_PENDENTE_DAYS * DAY_MS);
  const conferenciaLimit = new Date(today.getTime() - ADMISSAO_CONFERENCIA_DAYS * DAY_MS);

  const links = await prisma.admissaoLink.findMany({
    where: {
      tenantId,
      OR: [
        { status: "PENDENTE", createdAt: { lte: pendenteLimit } },
        { status: "PREENCHIDO", submittedAt: { lte: conferenciaLimit } },
      ],
    },
    include: { person: { select: { id: true, name: true } } },
  });

  let sent = 0;
  for (const link of links) {
    const key = `ADMISSAO_STALE:${link.id}:${link.status}`;
    if (!(await tryDispatch(tenantId, key, today))) continue;
    const message =
      link.status === "PENDENTE"
        ? `${link.person.name} ainda não preencheu a admissão digital (link enviado há ${daysBetween(link.createdAt, today)} dia(s)).`
        : `Admissão de ${link.person.name} aguardando conferência há ${daysBetween(link.submittedAt!, today)} dia(s).`;
    await notifyUser(link.createdById, { tenantId, type: "ADMISSAO_STALE", message, entityType: "PERSON", entityId: link.personId });
    sent++;
  }
  return sent;
}

// ─── Financeiro (18/09) ──────────────────────────────────────────────────────
//
// As checagens acima são de DP e nasceram antes dos módulos; as três abaixo são
// do BPO e **só rodam com o módulo ligado** no cliente. As regras de texto e de
// estouro são puras, em `src/lib/financeiro/alertas.ts`, com teste.

const MODULO_CONTAS_PAGAR = "bpo_contas_pagar";
const MODULO_PENDENCIAS = "bpo_pendencias";

/** Abaixo disso, estouro de orçamento é troco de arredondamento, não notícia. */
const ESTOURO_MINIMO_CENTAVOS = 100_00;

function setorPadrao(code: string): string {
  return getModuleDef(code)?.sectorCode ?? "bpo";
}

/**
 * Reserva um aviso cuja chave já carrega o **dia de São Paulo** (ou a
 * competência).
 *
 * O `tryDispatch` dedupe pelo dia UTC, que vira às 21h de Brasília: sem isto, o
 * aviso das contas de hoje sairia de novo às 21h, com o mesmo texto. Aqui a
 * pergunta é "esta chave já saiu alguma vez?", e a chave é única por dia civil
 * daqui.
 */
async function reservarPorChave(tenantId: string, alertKey: string, today: Date): Promise<boolean> {
  const prisma = getPrisma();
  const jaSaiu = await prisma.alertDispatch.findFirst({ where: { tenantId, alertKey }, select: { id: true } });
  if (jaSaiu) return false;
  return tryDispatch(tenantId, alertKey, today);
}

/** Um dia antes, em chave de dia civil (`AAAA-MM-DD`). */
function diaAnterior(dateKey: string): string {
  const [ano, mes, dia] = dateKey.split("-").map(Number);
  const d = new Date(Date.UTC(ano!, mes! - 1, dia! - 1));
  return d.toISOString().slice(0, 10);
}

// O que vence hoje e o que venceu ontem e segue em aberto, num aviso só para o
// setor que opera as contas a pagar.
async function checkContasAPagar(tenantId: string, today: Date): Promise<number> {
  if (!(await isModuleEnabled(tenantId, MODULO_CONTAS_PAGAR))) return 0;

  const hojeKey = saoPauloParts(new Date()).dateKey;
  const ontemKey = diaAnterior(hojeKey);
  const alertKey = `FINANCE_CONTAS_DIA:${hojeKey}`;
  const prisma = getPrisma();

  // A pergunta barata primeiro: já avisei hoje? O motor roda a cada 15 minutos, e
  // sem isto a consulta das contas sairia 96 vezes por dia para nada. Reservar
  // aqui, porém, seria pior: numa manhã sem vencimento a chave queimaria, e a
  // conta lançada às 10h não avisaria ninguém.
  if (await prisma.alertDispatch.findFirst({ where: { tenantId, alertKey }, select: { id: true } })) return 0;

  const contas = await prisma.financeEntry.findMany({
    where: {
      tenantId,
      kind: "PAGAR",
      status: { in: ["PROVISORIO", "CONFERIDO"] },
      paidAt: null,
      dueDate: { gte: new Date(`${ontemKey}T00:00:00-03:00`), lte: new Date(`${hojeKey}T23:59:59.999-03:00`) },
    },
    select: { amount: true, dueDate: true },
  });

  const resumo = { venceHoje: 0, totalHoje: 0, venceramOntem: 0, totalOntem: 0 };
  for (const c of contas) {
    const dia = saoPauloParts(c.dueDate).dateKey;
    const centavos = centavosDeDecimal(c.amount);
    if (dia === hojeKey) {
      resumo.venceHoje += 1;
      resumo.totalHoje += centavos;
    } else if (dia === ontemKey) {
      resumo.venceramOntem += 1;
      resumo.totalOntem += centavos;
    }
  }

  const message = avisoDeContasAPagar(resumo);
  if (!message) return 0;
  if (!(await reservarPorChave(tenantId, alertKey, today))) return 0;

  const setor = (await setorDoModulo(tenantId, MODULO_CONTAS_PAGAR)) ?? setorPadrao(MODULO_CONTAS_PAGAR);
  await notifySector(setor, { tenantId, type: "FINANCE_CONTAS_DIA", message });
  return 1;
}

// Pendência vencida sem resposta avisa **quem a abriu**, não o setor: o cliente
// já recebe o lembrete por e-mail (ver `pendencias/lembrete.ts`), e quem cobra é
// quem pediu.
async function checkPendenciasVencidas(tenantId: string, today: Date): Promise<number> {
  if (!(await isModuleEnabled(tenantId, MODULO_PENDENCIAS))) return 0;

  const hojeKey = saoPauloParts(new Date()).dateKey;
  const prisma = getPrisma();
  const porAutor = await prisma.clientRequest.groupBy({
    by: ["createdById"],
    where: {
      tenantId,
      status: "ABERTA",
      dueDate: { lt: new Date(`${hojeKey}T00:00:00-03:00`) },
      createdById: { not: null },
    },
    _count: { _all: true },
  });

  let sent = 0;
  for (const linha of porAutor) {
    const userId = linha.createdById;
    if (!userId) continue;
    const message = avisoDePendenciasVencidas(linha._count._all);
    if (!message) continue;
    if (!(await reservarPorChave(tenantId, `PENDENCIAS_VENCIDAS:${userId}:${hojeKey}`, today))) continue;
    await notifyUser(userId, { tenantId, type: "PENDENCIAS_VENCIDAS", message });
    sent++;
  }
  return sent;
}

// Orçamento estourado no mês: uma vez por empresa e por competência — o estouro
// não desfaz, e repetir todo dia seria cobrar a mesma coisa trinta vezes.
//
// Só as empresas com versão APROVADA do ano entram na conta, e a DRE do mês só é
// montada para quem ainda não foi avisado: é a parte cara da checagem.
async function checkOrcamentoEstourado(tenantId: string, today: Date): Promise<number> {
  if (!(await isModuleEnabled(tenantId, MODULO_DE_ORCAMENTO))) return 0;

  const hojeKey = saoPauloParts(new Date()).dateKey;
  const competencia = hojeKey.slice(0, 7);
  const ano = Number(competencia.slice(0, 4));
  const mes = Number(competencia.slice(5, 7));

  const prisma = getPrisma();
  const versoes = await prisma.budget.findMany({
    where: { tenantId, year: ano, status: "APROVADO" },
    select: { companyId: true, company: { select: { name: true, displayName: true } } },
    distinct: ["companyId"],
  });
  if (versoes.length === 0) return 0;

  const setor = (await setorDoModulo(tenantId, MODULO_DE_ORCAMENTO)) ?? setorPadrao(MODULO_DE_ORCAMENTO);
  let sent = 0;

  for (const v of versoes) {
    const alertKey = `ORCAMENTO_ESTOURADO:${v.companyId}:${competencia}`;
    const jaSaiu = await prisma.alertDispatch.findFirst({ where: { tenantId, alertKey }, select: { id: true } });
    if (jaSaiu) continue;

    const orcamento = (await orcamentosAprovados(tenantId, v.companyId, [ano])).get(ano);
    if (!orcamento) continue;
    const serie = await serieEconomica(tenantId, v.companyId, [competencia]);
    const realizado = serie.get(competencia)?.resultado.porGrupo ?? {};

    const estouro = maiorEstouro(realizado, porGrupoOrcado(orcamento.grade, [mes]), ESTOURO_MINIMO_CENTAVOS);
    if (!estouro) continue;
    if (!(await reservarPorChave(tenantId, alertKey, today))) continue;

    await notifySector(setor, {
      tenantId,
      type: "ORCAMENTO_ESTOURADO",
      message: avisoDeOrcamento(nomeExibicao(v.company), competencia, estouro),
      entityType: "COMPANY",
      entityId: v.companyId,
    });
    sent++;
  }
  return sent;
}

type TenantResult = { tenantId: string; sent: number; errors: string[] };

// Prazo legal de pagamento da rescisão (CLT art. 477 §6). É o passivo mais
// caro do ciclo de desligamento e o único prazo aqui que gera multa automática
// ao empregador, então avisa com antecedência e volta a avisar quando estoura.
async function checkRescisoesPrazo(tenantId: string, today: Date): Promise<number> {
  const prisma = getPrisma();

  const terminations = await prisma.termination.findMany({
    where: {
      tenantId,
      terminationDate: { not: null },
      status: { notIn: ["FINALIZADO", "CANCELADO"] },
    },
    select: {
      id: true,
      terminationDate: true,
      personId: true,
      person: { select: { name: true } },
    },
  });

  let sent = 0;
  for (const t of terminations) {
    if (!t.terminationDate) continue;
    const { dueDate, diasRestantes, status } = statusPrazoPagamento(t.terminationDate, today);
    // Avisa a 3 dias, no dia, e enquanto estiver vencido.
    if (!(status === "VENCIDO" || diasRestantes <= RESCISAO_WARNING_DAYS)) continue;

    const key = `RESCISAO_PRAZO:${t.id}:${status === "VENCIDO" ? "vencido" : diasRestantes}`;
    if (!(await tryDispatch(tenantId, key, today))) continue;

    const message =
      status === "VENCIDO"
        ? `Prazo de pagamento da rescisão de ${t.person.name} venceu há ${Math.abs(diasRestantes)} dia(s).`
        : diasRestantes === 0
          ? `Prazo de pagamento da rescisão de ${t.person.name} vence hoje.`
          : `Prazo de pagamento da rescisão de ${t.person.name} vence em ${diasRestantes} dia(s) (${dueDate.toISOString().slice(0, 10)}).`;

    await notifySector("dp", { tenantId, type: "RESCISAO_PRAZO", message, entityType: "PERSON", entityId: t.personId });
    sent++;
  }
  return sent;
}

// Reciclagem de treinamento vencendo. O enum TrainingParticipantStatus já tinha
// VENCIDO, mas nada calculava — dependia de alguém marcar à mão, então na
// prática ninguém era avisado. A validade vem de Training.validityMonths
// contada a partir da data da turma.
async function checkTreinamentosVencendo(tenantId: string, today: Date): Promise<number> {
  const prisma = getPrisma();

  const participants = await prisma.trainingParticipant.findMany({
    where: {
      tenantId,
      status: { in: ["REALIZADO", "CONCLUIDO"] },
      class: { training: { validityMonths: { not: null } } },
      // Colaborador desligado não precisa reciclar.
      person: { active: true, employmentStatus: { not: "DESLIGADO" } },
    },
    select: {
      id: true,
      personId: true,
      person: { select: { name: true } },
      class: { select: { date: true, training: { select: { name: true, validityMonths: true } } } },
    },
  });

  let sent = 0;
  for (const p of participants) {
    const validadeAte = calcularValidade(p.class.date, p.class.training.validityMonths);
    if (!validadeAte) continue;

    const dias = daysBetween(today, validadeAte);
    if (dias > TRAINING_WARNING_DAYS) continue;

    // Vencido notifica uma vez só (não todo dia, pra sempre); dentro da janela
    // notifica por marco de dias restantes.
    const key = `TRAINING_EXPIRING:${p.id}:${dias < 0 ? "vencido" : dias}`;
    if (!(await tryDispatch(tenantId, key, today))) continue;

    const message =
      dias < 0
        ? `Treinamento "${p.class.training.name}" de ${p.person.name} está vencido desde ${validadeAte.toISOString().slice(0, 10)}.`
        : dias === 0
          ? `Treinamento "${p.class.training.name}" de ${p.person.name} vence hoje.`
          : `Treinamento "${p.class.training.name}" de ${p.person.name} vence em ${dias} dia(s).`;

    await notifySector("dp", { tenantId, type: "TRAINING_EXPIRING", message, entityType: "PERSON", entityId: p.personId });
    sent++;
  }
  return sent;
}

async function runForTenant(tenantId: string, today: Date): Promise<TenantResult> {
  const checks: Array<[string, () => Promise<number>]> = [
    ["vacations", () => checkVacationsExpiring(tenantId, today)],
    ["probation", () => checkProbationDeadlines(tenantId, today)],
    ["exames", () => checkExamesVencendo(tenantId, today)],
    ["handoffs", () => checkHandoffsParados(tenantId, today)],
    ["documentos", () => checkDocumentosVencendo(tenantId, today)],
    ["admissoes", () => checkAdmissoesParadas(tenantId, today)],
    ["rescisoes", () => checkRescisoesPrazo(tenantId, today)],
    ["treinamentos", () => checkTreinamentosVencendo(tenantId, today)],
    ["contas a pagar", () => checkContasAPagar(tenantId, today)],
    ["pendências", () => checkPendenciasVencidas(tenantId, today)],
    ["orçamento", () => checkOrcamentoEstourado(tenantId, today)],
  ];

  let sent = 0;
  const errors: string[] = [];
  for (const [name, run] of checks) {
    try {
      sent += await run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[alerts] falha na checagem "${name}" (tenant ${tenantId})`, err);
      errors.push(`${name}: ${msg}`);
    }
  }
  return { tenantId, sent, errors };
}

export async function runAlertEngine(): Promise<{ tenants: number; alertsSent: number; results: TenantResult[] }> {
  const prisma = getPrisma();
  const today = startOfDayUTC(new Date());

  const tenants = await prisma.tenant.findMany({ where: { active: true }, select: { id: true } });

  const results: TenantResult[] = [];
  for (const t of tenants) {
    results.push(await runForTenant(t.id, today));
  }

  return {
    tenants: results.length,
    alertsSent: results.reduce((acc, r) => acc + r.sent, 0),
    results,
  };
}

const SCHEDULER_INTERVAL_MS = 15 * 60 * 1000;

// Cache em globalThis pelo mesmo motivo do getPrisma() (src/lib/prisma.ts):
// sobrevive ao HMR do Turbopack em dev, e garante que só existe um
// setInterval por processo mesmo se register() for chamado mais de uma vez.
const globalForScheduler = globalThis as unknown as { __alertSchedulerStarted?: boolean };

// Gatilho interno (chamado por instrumentation.ts na subida do servidor) —
// substitui a dependência de um scheduler externo (n8n) chamando
// POST /api/cron/alerts. A rota continua existindo como gatilho manual/backup
// (ex: forçar uma checagem fora do intervalo), mas deixa de ser o caminho
// principal. O dedup diário via AlertDispatch protege mesmo se os dois
// caminhos rodarem próximos um do outro.
export function startAlertScheduler(): void {
  if (globalForScheduler.__alertSchedulerStarted) return;
  globalForScheduler.__alertSchedulerStarted = true;

  const run = () => {
    runAlertEngine()
      .then((result) => console.log("[alerts] execução do scheduler interno", result))
      .catch((err) => console.error("[alerts] falha no scheduler interno", err));
    // Import dinâmico evita ciclo alerts ↔ recurringObligations no module graph.
    import("@/lib/recurringObligations")
      .then(({ generateRecurringObligations }) => generateRecurringObligations())
      .then((r) => {
        if (r.generated > 0) console.log("[obligations] itens gerados", r);
      })
      .catch((err) => console.error("[obligations] falha na geração", err));
  };

  run(); // primeira execução já na subida, não espera os 15min iniciais
  setInterval(run, SCHEDULER_INTERVAL_MS);
}
