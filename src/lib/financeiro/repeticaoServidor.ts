// As séries da repetição que não nascem inteiras (21/10, o que sobrou da fila
// do BPO): a que vai até uma data ou não tem fim nasce até o horizonte, e é
// aqui que as próximas contas nascem conforme o tempo anda. Roda no agendador
// interno (src/lib/alerts.ts, a cada 15 minutos); sem nada a criar, é uma
// consulta por índice.
//
// A conta nova copia a última da série que não foi cancelada — então o que a
// pessoa mudou numa conta (valor, categoria, centro, contraparte) vale para as
// que nascerem depois dela. A posição, o vencimento e a competência vêm da
// regra (`FinanceRecurrence`), e não da conta copiada.

import { randomUUID } from "crypto";
import { getPrisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { saoPauloParts } from "@/lib/agenda";
import { feriadosDoEscritorio } from "@/lib/feriados";
import { instanteDaData } from "./periodo";
import { statusInicialDoManual } from "./manual";
import { contextoDeEntrada, registrarEnvios } from "./aprovacao/servidor";
import { rateioDaConta, gravarRateio } from "./rateioServidor";
import { horizonteDaSerie, ocorrenciasDaRepeticao, type AjusteDoDia, type FimDaSerie, type Frequencia, type Repeticao } from "./repeticao";

/** Séries por passada — sobra para a próxima, 15 minutos depois. */
const SERIES_POR_VEZ = 200;

/** A regra gravada, de volta no formato das funções puras. Nula se a linha não faz sentido. */
export function repeticaoDaSerie(s: {
  frequency: string;
  dayAdjust: string;
  endMode: string;
  endDate: string | null;
  dueDay?: number | null;
}): Repeticao | null {
  const fim: FimDaSerie | null =
    s.endMode === "SEM_FIM" ? { tipo: "SEM_FIM" } : s.endMode === "ATE" && s.endDate ? { tipo: "ATE", dataKey: s.endDate } : null;
  if (!fim) return null;
  // O dia que mudou no "daqui em diante" (22/10/2026) vale para as que nascerem.
  return { frequencia: s.frequency as Frequencia, ajuste: s.dayAdjust as AjusteDoDia, fim, ...(s.dueDay ? { dia: s.dueDay } : {}) };
}

export type ResultadoDaExtensao = { series: number; criadas: number };

export async function estenderSeries(p: { hojeKey?: string } = {}): Promise<ResultadoDaExtensao> {
  const prisma = getPrisma();
  const hojeKey = p.hojeKey ?? saoPauloParts(new Date()).dateKey;
  const series = await prisma.financeRecurrence.findMany({
    where: { active: true, endMode: { in: ["ATE", "SEM_FIM"] } },
    orderBy: { updatedAt: "asc" },
    take: SERIES_POR_VEZ,
  });

  const feriadosDo = new Map<string, Set<string>>();
  let criadas = 0;
  let estendidas = 0;
  for (const s of series) {
    if (s.total !== null && s.lastIndex >= s.total) continue;
    const r = repeticaoDaSerie(s);
    if (!r) continue;
    if (!feriadosDo.has(s.tenantId)) feriadosDo.set(s.tenantId, new Set((await feriadosDoEscritorio(s.tenantId)).keys()));
    const novas = ocorrenciasDaRepeticao(
      { vencimentoKey: s.firstDueDate, competencia: s.firstCompetence },
      r,
      feriadosDo.get(s.tenantId),
      horizonteDaSerie(r.frequencia, hojeKey)
    ).filter((o) => o.indice > s.lastIndex);
    if (novas.length === 0) continue;

    const modelo = await prisma.financeEntry.findFirst({
      where: { tenantId: s.tenantId, companyId: s.companyId, recurrenceId: s.id, status: { not: "CANCELADO" } },
      orderBy: { recurrenceIndex: "desc" },
      select: {
        id: true,
        kind: true,
        counterpartyId: true,
        categoryId: true,
        costCenterId: true,
        projectId: true,
        bankAccountId: true,
        amount: true,
        description: true,
      },
    });
    // Todas canceladas uma a uma: a série acabou, como no "cancelar esta e as próximas".
    if (!modelo) {
      await prisma.financeRecurrence.updateMany({ where: { id: s.id, active: true }, data: { active: false } });
      continue;
    }

    const status = statusInicialDoManual(null);
    const aprovacao = (await contextoDeEntrada(s.tenantId, [s.companyId])).statusInicial(s.companyId, modelo.kind, status);
    const rateio = await rateioDaConta(s.tenantId, modelo.id);
    const ids = novas.map(() => randomUUID());
    const ultima = novas[novas.length - 1]!.indice;

    const gravou = await prisma.$transaction(async (tx) => {
      // A trava: outra passada que andou antes não cria as mesmas de novo.
      const andou = await tx.financeRecurrence.updateMany({
        where: { id: s.id, active: true, lastIndex: s.lastIndex },
        data: { lastIndex: ultima },
      });
      if (andou.count !== 1) return false;
      await tx.financeEntry.createMany({
        data: novas.map((o, i) => ({
          id: ids[i]!,
          tenantId: s.tenantId,
          companyId: s.companyId,
          kind: modelo.kind,
          status,
          approvalStatus: aprovacao,
          counterpartyId: modelo.counterpartyId,
          categoryId: modelo.categoryId,
          costCenterId: modelo.costCenterId,
          projectId: modelo.projectId,
          bankAccountId: modelo.bankAccountId,
          competence: o.competencia,
          dueDate: instanteDaData(o.vencimentoKey),
          amount: modelo.amount,
          description: modelo.description,
          createdById: s.createdById,
          // Quem lançou a série conferiu a regra; cada conta nova é a mesma conta, em outro vencimento.
          reviewedById: s.createdById,
          reviewedAt: new Date(),
          recurrenceId: s.id,
          recurrenceIndex: o.indice,
          recurrenceTotal: s.total,
        })),
      });
      if (rateio.length > 0) for (const entryId of ids) await gravarRateio(tx, { tenantId: s.tenantId, entryId, linhas: rateio });
      if (aprovacao === "AGUARDANDO") await registrarEnvios(tx, ids, null);
      return true;
    });
    if (!gravou) continue;

    estendidas++;
    criadas += novas.length;
    await logAudit({
      tenantId: s.tenantId,
      // Sem pessoa: quem cria é o agendador. A série guarda quem a lançou.
      userId: "",
      action: "financeiro.entry.created_by_recurrence",
      entityType: "FinanceRecurrence",
      entityId: s.id,
      metadata: { companyId: s.companyId, de: s.lastIndex + 1, ate: ultima, copiadaDe: modelo.id },
    });
  }
  return { series: estendidas, criadas };
}
