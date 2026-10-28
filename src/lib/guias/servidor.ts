// O lado do banco das guias (Guias pelo Connect, 28/10/2026): gravar a guia
// emitida, ligar ao envio que a levou ao cliente, listar as do mês e marcar
// como paga. A situação é calculada em ./situacao.ts.

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { nomeExibicao } from "@/lib/companyName";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import { decimalDeCentavos } from "@/lib/financeiro/manual";
import { situacaoDaGuia, type SituacaoDaGuia } from "./situacao";
import type { RegistroDaGuia } from "./registro";

export async function registrarGuiaEmitida(p: {
  tenantId: string;
  companyId: string;
  userId: string;
  registro: RegistroDaGuia;
  driveFileId: string;
}): Promise<string> {
  const r = p.registro;
  const guia = await getPrisma().guia.create({
    data: {
      tenantId: p.tenantId,
      companyId: p.companyId,
      tipo: r.tipo,
      descricao: r.descricao,
      competencia: r.competencia,
      vencimento: r.vencimento,
      validoAte: r.validoAte,
      valor: r.valorCentavos === null ? null : decimalDeCentavos(r.valorCentavos),
      numeroDocumento: r.numeroDocumento,
      origem: "SERPRO",
      driveFileId: p.driveFileId,
      emitidaPorId: p.userId,
    },
    select: { id: true },
  });
  return guia.id;
}

/**
 * O envio que levou o arquivo é o envio da guia. Só liga guia sem envio: a
 * guia mandada duas vezes fica com o primeiro, que é o que o cliente recebeu
 * antes.
 */
export async function ligarGuiaAoEnvio(tenantId: string, driveFileId: string, clientDocumentId: string): Promise<number> {
  const r = await getPrisma().guia.updateMany({
    where: { tenantId, driveFileId, clientDocumentId: null },
    data: { clientDocumentId },
  });
  return r.count;
}

export type GuiaNaTela = {
  id: string;
  companyId: string;
  empresa: string;
  descricao: string;
  competencia: string | null;
  vencimento: string | null;
  validoAte: string | null;
  valorCentavos: number | null;
  situacao: SituacaoDaGuia;
  arquivoId: string | null;
  envioId: string | null;
  pagaEm: Date | null;
  emitidaEm: Date;
};

/** As guias que vencem no mês (sem vencimento, as da competência), da mais urgente para a menos. */
export async function guiasDoMes(
  tenantId: string,
  mes: string,
  hoje: string,
  escopoDaEmpresa: Prisma.CompanyWhereInput = {}
): Promise<GuiaNaTela[]> {
  const guias = await getPrisma().guia.findMany({
    where: {
      tenantId,
      company: escopoDaEmpresa,
      OR: [{ vencimento: { gte: `${mes}-01`, lte: `${mes}-31` } }, { vencimento: null, competencia: mes }],
    },
    select: {
      id: true,
      companyId: true,
      descricao: true,
      competencia: true,
      vencimento: true,
      validoAte: true,
      valor: true,
      driveFileId: true,
      clientDocumentId: true,
      pagaEm: true,
      createdAt: true,
      company: { select: { name: true, displayName: true } },
      clientDocument: { select: { status: true, recipients: { where: { firstViewedAt: { not: null } }, select: { id: true }, take: 1 } } },
    },
    orderBy: [{ vencimento: "asc" }, { createdAt: "asc" }],
    take: 1000,
  });
  return guias.map((g) => ({
    id: g.id,
    companyId: g.companyId,
    empresa: nomeExibicao(g.company),
    descricao: g.descricao,
    competencia: g.competencia,
    vencimento: g.vencimento,
    validoAte: g.validoAte,
    valorCentavos: g.valor === null ? null : centavosDeDecimal(g.valor),
    situacao: situacaoDaGuia(
      {
        vencimento: g.vencimento,
        validoAte: g.validoAte,
        pagaEm: g.pagaEm,
        envio: g.clientDocument ? { publicado: g.clientDocument.status === "PUBLISHED", abertoPeloCliente: g.clientDocument.recipients.length > 0 } : null,
      },
      hoje
    ),
    arquivoId: g.driveFileId,
    envioId: g.clientDocumentId,
    pagaEm: g.pagaEm,
    emitidaEm: g.createdAt,
  }));
}

/** Marca (ou desmarca) como paga. Devolve a empresa da guia, para o foco e o registro; nulo se a guia não é do tenant. */
export async function marcarGuiaComoPaga(
  tenantId: string,
  userId: string,
  guiaId: string,
  paga: boolean,
  agora = new Date()
): Promise<{ companyId: string; descricao: string } | null> {
  const prisma = getPrisma();
  const guia = await prisma.guia.findFirst({ where: { id: guiaId, tenantId }, select: { id: true, companyId: true, descricao: true } });
  if (!guia) return null;
  await prisma.guia.update({
    where: { id: guia.id },
    data: paga ? { pagaEm: agora, pagaPorId: userId } : { pagaEm: null, pagaPorId: null },
  });
  return { companyId: guia.companyId, descricao: guia.descricao };
}

