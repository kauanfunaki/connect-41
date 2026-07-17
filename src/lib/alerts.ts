// Motor de alertas proativos — disparado por um scheduler externo (n8n) via
// POST /api/cron/alerts, sem sessão de usuário. Cada checagem é independente e
// best-effort (uma falha numa checagem ou num tenant não derruba as demais).
// Dedup por dia usa AlertDispatch: cada condição só notifica uma vez por dia
// mesmo que o job rode várias vezes. Lembrete de reunião não entra aqui — o
// Kauan já cobre isso com o overlay focal em tempo real (MeetingAttendee.
// acknowledgedAt + polling no client), que é mais preciso que um cron diário.
import { getPrisma } from "@/lib/prisma";
import { notifySector, notifyUser } from "@/lib/notifications";

const DAY_MS = 24 * 60 * 60 * 1000;

const VACATION_WARNING_DAYS = 30;
const PROBATION_CHECKPOINTS = [40, 45, 85, 90] as const; // dias desde a admissão (5 dias de antecedência + no dia)
const EXAM_WARNING_DAYS = 15;
const HANDOFF_STALE_DAYS = 3;

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
    await notifySector("dprh", { tenantId, type: "VACATION_EXPIRING", message, entityType: "PERSON", entityId: v.personId });
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
    await notifySector("dprh", { tenantId, type: "PROBATION_DEADLINE", message, entityType: "PERSON", entityId: p.id });
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
    await notifySector("dprh", { tenantId, type: "EXAM_DUE", message, entityType: "PERSON", entityId: e.personId });
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
    include: { handoff: { select: { entityType: true, entityId: true, createdAt: true } } },
  });

  let sent = 0;
  for (const hs of pendentes) {
    const key = `HANDOFF_STALE:${hs.id}`;
    if (!(await tryDispatch(tenantId, key, today))) continue;
    const dias = daysBetween(hs.handoff.createdAt, today);
    const message = `Transferência parada há ${dias} dia(s) sem visualização no setor ${hs.sectorCode}.`;
    if (hs.assignedTo) {
      await notifyUser(hs.assignedTo, {
        tenantId,
        type: "HANDOFF_STALE",
        message,
        entityType: hs.handoff.entityType,
        entityId: hs.handoff.entityId,
      });
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

type TenantResult = { tenantId: string; sent: number; errors: string[] };

async function runForTenant(tenantId: string, today: Date): Promise<TenantResult> {
  const checks: Array<[string, () => Promise<number>]> = [
    ["vacations", () => checkVacationsExpiring(tenantId, today)],
    ["probation", () => checkProbationDeadlines(tenantId, today)],
    ["exames", () => checkExamesVencendo(tenantId, today)],
    ["handoffs", () => checkHandoffsParados(tenantId, today)],
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
