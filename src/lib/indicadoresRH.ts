// Os dados dos Indicadores de RH: a tela (`carregarIndicadoresRH`) e a
// exportação em PDF/Excel (`getIndicadoresRH`), que reaproveita as mesmas
// consultas para não duplicar o cálculo.
//
// 05/11/2026 (opção A da tela 9): a tela passou a 4 números e 4 gráficos mês a
// mês. As contas ficam em `indicadoresRHMensal.ts` (puras, com teste); aqui só
// o banco. Uma espera só: tudo num `Promise.all`, e a permissão de ver salário
// chega de quem chama, em vez de ser consultada de novo aqui dentro.
import { getPrisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth/context";
import { canViewSensitiveField } from "@/lib/auth/sensitiveFields";
import { AVISO_DAS_FERIAS_DIAS } from "@/lib/home/paineis";
import { FERIAS_EM_ABERTO } from "@/lib/ferias/regras";
import { formatarReais } from "@/lib/format";
import {
  absenteismo,
  diasUteisDosUltimos,
  feriasMensais,
  funilDoPeriodo,
  horasExtrasMensais,
  mesesDaJanela,
  noQuadroHoje,
  quadroMensal,
  tempoMedioDeContratacao,
  turnover,
  variacaoDoQuadro,
  type EtapaDoFunil,
  type Mes,
  type MesDasFerias,
  type MesDoQuadro,
} from "@/lib/indicadoresRHMensal";

/** Quantos meses a tela guarda: o turnover é de 12, e os gráficos mostram 6 ou 12. */
export const MESES_DO_HISTORICO = 12;
/** O funil é do trimestre: o mês atual e os dois anteriores. */
const MESES_DO_FUNIL = 3;
/** Absenteísmo e (na exportação) as contagens antigas: os últimos 30 dias. */
const DIAS_RECENTES = 30;

export type IndicadoresRH = {
  meses: Mes[];
  quadro: MesDoQuadro[];
  headcount: number;
  /** Headcount de hoje menos o do fim do mês de 6 meses atrás. */
  variacao6m: number | null;
  /** Turnover dos 12 meses, em %. */
  turnover12m: number | null;
  absenteismo: { pct: number | null; diasPerdidos: number };
  vagasAbertas: number;
  /** Dias, em média, entre a candidatura e a contratação (todas as contratações com data). */
  tempoDeContratacao: number | null;
  ferias: MesDasFerias[];
  horasExtras: { mes: Mes; horas: number }[];
  funil: { meses: Mes[]; etapas: EtapaDoFunil[]; reprovadas: number; desistentes: number };
  /** Só para quem vê salário; `null` para os outros. */
  custos: { folha: number; beneficios: number } | null;
};

function diasAtras(agora: Date, dias: number): Date {
  const d = new Date(agora);
  d.setDate(d.getDate() - dias);
  return d;
}

/** O primeiro instante do mês em São Paulo (fixo em -03:00, sem horário de verão). */
function inicioDoMes(mes: Mes): Date {
  return new Date(`${mes}-01T00:00:00-03:00`);
}

export async function carregarIndicadoresRH(
  ctx: AuthContext,
  {
    veSalario,
    agora = new Date(),
  }: {
    /** Pode ser a promessa da permissão: só as duas somas de custo esperam por ela. */
    veSalario: boolean | Promise<boolean>;
    agora?: Date;
  }
): Promise<IndicadoresRH> {
  const prisma = getPrisma();
  const tenantId = ctx.tenantId;
  const meses = mesesDaJanela(agora, MESES_DO_HISTORICO);
  const desde = inicioDoMes(meses[0]);
  const mesesDoFunil = meses.slice(-MESES_DO_FUNIL);
  const recentes = diasAtras(agora, DIAS_RECENTES);

  const [pessoas, ausencias, horas, vagasAbertas, contratadas, ferias, candidaturas, folha, beneficios] = await Promise.all([
    // Só quem pode aparecer na janela: no quadro hoje, ou que entrou ou saiu
    // dentro dela. Quem saiu antes dela não muda nenhum ponto.
    prisma.person.findMany({
      where: {
        tenantId,
        type: "COLABORADOR",
        OR: [{ active: true, employmentStatus: { not: "DESLIGADO" } }, { dismissalDate: { gte: desde } }, { admissionDate: { gte: desde } }],
      },
      select: { admissionDate: true, dismissalDate: true, active: true, employmentStatus: true },
    }),
    // REPROVADO = solicitação de ausência negada — não é dia perdido.
    prisma.absence.aggregate({
      where: { tenantId, startDate: { gte: recentes }, status: { not: "REPROVADO" } },
      _sum: { lostDays: true },
    }),
    // Somadas no banco por dia: uma linha por data, e não uma por lançamento.
    prisma.overtimeEntry.groupBy({
      by: ["date"],
      where: { tenantId, date: { gte: desde } },
      _sum: { overtimeHours: true },
    }),
    prisma.vaga.count({ where: { tenantId, status: "ABERTA" } }),
    prisma.candidatura.findMany({
      where: { tenantId, status: "CONTRATADO", hiredAt: { not: null } },
      select: { createdAt: true, hiredAt: true },
    }),
    // As em aberto hoje e as que fecharam dentro da janela (para os meses de antes).
    prisma.vacation.findMany({
      where: {
        tenantId,
        OR: [
          { status: { in: [...FERIAS_EM_ABERTO] } },
          { status: "CONCLUIDA", returnDate: { gte: desde } },
          { status: "CONCLUIDA", returnDate: null, updatedAt: { gte: desde } },
        ],
      },
      select: { concessivePeriodEnd: true, status: true, returnDate: true, updatedAt: true },
    }),
    prisma.candidatura.findMany({
      where: { tenantId, createdAt: { gte: inicioDoMes(mesesDoFunil[0]) } },
      select: { stage: true, status: true },
    }),
    Promise.resolve(veSalario).then((pode) =>
      pode
        ? prisma.payrollEntry.aggregate({
            where: { tenantId, competency: { month: Number(meses[meses.length - 1].slice(5, 7)), year: Number(meses[meses.length - 1].slice(0, 4)) } },
            _sum: { grossSalary: true },
          })
        : null
    ),
    Promise.resolve(veSalario).then((pode) =>
      pode ? prisma.benefitAssignment.aggregate({ where: { tenantId, status: "ATIVO" }, _sum: { companyValue: true } }) : null
    ),
  ]);

  const quadro = quadroMensal(pessoas, meses);
  const headcount = pessoas.filter(noQuadroHoje).length;
  const diasPerdidos = ausencias._sum.lostDays ?? 0;

  return {
    meses,
    quadro,
    headcount,
    variacao6m: variacaoDoQuadro(quadro, 6),
    turnover12m: turnover(quadro),
    absenteismo: { pct: absenteismo(diasPerdidos, headcount, diasUteisDosUltimos(agora, DIAS_RECENTES)), diasPerdidos },
    vagasAbertas,
    tempoDeContratacao: tempoMedioDeContratacao(contratadas),
    ferias: feriasMensais(ferias, meses, agora),
    horasExtras: horasExtrasMensais(
      horas.map((h) => ({ date: h.date, horas: Number(h._sum.overtimeHours ?? 0) })),
      meses
    ),
    funil: {
      meses: mesesDoFunil,
      etapas: funilDoPeriodo(candidaturas),
      reprovadas: candidaturas.filter((c) => c.status === "REPROVADO").length,
      desistentes: candidaturas.filter((c) => c.status === "DESISTENTE").length,
    },
    custos:
      folha && beneficios
        ? { folha: Number(folha._sum?.grossSalary ?? 0), beneficios: Number(beneficios._sum?.companyValue ?? 0) }
        : null,
  };
}

// ─── Exportação ────────────────────────────────────────────────────────────

export type IndicadorCard = { label: string; value: string; hint?: string };

function fmtInt(n: number): string {
  return Number(n).toLocaleString("pt-BR");
}

function fmtDecimal(n: number, digits = 1): string {
  return Number(n).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function pct(n: number | null): string {
  return n === null ? "—" : `${fmtDecimal(n, 1)}%`;
}

/**
 * Os números do PDF e do Excel: os quatro da tela e, depois, os que saíram
 * dela (05/11) mas continuam na exportação — quem baixa a planilha não perde
 * nenhuma linha de antes.
 */
export async function getIndicadoresRH(ctx: AuthContext): Promise<IndicadorCard[]> {
  const prisma = getPrisma();
  const tenantId = ctx.tenantId;
  const agora = new Date();
  const recentes = diasAtras(agora, DIAS_RECENTES);
  const ultimos90 = diasAtras(agora, 90);

  const [d, admissoes, demissoes, vagas, candidaturasTotal, contratadas, reprovadas, treinamentos, desempenho] = await Promise.all([
    carregarIndicadoresRH(ctx, { veSalario: canViewSensitiveField(ctx, "SALARIO"), agora }),
    prisma.person.count({ where: { tenantId, type: "COLABORADOR", admissionDate: { gte: recentes } } }),
    prisma.termination.count({ where: { tenantId, status: "FINALIZADO", finalizedAt: { gte: recentes } } }),
    prisma.vaga.count({ where: { tenantId } }),
    prisma.candidatura.count({ where: { tenantId } }),
    prisma.candidatura.count({ where: { tenantId, status: "CONTRATADO" } }),
    prisma.candidatura.count({ where: { tenantId, status: "REPROVADO" } }),
    prisma.trainingParticipant.count({ where: { tenantId, status: { in: ["REALIZADO", "CONCLUIDO"] }, createdAt: { gte: ultimos90 } } }),
    prisma.evaluation.aggregate({ where: { tenantId }, _avg: { averageScore: true } }),
  ]);

  const resolvidas = contratadas + reprovadas;
  const taxa = (n: number) => (resolvidas > 0 ? `${fmtInt(Math.round((n / resolvidas) * 100))}%` : "—");
  const feriasHoje = d.ferias[d.ferias.length - 1];
  const horasDoMes = d.horasExtras[d.horasExtras.length - 1].horas;

  const cards: IndicadorCard[] = [
    { label: "Headcount", value: fmtInt(d.headcount), hint: "Colaboradores ativos" },
    { label: "Variação do headcount (6 meses)", value: d.variacao6m === null ? "—" : `${d.variacao6m > 0 ? "+" : ""}${fmtInt(d.variacao6m)}` },
    { label: "Turnover (12 meses)", value: pct(d.turnover12m), hint: "Desligamentos / headcount médio" },
    { label: "Absenteísmo (30 dias)", value: pct(d.absenteismo.pct), hint: `${fmtInt(d.absenteismo.diasPerdidos)} dias perdidos` },
    { label: "Vagas abertas", value: fmtInt(d.vagasAbertas) },
    { label: "Tempo médio de contratação", value: d.tempoDeContratacao === null ? "—" : `${fmtInt(d.tempoDeContratacao)} dias` },
    { label: "Admissões (30 dias)", value: fmtInt(admissoes) },
    { label: "Demissões (30 dias)", value: fmtInt(demissoes) },
    { label: "Horas extras (mês atual)", value: `${fmtDecimal(horasDoMes, 1)}h` },
    { label: "Férias vencidas", value: fmtInt(feriasHoje.vencidas) },
    { label: `Férias a vencer (${AVISO_DAS_FERIAS_DIAS} dias)`, value: fmtInt(feriasHoje.aVencer), hint: "Período concessivo acabando" },
    { label: "Candidatos por vaga", value: vagas > 0 ? fmtDecimal(candidaturasTotal / vagas, 1) : "—" },
    { label: "Taxa de aprovação", value: taxa(contratadas) },
    { label: "Taxa de reprovação", value: taxa(reprovadas) },
    { label: "Treinamentos realizados (90 dias)", value: fmtInt(treinamentos) },
    {
      label: "Desempenho médio",
      value: desempenho._avg.averageScore != null ? fmtDecimal(Number(desempenho._avg.averageScore), 2) : "—",
    },
  ];

  if (d.custos) {
    cards.push(
      { label: "Custo de folha (mês atual)", value: formatarReais(d.custos.folha) },
      { label: "Custo de benefícios (ativos)", value: formatarReais(d.custos.beneficios) }
    );
  }
  return cards;
}
