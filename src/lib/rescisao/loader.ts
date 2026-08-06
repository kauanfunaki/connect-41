// Monta o input do motor a partir do banco. ÚNICO arquivo impuro de
// src/lib/rescisao/ — o resto é pura aritmética testável.
//
// Regra: quando uma fonte vem vazia, o loader NÃO inventa default numérico.
// Deixa null e o motor devolve NAO_CALCULAVEL pedindo o insumo.

import { getPrisma } from "@/lib/prisma";
import { motivoCanonico } from "./motivos";
import { resolveRescisaoConfig, type RescisaoConfigResolvida } from "./config";
import type { RescisaoInput, PeriodoFerias } from "./calculo";

type Args = { tenantId: string; personId: string; terminationId: string };

export type RescisaoContexto = {
  input: RescisaoInput;
  config: RescisaoConfigResolvida;
  /** Empresa usada pra resolver a config — null quando a pessoa não tem vínculo. */
  companyId: string | null;
};

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function carregarContextoRescisao({
  tenantId,
  personId,
  terminationId,
}: Args): Promise<RescisaoContexto | null> {
  const prisma = getPrisma();

  const termination = await prisma.termination.findFirst({
    where: { id: terminationId, tenantId, personId },
  });
  if (!termination) return null;

  const person = await prisma.person.findFirst({
    where: { id: personId, tenantId },
    select: {
      id: true,
      admissionDate: true,
      currentSalary: true,
      currentCompanyId: true,
    },
  });
  if (!person) return null;

  const companyId = person.currentCompanyId;

  // Config: padrão legal → tenant → empresa (campo a campo).
  const [tenantConfig, companyConfig] = await Promise.all([
    prisma.tenantRescisaoConfig.findUnique({ where: { tenantId } }),
    companyId ? prisma.companyRescisaoConfig.findUnique({ where: { companyId } }) : Promise.resolve(null),
  ]);
  const config = resolveRescisaoConfig(
    tenantConfig ? { ...tenantConfig, toleranciaPct: toNumber(tenantConfig.toleranciaPct) } : null,
    companyConfig ? { ...companyConfig, toleranciaPct: toNumber(companyConfig.toleranciaPct) } : null
  );

  // A data do término é o eixo do cálculo inteiro. Sem ela cai em requestedAt,
  // que é quando o desligamento foi REGISTRADO — só como último recurso.
  const desligamento = termination.terminationDate ?? termination.requestedAt;

  // Férias: vencidas = período concessivo já expirado; o aquisitivo em curso é
  // o mais recente ainda em aberto. Mesma fonte que a tela de conferência usa.
  const vacations = await prisma.vacation.findMany({
    where: { tenantId, personId, status: { notIn: ["CONCLUIDA", "CANCELADA"] } },
    orderBy: { acquisitivePeriodStart: "asc" },
  });

  const feriasVencidas: PeriodoFerias[] = vacations
    .filter((v) => v.concessivePeriodEnd != null && v.concessivePeriodEnd < desligamento)
    .map((v) => ({ inicio: v.acquisitivePeriodStart, fim: v.acquisitivePeriodEnd, dias: v.days }));

  const emCurso = vacations.filter((v) => v.acquisitivePeriodEnd >= desligamento).at(0);
  const inicioPeriodoAquisitivoAtual = emCurso?.acquisitivePeriodStart ?? null;

  // Médias de variáveis: soma dos adicionais e HE lançados nas últimas N
  // competências da empresa, dividida pela janela configurada.
  let mediaVariaveis: number | null = null;
  if (companyId) {
    const entries = await prisma.payrollEntry.findMany({
      where: { tenantId, personId, competency: { companyId } },
      orderBy: [{ competency: { year: "desc" } }, { competency: { month: "desc" } }],
      take: config.valores.mediaMeses,
      select: {
        nightShiftAllowance: true,
        hazardPay: true,
        unhealthyPay: true,
      },
    });
    if (entries.length > 0) {
      const soma = entries.reduce(
        (acc, e) =>
          acc + (toNumber(e.nightShiftAllowance) ?? 0) + (toNumber(e.hazardPay) ?? 0) + (toNumber(e.unhealthyPay) ?? 0),
        0
      );
      // Divide pelo número de competências REALMENTE encontradas, não pela
      // janela cheia — senão 3 meses lançados numa janela de 12 viram média
      // artificialmente baixa.
      mediaVariaveis = soma > 0 ? soma / entries.length : null;
    }
  }

  // Faltas: o valor informado na rescisão manda; sem ele, soma os afastamentos
  // do tipo falta lançados no período aquisitivo em curso.
  let faltasInjustificadas = termination.unjustifiedAbsences;
  if (faltasInjustificadas == null && inicioPeriodoAquisitivoAtual) {
    const absences = await prisma.absence.aggregate({
      where: {
        tenantId,
        personId,
        startDate: { gte: inicioPeriodoAquisitivoAtual, lte: desligamento },
        status: { not: "REPROVADO" },
      },
      _sum: { lostDays: true },
    });
    faltasInjustificadas = absences._sum.lostDays ?? null;
  }

  const input: RescisaoInput = {
    motivo: motivoCanonico(termination.type),
    admissao: person.admissionDate ?? desligamento,
    desligamento,
    avisoIndenizado: termination.noticeType === "INDENIZADO",
    avisoDispensado: termination.noticeType === "DISPENSADO",
    salarioBase: toNumber(person.currentSalary),
    feriasVencidas,
    inicioPeriodoAquisitivoAtual,
    faltasInjustificadas,
    mediaVariaveis,
    saldoFgtsInformado: toNumber(termination.fgtsBalanceInformed),
    decimoTerceiroAdiantado: toNumber(termination.thirteenthAdvancePaid),
    aprendiz: termination.apprentice,
  };

  return { input, config, companyId };
}
