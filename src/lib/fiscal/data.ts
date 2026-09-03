// Consultas do acervo de documentos fiscais.
//
// **Toda função aqui recebe o alcance como primeiro argumento.** Não existe
// caminho de leitura sem ele — é o que transforma "esqueci o filtro do portal"
// de vazamento silencioso em erro de compilação. Ver src/lib/fiscal/alcance.ts.

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type {
  FiscalDocumentType,
  FiscalDocumentDestination,
  FiscalDocumentSituation,
} from "@/generated/prisma/enums";
import { whereDoAlcance, type AlcanceFiscal } from "./alcance";

export type FiltroDoAcervo = {
  companyId?: string;
  competencia?: string;
  tipo?: FiscalDocumentType;
  destino?: FiscalDocumentDestination;
  situacao?: FiscalDocumentSituation;
  /** Número da nota ou nome da contraparte. */
  busca?: string;
};

const POR_PAGINA = 50;

function whereDoFiltro(alcance: AlcanceFiscal, filtro: FiltroDoAcervo): Prisma.FiscalDocumentWhereInput {
  const busca = filtro.busca?.trim();
  return {
    ...whereDoAlcance(alcance),
    ...(filtro.companyId ? { companyId: filtro.companyId } : {}),
    ...(filtro.competencia ? { competence: filtro.competencia } : {}),
    ...(filtro.tipo ? { type: filtro.tipo } : {}),
    ...(filtro.destino ? { destination: filtro.destino } : {}),
    ...(filtro.situacao ? { situation: filtro.situacao } : {}),
    ...(busca
      ? {
          OR: [
            { number: { contains: busca } },
            { issuerName: { contains: busca } },
            { recipientName: { contains: busca } },
            // Chave inteira só casa por igualdade — 44 dígitos colados não são
            // busca por pedaço, e `contains` num VarChar(44) indexado seria
            // varredura à toa.
            ...(/^\d{44}$/.test(busca) ? [{ accessKey: busca }] : []),
          ],
        }
      : {}),
  };
}

export type LinhaDoAcervo = Awaited<ReturnType<typeof listarDocumentos>>["documentos"][number];

export async function listarDocumentos(
  alcance: AlcanceFiscal,
  filtro: FiltroDoAcervo = {},
  pagina = 1
) {
  const prisma = getPrisma();
  const where = whereDoFiltro(alcance, filtro);

  const [documentos, total] = await Promise.all([
    prisma.fiscalDocument.findMany({
      where,
      // Emissão desc é a ordem que o fiscal lê: o que chegou por último é o que
      // está pendente de decisão. `id` desempata para a paginação não repetir
      // linha quando duas notas têm o mesmo instante.
      orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      select: {
        id: true,
        type: true,
        accessKey: true,
        number: true,
        series: true,
        issuerName: true,
        issuerDocument: true,
        recipientName: true,
        recipientDocument: true,
        amount: true,
        issuedAt: true,
        competence: true,
        origin: true,
        situation: true,
        destination: true,
        company: { select: { id: true, name: true, displayName: true, kind: true, cnpj: true, cpf: true } },
      },
    }),
    prisma.fiscalDocument.count({ where }),
  ]);

  return { documentos, total, pagina, porPagina: POR_PAGINA };
}

/** Um documento, já dentro do alcance. `null` quando não existe OU está fora dele. */
export async function obterDocumento(alcance: AlcanceFiscal, id: string) {
  const prisma = getPrisma();
  return prisma.fiscalDocument.findFirst({
    // O alcance entra no `where`, não numa checagem depois de buscar: buscar
    // primeiro e conferir depois já teria trazido o dado para a memória do
    // processo, e é assim que um `console.log` vira vazamento.
    where: { ...whereDoAlcance(alcance), id },
    include: {
      company: { select: { id: true, name: true, displayName: true, kind: true, cnpj: true, cpf: true } },
      uploadedBy: { select: { name: true } },
    },
  });
}

/** Documento já existente com esta chave de deduplicação, se houver. */
export async function acharPorDedupKey(alcance: AlcanceFiscal, dedupKey: string) {
  const prisma = getPrisma();
  return prisma.fiscalDocument.findFirst({
    where: { ...whereDoAlcance(alcance), dedupKey },
    select: { id: true, number: true, company: { select: { name: true, displayName: true } } },
  });
}

/** Competências com documento, da mais recente para a mais antiga — alimenta o filtro. */
export async function competenciasDisponiveis(alcance: AlcanceFiscal): Promise<string[]> {
  const prisma = getPrisma();
  const linhas = await prisma.fiscalDocument.groupBy({
    by: ["competence"],
    where: whereDoAlcance(alcance),
    orderBy: { competence: "desc" },
    take: 36,
  });
  return linhas.map((l) => l.competence);
}

/**
 * Contagem por destino, para a tela dizer quanto falta decidir.
 *
 * Só documentos autorizados: nota cancelada não está "pendente de lançamento",
 * está fora do jogo, e contá-la faria a fila parecer maior do que é.
 */
export async function resumoPorDestino(
  alcance: AlcanceFiscal,
  filtro: FiltroDoAcervo = {}
): Promise<Record<FiscalDocumentDestination, number>> {
  const prisma = getPrisma();
  const linhas = await prisma.fiscalDocument.groupBy({
    by: ["destination"],
    where: { ...whereDoFiltro(alcance, filtro), situation: "AUTORIZADA" },
    _count: { _all: true },
  });
  const zero: Record<FiscalDocumentDestination, number> = { PENDENTE: 0, LANCADO: 0, IGNORADO: 0 };
  for (const l of linhas) zero[l.destination] = l._count._all;
  return zero;
}
