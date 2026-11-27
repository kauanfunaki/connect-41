// O lado do banco das guias (Guias pelo Connect, 28/10/2026): gravar a guia
// emitida, ligar ao envio que a levou ao cliente, listar as do mês e marcar
// como paga. A situação é calculada em ./situacao.ts.

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { nomeExibicao } from "@/lib/companyName";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import { decimalDeCentavos } from "@/lib/financeiro/manual";
import { totalDePaginas } from "@/lib/financeiro/paginaDeContas";
import { contarPorSituacao, situacaoDaGuia, type SituacaoDaGuia } from "./situacao";
import type { RegistroDaGuia } from "./registro";

export async function registrarGuiaEmitida(p: {
  tenantId: string;
  companyId: string;
  /** Nulo quando foi a rotina (DCTFWeb do mês), não uma pessoa. */
  userId: string | null;
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

/** Guias por página na tela do mês (27/11/2026, melhoria-571). */
export const GUIAS_POR_PAGINA = 50;

export type GuiasDoMes = {
  /** As guias da página aberta, da mais urgente para a menos. */
  guias: GuiaNaTela[];
  /** Quantas guias o mês tem, em todas as páginas. */
  total: number;
  pagina: number;
  totalDePaginas: number;
  /** Os cartões do topo: contam o mês inteiro, não a página. */
  contagem: Record<SituacaoDaGuia, number>;
  aPagarCentavos: number;
};

/**
 * As guias que vencem no mês (sem vencimento, as da competência), da mais
 * urgente para a menos: as vencidas primeiro, depois pelo vencimento.
 *
 * Paginada (27/11/2026, melhoria-571). Era `take: 1000`, sem aviso. A situação
 * é calculada (o dia de hoje, o envio, o pagamento) e a vencida vem antes na
 * ordem, então o banco não sabe paginar sozinho: uma leitura leve do mês
 * inteiro — só o que a situação, a ordem e os cartões usam, sem teto — decide
 * a página e os totais, e o resto (empresa, descrição, arquivo, envio) é lido
 * só das guias da página.
 */
export async function guiasDoMes(
  tenantId: string,
  mes: string,
  hoje: string,
  escopoDaEmpresa: Prisma.CompanyWhereInput = {},
  pedida = 1
): Promise<GuiasDoMes> {
  const prisma = getPrisma();
  const leves = await prisma.guia.findMany({
    where: {
      tenantId,
      company: escopoDaEmpresa,
      OR: [{ vencimento: { gte: `${mes}-01`, lte: `${mes}-31` } }, { vencimento: null, competencia: mes }],
    },
    select: {
      id: true,
      vencimento: true,
      validoAte: true,
      valor: true,
      pagaEm: true,
      clientDocument: { select: { status: true, recipients: { where: { firstViewedAt: { not: null } }, select: { id: true }, take: 1 } } },
    },
    orderBy: [{ vencimento: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  const comSituacao = leves.map((g) => ({
    id: g.id,
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
  }));

  const contagem = contarPorSituacao(comSituacao.map((g) => g.situacao));
  const aPagarCentavos = comSituacao.filter((g) => g.situacao !== "PAGA").reduce((s, g) => s + (g.valorCentavos ?? 0), 0);
  // As vencidas primeiro; depois a ordem do vencimento, que já vem do banco (o sort é estável).
  const ordenadas = [...comSituacao].sort((a, b) => Number(b.situacao === "VENCIDA") - Number(a.situacao === "VENCIDA"));
  const ultima = totalDePaginas(ordenadas.length, GUIAS_POR_PAGINA);
  // Página além do fim (link antigo, o mês esvaziou): a última que existe.
  const pagina = Math.min(Math.max(1, pedida), ultima);
  const daPagina = ordenadas.slice((pagina - 1) * GUIAS_POR_PAGINA, pagina * GUIAS_POR_PAGINA);

  const completas =
    daPagina.length === 0
      ? []
      : await prisma.guia.findMany({
          where: { tenantId, id: { in: daPagina.map((g) => g.id) } },
          select: {
            id: true,
            companyId: true,
            descricao: true,
            competencia: true,
            vencimento: true,
            validoAte: true,
            driveFileId: true,
            clientDocumentId: true,
            pagaEm: true,
            createdAt: true,
            company: { select: { name: true, displayName: true } },
          },
        });
  const porId = new Map(completas.map((g) => [g.id, g]));
  const guias: GuiaNaTela[] = [];
  for (const leve of daPagina) {
    const g = porId.get(leve.id);
    // Apagada entre as duas leituras: some da página, como sumiria ao recarregar.
    if (!g) continue;
    guias.push({
      id: g.id,
      companyId: g.companyId,
      empresa: nomeExibicao(g.company),
      descricao: g.descricao,
      competencia: g.competencia,
      vencimento: g.vencimento,
      validoAte: g.validoAte,
      valorCentavos: leve.valorCentavos,
      situacao: leve.situacao,
      arquivoId: g.driveFileId,
      envioId: g.clientDocumentId,
      pagaEm: g.pagaEm,
      emitidaEm: g.createdAt,
    });
  }
  return { guias, total: ordenadas.length, pagina, totalDePaginas: ultima, contagem, aPagarCentavos };
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

