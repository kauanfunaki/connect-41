// Consultas do acervo de documentos fiscais.
//
// **Toda função aqui recebe o alcance como primeiro argumento.** Não existe
// caminho de leitura sem ele — é o que transforma "esqueci o filtro do portal"
// de vazamento silencioso em erro de compilação. Ver src/lib/fiscal/alcance.ts.

import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
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
  /**
   * O lado do documento em que está o CNPJ (só dígitos): `emitente` é a saída
   * desse estabelecimento, `destinatario` a entrada. É o filtro de sentido do
   * Acervo no modo motor (API-CONNECT §11.1).
   */
  parte?: { lado: "emitente" | "destinatario"; documento: string };
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
 *
 * **Desde 10/11/2026 o teto é a exceção.** O índice `fiscal_documents_contagem_idx`
 * (tenant, empresa, `removedAtOrigin`, competência, destino, situação, tipo) faz a
 * contagem de empresas ler só o índice, sem abrir linha — e a tela sempre abre
 * numa empresa (13/10/2026). Ver `contagemExata`: o teto fica para o escritório
 * inteiro (a IA da equipe) e para a busca por texto, que lê linha de qualquer jeito.
 */
const TETO_DA_CONTAGEM = 1000;

/**
 * A contagem pode ser exata (sem teto)? Sim quando o alcance é de empresas e não
 * há busca por texto: todo o resto do filtro está no índice da contagem. `parte`
 * (o CNPJ de um lado da nota) não está, mas o motor só o manda junto de empresa e
 * competência, e aí são poucas linhas.
 */
export function contagemExata(alcance: AlcanceFiscal, filtro: FiltroDoAcervo): boolean {
  return alcance.tipo === "EMPRESAS" && !filtro.busca?.trim();
}

/** As linhas do `groupBy` por destino viram o resumo, com zero no destino que não veio. */
export function resumoDosGrupos(
  grupos: readonly { destination: FiscalDocumentDestination; _count: { _all: number } }[]
): Record<FiscalDocumentDestination, Contagem> {
  const total = (d: FiscalDocumentDestination) => grupos.find((g) => g.destination === d)?._count._all ?? 0;
  return {
    PENDENTE: { total: total("PENDENTE"), limitado: false },
    LANCADO: { total: total("LANCADO"), limitado: false },
    IGNORADO: { total: total("IGNORADO"), limitado: false },
  };
}

/**
 * As empresas que a contagem exata percorre: as do alcance, ou só a do filtro
 * quando ela está nele (a do filtro nunca amplia o alcance — ver `whereDoFiltro`).
 */
function empresasDaContagem(alcance: Extract<AlcanceFiscal, { tipo: "EMPRESAS" }>, filtro: FiltroDoAcervo): string[] {
  if (!filtro.companyId) return alcance.companyIds;
  return alcance.companyIds.includes(filtro.companyId) ? [filtro.companyId] : [];
}

/** O resto do filtro (tirando empresa e busca) em SQL, para a contagem pelo índice. */
function condicoesDaContagem(filtro: FiltroDoAcervo, situacao?: FiscalDocumentSituation): Prisma.Sql {
  const partes = [Prisma.sql`removedAtOrigin = false`];
  if (filtro.competencia) partes.push(Prisma.sql`competence = ${filtro.competencia}`);
  if (filtro.tipo) partes.push(Prisma.sql`type = ${filtro.tipo}`);
  if (filtro.destino) partes.push(Prisma.sql`destination = ${filtro.destino}`);
  const sit = situacao ?? filtro.situacao;
  if (sit) partes.push(Prisma.sql`situation = ${sit}`);
  if (filtro.parte) {
    partes.push(
      filtro.parte.lado === "emitente"
        ? Prisma.sql`issuerDocument = ${filtro.parte.documento}`
        : Prisma.sql`recipientDocument = ${filtro.parte.documento}`
    );
  }
  return Prisma.join(partes, " AND ");
}

