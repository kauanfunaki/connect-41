// O lado do banco da vigilância da inscrição estadual (robô do Societário,
// 30/10/2026): quais empresas o robô lê na rodada e o que fazer com cada
// leitura. A regra está em ./inscricaoEstadual.ts.
//
// Quem chama `registrarSituacaoDaIE` é a rota do robô, quando ele devolver a
// tarefa do CICAD; a fila de tarefas é do robô do Societário (robot_tasks).

import { getPrisma } from "@/lib/prisma";
import { notifySector } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { nomeExibicao } from "@/lib/companyName";
import {
  avisoDaMudancaDaIE,
  ehSituacaoDaIE,
  lerSituacaoDaIE,
  precisaVigiarIE,
  UF_DA_VIGILANCIA,
  type SituacaoDaIE,
} from "./inscricaoEstadual";

const SETOR = "societario";

/** As empresas da próxima rodada, das nunca lidas para as lidas há mais tempo. */
export async function empresasParaVigiarIE(tenantId: string, agora: Date, limite: number): Promise<{ id: string; stateRegistration: string }[]> {
  const empresas = await getPrisma().company.findMany({
    where: { tenantId, status: "ACTIVE", stateCode: UF_DA_VIGILANCIA, stateRegistration: { not: null } },
    select: { id: true, stateRegistration: true, stateCode: true, stateRegistrationCheckedAt: true },
  });
  return empresas
    .filter((e) => precisaVigiarIE(e, agora))
    .sort((a, b) => (a.stateRegistrationCheckedAt?.getTime() ?? 0) - (b.stateRegistrationCheckedAt?.getTime() ?? 0))
    .slice(0, limite)
    .map((e) => ({ id: e.id, stateRegistration: e.stateRegistration! }));
}

export type ResultadoDaLeituraDaIE =
  | { tipo: "sem_empresa" }
  | { tipo: "nao_reconhecida"; texto: string }
  | { tipo: "igual"; situacao: SituacaoDaIE }
  | { tipo: "mudou"; de: SituacaoDaIE | null; para: SituacaoDaIE; avisou: boolean };

/**
 * Grava o que o robô leu no campo "Situação Atual". Texto que não é nenhuma
 * das quatro situações não muda nada: volta para o robô registrar a falha e a
 * captura da tela. A mesma situação só marca a hora da leitura.
 */
export async function registrarSituacaoDaIE(p: { tenantId: string; companyId: string; texto: string; lidaEm: Date }): Promise<ResultadoDaLeituraDaIE> {
  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({
    where: { id: p.companyId, tenantId: p.tenantId },
    select: { id: true, name: true, displayName: true, stateRegistrationStatus: true },
  });
  if (!empresa) return { tipo: "sem_empresa" };

  const nova = lerSituacaoDaIE(p.texto);
  if (!nova) return { tipo: "nao_reconhecida", texto: p.texto.slice(0, 120) };

  const anterior = ehSituacaoDaIE(empresa.stateRegistrationStatus) ? empresa.stateRegistrationStatus : null;
  if (anterior === nova) {
    await prisma.company.updateMany({ where: { id: empresa.id, tenantId: p.tenantId }, data: { stateRegistrationCheckedAt: p.lidaEm } });
    return { tipo: "igual", situacao: nova };
  }

  await prisma.company.updateMany({
    where: { id: empresa.id, tenantId: p.tenantId },
    data: { stateRegistrationStatus: nova, stateRegistrationCheckedAt: p.lidaEm, stateRegistrationChangedAt: p.lidaEm },
  });
  await logAudit({
    tenantId: p.tenantId,
    userId: "", // o robô: sem pessoa (vira null na trilha)
    action: "company.ie_situacao",
    entityType: "Company",
    entityId: empresa.id,
    metadata: { de: anterior, para: nova, texto: p.texto.slice(0, 120) },
  });

  const aviso = avisoDaMudancaDaIE(anterior, nova, nomeExibicao(empresa));
  if (aviso) {
    await notifySector(SETOR, {
      tenantId: p.tenantId,
      type: "IE_SITUACAO_MUDOU",
      message: aviso.mensagem,
      entityType: "COMPANY",
      entityId: empresa.id,
    });
  }
  return { tipo: "mudou", de: anterior, para: nova, avisou: aviso !== null };
}
