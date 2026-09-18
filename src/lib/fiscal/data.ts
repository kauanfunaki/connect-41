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

/** Quantas competências o filtro oferece. */
const MESES_NO_FILTRO = 36;

/**
 * Até onde as contagens do acervo vão antes de parar.
 *
 * Nasceu de um incidente em 18/09/2026: o portal da BLD LOGISTICA — 21 empresas,
 * 252 mil documentos, praticamente o acervo inteiro — **levava quase dois
 * minutos para abrir**, e o login parecia travado em "Entrando…". O login
 * funcionava; era a home que não terminava. A tela interna tinha o mesmo mal:
 * 90 s só para contar.
 *
 * A causa: toda listagem filtra `removedAtOrigin = false`, e **nenhum índice
 * tem essa coluna**. Contar vira abrir cada uma das 252 mil linhas para ler um
 * booleano — num banco cujo buffer pool está no padrão de fábrica (128 MB) e não
 * comporta a tabela (528 MB com índices), então é disco. A página em si, que para
 * nas primeiras 51 linhas, sai em milissegundos.
 *
 * Com `take`, o banco para na milésima linha, qualquer que seja o plano (55 ms).
 * E ninguém pagina até a página cinco mil — quem tem mais de mil documentos
 * filtra por empresa e competência, e aí a contagem volta a ser exata.
 *
 * Aumentar o buffer pool devolveria a contagem exata; é decisão de infra, e o
 * teto continua valendo com ela — a tabela cresce todo mês.
 */
const TETO_DA_CONTAGEM = 1000;

/** Um total que pode ter parado no teto — `limitado` quer dizer "há mais do que isso". */
export type Contagem = { total: number; limitado: boolean };

/** O total para a tela, a partir de quantas linhas a busca com teto trouxe. */
export function lerContagem(encontradas: number, teto = TETO_DA_CONTAGEM): Contagem {
  return { total: Math.min(encontradas, teto), limitado: encontradas > teto };
}

/** As competências mais recentes da união das listas de cada empresa, sem repetir. */
export function mesclarCompetencias(listas: string[][], limite = MESES_NO_FILTRO): string[] {
  // "AAAA-MM" ordena como texto na mesma ordem que no calendário.
  return [...new Set(listas.flat())].sort().reverse().slice(0, limite);
}

function whereDoFiltro(alcance: AlcanceFiscal, filtro: FiltroDoAcervo): Prisma.FiscalDocumentWhereInput {
  const busca = filtro.busca?.trim();
  return {
    ...whereDoAlcance(alcance),
    // Documento removido na origem sai da listagem — é o "a projeção apaga" do
    // contrato. A linha continua no banco de propósito (ver `removedAtOrigin`
    // no schema), e quem abre o link direto ainda a encontra, com o aviso.
    removedAtOrigin: false,
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

  const [linhas, contagem] = await Promise.all([
    prisma.fiscalDocument.findMany({
      where,
      // Emissão desc é a ordem que o fiscal lê: o que chegou por último é o que
      // está pendente de decisão. `id` desempata para a paginação não repetir
      // linha quando duas notas têm o mesmo instante.
      orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
      skip: (pagina - 1) * POR_PAGINA,
      // Uma a mais só para saber se existe a próxima página — é o que o botão
      // "Próxima" usa quando a contagem parou no teto e não diz onde o fim está.
      take: POR_PAGINA + 1,
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
        completude: true,
        renderizavel: true,
        company: { select: { id: true, name: true, displayName: true, kind: true, cnpj: true, cpf: true } },
      },
    }),
    contar(where),
  ]);

  return {
    documentos: linhas.slice(0, POR_PAGINA),
    temProxima: linhas.length > POR_PAGINA,
    total: contagem.total,
    /** A contagem parou no teto: há mais de `total` documentos. */
    totalLimitado: contagem.limitado,
    pagina,
    porPagina: POR_PAGINA,
  };
}

/** Conta até o teto — ver `TETO_DA_CONTAGEM`. */
async function contar(where: Prisma.FiscalDocumentWhereInput): Promise<Contagem> {
  const prisma = getPrisma();
  const linhas = await prisma.fiscalDocument.findMany({ where, select: { id: true }, take: TETO_DA_CONTAGEM + 1 });
  return lerContagem(linhas.length);
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
      // O lançamento vem junto: a tela precisa saber se já existe para oferecer
      // "lançar" ou "estornar", e uma segunda consulta para isso seria uma
      // chance a mais de as duas discordarem.
      financeEntry: {
        select: {
          id: true,
          kind: true,
          status: true,
          closeReason: true,
          dueDate: true,
          amount: true,
          category: { select: { name: true } },
          counterparty: { select: { name: true } },
          costCenter: { select: { name: true } },
        },
      },
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
  if (alcance.tipo === "TENANT") {
    const linhas = await prisma.fiscalDocument.groupBy({
      by: ["competence"],
      where: whereDoAlcance(alcance),
      orderBy: { competence: "desc" },
      take: MESES_NO_FILTRO,
    });
    return linhas.map((l) => l.competence);
  }
  // Uma consulta por empresa, com o índice escolhido à mão.
  //
  // O índice `[tenantId, companyId, competence]` responde isto sem abrir uma
  // linha sequer: um salto por mês. Deixado por conta própria, o MySQL escolhe
  // `[tenantId, competence]` e confere a empresa linha por linha — 103 s para a
  // maior empresa da BLD, contra milissegundos. Ele erra porque estima as linhas
  // de um tenant pela média entre tenants, e o 41tech tem praticamente todas:
  // acha que são 121 mil quando são 252 mil. Com empresa pequena ele acerta, e
  // por isso o erro só aparece em quem tem muito documento.
  //
  // Sem ORDER BY nem LIMIT de propósito: cada empresa devolve todos os seus
  // meses (dezenas), e a ordem sai em `mesclarCompetencias`. O nome do índice
  // está fixado no schema com `map:` — ver o comentário lá.
  const porEmpresa = await Promise.all(
    alcance.companyIds.map(
      (companyId) => prisma.$queryRaw<{ competence: string }[]>`
        SELECT DISTINCT competence
        FROM fiscal_documents FORCE INDEX (fiscal_documents_tenantId_companyId_competence_idx)
        WHERE tenantId = ${alcance.tenantId} AND companyId = ${companyId}`
    )
  );
  return mesclarCompetencias(porEmpresa.map((linhas) => linhas.map((l) => l.competence)));
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
): Promise<Record<FiscalDocumentDestination, Contagem>> {
  const where: Prisma.FiscalDocumentWhereInput = { ...whereDoFiltro(alcance, filtro), situation: "AUTORIZADA" };
  // Uma contagem com teto por destino, e não um `groupBy`: o `groupBy` conta
  // tudo, e contar tudo é o que levava 90 s — ver `TETO_DA_CONTAGEM`.
  const [PENDENTE, LANCADO, IGNORADO] = await Promise.all(
    (["PENDENTE", "LANCADO", "IGNORADO"] as const).map((destination) => contar({ ...where, destination }))
  );
  return { PENDENTE, LANCADO, IGNORADO };
}