// Uma consulta por empresa com o índice escolhido à mão, como as competências
// (ver `competenciasDisponiveis`): medido no banco local em 10/11/2026, o MySQL
// deixado por conta própria contava pelo unique de `dedupKey` ou por
// (tenant, situação, destino) e abria cada linha — o mesmo erro de estimativa.
// O nome do índice está fixado no schema com `map:`.
async function contarExato(alcance: Extract<AlcanceFiscal, { tipo: "EMPRESAS" }>, filtro: FiltroDoAcervo): Promise<number> {
  const prisma = getPrisma();
  const condicoes = condicoesDaContagem(filtro);
  const porEmpresa = await Promise.all(
    empresasDaContagem(alcance, filtro).map(
      (companyId) => prisma.$queryRaw<{ n: bigint | number }[]>`
        SELECT COUNT(*) AS n
        FROM fiscal_documents FORCE INDEX (fiscal_documents_contagem_idx)
        WHERE tenantId = ${alcance.tenantId} AND companyId = ${companyId} AND ${condicoes}`
    )
  );
  return porEmpresa.reduce((soma, linhas) => soma + Number(linhas[0]?.n ?? 0), 0);
}

async function resumoExato(
  alcance: Extract<AlcanceFiscal, { tipo: "EMPRESAS" }>,
  filtro: FiltroDoAcervo
): Promise<Record<FiscalDocumentDestination, Contagem>> {
  const prisma = getPrisma();
  const condicoes = condicoesDaContagem(filtro, "AUTORIZADA");
  const porEmpresa = await Promise.all(
    empresasDaContagem(alcance, filtro).map(
      (companyId) => prisma.$queryRaw<{ destination: FiscalDocumentDestination; n: bigint | number }[]>`
        SELECT destination, COUNT(*) AS n
        FROM fiscal_documents FORCE INDEX (fiscal_documents_contagem_idx)
        WHERE tenantId = ${alcance.tenantId} AND companyId = ${companyId} AND ${condicoes}
        GROUP BY destination`
    )
  );
  const somados = new Map<FiscalDocumentDestination, number>();
  for (const linha of porEmpresa.flat()) somados.set(linha.destination, (somados.get(linha.destination) ?? 0) + Number(linha.n));
  return resumoDosGrupos([...somados].map(([destination, n]) => ({ destination, _count: { _all: n } })));
}

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

/**
 * O `where` da listagem: o alcance E o filtro, nunca o filtro no lugar do alcance.
 *
 * Até 21/10/2026 o alcance e o filtro iam no mesmo objeto, e o
 * `companyId` do filtro **substituía** o `companyId: { in: [...] }` do
 * alcance — pedir a empresa de outro cliente trazia as notas dela. Nada
 * vazava porque a tela do portal conferia a empresa antes de chamar; a IA do
 * portal vai chamar esta consulta com o que o modelo pedir, e a trava tem de
 * estar aqui. O alcance mora num `AND` à parte, que nenhum campo de filtro (nem
 * quem espalha este `where` e acrescenta chaves) consegue sobrescrever.
 */
