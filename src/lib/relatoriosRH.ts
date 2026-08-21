// Relatórios operacionais de RH. Diferente de indicadoresRH.ts (que devolve
// KPIs agregados em cards), aqui a saída é a LISTA acionável: quem está
// vencido, o que falta, quem está fora da faixa. É o que o escopo de serviço
// chama de "relatórios de status por colaborador, área ou gestor".
//
// Todos os dados já existiam no banco — o que faltava era consultá-los.
import { getPrisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth/context";
import { canViewSensitiveField } from "@/lib/auth/sensitiveFields";

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysUntil(target: Date, from: Date): number {
  const startOfDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((startOfDay(target) - startOfDay(from)) / DAY_MS);
}

// ─── Férias ──────────────────────────────────────────────────────────────────

export type FeriasSituacao = "VENCIDA" | "A_VENCER" | "PROGRAMADA" | "EM_DIA";

export type FeriasRow = {
  id: string;
  personId: string;
  personName: string;
  companyName: string | null;
  acquisitiveLabel: string;
  concessiveEnd: Date | null;
  diasParaVencer: number | null;
  startDate: Date | null;
  status: string;
  situacao: FeriasSituacao;
};

// "Vencida" é passivo trabalhista consumado; "a vencer" é o que ainda dá pra
// programar. Uma férias já com data marcada conta como PROGRAMADA mesmo se o
// período concessivo estiver perto do fim — o risco ali já foi endereçado.
export function classificarFerias(
  concessiveEnd: Date | null,
  startDate: Date | null,
  hoje: Date,
  janelaDias: number
): { situacao: FeriasSituacao; diasParaVencer: number | null } {
  if (!concessiveEnd) return { situacao: startDate ? "PROGRAMADA" : "EM_DIA", diasParaVencer: null };
  const dias = daysUntil(concessiveEnd, hoje);
  if (dias < 0) return { situacao: "VENCIDA", diasParaVencer: dias };
  if (startDate) return { situacao: "PROGRAMADA", diasParaVencer: dias };
  if (dias <= janelaDias) return { situacao: "A_VENCER", diasParaVencer: dias };
  return { situacao: "EM_DIA", diasParaVencer: dias };
}

export const FERIAS_JANELA_DIAS = 60;

export async function getRelatorioFerias(ctx: AuthContext, hoje = new Date()): Promise<FeriasRow[]> {
  const prisma = getPrisma();
  const vacations = await prisma.vacation.findMany({
    where: { tenantId: ctx.tenantId, status: { notIn: ["CONCLUIDA", "CANCELADA"] } },
    include: { person: { select: { id: true, name: true, currentCompany: { select: { name: true } } } } },
  });

  const rows = vacations.map((v) => {
    const { situacao, diasParaVencer } = classificarFerias(
      v.concessivePeriodEnd,
      v.startDate,
      hoje,
      FERIAS_JANELA_DIAS
    );
    return {
      id: v.id,
      personId: v.person.id,
      personName: v.person.name,
      companyName: v.person.currentCompany?.name ?? null,
      acquisitiveLabel: `${v.acquisitivePeriodStart.toISOString().slice(0, 10)} → ${v.acquisitivePeriodEnd.toISOString().slice(0, 10)}`,
      concessiveEnd: v.concessivePeriodEnd,
      diasParaVencer,
      startDate: v.startDate,
      status: v.status,
      situacao,
    } satisfies FeriasRow;
  });

  // Vencidas primeiro (mais negativo = mais atrasado), depois as que vencem antes.
  const ordem: Record<FeriasSituacao, number> = { VENCIDA: 0, A_VENCER: 1, PROGRAMADA: 2, EM_DIA: 3 };
  return rows.sort((a, b) => {
    if (ordem[a.situacao] !== ordem[b.situacao]) return ordem[a.situacao] - ordem[b.situacao];
    return (a.diasParaVencer ?? 9999) - (b.diasParaVencer ?? 9999);
  });
}

// ─── Treinamentos ────────────────────────────────────────────────────────────

export type TreinamentoSituacao = "VENCIDO" | "A_VENCER" | "VALIDO" | "SEM_VALIDADE" | "PENDENTE";

export type TreinamentoRow = {
  id: string;
  personId: string;
  personName: string;
  trainingName: string;
  classDate: Date;
  status: string;
  validadeAte: Date | null;
  diasParaVencer: number | null;
  situacao: TreinamentoSituacao;
};

// Vencimento = data da turma + validityMonths do treinamento. O enum já tinha
// o status VENCIDO, mas nada calculava — ficava a cargo de alguém marcar à mão.
export function calcularValidade(classDate: Date, validityMonths: number | null): Date | null {
  if (!validityMonths || validityMonths <= 0) return null;
  const d = new Date(classDate);
  d.setUTCMonth(d.getUTCMonth() + validityMonths);
  return d;
}

export function classificarTreinamento(
  status: string,
  classDate: Date,
  validityMonths: number | null,
  hoje: Date,
  janelaDias: number
): { situacao: TreinamentoSituacao; validadeAte: Date | null; diasParaVencer: number | null } {
  // Só quem efetivamente fez o treinamento tem validade a expirar.
  const concluido = status === "REALIZADO" || status === "CONCLUIDO";
  if (!concluido) return { situacao: "PENDENTE", validadeAte: null, diasParaVencer: null };

  const validadeAte = calcularValidade(classDate, validityMonths);
  if (!validadeAte) return { situacao: "SEM_VALIDADE", validadeAte: null, diasParaVencer: null };

  const dias = daysUntil(validadeAte, hoje);
  if (dias < 0) return { situacao: "VENCIDO", validadeAte, diasParaVencer: dias };
  if (dias <= janelaDias) return { situacao: "A_VENCER", validadeAte, diasParaVencer: dias };
  return { situacao: "VALIDO", validadeAte, diasParaVencer: dias };
}

export const TREINAMENTO_JANELA_DIAS = 60;

export async function getRelatorioTreinamentos(ctx: AuthContext, hoje = new Date()): Promise<TreinamentoRow[]> {
  const prisma = getPrisma();
  const participants = await prisma.trainingParticipant.findMany({
    where: { tenantId: ctx.tenantId },
    include: {
      person: { select: { id: true, name: true } },
      class: { select: { date: true, training: { select: { name: true, validityMonths: true } } } },
    },
  });

  const rows = participants.map((p) => {
    const { situacao, validadeAte, diasParaVencer } = classificarTreinamento(
      p.status,
      p.class.date,
      p.class.training.validityMonths,
      hoje,
      TREINAMENTO_JANELA_DIAS
    );
    return {
      id: p.id,
      personId: p.person.id,
      personName: p.person.name,
      trainingName: p.class.training.name,
      classDate: p.class.date,
      status: p.status,
      validadeAte,
      diasParaVencer,
      situacao,
    } satisfies TreinamentoRow;
  });

  const ordem: Record<TreinamentoSituacao, number> = {
    VENCIDO: 0,
    A_VENCER: 1,
    PENDENTE: 2,
    VALIDO: 3,
    SEM_VALIDADE: 4,
  };
  return rows.sort((a, b) => {
    if (ordem[a.situacao] !== ordem[b.situacao]) return ordem[a.situacao] - ordem[b.situacao];
    return (a.diasParaVencer ?? 9999) - (b.diasParaVencer ?? 9999);
  });
}

// ─── Pendências documentais ──────────────────────────────────────────────────

export type PendenciaRow = {
  key: string;
  personId: string;
  personName: string;
  tipo: "DOCUMENTO_VENCIDO" | "DOCUMENTO_VENCENDO" | "ADMISSAO_INCOMPLETA" | "EXAME_PENDENTE";
  descricao: string;
  referencia: Date | null;
  diasParaVencer: number | null;
};

export const DOCUMENTO_JANELA_DIAS = 30;

// Consolida num só lugar o que hoje só aparecia espalhado por tela (documento
// com vencimento, admissão que não fechou, exame sem ASO).
export async function getRelatorioPendencias(ctx: AuthContext, hoje = new Date()): Promise<PendenciaRow[]> {
  const prisma = getPrisma();
  const limite = new Date(hoje.getTime() + DOCUMENTO_JANELA_DIAS * DAY_MS);

  const [docs, admissoesAbertas, examesPendentes] = await Promise.all([
    prisma.document.findMany({
      where: { tenantId: ctx.tenantId, entityType: "PERSON", expiresAt: { not: null, lte: limite } },
      select: { id: true, entityId: true, fileName: true, category: true, expiresAt: true },
    }),
    prisma.person.findMany({
      where: { tenantId: ctx.tenantId, type: "COLABORADOR", employmentStatus: "ADMISSAO_EM_ANDAMENTO" },
      select: { id: true, name: true, admissionDate: true },
    }),
    prisma.exameAdmissional.findMany({
      where: { tenantId: ctx.tenantId, status: { notIn: ["ASO_APTO", "ASO_INAPTO", "ASO_APTO_COM_RESTRICAO"] } },
      include: { person: { select: { id: true, name: true } } },
    }),
  ]);

  const personIds = [...new Set(docs.map((d) => d.entityId))];
  const people = personIds.length
    ? await prisma.person.findMany({ where: { id: { in: personIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(people.map((p) => [p.id, p.name]));

  const rows: PendenciaRow[] = [];

  for (const d of docs) {
    if (!d.expiresAt) continue;
    const dias = daysUntil(d.expiresAt, hoje);
    rows.push({
      key: `doc:${d.id}`,
      personId: d.entityId,
      personName: nameById.get(d.entityId) ?? "—",
      tipo: dias < 0 ? "DOCUMENTO_VENCIDO" : "DOCUMENTO_VENCENDO",
      descricao: `${d.category} — ${d.fileName}`,
      referencia: d.expiresAt,
      diasParaVencer: dias,
    });
  }

  for (const p of admissoesAbertas) {
    rows.push({
      key: `adm:${p.id}`,
      personId: p.id,
      personName: p.name,
      tipo: "ADMISSAO_INCOMPLETA",
      descricao: "Admissão em andamento — documentação não concluída",
      referencia: p.admissionDate,
      diasParaVencer: null,
    });
  }

  for (const e of examesPendentes) {
    rows.push({
      key: `exame:${e.id}`,
      personId: e.person.id,
      personName: e.person.name,
      tipo: "EXAME_PENDENTE",
      descricao: `Exame admissional sem ASO conferido (${e.status})`,
      referencia: e.asoDueDate,
      diasParaVencer: e.asoDueDate ? daysUntil(e.asoDueDate, hoje) : null,
    });
  }

  const ordem: Record<PendenciaRow["tipo"], number> = {
    DOCUMENTO_VENCIDO: 0,
    EXAME_PENDENTE: 1,
    ADMISSAO_INCOMPLETA: 2,
    DOCUMENTO_VENCENDO: 3,
  };
  return rows.sort((a, b) => {
    if (ordem[a.tipo] !== ordem[b.tipo]) return ordem[a.tipo] - ordem[b.tipo];
    return (a.diasParaVencer ?? 9999) - (b.diasParaVencer ?? 9999);
  });
}

// ─── Distorção salarial ──────────────────────────────────────────────────────

export type DistorcaoTipo = "ABAIXO_FAIXA" | "ACIMA_FAIXA" | "SEM_FAIXA" | "SEM_CARGO";

export type DistorcaoRow = {
  personId: string;
  personName: string;
  cargoName: string | null;
  companyName: string | null;
  salary: number | null;
  rangeMin: number | null;
  rangeMax: number | null;
  tipo: DistorcaoTipo;
  desvioPct: number | null;
};

// Compara o salário com a faixa do próprio cargo. O dado (Cargo.salaryRangeMin/
// Max + Person.currentSalary) já existia; ninguém cruzava.
export function classificarDistorcao(
  salary: number | null,
  rangeMin: number | null,
  rangeMax: number | null,
  temCargo: boolean
): { tipo: DistorcaoTipo; desvioPct: number | null } {
  if (!temCargo) return { tipo: "SEM_CARGO", desvioPct: null };
  if (salary == null || (rangeMin == null && rangeMax == null)) return { tipo: "SEM_FAIXA", desvioPct: null };
  if (rangeMin != null && salary < rangeMin) {
    return { tipo: "ABAIXO_FAIXA", desvioPct: Math.round(((salary - rangeMin) / rangeMin) * 1000) / 10 };
  }
  if (rangeMax != null && salary > rangeMax) {
    return { tipo: "ACIMA_FAIXA", desvioPct: Math.round(((salary - rangeMax) / rangeMax) * 1000) / 10 };
  }
  return { tipo: "SEM_FAIXA", desvioPct: null };
}

export type DistorcaoResult = { permitido: boolean; rows: DistorcaoRow[] };

export async function getRelatorioDistorcoes(ctx: AuthContext): Promise<DistorcaoResult> {
  // Salário é campo sensível — sem permissão, o relatório inteiro não abre
  // (não adianta esconder a coluna: o relatório É sobre salário).
  if (!(await canViewSensitiveField(ctx, "SALARIO"))) return { permitido: false, rows: [] };

  const prisma = getPrisma();
  const people = await prisma.person.findMany({
    where: {
      tenantId: ctx.tenantId,
      type: "COLABORADOR",
      active: true,
      employmentStatus: { not: "DESLIGADO" },
    },
    select: {
      id: true,
      name: true,
      currentSalary: true,
      currentCompany: { select: { name: true } },
      cargo: { select: { name: true, salaryRangeMin: true, salaryRangeMax: true } },
    },
  });

  const rows: DistorcaoRow[] = people.map((p) => {
    const salary = p.currentSalary != null ? Number(p.currentSalary) : null;
    const rangeMin = p.cargo?.salaryRangeMin != null ? Number(p.cargo.salaryRangeMin) : null;
    const rangeMax = p.cargo?.salaryRangeMax != null ? Number(p.cargo.salaryRangeMax) : null;
    const { tipo, desvioPct } = classificarDistorcao(salary, rangeMin, rangeMax, !!p.cargo);
    return {
      personId: p.id,
      personName: p.name,
      cargoName: p.cargo?.name ?? null,
      companyName: p.currentCompany?.name ?? null,
      salary,
      rangeMin,
      rangeMax,
      tipo,
      desvioPct,
    };
  });

  // Só o que exige ação aparece: dentro da faixa não é distorção.
  const relevantes = rows.filter((r) => r.tipo === "ABAIXO_FAIXA" || r.tipo === "ACIMA_FAIXA");
  relevantes.sort((a, b) => Math.abs(b.desvioPct ?? 0) - Math.abs(a.desvioPct ?? 0));
  return { permitido: true, rows: relevantes };
}
