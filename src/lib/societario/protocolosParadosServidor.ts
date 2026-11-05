// A lista dos protocolos parados no órgão (Exigências A, página de opções de
// 04/11/2026). Até aqui o protocolo parado era só uma configuração no pé da
// tela de Exigências ("Cobrar o órgão do protocolo parado") e um aviso no sino;
// agora é uma aba com a lista de trabalho: quanto tempo está parado, quando
// foi cobrado pela última vez e o "Registrar cobrança" por linha.
//
// "Parado" é a mesma régua do aviso (`protocoloParado`): pendente há N dias ou
// mais, com o processo em andamento. Com o aviso desligado (N = 0), a lista
// usa o padrão — desligar o sino não pode esconder a lista.
//
// A cobrança feita por alguém do setor fica na auditoria
// (`societario.protocolo.cobrado`), e o aviso automático, em `AlertDispatch`
// (a chave de cada volta). A última das duas é a "Última cobrança".

import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { SO_EMPRESA_DE_VERDADE } from "@/lib/demonstracao/marca";
import { COBRAR_APOS_DIAS_PADRAO, chaveDoProtocoloParado, protocoloParado } from "./protocoloParado";

export const ACAO_DA_COBRANCA = "societario.protocolo.cobrado";

const DIA_MS = 24 * 60 * 60 * 1000;
const TETO = 300;

export type ProtocoloParadoNaTela = {
  id: string;
  processoId: string;
  processo: string;
  empresa: string;
  orgao: string;
  numero: string | null;
  tentativa: number;
  protocoladoEm: Date;
  diasParado: number;
  responsavel: string | null;
  ultimaCobranca: { quando: Date; quem: string } | null;
};

/** O prazo da lista: o do aviso, ou o padrão com o aviso desligado. */
export const diasDaLista = (dias: number) => (dias > 0 ? dias : COBRAR_APOS_DIAS_PADRAO);

/** O que mais tempo está parado primeiro. */
export async function listarProtocolosParados(
  tenantId: string,
  dias: number,
  agora = new Date()
): Promise<ProtocoloParadoNaTela[]> {
  const prazo = diasDaLista(dias);
  const prisma = getPrisma();
  const protocolos = await prisma.processProtocol.findMany({
    where: {
      tenantId,
      outcome: "PENDENTE",
      submittedAt: { lte: new Date(agora.getTime() - prazo * DIA_MS) },
      process: { tenantId, status: { in: ["EM_ANDAMENTO", "AGUARDANDO_ORGAO"] }, company: SO_EMPRESA_DE_VERDADE },
    },
    select: {
      id: true,
      number: true,
      attempt: true,
      submittedAt: true,
      organ: { select: { name: true } },
      process: {
        select: {
          id: true,
          title: true,
          type: { select: { name: true } },
          company: { select: { name: true, displayName: true } },
          owner: { select: { name: true } },
        },
      },
    },
    orderBy: { submittedAt: "asc" },
    take: TETO,
  });
  if (protocolos.length === 0) return [];

  const ids = protocolos.map((p) => p.id);
  // As chaves de todas as voltas que já podem ter saído (1ª aos N dias, 2ª aos 2N…).
  const chaves =
    dias > 0
      ? protocolos.flatMap((p) => {
          const parado = protocoloParado(p.submittedAt, agora, dias);
          return parado ? Array.from({ length: parado.volta }, (_, i) => chaveDoProtocoloParado(p.id, i + 1)) : [];
        })
      : [];

  const [manuais, automaticos] = await Promise.all([
    prisma.auditLog.findMany({
      where: { tenantId, action: ACAO_DA_COBRANCA, entityType: "ProcessProtocol", entityId: { in: ids } },
      select: { entityId: true, createdAt: true, actorName: true },
      orderBy: { createdAt: "desc" },
    }),
    chaves.length > 0
      ? prisma.alertDispatch.findMany({ where: { tenantId, alertKey: { in: chaves } }, select: { alertKey: true, sentOn: true } })
      : Promise.resolve([]),
  ]);

  const ultima = new Map<string, { quando: Date; quem: string }>();
  const guardar = (id: string, quando: Date, quem: string) => {
    const atual = ultima.get(id);
    if (!atual || quando > atual.quando) ultima.set(id, { quando, quem });
  };
  for (const m of manuais) if (m.entityId) guardar(m.entityId, m.createdAt, m.actorName ?? "Alguém do setor");
  for (const a of automaticos) {
    const id = a.alertKey.split(":")[1];
    if (id) guardar(id, a.sentOn, "aviso automático");
  }

  return protocolos.map((p) => ({
    id: p.id,
    processoId: p.process.id,
    processo: p.process.title ? `${p.process.type.name} — ${p.process.title}` : p.process.type.name,
    empresa: nomeExibicao(p.process.company),
    orgao: p.organ.name,
    numero: p.number,
    tentativa: p.attempt,
    protocoladoEm: p.submittedAt,
    diasParado: Math.floor((agora.getTime() - p.submittedAt.getTime()) / DIA_MS),
    responsavel: p.process.owner?.name ?? null,
    ultimaCobranca: ultima.get(p.id) ?? null,
  }));
}