export function whereDoFiltro(alcance: AlcanceFiscal, filtro: FiltroDoAcervo): Prisma.FiscalDocumentWhereInput {
  const busca = filtro.busca?.trim();
  return {
    AND: [whereDoAlcance(alcance)],
    // Documento removido na origem sai da listagem — é o "a projeção apaga" do
    // contrato. A linha continua no banco de propósito (ver `removedAtOrigin`
    // no schema), e quem abre o link direto ainda a encontra, com o aviso.
    removedAtOrigin: false,
    ...(filtro.companyId ? { companyId: filtro.companyId } : {}),
    ...(filtro.competencia ? { competence: filtro.competencia } : {}),
    ...(filtro.tipo ? { type: filtro.tipo } : {}),
    ...(filtro.destino ? { destination: filtro.destino } : {}),
    ...(filtro.situacao ? { situation: filtro.situacao } : {}),
    ...(filtro.parte
      ? filtro.parte.lado === "emitente"
        ? { issuerDocument: filtro.parte.documento }
        : { recipientDocument: filtro.parte.documento }
      : {}),
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

export type LinhaDoAcervo = Awaited<ReturnType<typeof listarPaginaDoAcervo>>["documentos"][number];

/**
 * Só a página, sem contar (10/11/2026): a tela mostra a tabela com isto e a
 * contagem chega depois, num `<Suspense>` — ver `documentos-fiscais/page.tsx`.
 */
export async function listarPaginaDoAcervo(
  alcance: AlcanceFiscal,
  filtro: FiltroDoAcervo = {},
  pagina = 1
) {
  const linhas = await getPrisma().fiscalDocument.findMany({
    where: whereDoFiltro(alcance, filtro),
    // Emissão desc é a ordem que o fiscal lê: o que chegou por último é o que
    // está pendente de decisão. `id` desempata para a paginação não repetir
    // linha quando duas notas têm o mesmo instante.
    orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
    skip: (pagina - 1) * POR_PAGINA,
    // Uma a mais só para saber se existe a próxima página — é o que o botão
    // "Próxima" usa enquanto a contagem não chegou (ou parou no teto).
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
  });
  return { documentos: linhas.slice(0, POR_PAGINA), temProxima: linhas.length > POR_PAGINA, pagina, porPagina: POR_PAGINA };
}

/** A página e a contagem juntas — o portal, a IA e o motor leem assim. */
export async function listarDocumentos(
  alcance: AlcanceFiscal,
  filtro: FiltroDoAcervo = {},
  pagina = 1
) {
  const [daPagina, contagem] = await Promise.all([listarPaginaDoAcervo(alcance, filtro, pagina), contarDocumentos(alcance, filtro)]);
  return {
    ...daPagina,
    total: contagem.total,
    /** A contagem parou no teto: há mais de `total` documentos. */
    totalLimitado: contagem.limitado,
  };
}

/**
 * Só o número, sem a lista — o atalho de documentos do Início do portal
 * (05/10). O Início é a primeira tela depois do login, e foi a contagem lendo
 * linha que levou o portal a 2 minutos em 18/09: exata só pelo índice da
 * contagem (ver `contagemExata`).
 */
export async function contarDocumentos(alcance: AlcanceFiscal, filtro: FiltroDoAcervo = {}): Promise<Contagem> {
  if (alcance.tipo === "EMPRESAS" && contagemExata(alcance, filtro)) {
    return { total: await contarExato(alcance, filtro), limitado: false };
  }
  return contar(whereDoFiltro(alcance, filtro));
}

/** Até o teto — ver `TETO_DA_CONTAGEM`. A exata é `contarExato`. */
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
    where: { AND: [whereDoAlcance(alcance)], id },
    include: {
      company: { select: { id: true, name: true, displayName: true, kind: true, cnpj: true, cpf: true } },
      uploadedBy: { select: { name: true } },
      // Os lançamentos vêm junto: a tela precisa saber se já existem para
      // oferecer "lançar" ou "estornar", e uma segunda consulta para isso seria
      // uma chance a mais de as duas discordarem. **1:N** desde 23/10: a conta
      // que nasce parcelada pelas duplicatas tem todas as parcelas ligadas à
      // nota, na ordem da nota (`fiscalDocumentInstallment`); a conta única é
      // uma lista de um.
      financeEntries: {
        orderBy: { fiscalDocumentInstallment: "asc" },
        select: {
          id: true,
          kind: true,
          status: true,
          closeReason: true,
          dueDate: true,
          amount: true,
          fiscalDocumentInstallment: true,
          // A série, quando a conta nasceu parcelada pelas duplicatas da nota.
          recurrenceId: true,
          recurrenceTotal: true,
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
    where: { AND: [whereDoAlcance(alcance)], dedupKey },
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
  // Exata: um GROUP BY por empresa, que o índice da contagem responde sem abrir
  // linha (10/11/2026). Sem ela, uma contagem com teto por destino — contar tudo
  // lendo linha é o que levava 90 s (ver `TETO_DA_CONTAGEM`).
  if (alcance.tipo === "EMPRESAS" && contagemExata(alcance, filtro)) return resumoExato(alcance, filtro);
  const [PENDENTE, LANCADO, IGNORADO] = await Promise.all(
    (["PENDENTE", "LANCADO", "IGNORADO"] as const).map((destination) => contar({ ...where, destination }))
  );
  return { PENDENTE, LANCADO, IGNORADO };
}
